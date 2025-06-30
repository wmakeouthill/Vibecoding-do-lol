// Script para debugar o mapeamento de campeões
const fs = require('fs');

// Simular dados do draft como eles vêm do frontend
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

// Simular dados do pick/ban como eles vêm do draft
const mockPickBanResult = {
  sessionId: 'draft_123',
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
  ],
  blueTeamPicks: [
    { team: 'blue', champion: { id: 266, name: 'Aatrox' } },
    { team: 'blue', champion: { id: 121, name: 'Kha\'Zix' } },
    { team: 'blue', champion: { id: 103, name: 'Ahri' } },
    { team: 'blue', champion: { id: 51, name: 'Caitlyn' } },
    { team: 'blue', champion: { id: 412, name: 'Thresh' } }
  ],
  redTeamPicks: [
    { team: 'red', champion: { id: 23, name: 'Tryndamere' } },
    { team: 'red', champion: { id: 64, name: 'Lee Sin' } },
    { team: 'red', champion: { id: 245, name: 'Ekko' } },
    { team: 'red', champion: { id: 15, name: 'Sivir' } },
    { team: 'red', champion: { id: 40, name: 'Janna' } }
  ]
};

// Simular o método updatePlayersWithChampions do frontend
function updatePlayersWithChampions(pickBanResult, gameData) {
  console.log('🎯 [updatePlayersWithChampions] Iniciando mapeamento de campeões aos jogadores');
  console.log('📊 Pick/Ban result:', JSON.stringify(pickBanResult, null, 2));

  if (!gameData || !pickBanResult.picks) {
    console.log('❌ Dados insuficientes para mapeamento');
    return;
  }

  // Buscar os picks com informações do jogador que escolheu
  const picksWithPlayerInfo = pickBanResult.picks || [];
  console.log('👥 Picks com informações de jogador:', picksWithPlayerInfo);

  // Mapear campeões aos jogadores do time azul (team1)
  gameData.team1.forEach((player, index) => {
    console.log(`\n🔍 Processando jogador do time azul: ${player.summonerName} (ID: ${player.id})`);
    
    // Buscar o pick correspondente a este jogador
    const playerPick = picksWithPlayerInfo.find((pick) => {
      console.log(`  🔍 Verificando pick:`, pick);
      
      // Verificar se o pick é do time azul e corresponde ao jogador
      if (pick.team === 'blue') {
        // Se temos informação do jogador que escolheu
        if (pick.playerId && pick.playerId === player.id) {
          console.log(`    ✅ Match por playerId: ${pick.playerId} === ${player.id}`);
          return true;
        }
        if (pick.playerName && pick.playerName === player.summonerName) {
          console.log(`    ✅ Match por playerName: ${pick.playerName} === ${player.summonerName}`);
          return true;
        }
        // Se não temos informação específica, usar ordem de index
        if (!pick.playerId && !pick.playerName) {
          console.log(`    ⚠️ Pick sem informações específicas de jogador`);
          return true; // Será filtrado por ordem
        }
      }
      return false;
    });

    if (playerPick && playerPick.champion) {
      player.champion = playerPick.champion;
      console.log(`✅ [Team1] ${player.summonerName} mapeado para ${playerPick.champion.name} (ID: ${playerPick.champion.id})`);
    } else {
      console.log(`⚠️ [Team1] ${player.summonerName} não encontrou pick correspondente`);
    }
  });

  // Mapear campeões aos jogadores do time vermelho (team2)
  gameData.team2.forEach((player, index) => {
    console.log(`\n🔍 Processando jogador do time vermelho: ${player.summonerName} (ID: ${player.id})`);
    
    // Buscar o pick correspondente a este jogador
    const playerPick = picksWithPlayerInfo.find((pick) => {
      console.log(`  🔍 Verificando pick:`, pick);
      
      // Verificar se o pick é do time vermelho e corresponde ao jogador
      if (pick.team === 'red') {
        // Se temos informação do jogador que escolheu
        if (pick.playerId && pick.playerId === player.id) {
          console.log(`    ✅ Match por playerId: ${pick.playerId} === ${player.id}`);
          return true;
        }
        if (pick.playerName && pick.playerName === player.summonerName) {
          console.log(`    ✅ Match por playerName: ${pick.playerName} === ${player.summonerName}`);
          return true;
        }
        // Se não temos informação específica, usar ordem de index
        if (!pick.playerId && !pick.playerName) {
          console.log(`    ⚠️ Pick sem informações específicas de jogador`);
          return true; // Será filtrado por ordem
        }
      }
      return false;
    });

    if (playerPick && playerPick.champion) {
      player.champion = playerPick.champion;
      console.log(`✅ [Team2] ${player.summonerName} mapeado para ${playerPick.champion.name} (ID: ${playerPick.champion.id})`);
    } else {
      console.log(`⚠️ [Team2] ${player.summonerName} não encontrou pick correspondente`);
    }
  });

  // Fallback: Se não conseguimos mapear por jogador específico, usar ordem sequencial
  const bluePicks = pickBanResult.blueTeamPicks || pickBanResult.picks.filter((p) => p.team === 'blue');
  const redPicks = pickBanResult.redTeamPicks || pickBanResult.picks.filter((p) => p.team === 'red');

  console.log('\n🔄 Aplicando fallback por ordem...');
  console.log('Blue picks para fallback:', bluePicks);
  console.log('Red picks para fallback:', redPicks);

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

  console.log('\n✅ [updatePlayersWithChampions] Mapeamento concluído');
  console.log('📊 Team1 com campeões:', gameData.team1.map((p) => ({ name: p.summonerName, champion: p.champion?.name, championId: p.champion?.id })));
  console.log('📊 Team2 com campeões:', gameData.team2.map((p) => ({ name: p.summonerName, champion: p.champion?.name, championId: p.champion?.id })));
}

