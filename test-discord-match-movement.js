const mysql = require('mysql2/promise');
const axios = require('axios');

// Configuração do banco
const dbConfig = {
  host: 'lolmatchmaking.mysql.uhserver.com',
  user: 'wmakeouthill',
  password: 'Angel1202@@',
  database: 'lolmatchmaking'
};

console.log('🔍 [AGENTE] Investigação completa - Criação de canais Discord...');

async function diagnoseDiscordChannelCreation() {
  console.log('🔍 DIAGNÓSTICO COMPLETO - CRIAÇÃO DE CANAIS DISCORD\n');
  
  const connection = await mysql.createConnection(dbConfig);

  try {
    // 1. Verificar status do Discord
    console.log('1️⃣ Verificando conexão Discord...');
    try {
      const discordStatus = await axios.get('http://localhost:3000/api/discord/status');
      console.log('✅ Discord conectado:', discordStatus.data.isConnected);
      console.log('🤖 Bot username:', discordStatus.data.botUsername);
    } catch (error) {
      console.log('❌ Discord não conectado:', error.message);
      return;
    }

    // 2. Verificar partidas recentes aceitas
    console.log('\n2️⃣ Verificando partidas aceitas...');
    
    // Primeiro verificar todas as partidas para debug
    const [allMatches] = await connection.execute(`
      SELECT id, status, team1_players, team2_players, created_at, updated_at
      FROM custom_matches 
      ORDER BY updated_at DESC 
      LIMIT 5
    `);
    
    console.log('📊 Todas as partidas recentes:');
    allMatches.forEach(match => {
      console.log(`  ID: ${match.id}, Status: ${match.status}, Updated: ${match.updated_at}`);
    });
    
    const [matches] = await connection.execute(`
      SELECT id, status, team1_players, team2_players, created_at, updated_at
      FROM custom_matches 
      WHERE status IN ('accepted', 'draft', 'in_progress')
      ORDER BY updated_at DESC 
      LIMIT 3
    `);
    
    if (matches.length === 0) {
      console.log('❌ Nenhuma partida aceita encontrada');
      return;
    }
    
    const latestMatch = matches[0];
    console.log('✅ Partida encontrada:', latestMatch.id, 'Status:', latestMatch.status);
    
    // 3. Verificar jogadores vinculados
    console.log('\n3️⃣ Verificando vinculações Discord...');
    const team1 = JSON.parse(latestMatch.team1_players);
    const team2 = JSON.parse(latestMatch.team2_players);
    const allPlayers = [...team1, ...team2];
    
    const linkedPlayers = [];
    
    for (const player of allPlayers) {
      const [gameName, tagLine] = player.split('#');
      const [links] = await connection.execute(`
        SELECT discord_id FROM discord_lol_links 
        WHERE game_name = ? AND tag_line = ?
      `, [gameName, tagLine || 'BOT']);
      
      if (links.length > 0) {
        linkedPlayers.push({
          player,
          discordId: links[0].discord_id
        });
        console.log(`✅ ${player} → Discord ID: ${links[0].discord_id}`);
      } else {
        console.log(`❌ ${player} → Não vinculado`);
      }
    }
    
    // 4. Verificar canais existentes
    console.log('\n4️⃣ Verificando canais Discord existentes...');
    try {
      const channels = await axios.get('http://localhost:3000/api/discord/channels');
      console.log('📋 Canais encontrados:', channels.data.length || 0);
      
      const matchChannels = channels.data.filter(ch => 
        ch.name.includes('blue-team') || 
        ch.name.includes('red-team') ||
        ch.name.includes(latestMatch.id)
      );
      
      if (matchChannels.length > 0) {
        console.log('✅ Canais da partida encontrados:', matchChannels.map(ch => ch.name));
      } else {
        console.log('❌ PROBLEMA: Nenhum canal da partida encontrado');
      }
      
    } catch (error) {
      console.log('❌ Erro ao buscar canais:', error.message);
    }
    
    // 5. Tentar disparar criação manualmente
    console.log('\n5️⃣ Tentando disparar criação de canais...');
    try {
      const createResponse = await axios.post('http://localhost:3000/api/discord/create-match-channels', {
        matchId: latestMatch.id,
        team1: team1,
        team2: team2
      });
      console.log('✅ Resposta da criação:', createResponse.data);
    } catch (error) {
      console.log('❌ PROBLEMA CRÍTICO: Endpoint não existe ou falhou');
      console.log('Erro:', error.response?.data || error.message);
      
      // Se endpoint não existe, vamos criar
      if (error.response?.status === 404) {
        console.log('\n🔧 ENDPOINT NÃO EXISTE - IMPLEMENTANDO CORREÇÃO...');
        await implementDiscordChannelEndpoint();
      }
    }
    
    // 6. Se há jogadores vinculados, testar movimentação direta
    if (linkedPlayers.length > 0) {
      console.log('\n6️⃣ Testando movimentação direta...');
      try {
        const moveResponse = await axios.post('http://localhost:3000/api/discord/move-players', {
          matchId: latestMatch.id,
          team1Players: team1,
          team2Players: team2,
          linkedPlayers: linkedPlayers
        });
        console.log('✅ Movimentação executada:', moveResponse.data);
      } catch (error) {
        console.log('❌ Falha na movimentação:', error.response?.data || error.message);
      }
    }
    
    console.log('\n📋 DIAGNÓSTICO COMPLETO:');
    console.log('=====================================');
    console.log('✅ Discord conectado: Verificado');
    console.log('✅ Partida aceita: Encontrada');
    console.log(`⚠️ Vinculações: ${linkedPlayers.length}/${allPlayers.length}`);
    console.log('❌ Criação automática: INVESTIGANDO...');
    
    console.log('\n🎯 PRÓXIMOS PASSOS:');
    console.log('1. Verificar se endpoint Discord existe');
    console.log('2. Implementar trigger na aceitação da partida');
    console.log('3. Criar método createMatchChannels');
    console.log('4. Testar movimentação de jogadores');
    
  } finally {
    await connection.end();
  }
}

async function implementDiscordChannelEndpoint() {
  console.log('\n🛠️ IMPLEMENTANDO CORREÇÃO DO DISCORD...');
  
  // Aqui vamos verificar se existe o endpoint e implementá-lo
  try {
    // Primeiro verificar se existe DiscordService
    const serviceCheck = await axios.get('http://localhost:3000/api/discord/test');
    console.log('✅ DiscordService ativo');
    
    // Se chegou até aqui, o serviço existe mas falta o endpoint
    console.log('🔧 Será necessário implementar o endpoint create-match-channels');
    
  } catch (error) {
    console.log('❌ DiscordService não ativo ou não implementado completamente');
  }
}
diagnoseDiscordChannelCreation().catch(console.error);
