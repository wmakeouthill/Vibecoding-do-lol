const fs = require('fs');

// Simular dados de pick/ban como seriam retornados pelo componente de draft
const mockPickBanResult = {
  session: {
    blueTeam: [
      { id: '1', summonerName: 'Bot8', lane: 'top', teamIndex: 0 },
      { id: '2', summonerName: 'Bot4', lane: 'jungle', teamIndex: 1 },
      { id: '3', summonerName: 'Bot1', lane: 'mid', teamIndex: 2 },
      { id: '4', summonerName: 'Bot7', lane: 'adc', teamIndex: 3 },
      { id: '5', summonerName: 'Bot5', lane: 'support', teamIndex: 4 }
    ],
    redTeam: [
      { id: '6', summonerName: 'Bot2', lane: 'top', teamIndex: 0 },
      { id: '7', summonerName: 'Bot9', lane: 'jungle', teamIndex: 1 },
      { id: '8', summonerName: 'Bot6', lane: 'mid', teamIndex: 2 },
      { id: '9', summonerName: 'Bot3', lane: 'adc', teamIndex: 3 },
      { id: '10', summonerName: 'popcorn seller', tagLine: 'coup', lane: 'support', teamIndex: 4 }
    ],
    phases: [
      // Fases de ban (0-5)
      { action: 'ban', team: 'blue', champion: { id: 266, name: 'Aatrox' }, locked: true },
      { action: 'ban', team: 'red', champion: { id: 103, name: 'Ahri' }, locked: true },
      { action: 'ban', team: 'blue', champion: { id: 84, name: 'Akali' }, locked: true },
      { action: 'ban', team: 'red', champion: { id: 166, name: 'Akshan' }, locked: true },
      { action: 'ban', team: 'blue', champion: { id: 12, name: 'Alistar' }, locked: true },
      { action: 'ban', team: 'red', champion: { id: 32, name: 'Amumu' }, locked: true },
      
      // Fases de pick (6-20)
      { action: 'pick', team: 'blue', champion: { id: 266, name: 'Aatrox' }, locked: true },
      { action: 'pick', team: 'red', champion: { id: 103, name: 'Ahri' }, locked: true },
      { action: 'pick', team: 'red', champion: { id: 84, name: 'Akali' }, locked: true },
      { action: 'pick', team: 'blue', champion: { id: 166, name: 'Akshan' }, locked: true },
      { action: 'pick', team: 'blue', champion: { id: 12, name: 'Alistar' }, locked: true },
      { action: 'pick', team: 'red', champion: { id: 32, name: 'Amumu' }, locked: true },
      { action: 'pick', team: 'red', champion: { id: 34, name: 'Anivia' }, locked: true },
      { action: 'pick', team: 'blue', champion: { id: 1, name: 'Annie' }, locked: true },
      { action: 'pick', team: 'blue', champion: { id: 523, name: 'Aphelios' }, locked: true },
      { action: 'pick', team: 'red', champion: { id: 22, name: 'Ashe' }, locked: true }
    ]
  },
  blueTeam: [
    { id: '1', summonerName: 'Bot8', lane: 'top', teamIndex: 0 },
    { id: '2', summonerName: 'Bot4', lane: 'jungle', teamIndex: 1 },
    { id: '3', summonerName: 'Bot1', lane: 'mid', teamIndex: 2 },
    { id: '4', summonerName: 'Bot7', lane: 'adc', teamIndex: 3 },
    { id: '5', summonerName: 'Bot5', lane: 'support', teamIndex: 4 }
  ],
  redTeam: [
    { id: '6', summonerName: 'Bot2', lane: 'top', teamIndex: 0 },
    { id: '7', summonerName: 'Bot9', lane: 'jungle', teamIndex: 1 },
    { id: '8', summonerName: 'Bot6', lane: 'mid', teamIndex: 2 },
    { id: '9', summonerName: 'Bot3', lane: 'adc', teamIndex: 3 },
    { id: '10', summonerName: 'popcorn seller', tagLine: 'coup', lane: 'support', teamIndex: 4 }
  ]
};

