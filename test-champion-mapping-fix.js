// Test script para verificar o mapeamento de campeões corrigido
const pickBanResult = {
  session: {
    phases: [
      { team: 'blue', action: 'ban', champion: { id: '101', name: 'Xerath' }, playerId: 'Bot3', playerName: 'Bot3', playerIndex: 0 },
      { team: 'red', action: 'ban', champion: { id: '102', name: 'Yasuo' }, playerId: 'Bot2', playerName: 'Bot2', playerIndex: 0 },
      { team: 'blue', action: 'ban', champion: { id: '103', name: 'Zed' }, playerId: 'Bot7', playerName: 'Bot7', playerIndex: 1 },
      { team: 'red', action: 'ban', champion: { id: '104', name: 'Katarina' }, playerId: 'Bot4', playerName: 'Bot4', playerIndex: 1 },
      { team: 'blue', action: 'ban', champion: { id: '105', name: 'Akali' }, playerId: 'Bot5', playerName: 'Bot5', playerIndex: 2 },
      { team: 'red', action: 'ban', champion: { id: '106', name: 'Fizz' }, playerId: 'Bot6', playerName: 'Bot6', playerIndex: 2 },
      { team: 'blue', action: 'pick', champion: { id: '1', name: 'Annie' }, playerId: 'Bot3', playerName: 'Bot3', playerIndex: 0 },
      { team: 'red', action: 'pick', champion: { id: '2', name: 'Olaf' }, playerId: 'Bot2', playerName: 'Bot2', playerIndex: 0 },
      { team: 'red', action: 'pick', champion: { id: '3', name: 'Galio' }, playerId: 'Bot4', playerName: 'Bot4', playerIndex: 1 },
      { team: 'blue', action: 'pick', champion: { id: '4', name: 'Twisted Fate' }, playerId: 'Bot7', playerName: 'Bot7', playerIndex: 1 },
      { team: 'blue', action: 'pick', champion: { id: '5', name: 'Xin Zhao' }, playerId: 'Bot5', playerName: 'Bot5', playerIndex: 2 },
      { team: 'red', action: 'pick', champion: { id: '6', name: 'Urgot' }, playerId: 'Bot6', playerName: 'Bot6', playerIndex: 2 },
      { team: 'red', action: 'ban', champion: { id: '107', name: 'LeBlanc' }, playerId: 'Bot1', playerName: 'Bot1', playerIndex: 3 },
      { team: 'blue', action: 'ban', champion: { id: '108', name: 'Vladimir' }, playerId: 'Bot8', playerName: 'Bot8', playerIndex: 3 },
      { team: 'red', action: 'ban', champion: { id: '109', name: 'Fiddlesticks' }, playerId: 'popcorn seller#coup', playerName: 'popcorn seller#coup', playerIndex: 4 },
      { team: 'blue', action: 'ban', champion: { id: '110', name: 'Chogath' }, playerId: 'Bot9', playerName: 'Bot9', playerIndex: 4 },
      { team: 'red', action: 'pick', champion: { id: '7', name: 'Ryze' }, playerId: 'Bot1', playerName: 'Bot1', playerIndex: 3 },
      { team: 'blue', action: 'pick', champion: { id: '8', name: 'Sion' }, playerId: 'Bot8', playerName: 'Bot8', playerIndex: 3 },
      { team: 'blue', action: 'pick', champion: { id: '9', name: 'Janna' }, playerId: 'Bot9', playerName: 'Bot9', playerIndex: 4 },
      { team: 'red', action: 'pick', champion: { id: '10', name: 'Malphite' }, playerId: 'popcorn seller#coup', playerName: 'popcorn seller#coup', playerIndex: 4 }
    ]
  }
};

// Simular gameData
const gameData = {
  team1: [
    { name: 'Bot3', champion: undefined, championId: undefined, hasChampion: false },
    { name: 'Bot7', champion: undefined, championId: undefined, hasChampion: false },
    { name: 'Bot5', champion: undefined, championId: undefined, hasChampion: false },
    { name: 'Bot8', champion: undefined, championId: undefined, hasChampion: false },
    { name: 'Bot9', champion: undefined, championId: undefined, hasChampion: false }
  ],
  team2: [
    { name: 'Bot2', champion: undefined, championId: undefined, hasChampion: false },
    { name: 'Bot4', champion: undefined, championId: undefined, hasChampion: false },
    { name: 'Bot6', champion: undefined, championId: undefined, hasChampion: false },
    { name: 'Bot1', champion: undefined, championId: undefined, hasChampion: false },
    { name: 'popcorn seller#coup', champion: undefined, championId: undefined, hasChampion: false }
  ]
};

// Função corrigida
function updatePlayersWithChampions(pickBanResult, gameData) {
  console.log('🔄 [updatePlayersWithChampions] Iniciando mapeamento de campeões');
  
  // Verificar se temos dados suficientes
  if (!gameData || !pickBanResult?.session?.phases) {
    console.log('❌ [updatePlayersWithChampions] Dados insuficientes para mapeamento');
    console.log('❌ gameData existe:', !!gameData);
    console.log('❌ pickBanResult.session.phases existe:', !!pickBanResult?.session?.phases);
    return;
  }

  // Extrair picks das fases do draft
  const picks = pickBanResult.session.phases
    .filter((phase) => phase.action === 'pick' && phase.champion)
    .map((phase) => ({
      team: phase.team,
      champion: phase.champion,
      playerId: phase.playerId,
      playerName: phase.playerName,
      playerIndex: phase.playerIndex
    }));

  console.log('🎯 Picks extraídos das fases:', picks.length);
  console.log('🎯 Picks detalhados:', picks.map((p) => ({
    team: p.team,
    champion: p.champion?.name,
    playerId: p.playerId,
    playerName: p.playerName,
    playerIndex: p.playerIndex
  })));

  // Separar picks por time
  const bluePicks = picks.filter((p) => p.team === 'blue');
  const redPicks = picks.filter((p) => p.team === 'red');

  console.log('🔵 Blue picks:', bluePicks.length);
  console.log('🔴 Red picks:', redPicks.length);

  // Mapear campeões para jogadores do time 1 (blue)
  bluePicks.forEach((pick, index) => {
    if (gameData.team1[index]) {
      gameData.team1[index].champion = pick.champion;
      gameData.team1[index].championId = pick.champion.id;
      gameData.team1[index].hasChampion = true;
      console.log(`✅ [Team1] ${gameData.team1[index].name} -> ${pick.champion.name} (ID: ${pick.champion.id})`);
    }
  });

  // Mapear campeões para jogadores do time 2 (red)
  redPicks.forEach((pick, index) => {
    if (gameData.team2[index]) {
      gameData.team2[index].champion = pick.champion;
      gameData.team2[index].championId = pick.champion.id;
      gameData.team2[index].hasChampion = true;
      console.log(`✅ [Team2] ${gameData.team2[index].name} -> ${pick.champion.name} (ID: ${pick.champion.id})`);
    }
  });

  console.log('🎯 Mapeamento de campeões concluído');
  console.log('📊 Team1 após mapeamento:', gameData.team1.map((p) => ({ name: p.name, champion: p.champion?.name, championId: p.championId })));
  console.log('📊 Team2 após mapeamento:', gameData.team2.map((p) => ({ name: p.name, champion: p.champion?.name, championId: p.championId })));
}

// Executar teste
console.log('🧪 Testando mapeamento de campeões corrigido...\n');
updatePlayersWithChampions(pickBanResult, gameData);

console.log('\n✅ Teste concluído!'); 