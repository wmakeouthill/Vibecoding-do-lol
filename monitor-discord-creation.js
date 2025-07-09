const mysql = require('mysql2/promise');
const axios = require('axios');

console.log('🔍 [AGENTE] Testando sistema de criação Discord em tempo real...');

const dbConfig = {
  host: 'lolmatchmaking.mysql.uhserver.com',
  user: 'wmakeouthill',
  password: 'Angel1202@@',
  database: 'lolmatchmaking'
};

async function monitorDiscordCreation() {
  console.log('🎯 MONITORAMENTO EM TEMPO REAL - CRIAÇÃO DISCORD\n');
  
  const connection = await mysql.createConnection(dbConfig);
  
  try {
    // Verificar a última partida e seu status atual
    const [matches] = await connection.execute(`
      SELECT id, status, team1_players, team2_players, created_at, updated_at
      FROM custom_matches 
      ORDER BY updated_at DESC 
      LIMIT 1
    `);
    
    if (matches.length === 0) {
      console.log('❌ Nenhuma partida encontrada');
      return;
    }
    
    const match = matches[0];
    console.log('📊 Partida mais recente:');
    console.log(`   ID: ${match.id}`);
    console.log(`   Status: ${match.status}`);
    console.log(`   Criada: ${match.created_at}`);
    console.log(`   Atualizada: ${match.updated_at}`);
    
    const team1 = JSON.parse(match.team1_players);
    const team2 = JSON.parse(match.team2_players);
    
    console.log('\n🔵 Team 1:', team1);
    console.log('🔴 Team 2:', team2);
    
    // Verificar se há jogadores vinculados
    console.log('\n🔗 Verificando vinculações:');
    let vinculados = 0;
    
    for (const player of [...team1, ...team2]) {
      const [gameName, tagLine] = player.split('#');
      const [links] = await connection.execute(`
        SELECT discord_id, discord_username FROM discord_lol_links 
        WHERE game_name = ? AND tag_line = ?
      `, [gameName, tagLine || 'BOT']);
      
      if (links.length > 0) {
        console.log(`✅ ${player} → ${links[0].discord_username} (${links[0].discord_id})`);
        vinculados++;
      } else {
        console.log(`❌ ${player} → Não vinculado`);
      }
    }
    
    console.log(`\n📊 Resumo: ${vinculados}/${team1.length + team2.length} jogadores vinculados`);
    
    // Agora testar manualmente o endpoint que DEVERIA existir
    console.log('\n🧪 TESTANDO CRIAÇÃO MANUAL...');
    
    // Vamos tentar chamar diretamente o DiscordService via endpoint
    try {
      const response = await axios.post('http://localhost:3000/api/discord/create-match-channels', {
        matchId: match.id,
        team1Players: team1,
        team2Players: team2
      });
      console.log('✅ Endpoint funcionou:', response.data);
    } catch (error) {
      console.log('❌ Endpoint não existe. Vou implementar!');
      console.log('Erro:', error.response?.status || error.message);
    }
    
    console.log('\n🎯 PRÓXIMO PASSO:');
    console.log('1. Criar uma nova partida');
    console.log('2. Aceitar com todos os bots');
    console.log('3. Observar os logs do backend');
    console.log('4. Verificar se createDiscordMatch é chamado');
    console.log('5. Se não for, há um problema no MatchFoundService');
    console.log('6. Se for chamado mas falhar, há um problema no DiscordService');
    
  } finally {
    await connection.end();
  }
}

monitorDiscordCreation().catch(console.error);
