console.log('🧪 [TeamOrder] Testando ordem dos times...');

// Simular o funcionamento do método assignLanesByMMRAndPreferences
function simulateAssignLanesByMMRAndPreferences(players) {
  console.log('🎯 [Matchmaking] Simulando atribuição de lanes...');
  
  // Mapear lanes para teamIndex
  const laneOrder = ['top', 'jungle', 'mid', 'bot', 'support'];
  const laneToTeamIndex = {
    'top': { team1: 0, team2: 5 },
    'jungle': { team1: 1, team2: 6 },
    'mid': { team1: 2, team2: 7 },
    'bot': { team1: 3, team2: 8 },
    'support': { team1: 4, team2: 9 }
  };
  
  // Ordenar jogadores por MMR (maior primeiro)
  const sortedPlayers = [...players].sort((a, b) => b.mmr - a.mmr);
  
  console.log('🎯 [Matchmaking] Jogadores ordenados por MMR:');
  sortedPlayers.forEach((p, index) => {
    console.log(`  ${index + 1}. ${p.summonerName} - MMR: ${p.mmr} - Preferências: ${p.primaryLane}/${p.secondaryLane}`);
  });
  
  // Sistema de atribuição
  const laneAssignments = {
    'top': { team1: false, team2: false },
    'jungle': { team1: false, team2: false },
    'mid': { team1: false, team2: false },
    'bot': { team1: false, team2: false },
    'support': { team1: false, team2: false }
  };
  
  const playersWithLanes = [];
  
  // Primeira passada - lanes primárias por prioridade de MMR
  for (let i = 0; i < sortedPlayers.length; i++) {
    const player = sortedPlayers[i];
    const primaryLane = player.primaryLane || 'fill';
    const secondaryLane = player.secondaryLane || 'fill';
    
    let assignedLane = null;
    let isAutofill = false;
    let teamIndex = null;
    
    console.log(`\n🎯 [Matchmaking] Processando jogador ${i + 1}: ${player.summonerName} (MMR: ${player.mmr})`);
    
    // Prioridade 1: Lane primária
    if (primaryLane !== 'fill' && laneAssignments[primaryLane]) {
      if (!laneAssignments[primaryLane].team1) {
        assignedLane = primaryLane;
        isAutofill = false;
        teamIndex = laneToTeamIndex[primaryLane].team1;
        laneAssignments[primaryLane].team1 = true;
        console.log(`  ✅ Lane primária TEAM1: ${primaryLane} (teamIndex: ${teamIndex})`);
      } else if (!laneAssignments[primaryLane].team2) {
        assignedLane = primaryLane;
        isAutofill = false;
        teamIndex = laneToTeamIndex[primaryLane].team2;
        laneAssignments[primaryLane].team2 = true;
        console.log(`  ✅ Lane primária TEAM2: ${primaryLane} (teamIndex: ${teamIndex})`);
      }
    }
    
    // Prioridade 2: Lane secundária
    if (!assignedLane && secondaryLane !== 'fill' && laneAssignments[secondaryLane]) {
      if (!laneAssignments[secondaryLane].team1) {
        assignedLane = secondaryLane;
        isAutofill = false;
        teamIndex = laneToTeamIndex[secondaryLane].team1;
        laneAssignments[secondaryLane].team1 = true;
        console.log(`  🟡 Lane secundária TEAM1: ${secondaryLane} (teamIndex: ${teamIndex})`);
      } else if (!laneAssignments[secondaryLane].team2) {
        assignedLane = secondaryLane;
        isAutofill = false;
        teamIndex = laneToTeamIndex[secondaryLane].team2;
        laneAssignments[secondaryLane].team2 = true;
        console.log(`  🟡 Lane secundária TEAM2: ${secondaryLane} (teamIndex: ${teamIndex})`);
      }
    }
    
    // Prioridade 3: Autofill
    if (!assignedLane) {
      for (const lane of laneOrder) {
        if (!laneAssignments[lane].team1) {
          assignedLane = lane;
          isAutofill = true;
          teamIndex = laneToTeamIndex[lane].team1;
          laneAssignments[lane].team1 = true;
          console.log(`  🔴 AUTOFILL TEAM1: ${lane} (teamIndex: ${teamIndex})`);
          break;
        } else if (!laneAssignments[lane].team2) {
          assignedLane = lane;
          isAutofill = true;
          teamIndex = laneToTeamIndex[lane].team2;
          laneAssignments[lane].team2 = true;
          console.log(`  🔴 AUTOFILL TEAM2: ${lane} (teamIndex: ${teamIndex})`);
          break;
        }
      }
    }
    
    if (!assignedLane) {
      console.error(`❌ Não foi possível atribuir lane para ${player.summonerName}!`);
      return [];
    }
    
    // Adicionar jogador com lane atribuída
    playersWithLanes.push({
      ...player,
      assignedLane: assignedLane,
      isAutofill: isAutofill,
      teamIndex: teamIndex
    });
  }
  
  // Ordenar por teamIndex
  return playersWithLanes.sort((a, b) => a.teamIndex - b.teamIndex);
}

