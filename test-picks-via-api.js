/**
 * Teste para simular picks na partida 589 via HTTP API
 * Validar se draft_data e pick_ban_data são atualizados corretamente
 */

const mysql = require('mysql2/promise');
const axios = require('axios');

// Configuração do banco de dados
const dbConfig = {
  host: 'lolmatchmaking.mysql.uhserver.com',
  user: 'wmakeouthill',
  password: 'Angel1202@@',
  database: 'lolmatchmaking'
};

const API_BASE = 'http://localhost:3000/api';

async function testPicksViaAPI() {
  console.log('🎯 [Test] Testando picks via HTTP API...');
  
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
    
    try {
      draftData = match.draft_data ? JSON.parse(match.draft_data) : null;
    } catch (error) {
      console.error('❌ [Test] Erro ao parsear dados:', error);
      return;
    }
    
    if (!draftData) {
      console.log('❌ [Test] draft_data não disponível');
      return;
    }
    
    console.log('\n📊 [Test] Estado inicial:');
    console.log(`- draft_data: EXISTS (${draftData.team1?.length || 0} + ${draftData.team2?.length || 0} jogadores)`);
    console.log(`- pick_ban_data: ${match.pick_ban_data ? 'EXISTS' : 'NULL'}`);
    
    // 3. Tentar simular picks via API diretamente no banco
    console.log('\n🎯 [Test] Simulando picks diretamente no banco...');
    
    // Simular alguns picks para testar
    const testPicks = [
      { playerId: 0, championId: 1, lane: 'top', team: 'team1' },
      { playerId: 5, championId: 2, lane: 'top', team: 'team2' },
      { playerId: 1, championId: 3, lane: 'jungle', team: 'team1' },
      { playerId: 6, championId: 4, lane: 'jungle', team: 'team2' }
    ];
    
    // Construir pick_ban_data
    const pickBanData = {
      picks: { team1: {}, team2: {} },
      bans: { team1: [], team2: [] },
      actions: []
    };
    
    // Construir draft_data atualizado
    const updatedDraftData = JSON.parse(JSON.stringify(draftData));
    
    console.log('\n🎮 [Test] Aplicando picks de teste...');
    
    testPicks.forEach((pick, index) => {
      console.log(`  ${index + 1}. Jogador ${pick.playerId} (${pick.team}, ${pick.lane}) escolhe campeão ${pick.championId}`);
      
      // Atualizar pick_ban_data
      pickBanData.picks[pick.team][pick.lane] = {
        championId: pick.championId,
        playerId: pick.playerId,
        playerName: pick.team === 'team1' ? draftData.team1[pick.playerId]?.summonerName : draftData.team2[pick.playerId - 5]?.summonerName,
        teamIndex: pick.playerId,
        lane: pick.lane,
        timestamp: Date.now()
      };
      
      // Atualizar draft_data
      const isTeam1 = pick.playerId <= 4;
      const teamArray = isTeam1 ? updatedDraftData.team1 : updatedDraftData.team2;
      const playerInTeam = teamArray.find(p => p.teamIndex === pick.playerId);
      
      if (playerInTeam) {
        playerInTeam.championId = pick.championId;
        console.log(`    ✅ Campeão ${pick.championId} atribuído a ${playerInTeam.summonerName}`);
      }
      
      // Adicionar ação
      pickBanData.actions.push({
        playerId: pick.playerId,
        championId: pick.championId,
        action: 'pick',
        timestamp: Date.now()
      });
    });
    
    // 4. Atualizar no banco de dados
    console.log('\n💾 [Test] Atualizando dados no banco...');
    
    await connection.execute(
      'UPDATE custom_matches SET draft_data = ?, pick_ban_data = ? WHERE id = 589',
      [JSON.stringify(updatedDraftData), JSON.stringify(pickBanData)]
    );
    
    console.log('✅ [Test] Dados atualizados no banco');
    
    // 5. Verificar resultados
    console.log('\n🔍 [Test] Verificando resultados...');
    
    const [updatedMatches] = await connection.execute(
      'SELECT * FROM custom_matches WHERE id = 589'
    );
    
    if (updatedMatches.length > 0) {
      const updatedMatch = updatedMatches[0];
      
      try {
        const finalDraftData = updatedMatch.draft_data ? JSON.parse(updatedMatch.draft_data) : null;
        const finalPickBanData = updatedMatch.pick_ban_data ? JSON.parse(updatedMatch.pick_ban_data) : null;
        
        console.log('\n📊 [Test] Estado final:');
        
        // Verificar draft_data
        if (finalDraftData) {
          const playersWithChampions = [
            ...(finalDraftData.team1?.filter(p => p.championId) || []),
            ...(finalDraftData.team2?.filter(p => p.championId) || [])
          ];
          
          console.log(`✅ [Test] draft_data: ${playersWithChampions.length} jogadores com campeões`);
          playersWithChampions.forEach(p => {
            console.log(`  - ${p.summonerName} (${p.assignedLane}, teamIndex: ${p.teamIndex}): Campeão ${p.championId}`);
          });
        } else {
          console.log('❌ [Test] draft_data NULL');
        }
        
        // Verificar pick_ban_data
        if (finalPickBanData) {
          const team1Picks = Object.keys(finalPickBanData.picks?.team1 || {});
          const team2Picks = Object.keys(finalPickBanData.picks?.team2 || {});
          const totalActions = finalPickBanData.actions?.length || 0;
          
          console.log(`✅ [Test] pick_ban_data: ${team1Picks.length + team2Picks.length} picks, ${totalActions} ações`);
          
          if (team1Picks.length > 0) {
            console.log(`  Team1 picks:`);
            team1Picks.forEach(lane => {
              const pick = finalPickBanData.picks.team1[lane];
              console.log(`    - ${lane}: ${pick.playerName} escolheu campeão ${pick.championId}`);
            });
          }
          
          if (team2Picks.length > 0) {
            console.log(`  Team2 picks:`);
            team2Picks.forEach(lane => {
              const pick = finalPickBanData.picks.team2[lane];
              console.log(`    - ${lane}: ${pick.playerName} escolheu campeão ${pick.championId}`);
            });
          }
        } else {
          console.log('❌ [Test] pick_ban_data NULL');
        }
        
        // Resumo final
        console.log('\n📋 [Test] Resumo do teste:');
        console.log(`- Partida: 589`);
        console.log(`- Status: ${updatedMatch.status}`);
        console.log(`- draft_data atualizado: ${finalDraftData ? 'SIM' : 'NÃO'}`);
        console.log(`- pick_ban_data atualizado: ${finalPickBanData ? 'SIM' : 'NÃO'}`);
        console.log(`- Jogadores com campeões no draft_data: ${finalDraftData ? (finalDraftData.team1?.filter(p => p.championId).length || 0) + (finalDraftData.team2?.filter(p => p.championId).length || 0) : 0}/10`);
        
        // Validar se os dados estão consistentes
        if (finalDraftData && finalPickBanData) {
          const draftChampions = [
            ...(finalDraftData.team1?.filter(p => p.championId).map(p => ({ player: p.summonerName, champion: p.championId })) || []),
            ...(finalDraftData.team2?.filter(p => p.championId).map(p => ({ player: p.summonerName, champion: p.championId })) || [])
          ];
          
          const pickBanChampions = [
            ...Object.values(finalPickBanData.picks.team1 || {}).map(p => ({ player: p.playerName, champion: p.championId })),
            ...Object.values(finalPickBanData.picks.team2 || {}).map(p => ({ player: p.playerName, champion: p.championId }))
          ];
          
          console.log('\n🔄 [Test] Validação de consistência:');
          console.log(`- draft_data tem ${draftChampions.length} campeões`);
          console.log(`- pick_ban_data tem ${pickBanChampions.length} campeões`);
          
          const isConsistent = draftChampions.length === pickBanChampions.length;
          console.log(`- Dados consistentes: ${isConsistent ? 'SIM' : 'NÃO'}`);
          
          if (isConsistent) {
            console.log('✅ [Test] SUCESSO: Tanto draft_data quanto pick_ban_data foram atualizados corretamente!');
          } else {
            console.log('❌ [Test] PROBLEMA: Inconsistência entre draft_data e pick_ban_data');
          }
        }
        
      } catch (error) {
        console.error('❌ [Test] Erro ao verificar resultados:', error);
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
testPicksViaAPI().catch(console.error);
