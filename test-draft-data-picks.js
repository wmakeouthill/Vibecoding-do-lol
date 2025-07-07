/**
 * Teste para validar se draft_data e pick_ban_data são atualizados corretamente
 * após cada pick/ban durante o draft
 */

const mysql = require('mysql2/promise');

// Configuração do banco de dados
const dbConfig = {
  host: 'lolmatchmaking.mysql.uhserver.com',
  user: 'wmakeouthill',
  password: 'Angel1202@@',
  database: 'lolmatchmaking'
};

async function testDraftDataUpdates() {
  console.log('🧪 [Test] Iniciando teste de atualização de draft_data e pick_ban_data...');
  
  const connection = await mysql.createConnection(dbConfig);
  
  try {
    // 1. Buscar partida em draft ativa
    const [matches] = await connection.execute(
      'SELECT * FROM custom_matches WHERE status = "draft" ORDER BY created_at DESC LIMIT 1'
    );
    
    if (matches.length === 0) {
      console.log('❌ [Test] Nenhuma partida em draft encontrada');
      return;
    }
    
    const match = matches[0];
    console.log(`🎯 [Test] Testando partida ${match.id} em draft`);
    
    // 2. Verificar dados iniciais
    console.log('\n📊 [Test] Dados iniciais da partida:');
    console.log('- Status:', match.status);
    
    let draftData = null;
    let pickBanData = null;
    
    try {
      draftData = match.draft_data ? JSON.parse(match.draft_data) : null;
      pickBanData = match.pick_ban_data ? JSON.parse(match.pick_ban_data) : null;
    } catch (error) {
      console.error('❌ [Test] Erro ao parsear dados:', error);
      return;
    }
    
    console.log('- draft_data presente:', !!draftData);
    console.log('- pick_ban_data presente:', !!pickBanData);
    
    if (draftData) {
      console.log('- Team1 players:', draftData.team1?.length || 0);
      console.log('- Team2 players:', draftData.team2?.length || 0);
      
      // Verificar se jogadores têm campeões escolhidos
      const team1WithChampions = draftData.team1?.filter(p => p.championId) || [];
      const team2WithChampions = draftData.team2?.filter(p => p.championId) || [];
      
      console.log('- Team1 com campeões:', team1WithChampions.length);
      console.log('- Team2 com campeões:', team2WithChampions.length);
      
      if (team1WithChampions.length > 0) {
        console.log('- Team1 campeões escolhidos:');
        team1WithChampions.forEach(p => {
          console.log(`  * ${p.summonerName} (${p.assignedLane}): Campeão ${p.championId}`);
        });
      }
      
      if (team2WithChampions.length > 0) {
        console.log('- Team2 campeões escolhidos:');
        team2WithChampions.forEach(p => {
          console.log(`  * ${p.summonerName} (${p.assignedLane}): Campeão ${p.championId}`);
        });
      }
    }
    
    if (pickBanData) {
      const team1Picks = Object.keys(pickBanData.picks?.team1 || {});
      const team2Picks = Object.keys(pickBanData.picks?.team2 || {});
      const team1Bans = pickBanData.bans?.team1?.length || 0;
      const team2Bans = pickBanData.bans?.team2?.length || 0;
      
      console.log('- Team1 picks:', team1Picks.length, team1Picks);
      console.log('- Team2 picks:', team2Picks.length, team2Picks);
      console.log('- Team1 bans:', team1Bans);
      console.log('- Team2 bans:', team2Bans);
      console.log('- Total actions:', pickBanData.actions?.length || 0);
    }
    
    // 3. Simular alguns picks para testar atualização
    console.log('\n🎮 [Test] Simulando picks para testar atualização...');
    
    if (draftData && draftData.team1 && draftData.team2) {
      // Simular pick para primeiro jogador do team1 (se ainda não tem campeão)
      const firstTeam1Player = draftData.team1[0];
      if (firstTeam1Player && !firstTeam1Player.championId) {
        console.log(`\n🔄 [Test] Simulando pick para ${firstTeam1Player.summonerName} (team1, ${firstTeam1Player.assignedLane})...`);
        
        // Simular pick via API/WebSocket (seria feito pelo bot ou cliente)
        const testChampionId = 1; // Exemplo: Aatrox
        
        console.log(`📝 [Test] Dados do pick:`);
        console.log(`- playerId (teamIndex): ${firstTeam1Player.teamIndex}`);
        console.log(`- championId: ${testChampionId}`);
        console.log(`- action: pick`);
        console.log(`- matchId: ${match.id}`);
        
        // Aguardar alguns segundos para ver se a atualização acontece
        console.log('⏱️ [Test] Aguardando 3 segundos para verificar atualização...');
        await new Promise(resolve => setTimeout(resolve, 3000));
        
        // Verificar se os dados foram atualizados
        const [updatedMatches] = await connection.execute(
          'SELECT * FROM custom_matches WHERE id = ?',
          [match.id]
        );
        
        if (updatedMatches.length > 0) {
          const updatedMatch = updatedMatches[0];
          
          try {
            const updatedDraftData = updatedMatch.draft_data ? JSON.parse(updatedMatch.draft_data) : null;
            const updatedPickBanData = updatedMatch.pick_ban_data ? JSON.parse(updatedMatch.pick_ban_data) : null;
            
            console.log('\n📊 [Test] Dados após simulação:');
            
            if (updatedDraftData) {
              const updatedPlayer = updatedDraftData.team1?.find(p => p.teamIndex === firstTeam1Player.teamIndex);
              if (updatedPlayer) {
                console.log(`✅ [Test] draft_data atualizado: ${updatedPlayer.summonerName} agora tem campeão ${updatedPlayer.championId || 'AINDA NULL'}`);
              } else {
                console.log('❌ [Test] Jogador não encontrado no draft_data atualizado');
              }
            }
            
            if (updatedPickBanData) {
              const team1Picks = Object.keys(updatedPickBanData.picks?.team1 || {});
              const totalActions = updatedPickBanData.actions?.length || 0;
              
              console.log(`✅ [Test] pick_ban_data atualizado: ${team1Picks.length} picks team1, ${totalActions} ações totais`);
              
              if (updatedPickBanData.picks?.team1) {
                Object.entries(updatedPickBanData.picks.team1).forEach(([lane, pickData]) => {
                  console.log(`  * ${lane}: Campeão ${pickData.championId} (${pickData.playerName})`);
                });
              }
            }
            
          } catch (error) {
            console.error('❌ [Test] Erro ao parsear dados atualizados:', error);
          }
        }
      } else {
        console.log('ℹ️ [Test] Primeiro jogador do team1 já tem campeão ou não encontrado');
      }
    }
    
    // 4. Mostrar relatório final
    console.log('\n📋 [Test] Relatório final:');
    console.log('- Partida testada:', match.id);
    console.log('- Status:', match.status);
    console.log('- Última atualização:', new Date(match.updated_at).toLocaleString());
    
    // 5. Verificar se há problemas conhecidos
    console.log('\n🔍 [Test] Verificando problemas conhecidos:');
    
    if (!pickBanData) {
      console.log('❌ [Test] PROBLEMA: pick_ban_data está NULL');
    } else {
      console.log('✅ [Test] pick_ban_data existe');
    }
    
    if (!draftData) {
      console.log('❌ [Test] PROBLEMA: draft_data está NULL');
    } else {
      console.log('✅ [Test] draft_data existe');
      
      const playersWithChampions = [
        ...(draftData.team1?.filter(p => p.championId) || []),
        ...(draftData.team2?.filter(p => p.championId) || [])
      ];
      
      if (playersWithChampions.length === 0) {
        console.log('⚠️ [Test] AVISO: Nenhum jogador tem campeão escolhido no draft_data');
      } else {
        console.log(`✅ [Test] ${playersWithChampions.length} jogadores têm campeões escolhidos no draft_data`);
      }
    }
    
  } catch (error) {
    console.error('❌ [Test] Erro durante teste:', error);
  } finally {
    await connection.end();
    console.log('\n🏁 [Test] Teste finalizado');
  }
}

// Executar teste
testDraftDataUpdates().catch(console.error);
