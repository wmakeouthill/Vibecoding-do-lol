// Script para testar a distribuição de lanes e índices
const { spawn } = require('child_process');
const path = require('path');

console.log('🧪 Testando distribuição de lanes e índices...');

// Simular 10 jogadores com diferentes MMRs e preferências
const testPlayers = [
  { summonerName: 'Player1', mmr: 2000, primaryLane: 'TOP', secondaryLane: 'JUNGLE' },
  { summonerName: 'Player2', mmr: 1900, primaryLane: 'JUNGLE', secondaryLane: 'TOP' },
  { summonerName: 'Player3', mmr: 1800, primaryLane: 'MID', secondaryLane: 'TOP' },
  { summonerName: 'Player4', mmr: 1700, primaryLane: 'ADC', secondaryLane: 'MID' },
  { summonerName: 'Player5', mmr: 1600, primaryLane: 'SUPPORT', secondaryLane: 'ADC' },
  { summonerName: 'Player6', mmr: 1500, primaryLane: 'TOP', secondaryLane: 'JUNGLE' },
  { summonerName: 'Player7', mmr: 1400, primaryLane: 'JUNGLE', secondaryLane: 'MID' },
  { summonerName: 'Player8', mmr: 1300, primaryLane: 'MID', secondaryLane: 'ADC' },
  { summonerName: 'Player9', mmr: 1200, primaryLane: 'ADC', secondaryLane: 'SUPPORT' },
  { summonerName: 'Player10', mmr: 1100, primaryLane: 'SUPPORT', secondaryLane: 'TOP' }
];

console.log('📊 Jogadores de teste:', testPlayers.map(p => `${p.summonerName} (MMR: ${p.mmr}) - ${p.primaryLane}/${p.secondaryLane}`));

// Simular a lógica do backend
function mapLaneToBackend(lane) {
  const mapping = {
    'TOP': 'top',
    'JUNGLE': 'jungle', 
    'MID': 'mid',
    'ADC': 'bot',
    'SUPPORT': 'support',
    'fill': 'fill'
  };
  return mapping[lane.toUpperCase()] || 'fill';
}

function mapLaneToFrontend(lane) {
  const mapping = {
    'top': 'TOP',
    'jungle': 'JUNGLE',
    'mid': 'MID', 
    'bot': 'ADC',
    'support': 'SUPPORT'
  };
  return mapping[lane] || 'FILL';
}

function assignLanesOptimized(players) {
  const laneOrder = ['top', 'jungle', 'mid', 'bot', 'support'];
  const laneAssignments = { 
    'top': 0, 'jungle': 0, 'mid': 0, 'bot': 0, 'support': 0 
  };
  const playersWithLanes = [];
  
  console.log('🎯 Atribuindo lanes...');
  
  for (const player of players) {
    const primaryLane = mapLaneToBackend(player.primaryLane || 'fill');
    const secondaryLane = mapLaneToBackend(player.secondaryLane || 'fill');
    
    let assignedLane = null;
    let isAutofill = false;
    
    // Tentar lane primária
    if (primaryLane !== 'fill' && laneAssignments[primaryLane] < 2) {
      assignedLane = primaryLane;
      isAutofill = false;
      laneAssignments[primaryLane]++;
    }
    // Tentar lane secundária
    else if (secondaryLane !== 'fill' && laneAssignments[secondaryLane] < 2) {
      assignedLane = secondaryLane;
      isAutofill = false;
      laneAssignments[secondaryLane]++;
    }
    // Autofill
    else {
      for (const lane of laneOrder) {
        if (laneAssignments[lane] < 2) {
          assignedLane = lane;
          isAutofill = true;
          laneAssignments[lane]++;
          break;
        }
      }
    }
    
    const playerWithLane = {
      ...player,
      assignedLane: mapLaneToFrontend(assignedLane),
      isAutofill
    };
    
    playersWithLanes.push(playerWithLane);
  }
  
  console.log('✅ Atribuições finais:', laneAssignments);
  return playersWithLanes;
}

