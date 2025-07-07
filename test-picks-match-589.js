/**
 * Teste para simular picks na partida 589 em draft
 * Validar se draft_data e pick_ban_data são atualizados corretamente
 */

const mysql = require('mysql2/promise');
const WebSocket = require('ws');

// Configuração do banco de dados
const dbConfig = {
  host: 'lolmatchmaking.mysql.uhserver.com',
  user: 'wmakeouthill',
  password: 'Angel1202@@',
  database: 'lolmatchmaking'
};

async function testPicksForMatch589() {
  console.log('🎯 [Test] Testando picks para partida 589...');
  
  const connection = await mysql.createConnection(dbConfig);
  
  try {
    // 1. Buscar dados da partida 589
    const [matches] = await connection.execute(
      'SELECT * FROM custom_matches WHERE id = 589'
    );
    
    if (matches.length === 0) {
      console.log('❌ [Test] Partida 589 não encontrada');
      return;
    }
    
    const match = matches[0];
    console.log(`✅ [Test] Partida 589 encontrada (status: ${match.status})`);
    
    // 2. Verificar dados do draft
    let draftData = null;
    let pickBanData = null;
    
    try {
      draftData = match.draft_data ? JSON.parse(match.draft_data) : null;
      pickBanData = match.pick_ban_data ? JSON.parse(match.pick_ban_data) : null;
    } catch (error) {
      console.error('❌ [Test] Erro ao parsear dados:', error);
      return;
    }
    
    console.log('\n📊 [Test] Estado inicial:');
    console.log(`- draft_data: ${draftData ? 'EXISTS' : 'NULL'}`);
    console.log(`- pick_ban_data: ${pickBanData ? 'EXISTS' : 'NULL'}`);
    
    if (draftData) {
      console.log(`- Team1: ${draftData.team1?.length || 0} jogadores`);
      console.log(`- Team2: ${draftData.team2?.length || 0} jogadores`);
      
      // Mostrar jogadores dos times
      console.log('\n🔵 [Test] Team1 (Blue):');
      draftData.team1?.forEach((player, index) => {
        console.log(`  ${index}. ${player.summonerName} (${player.assignedLane}) - teamIndex: ${player.teamIndex} - Champion: ${player.championId || 'NONE'}`);
      });
      
      console.log('\n🔴 [Test] Team2 (Red):');
      draftData.team2?.forEach((player, index) => {
        console.log(`  ${index}. ${player.summonerName} (${player.assignedLane}) - teamIndex: ${player.teamIndex} - Champion: ${player.championId || 'NONE'}`);
      });
    }
    
    if (pickBanData) {
      console.log('\n🎮 [Test] pick_ban_data inicial:');
      console.log(`- Team1 picks: ${Object.keys(pickBanData.picks?.team1 || {}).length}`);
      console.log(`- Team2 picks: ${Object.keys(pickBanData.picks?.team2 || {}).length}`);
      console.log(`- Total actions: ${pickBanData.actions?.length || 0}`);
    }
    
    // 3. Simular picks via WebSocket API
    console.log('\n🎯 [Test] Simulando picks via WebSocket...');
    
    // Conectar ao WebSocket do servidor
    const ws = new WebSocket('ws://localhost:3000');
    
    ws.on('open', () => {
      console.log('✅ [Test] Conectado ao WebSocket');
      
      // Simular picks para alguns jogadores
      if (draftData && draftData.team1 && draftData.team2) {
        const playersToTest = [
          { player: draftData.team1[0], championId: 1 },   // Aatrox
          { player: draftData.team2[0], championId: 2 },   // Ahri
          { player: draftData.team1[1], championId: 3 },   // Akali
          { player: draftData.team2[1], championId: 4 }    // Alistar
        ];
        
        console.log(`\n🎮 [Test] Simulando ${playersToTest.length} picks...`);
        
        playersToTest.forEach((test, index) => {
          setTimeout(() => {
            const message = {
              type: 'draft_action',
              data: {
                matchId: 589,
                playerId: test.player.teamIndex,
                championId: test.championId,
                action: 'pick'
              }
            };
            
            console.log(`📤 [Test] Enviando pick ${index + 1}/${playersToTest.length}:`, {
              player: test.player.summonerName,
              lane: test.player.assignedLane,
              teamIndex: test.player.teamIndex,
              championId: test.championId
            });
            
            ws.send(JSON.stringify(message));
          }, index * 1000); // 1 segundo entre cada pick
        });
        
        // Verificar resultados após todos os picks
        setTimeout(async () => {
          console.log('\n🔍 [Test] Verificando resultados após picks...');
          
          const [updatedMatches] = await connection.execute(
            'SELECT * FROM custom_matches WHERE id = 589'
          );
          
          if (updatedMatches.length > 0) {
            const updatedMatch = updatedMatches[0];
            
            try {
              const updatedDraftData = updatedMatch.draft_data ? JSON.parse(updatedMatch.draft_data) : null;
              const updatedPickBanData = updatedMatch.pick_ban_data ? JSON.parse(updatedMatch.pick_ban_data) : null;
              
              console.log('\n📊 [Test] Estado após picks:');
              
              // Verificar draft_data
              if (updatedDraftData) {
                const playersWithChampions = [
                  ...(updatedDraftData.team1?.filter(p => p.championId) || []),
                  ...(updatedDraftData.team2?.filter(p => p.championId) || [])
                ];
                
                console.log(`✅ [Test] draft_data: ${playersWithChampions.length} jogadores com campeões`);
                playersWithChampions.forEach(p => {
                  console.log(`  - ${p.summonerName} (${p.assignedLane}): Campeão ${p.championId}`);
                });
              } else {
                console.log('❌ [Test] draft_data ainda NULL');
              }
              
              // Verificar pick_ban_data
              if (updatedPickBanData) {
                const team1Picks = Object.keys(updatedPickBanData.picks?.team1 || {});
                const team2Picks = Object.keys(updatedPickBanData.picks?.team2 || {});
                const totalActions = updatedPickBanData.actions?.length || 0;
                
                console.log(`✅ [Test] pick_ban_data: ${team1Picks.length + team2Picks.length} picks, ${totalActions} ações`);
                
                if (team1Picks.length > 0) {
                  console.log(`  Team1 picks:`);
                  team1Picks.forEach(lane => {
                    const pick = updatedPickBanData.picks.team1[lane];
                    console.log(`    - ${lane}: ${pick.playerName} escolheu campeão ${pick.championId}`);
                  });
                }
                
                if (team2Picks.length > 0) {
                  console.log(`  Team2 picks:`);
                  team2Picks.forEach(lane => {
                    const pick = updatedPickBanData.picks.team2[lane];
                    console.log(`    - ${lane}: ${pick.playerName} escolheu campeão ${pick.championId}`);
                  });
                }
              } else {
                console.log('❌ [Test] pick_ban_data ainda NULL');
              }
              
              // Resumo final
              console.log('\n📋 [Test] Resumo do teste:');
              console.log(`- Partida: 589`);
              console.log(`- Status: ${updatedMatch.status}`);
              console.log(`- draft_data atualizado: ${updatedDraftData ? 'SIM' : 'NÃO'}`);
              console.log(`- pick_ban_data atualizado: ${updatedPickBanData ? 'SIM' : 'NÃO'}`);
              console.log(`- Jogadores com campeões: ${updatedDraftData ? (updatedDraftData.team1?.filter(p => p.championId).length || 0) + (updatedDraftData.team2?.filter(p => p.championId).length || 0) : 0}/10`);
              
            } catch (error) {
              console.error('❌ [Test] Erro ao verificar resultados:', error);
            }
          }
          
          ws.close();
          await connection.end();
          console.log('\n🏁 [Test] Teste finalizado');
        }, 6000); // 6 segundos para aguardar todos os picks
      }
    });
    
    ws.on('message', (data) => {
      try {
        const message = JSON.parse(data.toString());
        console.log('📨 [Test] Mensagem recebida:', message.type);
        
        if (message.type === 'draft_action') {
          console.log(`  - Ação: ${message.data.action}`);
          console.log(`  - Jogador: ${message.data.player || 'N/A'}`);
          console.log(`  - Campeão: ${message.data.championId}`);
          console.log(`  - Picks totais: ${message.data.totalPicks || 0}`);
        }
      } catch (error) {
        console.error('❌ [Test] Erro ao processar mensagem:', error);
      }
    });
    
    ws.on('error', (error) => {
      console.error('❌ [Test] Erro no WebSocket:', error);
    });
    
    ws.on('close', () => {
      console.log('🔌 [Test] WebSocket fechado');
    });
    
  } catch (error) {
    console.error('❌ [Test] Erro durante teste:', error);
    await connection.end();
  }
}

// Executar teste
testPicksForMatch589().catch(console.error);
