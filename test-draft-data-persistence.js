const { DatabaseManager } = require('./src/backend/database/DatabaseManager.js');
const { DraftService } = require('./src/backend/services/DraftService_new.js');

async function testDraftDataPersistence() {
  console.log('🧪 [Test] Iniciando teste de persistência de dados do draft...');
  
  const dbManager = new DatabaseManager();
  await dbManager.connect();
  
  // Criar DraftService sem WebSocket para teste
  const draftService = new DraftService(dbManager);
  
  try {
    // 1. Criar uma partida de teste
    console.log('📝 [Test] Criando partida de teste...');
    
    const team1Players = ['TestPlayer1', 'TestPlayer2', 'TestPlayer3', 'TestPlayer4', 'TestPlayer5'];
    const team2Players = ['TestBot1#BOT', 'TestBot2#BOT', 'TestBot3#BOT', 'TestBot4#BOT', 'TestBot5#BOT'];
    
    // Adicionar jogadores à fila com dados de teste
    console.log('👥 [Test] Adicionando jogadores à fila...');
    const lanes = ['top', 'jungle', 'mid', 'adc', 'support'];
    
    for (let i = 0; i < 5; i++) {
      await dbManager.addPlayerToQueue(
        `test_player_${i + 1}`,
        team1Players[i],
        'br1',
        1000 + (i * 100),
        { primaryLane: lanes[i], secondaryLane: 'fill' }
      );
      
      await dbManager.addPlayerToQueue(
        `test_bot_${i + 1}`,
        team2Players[i],
        'br1',
        1000 + (i * 100),
        { primaryLane: lanes[i], secondaryLane: 'fill' }
      );
    }
    
    // Criar partida customizada
    const matchId = await dbManager.createCustomMatch(
      team1Players,
      team2Players,
      'manual_test',
      { test: true }
    );
    
    console.log(`✅ [Test] Partida criada com ID: ${matchId}`);
    
    // Aceitar a partida
    await dbManager.updateCustomMatch(matchId, { status: 'accepted' });
    
    // 2. Iniciar draft
    console.log('🎯 [Test] Iniciando draft...');
    await draftService.startDraft(matchId);
    
    // 3. Verificar se draft_data foi salvo inicialmente
    let match = await dbManager.getCustomMatchById(matchId);
    console.log('📋 [Test] Draft data inicial:', {
      hasDraftData: !!match.draft_data,
      hasPickBanData: !!match.pick_ban_data,
      status: match.status
    });
    
    if (match.draft_data) {
      const draftData = JSON.parse(match.draft_data);
      console.log('👥 [Test] Times inicial:', {
        team1Count: draftData.team1.length,
        team2Count: draftData.team2.length,
        team1Players: draftData.team1.map(p => ({ name: p.summonerName, lane: p.assignedLane, championId: p.championId })),
        team2Players: draftData.team2.map(p => ({ name: p.summonerName, lane: p.assignedLane, championId: p.championId }))
      });
    }
    
    // 4. Simular algumas ações de draft
    console.log('🎮 [Test] Simulando ações de draft...');
    
    // Testar pick para time azul (player com teamIndex 0)
    await draftService.processDraftAction(matchId, 0, 1, 'pick'); // Campeão Annie (ID 1)
    console.log('✅ [Test] Pick 1 processado');
    
    // Verificar se dados foram salvos
    match = await dbManager.getCustomMatchById(matchId);
    let pickBanData = match.pick_ban_data ? JSON.parse(match.pick_ban_data) : null;
    let draftData = match.draft_data ? JSON.parse(match.draft_data) : null;
    
    console.log('📊 [Test] Após pick 1:', {
      hasPickBanData: !!pickBanData,
      hasDraftData: !!draftData,
      picksTeam1: pickBanData ? Object.keys(pickBanData.picks.team1) : [],
      picksTeam2: pickBanData ? Object.keys(pickBanData.picks.team2) : [],
      totalActions: pickBanData ? pickBanData.actions.length : 0
    });
    
    if (draftData) {
      const playerWithChampion = draftData.team1.find(p => p.championId);
      console.log('👤 [Test] Jogador com campeão:', playerWithChampion ? {
        name: playerWithChampion.summonerName,
        lane: playerWithChampion.assignedLane,
        championId: playerWithChampion.championId
      } : 'Nenhum encontrado');
    }
    
    // Testar pick para time vermelho (player com teamIndex 5)
    await draftService.processDraftAction(matchId, 5, 2, 'pick'); // Campeão Olaf (ID 2)
    console.log('✅ [Test] Pick 2 processado');
    
    // Verificar se dados foram salvos
    match = await dbManager.getCustomMatchById(matchId);
    pickBanData = match.pick_ban_data ? JSON.parse(match.pick_ban_data) : null;
    draftData = match.draft_data ? JSON.parse(match.draft_data) : null;
    
    console.log('📊 [Test] Após pick 2:', {
      hasPickBanData: !!pickBanData,
      hasDraftData: !!draftData,
      picksTeam1: pickBanData ? Object.keys(pickBanData.picks.team1) : [],
      picksTeam2: pickBanData ? Object.keys(pickBanData.picks.team2) : [],
      totalActions: pickBanData ? pickBanData.actions.length : 0
    });
    
    if (draftData) {
      const team1WithChampions = draftData.team1.filter(p => p.championId);
      const team2WithChampions = draftData.team2.filter(p => p.championId);
      
      console.log('👥 [Test] Jogadores com campeões:', {
        team1: team1WithChampions.map(p => ({ name: p.summonerName, lane: p.assignedLane, championId: p.championId })),
        team2: team2WithChampions.map(p => ({ name: p.summonerName, lane: p.assignedLane, championId: p.championId }))
      });
    }
    
    // Testar um ban
    await draftService.processDraftAction(matchId, 1, 3, 'ban'); // Campeão Twisted Fate (ID 4)
    console.log('✅ [Test] Ban processado');
    
    // Verificar se ban foi salvo
    match = await dbManager.getCustomMatchById(matchId);
    pickBanData = match.pick_ban_data ? JSON.parse(match.pick_ban_data) : null;
    
    console.log('📊 [Test] Após ban:', {
      bansTeam1: pickBanData ? pickBanData.bans.team1.length : 0,
      bansTeam2: pickBanData ? pickBanData.bans.team2.length : 0,
      totalActions: pickBanData ? pickBanData.actions.length : 0
    });
    
    if (pickBanData && pickBanData.bans.team1.length > 0) {
      console.log('🚫 [Test] Ban details:', pickBanData.bans.team1[0]);
    }
    
    // 5. Teste final: verificar integridade dos dados
    console.log('🔍 [Test] Verificação final dos dados...');
    
    const finalMatch = await dbManager.getCustomMatchById(matchId);
    const finalPickBanData = finalMatch.pick_ban_data ? JSON.parse(finalMatch.pick_ban_data) : null;
    const finalDraftData = finalMatch.draft_data ? JSON.parse(finalMatch.draft_data) : null;
    
    console.log('📋 [Test] Estado final:', {
      status: finalMatch.status,
      hasPickBanData: !!finalPickBanData,
      hasDraftData: !!finalDraftData,
      pickBanActionsCount: finalPickBanData ? finalPickBanData.actions.length : 0,
      draftPlayersWithChampions: finalDraftData ? 
        [...finalDraftData.team1, ...finalDraftData.team2].filter(p => p.championId).length : 0
    });
    
    if (finalPickBanData && finalDraftData) {
      console.log('✅ [Test] SUCESSO: Ambos pick_ban_data e draft_data estão sendo salvos corretamente!');
      
      // Verificar se os campeões no draft_data correspondem aos picks no pick_ban_data
      const draftChampions = [...finalDraftData.team1, ...finalDraftData.team2]
        .filter(p => p.championId)
        .map(p => ({ lane: p.assignedLane, championId: p.championId, team: p.teamIndex <= 4 ? 'team1' : 'team2' }));
      
      const pickChampions = [
        ...Object.entries(finalPickBanData.picks.team1).map(([lane, pick]) => ({ lane, championId: pick.championId, team: 'team1' })),
        ...Object.entries(finalPickBanData.picks.team2).map(([lane, pick]) => ({ lane, championId: pick.championId, team: 'team2' }))
      ];
      
      console.log('🔄 [Test] Comparação draft_data vs pick_ban_data:', {
        draftChampions,
        pickChampions,
        matches: draftChampions.length === pickChampions.length
      });
      
    } else {
      console.log('❌ [Test] FALHA: Dados não estão sendo salvos corretamente');
    }
    
    // 6. Limpeza
    console.log('🧹 [Test] Limpando dados de teste...');
    await dbManager.deleteCustomMatch(matchId);
    
    // Remover jogadores da fila
    for (let i = 0; i < 5; i++) {
      await dbManager.removePlayerFromQueue(team1Players[i]);
      await dbManager.removePlayerFromQueue(team2Players[i]);
    }
    
    console.log('✅ [Test] Teste concluído com sucesso!');
    
  } catch (error) {
    console.error('❌ [Test] Erro no teste:', error);
    throw error;
  } finally {
    await dbManager.disconnect();
  }
}

// Executar teste
testDraftDataPersistence().catch(console.error);