// Simular o método createPreliminaryParticipantsData
function createPreliminaryParticipantsData(gameData) {
  console.log('\n🎯 [createPreliminaryParticipantsData] Criando dados preliminares dos participantes');
  
  const participants = [];
  let participantId = 1;

  // Processar time azul (team1)
  gameData.team1.forEach((player, index) => {
    const participant = {
      participantId: participantId++,
      teamId: 100,
      championId: player.champion?.id || 0,
      championName: player.champion?.name || 'Unknown',
      summonerName: player.summonerName,
      riotIdGameName: player.summonerName,
      riotIdTagline: '',
      lane: player.lane,
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
      win: false
    };

    console.log(`👤 [Team1] ${player.summonerName}: championId=${participant.championId}, championName="${participant.championName}"`);
    participants.push(participant);
  });

  // Processar time vermelho (team2)
  gameData.team2.forEach((player, index) => {
    const participant = {
      participantId: participantId++,
      teamId: 200,
      championId: player.champion?.id || 0,
      championName: player.champion?.name || 'Unknown',
      summonerName: player.summonerName,
      riotIdGameName: player.summonerName,
      riotIdTagline: '',
      lane: player.lane,
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
      win: false
    };

    console.log(`👤 [Team2] ${player.summonerName}: championId=${participant.championId}, championName="${participant.championName}"`);
    participants.push(participant);
  });

  console.log('\n📊 Dados preliminares criados:', participants.length, 'participantes');
  return participants;
}

// Executar o teste
console.log('🧪 Iniciando teste de mapeamento de campeões...\n');

// Criar gameData similar ao que é criado no startGamePhase
const gameData = {
  sessionId: mockPickBanResult.sessionId || 'game_' + Date.now(),
  gameId: 'custom_' + Date.now(),
  team1: [...mockDraftData.team1], // Copiar para não modificar o original
  team2: [...mockDraftData.team2], // Copiar para não modificar o original
  startTime: new Date(),
  pickBanData: mockPickBanResult,
  isCustomGame: true,
  originalMatchId: 'draft_123'
};

console.log('🎮 Game data inicial:', {
  team1Count: gameData.team1.length,
  team2Count: gameData.team2.length,
  hasPickBanData: !!gameData.pickBanData
});

// Executar o mapeamento de campeões
updatePlayersWithChampions(mockPickBanResult, gameData);

// Criar dados preliminares dos participantes
const preliminaryData = createPreliminaryParticipantsData(gameData);

console.log('\n🎯 RESULTADO FINAL:');
console.log('JSON dos dados preliminares:');
console.log(JSON.stringify(preliminaryData, null, 2));

// Verificar se há campeões com ID 0 ou nome "Unknown"
const unknownChampions = preliminaryData.filter(p => p.championId === 0 || p.championName === 'Unknown');
if (unknownChampions.length > 0) {
  console.log('\n❌ PROBLEMA DETECTADO:');
  console.log(`${unknownChampions.length} participantes com campeões desconhecidos:`);
  unknownChampions.forEach(p => {
    console.log(`  - ${p.summonerName}: championId=${p.championId}, championName="${p.championName}"`);
  });
} else {
  console.log('\n✅ SUCESSO: Todos os campeões foram mapeados corretamente!');
}

console.log('\n🏁 Teste concluído!'); 