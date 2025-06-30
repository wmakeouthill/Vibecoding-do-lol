// Script simples para testar mapeamento de campeões
const mockDraftData = {
  team1: [
    { id: 1, summonerName: "Bot8", lane: "top" },
    { id: 2, summonerName: "Bot4", lane: "jungle" },
    { id: 3, summonerName: "Bot1", lane: "mid" },
    { id: 4, summonerName: "Bot7", lane: "adc" },
    { id: 5, summonerName: "Bot5", lane: "support" }
  ],
  team2: [
    { id: 6, summonerName: "Bot2", lane: "top" },
    { id: 7, summonerName: "Bot9", lane: "jungle" },
    { id: 8, summonerName: "Bot6", lane: "mid" },
    { id: 9, summonerName: "Bot3", lane: "adc" },
    { id: 10, summonerName: "popcorn seller#coup", lane: "support" }
  ]
};

const mockPickBanResult = {
  picks: [
    { team: 'blue', champion: { id: 266, name: 'Aatrox' }, playerId: 1, playerName: 'Bot8' },
    { team: 'blue', champion: { id: 121, name: 'Kha\'Zix' }, playerId: 2, playerName: 'Bot4' },
    { team: 'blue', champion: { id: 103, name: 'Ahri' }, playerId: 3, playerName: 'Bot1' },
    { team: 'blue', champion: { id: 51, name: 'Caitlyn' }, playerId: 4, playerName: 'Bot7' },
    { team: 'blue', champion: { id: 412, name: 'Thresh' }, playerId: 5, playerName: 'Bot5' },
    { team: 'red', champion: { id: 23, name: 'Tryndamere' }, playerId: 6, playerName: 'Bot2' },
    { team: 'red', champion: { id: 64, name: 'Lee Sin' }, playerId: 7, playerName: 'Bot9' },
    { team: 'red', champion: { id: 245, name: 'Ekko' }, playerId: 8, playerName: 'Bot6' },
    { team: 'red', champion: { id: 15, name: 'Sivir' }, playerId: 9, playerName: 'Bot3' },
    { team: 'red', champion: { id: 40, name: 'Janna' }, playerId: 10, playerName: 'popcorn seller#coup' }
  ]
};

function updatePlayersWithChampions(pickBanResult, gameData) {
  if (!gameData || !pickBanResult.picks) return;

  const picksWithPlayerInfo = pickBanResult.picks || [];

  // Mapear campeões aos jogadores do time azul (team1)
  gameData.team1.forEach((player) => {
    const playerPick = picksWithPlayerInfo.find((pick) => {
      if (pick.team === 'blue') {
        if (pick.playerId && pick.playerId === player.id) return true;
        if (pick.playerName && pick.playerName === player.summonerName) return true;
      }
      return false;
    });

    if (playerPick && playerPick.champion) {
      player.champion = playerPick.champion;
    }
  });

  // Mapear campeões aos jogadores do time vermelho (team2)
  gameData.team2.forEach((player) => {
    const playerPick = picksWithPlayerInfo.find((pick) => {
      if (pick.team === 'red') {
        if (pick.playerId && pick.playerId === player.id) return true;
        if (pick.playerName && pick.playerName === player.summonerName) return true;
      }
      return false;
    });

    if (playerPick && playerPick.champion) {
      player.champion = playerPick.champion;
    }
  });
}

function createPreliminaryParticipantsData(gameData) {
  const participants = [];
  let participantId = 1;

  // Processar time azul (team1)
  gameData.team1.forEach((player) => {
    const participant = {
      participantId: participantId++,
      teamId: 100,
      championId: player.champion?.id || 0,
      championName: player.champion?.name || 'Unknown',
      summonerName: player.summonerName,
      lane: player.lane,
      // ... outros campos zerados
    };
    participants.push(participant);
  });

  // Processar time vermelho (team2)
  gameData.team2.forEach((player) => {
    const participant = {
      participantId: participantId++,
      teamId: 200,
      championId: player.champion?.id || 0,
      championName: player.champion?.name || 'Unknown',
      summonerName: player.summonerName,
      lane: player.lane,
      // ... outros campos zerados
    };
    participants.push(participant);
  });

  return participants;
}

// Executar teste
const gameData = {
  team1: [...mockDraftData.team1],
  team2: [...mockDraftData.team2]
};

updatePlayersWithChampions(mockPickBanResult, gameData);
const preliminaryData = createPreliminaryParticipantsData(gameData);

console.log('RESULTADO DO MAPEAMENTO:');
console.log('Team1:', gameData.team1.map(p => `${p.summonerName}: ${p.champion?.name || 'Unknown'} (ID: ${p.champion?.id || 0})`));
console.log('Team2:', gameData.team2.map(p => `${p.summonerName}: ${p.champion?.name || 'Unknown'} (ID: ${p.champion?.id || 0})`));

console.log('\nDADOS PRELIMINARES:');
preliminaryData.forEach(p => {
  console.log(`${p.summonerName}: championId=${p.championId}, championName="${p.championName}"`);
});

const unknownChampions = preliminaryData.filter(p => p.championId === 0 || p.championName === 'Unknown');
if (unknownChampions.length > 0) {
  console.log(`\n❌ PROBLEMA: ${unknownChampions.length} campeões desconhecidos`);
} else {
  console.log('\n✅ SUCESSO: Todos os campeões mapeados corretamente!');
} 