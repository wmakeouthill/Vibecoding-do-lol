const fs = require('fs');
const path = require('path');

// Script para testar a lógica de balanceamento de lanes
console.log('🧪 [Test] Testando lógica de distribuição de lanes...');

// Simular 10 jogadores com preferências variadas
const testPlayers = [
  { summonerName: 'Player1', mmr: 1500, primaryLane: 'TOP', secondaryLane: 'JUNGLE' },
  { summonerName: 'Player2', mmr: 1450, primaryLane: 'JUNGLE', secondaryLane: 'MID' },
  { summonerName: 'Player3', mmr: 1400, primaryLane: 'MID', secondaryLane: 'ADC' },
  { summonerName: 'Player4', mmr: 1350, primaryLane: 'ADC', secondaryLane: 'SUPPORT' },
  { summoserName: 'Player5', mmr: 1300, primaryLane: 'SUPPORT', secondaryLane: 'TOP' },
  { summonerName: 'Player6', mmr: 1250, primaryLane: 'TOP', secondaryLane: 'MID' },
  { summonerName: 'Player7', mmr: 1200, primaryLane: 'JUNGLE', secondaryLane: 'BOT' },
  { summonerName: 'Player8', mmr: 1150, primaryLane: 'MID', secondaryLane: 'SUPPORT' },
  { summonerName: 'Player9', mmr: 1100, primaryLane: 'ADC', secondaryLane: 'TOP' },
  { summonerName: 'Player10', mmr: 1050, primaryLane: 'SUPPORT', secondaryLane: 'JUNGLE' }
];

// Função para mapear lanes (simulando a do backend)
function mapLaneToBackend(lane) {
  const mapping = {
    'TOP': 'top',
    'JUNGLE': 'jungle', 
    'MID': 'mid',
    'ADC': 'bot',
    'SUPPORT': 'support',
    'BOTTOM': 'bot',
    'BOT': 'bot',
    'fill': 'fill'
  };
  return mapping[lane?.toUpperCase()] || 'fill';
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

// Simular atribuição de lanes
function assignLanesOptimized(players) {
  const laneOrder = ['top', 'jungle', 'mid', 'bot', 'support'];
  const laneAssignments = { 'top': 0, 'jungle': 0, 'mid': 0, 'bot': 0, 'support': 0 };
  const playersWithLanes = [];
  
  console.log('🎯 Iniciando atribuição de lanes para', players.length, 'jogadores');
  
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
    
    playersWithLanes.push({
      ...player,
      assignedLane: mapLaneToFrontend(assignedLane),
      isAutofill
    });
    
    console.log(`✅ ${player.summonerName} (MMR: ${player.mmr}) → ${assignedLane} ${isAutofill ? '(autofill)' : '(preferência)'}`);
  }
  
  console.log('✅ Atribuição final:', laneAssignments);
  return playersWithLanes;
}

// Simular balanceamento de times
function balanceTeamsAndAssignLanes(players) {
  if (players.length !== 10) {
    console.error('❌ Número incorreto de jogadores:', players.length);
    return null;
  }

  // Ordenar por MMR
  const sortedPlayers = [...players].sort((a, b) => b.mmr - a.mmr);
  
  // Atribuir lanes
  const playersWithLanes = assignLanesOptimized(sortedPlayers);
  
  // Organizar times por lanes e índices
  const laneOrder = ['top', 'jungle', 'mid', 'bot', 'support'];
  const team1 = [];
  const team2 = [];
  
  // Separar jogadores por lanes
  const playersByLane = {};
  laneOrder.forEach(lane => {
    playersByLane[lane.toLowerCase()] = playersWithLanes.filter(p => 
      p.assignedLane?.toLowerCase() === lane || 
      (lane === 'bot' && p.assignedLane?.toLowerCase() === 'adc')
    );
  });
  
  // Distribuir cada lane entre os times
  laneOrder.forEach((lane, laneIndex) => {
    const lanePlayers = playersByLane[lane === 'bot' ? 'adc' : lane] || playersByLane[lane] || [];
    if (lanePlayers.length === 2) {
      // Ordenar por MMR
      lanePlayers.sort((a, b) => b.mmr - a.mmr);
      
      const team1Player = {
        ...lanePlayers[0],
        teamIndex: laneIndex,
        assignedLane: mapLaneToFrontend(lane)
      };
      
      const team2Player = {
        ...lanePlayers[1],
        teamIndex: laneIndex + 5,
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
console.log('\n🧪 === TESTE DE BALANCEAMENTO ===');
const result = balanceTeamsAndAssignLanes(testPlayers);

if (result) {
  console.log('\n✅ === RESULTADO FINAL ===');
  console.log('\n🔵 TEAM 1 (AZUL):');
  result.team1.forEach(p => {
    console.log(`  [${p.teamIndex}] ${p.summonerName} - ${p.assignedLane} (MMR: ${p.mmr}) ${p.isAutofill ? '(autofill)' : ''}`);
  });
  
  console.log('\n🔴 TEAM 2 (VERMELHO):');
  result.team2.forEach(p => {
    console.log(`  [${p.teamIndex}] ${p.summonerName} - ${p.assignedLane} (MMR: ${p.mmr}) ${p.isAutofill ? '(autofill)' : ''}`);
  });
  
  // Verificar se está correto
  console.log('\n🔍 === VERIFICAÇÃO ===');
  const team1Lanes = result.team1.map(p => p.assignedLane);
  const team2Lanes = result.team2.map(p => p.assignedLane);
  const expectedLanes = ['TOP', 'JUNGLE', 'MID', 'ADC', 'SUPPORT'];
  
  const team1Valid = expectedLanes.every(lane => team1Lanes.includes(lane));
  const team2Valid = expectedLanes.every(lane => team2Lanes.includes(lane));
  
  console.log('Team1 válido:', team1Valid ? '✅' : '❌');
  console.log('Team2 válido:', team2Valid ? '✅' : '❌');
  console.log('Índices Team1:', result.team1.map(p => p.teamIndex));
  console.log('Índices Team2:', result.team2.map(p => p.teamIndex));
  
} else {
  console.log('❌ Falha no balanceamento');
}