// Simular a função createPreliminaryParticipantsData
function createPreliminaryParticipantsData(gameResult) {
  const participants = [];
  let participantId = 1;

  // Processar time azul (team1)
  if (gameResult.team1 && Array.isArray(gameResult.team1)) {
    gameResult.team1.forEach((player, index) => {
      const playerName = getPlayerFullName(player);
      const champion = player.champion || getChampionFromPickBanData(player, 'blue', index, gameResult);
      
      participants.push({
        participantId: participantId++,
        teamId: 100, // Time azul
        championId: champion?.id || 0,
        championName: champion?.name || 'Unknown',
        summonerName: playerName,
        riotIdGameName: player.summonerName || playerName.split('#')[0] || 'Unknown',
        riotIdTagline: player.tagLine || playerName.split('#')[1] || '',
        lane: player.lane || 'UNKNOWN',
        kills: 0,
        deaths: 0,
        assists: 0,
        champLevel: 0,
        goldEarned: 0,
        totalMinionsKilled: 0,
        neutralMinionsKilled: 0,
        totalDamageDealt: 0,
        totalDamageDealtToChampions: 0,
        totalDamageTaken: 0,
        wardsPlaced: 0,
        wardsKilled: 0,
        visionScore: 0,
        firstBloodKill: false,
        doubleKills: 0,
        tripleKills: 0,
        quadraKills: 0,
        pentaKills: 0,
        item0: 0,
        item1: 0,
        item2: 0,
        item3: 0,
        item4: 0,
        item5: 0,
        item6: 0,
        summoner1Id: 0,
        summoner2Id: 0,
        win: gameResult.winner === 'blue'
      });
    });
  }

  // Processar time vermelho (team2)
  if (gameResult.team2 && Array.isArray(gameResult.team2)) {
    gameResult.team2.forEach((player, index) => {
      const playerName = getPlayerFullName(player);
      const champion = player.champion || getChampionFromPickBanData(player, 'red', index, gameResult);
      
      participants.push({
        participantId: participantId++,
        teamId: 200, // Time vermelho
        championId: champion?.id || 0,
        championName: champion?.name || 'Unknown',
        summonerName: playerName,
        riotIdGameName: player.summonerName || playerName.split('#')[0] || 'Unknown',
        riotIdTagline: player.tagLine || playerName.split('#')[1] || '',
        lane: player.lane || 'UNKNOWN',
        kills: 0,
        deaths: 0,
        assists: 0,
        champLevel: 0,
        goldEarned: 0,
        totalMinionsKilled: 0,
        neutralMinionsKilled: 0,
        totalDamageDealt: 0,
        totalDamageDealtToChampions: 0,
        totalDamageTaken: 0,
        wardsPlaced: 0,
        wardsKilled: 0,
        visionScore: 0,
        firstBloodKill: false,
        doubleKills: 0,
        tripleKills: 0,
        quadraKills: 0,
        pentaKills: 0,
        item0: 0,
        item1: 0,
        item2: 0,
        item3: 0,
        item4: 0,
        item5: 0,
        item6: 0,
        summoner1Id: 0,
        summoner2Id: 0,
        win: gameResult.winner === 'red'
      });
    });
  }

  console.log('👥 Dados preliminares criados para', participants.length, 'participantes');
  return participants;
}

// Simular a função getPlayerFullName
function getPlayerFullName(player) {
  if (player.tagLine) {
    return `${player.summonerName}#${player.tagLine}`;
  }
  return player.summonerName || player.id?.toString() || 'Unknown';
}

// Simular a função getChampionFromPickBanData
function getChampionFromPickBanData(player, team, index, gameResult) {
  if (!gameResult.pickBanData) return null;

  // Tentar encontrar o campeão pelos picks do time
  const teamPicks = team === 'blue' ? 
    (gameResult.pickBanData.blueTeamPicks || []) : 
    (gameResult.pickBanData.redTeamPicks || []);

  // Se temos picks específicos do time, usar o índice
  if (teamPicks[index] && teamPicks[index].champion) {
    return teamPicks[index].champion;
  }

  // Se não, tentar encontrar por todos os picks
  const allPicks = gameResult.pickBanData.picks || [];
  const teamPicksFromAll = allPicks.filter(pick => pick.team === team);
  
  if (teamPicksFromAll[index] && teamPicksFromAll[index].champion) {
    return teamPicksFromAll[index].champion;
  }

  return null;
}

