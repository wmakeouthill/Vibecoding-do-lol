// Script para debugar os dados do draft
console.log('🧪 Testando dados do draft...\n');

// Simular dados que vêm do draft (como eles realmente chegam)
const mockPickBanResult = {
  sessionId: 'draft_123',
  picks: [
    { team: 'blue', champion: { id: 266, name: 'Aatrox' }, playerId: 1, playerName: 'Bot1' },
    { team: 'blue', champion: { id: 121, name: 'Kha\'Zix' }, playerId: 2, playerName: 'Bot6' },
    { team: 'blue', champion: { id: 103, name: 'Ahri' }, playerId: 3, playerName: 'Bot3' },
    { team: 'blue', champion: { id: 51, name: 'Caitlyn' }, playerId: 4, playerName: 'Bot8' },
    { team: 'blue', champion: { id: 412, name: 'Thresh' }, playerId: 5, playerName: 'Bot5' },
    { team: 'red', champion: { id: 23, name: 'Tryndamere' }, playerId: 6, playerName: 'Bot2' },
    { team: 'red', champion: { id: 64, name: 'Lee Sin' }, playerId: 7, playerName: 'Bot7' },
    { team: 'red', champion: { id: 245, name: 'Ekko' }, playerId: 8, playerName: 'Bot4' },
    { team: 'red', champion: { id: 15, name: 'Sivir' }, playerId: 9, playerName: 'Bot9' },
    { team: 'red', champion: { id: 40, name: 'Janna' }, playerId: 10, playerName: 'popcorn seller#coup' }
  ]
};

// Simular dados do draft (como eles vêm do backend)
const mockDraftData = {
  team1: [
    { id: 1, summonerName: "Bot1", lane: "top" },
    { id: 2, summonerName: "Bot6", lane: "jungle" },
    { id: 3, summonerName: "Bot3", lane: "mid" },
    { id: 4, summonerName: "Bot8", lane: "adc" },
    { id: 5, summonerName: "Bot5", lane: "support" }
  ],
  team2: [
    { id: 6, summonerName: "Bot2", lane: "top" },
    { id: 7, summonerName: "Bot7", lane: "jungle" },
    { id: 8, summonerName: "Bot4", lane: "mid" },
    { id: 9, summonerName: "Bot9", lane: "adc" },
    { id: 10, summonerName: "popcorn seller#coup", lane: "support" }
  ]
};

// Simular o gameData que é criado
const gameData = {
  sessionId: mockPickBanResult.sessionId,
  gameId: 'custom_' + Date.now(),
  team1: [...mockDraftData.team1],
  team2: [...mockDraftData.team2],
  startTime: new Date(),
  pickBanData: mockPickBanResult,
  isCustomGame: true,
  originalMatchId: 'draft_123'
};

console.log('📊 Dados iniciais:');
console.log('Pick/Ban result:', JSON.stringify(mockPickBanResult, null, 2));
console.log('Draft data:', JSON.stringify(mockDraftData, null, 2));
console.log('Game data inicial:', JSON.stringify(gameData, null, 2));

// Simular o método updatePlayersWithChampions
function updatePlayersWithChampions(pickBanResult, gameData) {
  console.log('\n🎯 [updatePlayersWithChampions] Iniciando mapeamento...');
  
  if (!gameData || !pickBanResult.picks) {
    console.log('❌ Dados insuficientes para mapeamento');
    return;
  }

  const picksWithPlayerInfo = pickBanResult.picks || [];
  console.log('👥 Picks com informações de jogador:', picksWithPlayerInfo.length);

  // Mapear campeões aos jogadores do time azul (team1)
  gameData.team1.forEach((player, index) => {
    console.log(`\n🔍 Processando ${player.summonerName} (ID: ${player.id})`);
    
    const playerPick = picksWithPlayerInfo.find((pick) => {
      if (pick.team === 'blue') {
        if (pick.playerId && pick.playerId === player.id) {
          console.log(`  ✅ Match por playerId: ${pick.playerId} === ${player.id}`);
          return true;
        }
        if (pick.playerName && pick.playerName === player.summonerName) {
          console.log(`  ✅ Match por playerName: ${pick.playerName} === ${player.summonerName}`);
          return true;
        }
      }
      return false;
    });

    if (playerPick && playerPick.champion) {
      player.champion = playerPick.champion;
      console.log(`✅ ${player.summonerName} mapeado para ${playerPick.champion.name} (ID: ${playerPick.champion.id})`);
    } else {
      console.log(`⚠️ ${player.summonerName} não encontrou pick correspondente`);
    }
  });

  // Mapear campeões aos jogadores do time vermelho (team2)
  gameData.team2.forEach((player, index) => {
    console.log(`\n🔍 Processando ${player.summonerName} (ID: ${player.id})`);
    
    const playerPick = picksWithPlayerInfo.find((pick) => {
      if (pick.team === 'red') {
        if (pick.playerId && pick.playerId === player.id) {
          console.log(`  ✅ Match por playerId: ${pick.playerId} === ${player.id}`);
          return true;
        }
        if (pick.playerName && pick.playerName === player.summonerName) {
          console.log(`  ✅ Match por playerName: ${pick.playerName} === ${player.summonerName}`);
          return true;
        }
      }
      return false;
    });

    if (playerPick && playerPick.champion) {
      player.champion = playerPick.champion;
      console.log(`✅ ${player.summonerName} mapeado para ${playerPick.champion.name} (ID: ${playerPick.champion.id})`);
    } else {
      console.log(`⚠️ ${player.summonerName} não encontrou pick correspondente`);
    }
  });

  console.log('\n📊 Resultado do mapeamento:');
  console.log('Team1:', gameData.team1.map(p => `${p.summonerName}: ${p.champion?.name || 'Unknown'} (ID: ${p.champion?.id || 0})`));
  console.log('Team2:', gameData.team2.map(p => `${p.summonerName}: ${p.champion?.name || 'Unknown'} (ID: ${p.champion?.id || 0})`));
}

// Simular o método createPreliminaryParticipantsData
function createPreliminaryParticipantsData(gameData) {
  console.log('\n🎯 [createPreliminaryParticipantsData] Criando dados preliminares...');
  
  const participants = [];
  let participantId = 1;

  // Team 1 (azul)
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
    console.log(`👤 [Team1] ${player.summonerName}: championId=${participant.championId}, championName="${participant.championName}"`);
    participants.push(participant);
  });

  // Team 2 (vermelho)
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
    console.log(`👤 [Team2] ${player.summonerName}: championId=${participant.championId}, championName="${participant.championName}"`);
    participants.push(participant);
  });

  return participants;
}

// Executar o teste
console.log('🚀 Executando teste completo...\n');

// 1. Mapear campeões
updatePlayersWithChampions(mockPickBanResult, gameData);

// 2. Criar dados preliminares
const participantsData = createPreliminaryParticipantsData(gameData);

console.log('\n🎯 RESULTADO FINAL:');
console.log('JSON dos dados preliminares:');
console.log(JSON.stringify(participantsData, null, 2));

const unknownChampions = participantsData.filter(p => p.championId === 0 || p.championName === 'Unknown');
if (unknownChampions.length > 0) {
  console.log(`\n❌ PROBLEMA: ${unknownChampions.length} campeões desconhecidos`);
  unknownChampions.forEach(p => {
    console.log(`  - ${p.summonerName}: championId=${p.championId}, championName="${p.championName}"`);
  });
} else {
  console.log('\n✅ SUCESSO: Todos os campeões mapeados corretamente!');
}

console.log('\n🏁 Teste concluído!'); 