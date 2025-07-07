/**
 * Teste para verificar estado atual das partidas e criar situação de teste
 */

const mysql = require('mysql2/promise');

// Configuração do banco de dados
const dbConfig = {
  host: 'lolmatchmaking.mysql.uhserver.com',
  user: 'wmakeouthill',
  password: 'Angel1202@@',
  database: 'lolmatchmaking'
};

async function checkAndCreateTestScenario() {
  console.log('🔍 [Test] Verificando estado atual das partidas...');
  
  const connection = await mysql.createConnection(dbConfig);
  
  try {
    // 1. Verificar todas as partidas
    const [allMatches] = await connection.execute(
      'SELECT * FROM custom_matches ORDER BY created_at DESC LIMIT 10'
    );
    
    console.log(`\n📊 [Test] Últimas 10 partidas:`);
    allMatches.forEach(match => {
      console.log(`- ID: ${match.id} | Status: ${match.status} | Criado: ${new Date(match.created_at).toLocaleString()}`);
    });
    
    // 2. Verificar se há partidas em draft
    const [draftMatches] = await connection.execute(
      'SELECT * FROM custom_matches WHERE status = "draft" ORDER BY created_at DESC'
    );
    
    if (draftMatches.length > 0) {
      console.log(`\n🎯 [Test] Encontradas ${draftMatches.length} partidas em draft:`);
      
      for (const match of draftMatches) {
        console.log(`\n--- Partida ${match.id} ---`);
        console.log(`Status: ${match.status}`);
        console.log(`Criado: ${new Date(match.created_at).toLocaleString()}`);
        console.log(`Atualizado: ${new Date(match.updated_at).toLocaleString()}`);
        
        // Verificar dados do draft
        let draftData = null;
        let pickBanData = null;
        
        try {
          draftData = match.draft_data ? JSON.parse(match.draft_data) : null;
          pickBanData = match.pick_ban_data ? JSON.parse(match.pick_ban_data) : null;
        } catch (error) {
          console.error('❌ Erro ao parsear dados:', error);
        }
        
        if (draftData) {
          console.log(`✅ draft_data: ${draftData.team1?.length || 0} + ${draftData.team2?.length || 0} jogadores`);
          
          // Verificar se jogadores têm campeões
          const playersWithChampions = [
            ...(draftData.team1?.filter(p => p.championId) || []),
            ...(draftData.team2?.filter(p => p.championId) || [])
          ];
          
          console.log(`📋 Jogadores com campeões: ${playersWithChampions.length}/10`);
          if (playersWithChampions.length > 0) {
            playersWithChampions.forEach(p => {
              console.log(`  - ${p.summonerName} (${p.assignedLane}): Campeão ${p.championId}`);
            });
          }
        } else {
          console.log(`❌ draft_data: NULL`);
        }
        
        if (pickBanData) {
          const team1Picks = Object.keys(pickBanData.picks?.team1 || {});
          const team2Picks = Object.keys(pickBanData.picks?.team2 || {});
          const totalActions = pickBanData.actions?.length || 0;
          
          console.log(`✅ pick_ban_data: ${team1Picks.length + team2Picks.length} picks, ${totalActions} ações`);
          
          if (team1Picks.length > 0) {
            console.log(`  Team1 picks: ${team1Picks.join(', ')}`);
          }
          if (team2Picks.length > 0) {
            console.log(`  Team2 picks: ${team2Picks.join(', ')}`);
          }
        } else {
          console.log(`❌ pick_ban_data: NULL`);
        }
      }
    } else {
      console.log(`\n⚠️ [Test] Nenhuma partida em draft encontrada`);
      
      // Verificar se há partidas aceitas que poderiam virar draft
      const [acceptedMatches] = await connection.execute(
        'SELECT * FROM custom_matches WHERE status = "accepted" ORDER BY created_at DESC'
      );
      
      if (acceptedMatches.length > 0) {
        console.log(`\n🎯 [Test] Encontradas ${acceptedMatches.length} partidas aceitas que poderiam virar draft:`);
        acceptedMatches.forEach(match => {
          console.log(`- ID: ${match.id} | Status: ${match.status} | Criado: ${new Date(match.created_at).toLocaleString()}`);
        });
      } else {
        console.log(`\n📝 [Test] Nenhuma partida aceita encontrada`);
        
        // Verificar se há partidas em outros status
        const [otherMatches] = await connection.execute(
          'SELECT status, COUNT(*) as count FROM custom_matches GROUP BY status ORDER BY count DESC'
        );
        
        console.log(`\n📊 [Test] Resumo de partidas por status:`);
        otherMatches.forEach(row => {
          console.log(`- ${row.status}: ${row.count} partidas`);
        });
      }
    }
    
    // 3. Verificar se há jogadores na fila para criar nova partida
    const [queuePlayers] = await connection.execute(
      'SELECT * FROM queue_players ORDER BY id ASC'
    );
    
    console.log(`\n🎮 [Test] Fila atual: ${queuePlayers.length} jogadores`);
    
    if (queuePlayers.length >= 10) {
      console.log(`✅ [Test] Há jogadores suficientes na fila para criar partida`);
      console.log(`🎯 [Test] Primeiros 10 jogadores:`);
      queuePlayers.slice(0, 10).forEach((player, index) => {
        console.log(`  ${index + 1}. ${player.summoner_name} (${player.primary_lane}/${player.secondary_lane}) - ${player.custom_lp} LP`);
      });
    } else {
      console.log(`⚠️ [Test] Apenas ${queuePlayers.length} jogadores na fila (necessário 10)`);
    }
    
  } catch (error) {
    console.error('❌ [Test] Erro durante verificação:', error);
  } finally {
    await connection.end();
    console.log('\n🏁 [Test] Verificação finalizada');
  }
}

// Executar verificação
checkAndCreateTestScenario().catch(console.error);