// Simular a função updatePlayersWithChampions
function updatePlayersWithChampions(pickBanResult, gameData) {
  if (!gameData || !pickBanResult.session) return;

  console.log('🎯 [updatePlayersWithChampions] Iniciando mapeamento de campeões aos jogadores');
  console.log('📊 Pick/Ban result:', pickBanResult);

  // Extrair picks das fases
  const picksWithPlayerInfo = pickBanResult.session.phases
    .filter(phase => phase.action === 'pick' && phase.champion && phase.locked)
    .map((phase, index) => ({
      team: phase.team,
      champion: phase.champion,
      phaseIndex: index
    }));

  console.log('👥 Picks com informações de jogador:', picksWithPlayerInfo);

  // Mapear campeões aos jogadores do time azul (team1)
  gameData.team1.forEach((player, index) => {
    // Buscar o pick correspondente a este jogador
    const playerPick = picksWithPlayerInfo.find((pick) => {
      if (pick.team === 'blue') {
        // Usar ordem de index para mapeamento
        return true; // Será filtrado por ordem
      }
      return false;
    });

    if (playerPick && playerPick.champion) {
      player.champion = playerPick.champion;
      console.log(`✅ [Team1] ${player.summonerName} mapeado para ${playerPick.champion.name}`);
    } else {
      console.log(`⚠️ [Team1] ${player.summonerName} não encontrou pick correspondente`);
    }
  });

  // Mapear campeões aos jogadores do time vermelho (team2)
  gameData.team2.forEach((player, index) => {
    // Buscar o pick correspondente a este jogador
    const playerPick = picksWithPlayerInfo.find((pick) => {
      if (pick.team === 'red') {
        // Usar ordem de index para mapeamento
        return true; // Será filtrado por ordem
      }
      return false;
    });

    if (playerPick && playerPick.champion) {
      player.champion = playerPick.champion;
      console.log(`✅ [Team2] ${player.summonerName} mapeado para ${playerPick.champion.name}`);
    } else {
      console.log(`⚠️ [Team2] ${player.summonerName} não encontrou pick correspondente`);
    }
  });

  // Fallback: Se não conseguimos mapear por jogador específico, usar ordem sequencial
  const bluePicks = picksWithPlayerInfo.filter(p => p.team === 'blue');
  const redPicks = picksWithPlayerInfo.filter(p => p.team === 'red');

  // Aplicar fallback para time azul
  gameData.team1.forEach((player, index) => {
    if (!player.champion && bluePicks[index] && bluePicks[index].champion) {
      player.champion = bluePicks[index].champion;
      console.log(`🔄 [Fallback Team1] ${player.summonerName} mapeado para ${bluePicks[index].champion.name} (por ordem)`);
    }
  });

  // Aplicar fallback para time vermelho
  gameData.team2.forEach((player, index) => {
    if (!player.champion && redPicks[index] && redPicks[index].champion) {
      player.champion = redPicks[index].champion;
      console.log(`🔄 [Fallback Team2] ${player.summonerName} mapeado para ${redPicks[index].champion.name} (por ordem)`);
    }
  });

  console.log('✅ [updatePlayersWithChampions] Mapeamento concluído');
  console.log('📊 Team1 com campeões:', gameData.team1.map(p => ({ name: p.summonerName, champion: p.champion?.name })));
  console.log('📊 Team2 com campeões:', gameData.team2.map(p => ({ name: p.summonerName, champion: p.champion?.name })));
}

// Testar o fluxo completo
console.log('🧪 TESTE: Estrutura de dados preliminares');
console.log('==========================================');

// Simular gameData
const gameData = {
  team1: mockPickBanResult.blueTeam,
  team2: mockPickBanResult.redTeam,
  pickBanData: mockPickBanResult
};

// Atualizar jogadores com campeões
updatePlayersWithChampions(mockPickBanResult, gameData);

// Criar dados preliminares
const participantsData = createPreliminaryParticipantsData({
  team1: gameData.team1,
  team2: gameData.team2,
  pickBanData: mockPickBanResult,
  winner: null,
  duration: 0,
  detectedByLCU: false
});

console.log('\n📊 RESULTADO FINAL:');
console.log('===================');
participantsData.forEach((participant, index) => {
  console.log(`${index + 1}. ${participant.summonerName} (${participant.lane}) - ${participant.championName} (ID: ${participant.championId})`);
});

console.log('\n🔍 PROBLEMA IDENTIFICADO:');
console.log('========================');
console.log('O problema está na função getChampionFromPickBanData que não está encontrando os campeões corretamente.');
console.log('A estrutura dos dados de pick/ban não está sendo mapeada corretamente para os jogadores.');

// Verificar a estrutura dos dados de pick/ban
console.log('\n📋 ESTRUTURA DOS DADOS DE PICK/BAN:');
console.log('====================================');
console.log('Phases:', mockPickBanResult.session.phases.length);
console.log('Blue picks:', mockPickBanResult.session.phases.filter(p => p.team === 'blue' && p.action === 'pick').length);
console.log('Red picks:', mockPickBanResult.session.phases.filter(p => p.team === 'red' && p.action === 'pick').length); 