// Simular 10 bots
const bots = [
  { summonerName: 'Bot1', mmr: 1900, primaryLane: 'top', secondaryLane: 'jungle', isBot: true },
  { summonerName: 'Bot2', mmr: 1800, primaryLane: 'jungle', secondaryLane: 'mid', isBot: true },
  { summonerName: 'Bot3', mmr: 1700, primaryLane: 'mid', secondaryLane: 'bot', isBot: true },
  { summonerName: 'Bot4', mmr: 1600, primaryLane: 'bot', secondaryLane: 'support', isBot: true },
  { summonerName: 'Bot5', mmr: 1500, primaryLane: 'support', secondaryLane: 'top', isBot: true },
  { summonerName: 'Bot6', mmr: 1400, primaryLane: 'top', secondaryLane: 'jungle', isBot: true },
  { summonerName: 'Bot7', mmr: 1300, primaryLane: 'jungle', secondaryLane: 'mid', isBot: true },
  { summonerName: 'Bot8', mmr: 1200, primaryLane: 'mid', secondaryLane: 'bot', isBot: true },
  { summonerName: 'Bot9', mmr: 1100, primaryLane: 'bot', secondaryLane: 'support', isBot: true },
  { summonerName: 'Bot10', mmr: 1000, primaryLane: 'support', secondaryLane: 'top', isBot: true }
];

console.log('🧪 [TeamOrder] Bots criados:');
bots.forEach((bot, index) => {
  console.log(`  ${index + 1}. ${bot.summonerName} - MMR: ${bot.mmr} - Lanes: ${bot.primaryLane}/${bot.secondaryLane}`);
});

// Testar atribuição
const playersWithLanes = simulateAssignLanesByMMRAndPreferences(bots);

if (playersWithLanes.length === 10) {
  console.log('\n✅ [TeamOrder] Lanes atribuídas com sucesso!');
  
  // Separar times
  const team1 = playersWithLanes.filter(p => p.teamIndex < 5);
  const team2 = playersWithLanes.filter(p => p.teamIndex >= 5);
  
  console.log('\n🧪 [TeamOrder] TIME 1 (Azul - teamIndex 0-4):');
  team1.forEach(p => {
    console.log(`  teamIndex ${p.teamIndex}: ${p.summonerName} - ${p.assignedLane} - MMR: ${p.mmr} - ${p.isAutofill ? 'AUTOFILL' : 'PREFERÊNCIA'}`);
  });
  
  console.log('\n🧪 [TeamOrder] TIME 2 (Vermelho - teamIndex 5-9):');
  team2.forEach(p => {
    console.log(`  teamIndex ${p.teamIndex}: ${p.summonerName} - ${p.assignedLane} - MMR: ${p.mmr} - ${p.isAutofill ? 'AUTOFILL' : 'PREFERÊNCIA'}`);
  });
  
  // Verificar ordem
  const team1Indexes = team1.map(p => p.teamIndex).sort((a, b) => a - b);
  const team2Indexes = team2.map(p => p.teamIndex).sort((a, b) => a - b);
  
  const team1Correct = JSON.stringify(team1Indexes) === JSON.stringify([0, 1, 2, 3, 4]);
  const team2Correct = JSON.stringify(team2Indexes) === JSON.stringify([5, 6, 7, 8, 9]);
  
  console.log('\n🧪 [TeamOrder] Verificação da ordem:');
  console.log(`  Team1 indexes: ${team1Indexes} - ${team1Correct ? '✅ CORRETO' : '❌ INCORRETO'}`);
  console.log(`  Team2 indexes: ${team2Indexes} - ${team2Correct ? '✅ CORRETO' : '❌ INCORRETO'}`);
  
  // Verificar lanes
  const team1Lanes = team1.map(p => p.assignedLane).sort();
  const team2Lanes = team2.map(p => p.assignedLane).sort();
  const expectedLanes = ['bot', 'jungle', 'mid', 'support', 'top'];
  
  const team1LanesCorrect = JSON.stringify(team1Lanes) === JSON.stringify(expectedLanes);
  const team2LanesCorrect = JSON.stringify(team2Lanes) === JSON.stringify(expectedLanes);
  
  console.log('\n🧪 [TeamOrder] Verificação das lanes:');
  console.log(`  Team1 lanes: ${team1Lanes} - ${team1LanesCorrect ? '✅ CORRETO' : '❌ INCORRETO'}`);
  console.log(`  Team2 lanes: ${team2Lanes} - ${team2LanesCorrect ? '✅ CORRETO' : '❌ INCORRETO'}`);
  
  if (team1Correct && team2Correct && team1LanesCorrect && team2LanesCorrect) {
    console.log('\n🎉 [TeamOrder] TESTE PASSOU! Ordem dos times está correta!');
  } else {
    console.log('\n❌ [TeamOrder] TESTE FALHOU! Há problemas na ordem dos times.');
  }
} else {
  console.log('❌ [TeamOrder] Falha na atribuição de lanes:', playersWithLanes.length, 'jogadores');
}