function balanceTeamsAndAssignLanes(players) {
  if (players.length !== 10) {
    console.error('❌ Número incorreto de jogadores:', players.length);
    return null;
  }

  // Ordenar por MMR
  const sortedPlayers = [...players].sort((a, b) => b.mmr - a.mmr);
  
  // Atribuir lanes
  const playersWithLanes = assignLanesOptimized(sortedPlayers);
  
  if (playersWithLanes.length !== 10) {
    console.error('❌ Erro na atribuição de lanes');
    return null;
  }
  
  // Organizar times
  const laneOrder = ['top', 'jungle', 'mid', 'bot', 'support'];
  const team1 = [];
  const team2 = [];
  
  // Separar por lanes
  const playersByLane = {};
  laneOrder.forEach(lane => {
    playersByLane[lane] = playersWithLanes.filter(p => mapLaneToBackend(p.assignedLane) === lane);
  });
  
  // Distribuir cada lane
  laneOrder.forEach((lane, laneIndex) => {
    const lanePlayers = playersByLane[lane];
    if (lanePlayers.length === 2) {
      lanePlayers.sort((a, b) => b.mmr - a.mmr);
      
      const team1Player = {
        ...lanePlayers[0],
        teamIndex: laneIndex, // 0-4
        assignedLane: mapLaneToFrontend(lane)
      };
      
      const team2Player = {
        ...lanePlayers[1],
        teamIndex: laneIndex + 5, // 5-9
        assignedLane: mapLaneToFrontend(lane)
      };
      
      team1.push(team1Player);
      team2.push(team2Player);
    }
  });
  
  // Ordenar por teamIndex
  team1.sort((a, b) => a.teamIndex - b.teamIndex);
  team2.sort((a, b) => a.teamIndex - b.teamIndex);
  
  return { team1, team2 };
}

// Executar teste
const result = balanceTeamsAndAssignLanes(testPlayers);

if (result) {
  console.log('\n✅ RESULTADO DO TESTE:');
  console.log('\n🔵 TEAM 1 (Azul - Índices 0-4):');
  result.team1.forEach((player, index) => {
    console.log(`${index}. ${player.summonerName} (MMR: ${player.mmr}) - ${player.assignedLane} [Index: ${player.teamIndex}] ${player.isAutofill ? '(AUTOFILL)' : ''}`);
  });
  
  console.log('\n🔴 TEAM 2 (Vermelho - Índices 5-9):');
  result.team2.forEach((player, index) => {
    console.log(`${index}. ${player.summonerName} (MMR: ${player.mmr}) - ${player.assignedLane} [Index: ${player.teamIndex}] ${player.isAutofill ? '(AUTOFILL)' : ''}`);
  });
  
  // Verificar se há lanes repetidas
  const team1Lanes = result.team1.map(p => p.assignedLane);
  const team2Lanes = result.team2.map(p => p.assignedLane);
  
  console.log('\n📊 VERIFICAÇÃO:');
  console.log('Team 1 lanes:', team1Lanes);
  console.log('Team 2 lanes:', team2Lanes);
  
  const team1HasDuplicates = team1Lanes.length !== new Set(team1Lanes).size;
  const team2HasDuplicates = team2Lanes.length !== new Set(team2Lanes).size;
  
  if (team1HasDuplicates || team2HasDuplicates) {
    console.log('❌ ERRO: Há lanes duplicadas!');
  } else {
    console.log('✅ SUCESSO: Todas as lanes são únicas em cada time!');
  }
  
  // Verificar ordem dos índices
  const team1Indices = result.team1.map(p => p.teamIndex);
  const team2Indices = result.team2.map(p => p.teamIndex);
  
  const team1IndicesCorrect = JSON.stringify(team1Indices) === JSON.stringify([0, 1, 2, 3, 4]);
  const team2IndicesCorrect = JSON.stringify(team2Indices) === JSON.stringify([5, 6, 7, 8, 9]);
  
  if (team1IndicesCorrect && team2IndicesCorrect) {
    console.log('✅ SUCESSO: Índices estão na ordem correta!');
  } else {
    console.log('❌ ERRO: Índices fora de ordem!');
    console.log('Team 1 esperado: [0,1,2,3,4], atual:', team1Indices);
    console.log('Team 2 esperado: [5,6,7,8,9], atual:', team2Indices);
  }
} else {
  console.log('❌ ERRO: Não foi possível balancear os times');
}
