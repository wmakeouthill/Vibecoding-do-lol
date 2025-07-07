const { exec } = require('child_process');

console.log('🧪 [TeamOrder] Testando ordem dos times após correção...');

// Simular uma partida com bots para testar a ordem
const testScript = `
const { MatchmakingService } = require('./src/backend/services/MatchmakingService');
const { DatabaseManager } = require('./src/backend/database/DatabaseManager');
const WebSocket = require('ws');

async function testTeamOrder() {
  console.log('🧪 [TeamOrder] Iniciando teste de ordem dos times...');
  
  const dbManager = new DatabaseManager();
  const wss = new WebSocket.Server({ port: 8080 });
  const matchmakingService = new MatchmakingService(dbManager, wss);
  
  // Simular 10 bots na fila com diferentes MMRs
  const bots = [];
  for (let i = 0; i < 10; i++) {
    bots.push({
      summonerName: \`Bot\${i + 1}\`,
      mmr: 1000 + (i * 100), // MMR crescente de 1000 a 1900
      primaryLane: ['top', 'jungle', 'mid', 'bot', 'support'][i % 5],
      secondaryLane: ['jungle', 'mid', 'bot', 'support', 'top'][i % 5],
      isBot: true
    });
  }
  
  console.log('🧪 [TeamOrder] Bots criados:');
  bots.forEach((bot, index) => {
    console.log(\`  \${index + 1}. \${bot.summonerName} - MMR: \${bot.mmr} - Lanes: \${bot.primaryLane}/\${bot.secondaryLane}\`);
  });
  
  // Testar atribuição de lanes
  console.log('\\n🧪 [TeamOrder] Testando atribuição de lanes...');
  const playersWithLanes = matchmakingService.assignLanesByMMRAndPreferences(bots, []);
  
  if (playersWithLanes.length === 10) {
    console.log('✅ [TeamOrder] Lanes atribuídas com sucesso!');
    
    // Separar times
    const team1 = playersWithLanes.filter(p => p.teamIndex < 5);
    const team2 = playersWithLanes.filter(p => p.teamIndex >= 5);
    
    console.log('\\n🧪 [TeamOrder] TIME 1 (Azul - teamIndex 0-4):');
    team1.forEach(p => {
      console.log(\`  teamIndex \${p.teamIndex}: \${p.summonerName} - \${p.assignedLane} - MMR: \${p.mmr} - \${p.isAutofill ? 'AUTOFILL' : 'PREFERÊNCIA'}\`);
    });
    
    console.log('\\n🧪 [TeamOrder] TIME 2 (Vermelho - teamIndex 5-9):');
    team2.forEach(p => {
      console.log(\`  teamIndex \${p.teamIndex}: \${p.summonerName} - \${p.assignedLane} - MMR: \${p.mmr} - \${p.isAutofill ? 'AUTOFILL' : 'PREFERÊNCIA'}\`);
    });
    
    // Verificar se a ordem está correta
    const team1Indexes = team1.map(p => p.teamIndex).sort((a, b) => a - b);
    const team2Indexes = team2.map(p => p.teamIndex).sort((a, b) => a - b);
    
    const team1Correct = JSON.stringify(team1Indexes) === JSON.stringify([0, 1, 2, 3, 4]);
    const team2Correct = JSON.stringify(team2Indexes) === JSON.stringify([5, 6, 7, 8, 9]);
    
    console.log('\\n🧪 [TeamOrder] Verificação da ordem:');
    console.log(\`  Team1 indexes: \${team1Indexes} - \${team1Correct ? '✅ CORRETO' : '❌ INCORRETO'}\`);
    console.log(\`  Team2 indexes: \${team2Indexes} - \${team2Correct ? '✅ CORRETO' : '❌ INCORRETO'}\`);
    
    // Verificar se cada time tem todas as lanes
    const team1Lanes = team1.map(p => p.assignedLane).sort();
    const team2Lanes = team2.map(p => p.assignedLane).sort();
    const expectedLanes = ['bot', 'jungle', 'mid', 'support', 'top'];
    
    const team1LanesCorrect = JSON.stringify(team1Lanes) === JSON.stringify(expectedLanes);
    const team2LanesCorrect = JSON.stringify(team2Lanes) === JSON.stringify(expectedLanes);
    
    console.log('\\n🧪 [TeamOrder] Verificação das lanes:');
    console.log(\`  Team1 lanes: \${team1Lanes} - \${team1LanesCorrect ? '✅ CORRETO' : '❌ INCORRETO'}\`);
    console.log(\`  Team2 lanes: \${team2Lanes} - \${team2LanesCorrect ? '✅ CORRETO' : '❌ INCORRETO'}\`);
    
    if (team1Correct && team2Correct && team1LanesCorrect && team2LanesCorrect) {
      console.log('\\n🎉 [TeamOrder] TESTE PASSOU! Ordem dos times está correta!');
    } else {
      console.log('\\n❌ [TeamOrder] TESTE FALHOU! Há problemas na ordem dos times.');
    }
  } else {
    console.log('❌ [TeamOrder] Falha na atribuição de lanes:', playersWithLanes.length, 'jogadores');
  }
  
  wss.close();
  process.exit(0);
}

testTeamOrder().catch(error => {
  console.error('❌ [TeamOrder] Erro no teste:', error);
  process.exit(1);
});
`;

// Executar o teste
exec('node -e "' + testScript.replace(/"/g, '\\"') + '"', (error, stdout, stderr) => {
  if (error) {
    console.error('❌ [TeamOrder] Erro ao executar teste:', error);
    return;
  }
  
  if (stderr) {
    console.error('❌ [TeamOrder] Stderr:', stderr);
  }
  
  console.log('📋 [TeamOrder] Resultado do teste:');
  console.log(stdout);
});
