const http = require('http');
const mysql = require('mysql2/promise');

// ✅ TESTE: Verificar múltiplas chamadas durante aceitação
console.log('🧪 TESTE: Verificando múltiplas chamadas durante processo de aceitação...\n');

// Configuração do banco MySQL
const dbConfig = {
  host: 'lolmatchmaking.mysql.uhserver.com',
  user: 'wmakeouthill',
  password: 'Angel1202@@',
  database: 'lolmatchmaking'
};

// Função para fazer requisições HTTP
function makeRequest(options, data = null) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          const response = JSON.parse(body);
          resolve({ status: res.statusCode, data: response });
        } catch (e) {
          resolve({ status: res.statusCode, data: body });
        }
      });
    });

    req.on('error', reject);
    
    if (data) {
      req.write(JSON.stringify(data));
    }
    req.end();
  });
}

// Função para verificar partidas criadas durante um período
async function monitorMatchCreation(durationMs = 10000) {
  const connection = await mysql.createConnection(dbConfig);
  const startTime = new Date();
  const matches = [];
  
  try {
    console.log(`📊 Monitorando criação de partidas por ${durationMs / 1000} segundos...`);
    
    while (new Date() - startTime < durationMs) {
      const [recentMatches] = await connection.execute(`
        SELECT id, title, status, created_at, team1_players, team2_players, match_leader 
        FROM custom_matches 
        WHERE created_at > ?
        ORDER BY created_at DESC
      `, [startTime]);
      
      // Adicionar novas partidas encontradas
      recentMatches.forEach(match => {
        if (!matches.find(m => m.id === match.id)) {
          matches.push(match);
          console.log(`   🎮 Nova partida detectada: ID ${match.id}, Status: ${match.status}, Criada: ${match.created_at}`);
        }
      });
      
      await new Promise(resolve => setTimeout(resolve, 500)); // Verificar a cada 500ms
    }
    
    return matches;
  } finally {
    await connection.end();
  }
}

// Função para verificar logs de acceptance_status durante o processo
async function monitorAcceptanceStatus(matchId) {
  const connection = await mysql.createConnection(dbConfig);
  
  try {
    const [players] = await connection.execute(`
      SELECT summoner_name, acceptance_status, updated_at
      FROM queue_players 
      WHERE acceptance_status IS NOT NULL
      ORDER BY updated_at DESC
    `);
    
    return players;
  } finally {
    await connection.end();
  }
}

// Teste 1: Criar partida e monitorar múltiplas criações
async function test1_MonitorMultipleCreations() {
  console.log('🎯 1. TESTANDO MÚLTIPLAS CRIAÇÕES DURANTE ACEITAÇÃO...');
  
  // Limpar fila primeiro
  await clearQueue();
  
  // Adicionar 10 bots (que aceitam automaticamente)
  console.log('   👥 Adicionando 10 bots que aceitam automaticamente...');
  
  const bots = [];
  for (let i = 1; i <= 10; i++) {
    const bot = {
      player: {
        id: 800000 + i,
        summonerName: `AutoBot${i}#AUTO`,
        region: 'br1',
        currentMMR: 1200 + (i * 50)
      },
      preferences: {
        primaryLane: ['top', 'jungle', 'mid', 'bot', 'support'][i % 5],
        secondaryLane: 'fill'
      }
    };
    
    try {
      const result = await makeRequest({
        hostname: 'localhost',
        port: 3000,
        path: '/api/queue/join',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      }, bot);
      
      if (result.status === 200) {
        console.log(`     ✅ ${bot.player.summonerName} adicionado`);
        bots.push(bot);
      } else {
        console.log(`     ❌ Erro ao adicionar ${bot.player.summonerName}`);
      }
    } catch (error) {
      console.log(`     ❌ Erro: ${error.message}`);
    }
  }
  
  if (bots.length < 10) {
    console.log('   ❌ Não conseguiu adicionar 10 bots, cancelando teste');
    return false;
  }
  
  // Monitorar criação de partidas por 30 segundos
  console.log('   📊 Iniciando monitoramento de criação de partidas...');
  const createdMatches = await monitorMatchCreation(30000);
  
  console.log(`\n   📋 Resultado do monitoramento:`);
  console.log(`     - Total de partidas criadas: ${createdMatches.length}`);
  
  if (createdMatches.length === 0) {
    console.log('     ⚠️ Nenhuma partida foi criada');
    return false;
  } else if (createdMatches.length === 1) {
    console.log('     ✅ Apenas 1 partida criada (correto)');
    return true;
  } else {
    console.log('     ❌ PROBLEMA: Múltiplas partidas criadas!');
    createdMatches.forEach(match => {
      console.log(`       - ID: ${match.id}, Status: ${match.status}, Criada: ${match.created_at}`);
    });
    return false;
  }
}

// Teste 2: Simular aceitação manual de jogador e verificar múltiplas chamadas
async function test2_ManualAcceptanceTest() {
  console.log('\n🎯 2. TESTANDO MÚLTIPLAS CHAMADAS COM ACEITAÇÃO MANUAL...');
  
  // Limpar fila
  await clearQueue();
  
  // Adicionar 9 bots + 1 humano
  console.log('   👥 Adicionando 9 bots + 1 humano...');
  
  const players = [];
  
  // 9 bots
  for (let i = 1; i <= 9; i++) {
    const bot = {
      player: {
        id: 700000 + i,
        summonerName: `MixBot${i}#MIX`,
        region: 'br1',
        currentMMR: 1200 + (i * 50)
      },
      preferences: {
        primaryLane: ['top', 'jungle', 'mid', 'bot', 'support'][i % 5],
        secondaryLane: 'fill'
      }
    };
    
    try {
      const result = await makeRequest({
        hostname: 'localhost',
        port: 3000,
        path: '/api/queue/join',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      }, bot);
      
      if (result.status === 200) {
        console.log(`     ✅ Bot ${bot.player.summonerName} adicionado`);
        players.push(bot);
      }
    } catch (error) {
      console.log(`     ❌ Erro: ${error.message}`);
    }
  }
  
  // 1 humano
  const human = {
    player: {
      id: 600001,
      summonerName: 'HumanPlayer#TEST',
      region: 'br1',
      currentMMR: 1500
    },
    preferences: {
      primaryLane: 'mid',
      secondaryLane: 'top'
    }
  };
  
  try {
    const result = await makeRequest({
      hostname: 'localhost',
      port: 3000,
      path: '/api/queue/join',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, human);
    
    if (result.status === 200) {
      console.log(`     ✅ Humano ${human.player.summonerName} adicionado`);
      players.push(human);
    }
  } catch (error) {
    console.log(`     ❌ Erro: ${error.message}`);
  }
  
  if (players.length < 10) {
    console.log('   ❌ Não conseguiu adicionar 10 jogadores, cancelando teste');
    return false;
  }
  
  // Aguardar partida ser criada
  console.log('   ⏳ Aguardando partida ser criada...');
  await new Promise(resolve => setTimeout(resolve, 10000));
  
  // Buscar partida criada
  const connection = await mysql.createConnection(dbConfig);
  let matchId = null;
  
  try {
    const [recentMatches] = await connection.execute(`
      SELECT id FROM custom_matches 
      WHERE created_at > DATE_SUB(NOW(), INTERVAL 1 MINUTE)
      AND status = 'pending'
      ORDER BY created_at DESC
      LIMIT 1
    `);
    
    if (recentMatches.length > 0) {
      matchId = recentMatches[0].id;
      console.log(`   🎮 Partida encontrada: ${matchId}`);
    } else {
      console.log('   ❌ Nenhuma partida pending encontrada');
      return false;
    }
  } finally {
    await connection.end();
  }
  
  // Simular aceitação manual do humano (após bots já terem aceitado)
  console.log('   👤 Simulando aceitação manual do humano...');
  
  // Iniciar monitoramento ANTES da aceitação
  const monitoringPromise = monitorMatchCreation(15000);
  
  try {
    const acceptResult = await makeRequest({
      hostname: 'localhost',
      port: 3000,
      path: '/api/match/accept',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, {
      matchId: matchId,
      summonerName: 'HumanPlayer#TEST'
    });
    
    console.log(`   📊 Resultado da aceitação: ${acceptResult.status}`);
    
    // Aguardar monitoramento completar
    const createdMatches = await monitoringPromise;
    
    console.log(`\n   📋 Resultado do monitoramento pós-aceitação:`);
    console.log(`     - Partidas criadas após aceitação: ${createdMatches.length}`);
    
    if (createdMatches.length === 0) {
      console.log('     ✅ Nenhuma partida adicional criada (correto)');
      return true;
    } else {
      console.log('     ❌ PROBLEMA: Partidas adicionais criadas após aceitação!');
      createdMatches.forEach(match => {
        console.log(`       - ID: ${match.id}, Status: ${match.status}, Criada: ${match.created_at}`);
      });
      return false;
    }
    
  } catch (error) {
    console.log(`   ❌ Erro na aceitação: ${error.message}`);
    return false;
  }
}

// Função para limpar fila
async function clearQueue() {
  try {
    await makeRequest({
      hostname: 'localhost',
      port: 3000,
      path: '/api/queue/clear',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });
    console.log('   🧹 Fila limpa');
  } catch (error) {
    console.log('   ⚠️ Erro ao limpar fila');
  }
}

// Função para limpar dados de teste
async function cleanup() {
  console.log('\n🧹 LIMPANDO DADOS DE TESTE...');
  
  const connection = await mysql.createConnection(dbConfig);
  
  try {
    // Remover jogadores de teste da fila
    await connection.execute(`
      DELETE FROM queue_players 
      WHERE summoner_name LIKE '%Bot%#%' OR summoner_name LIKE 'HumanPlayer#TEST'
    `);
    
    // Remover partidas de teste
    await connection.execute(`
      DELETE FROM custom_matches 
      WHERE (team1_players LIKE '%Bot%' OR team2_players LIKE '%Bot%' OR 
             team1_players LIKE '%HumanPlayer%' OR team2_players LIKE '%HumanPlayer%')
      AND created_at > DATE_SUB(NOW(), INTERVAL 2 HOUR)
    `);
    
    console.log('   ✅ Dados de teste removidos');
  } finally {
    await connection.end();
  }
}

// Função principal
async function runMultipleCallsTest() {
  try {
    console.log('🎯 OBJETIVO: Detectar múltiplas chamadas durante processo de aceitação\n');
    console.log('🔍 Verificações:');
    console.log('   1. handleAllPlayersAccepted chamado múltiplas vezes?');
    console.log('   2. Partidas duplicadas criadas durante aceitação?');
    console.log('   3. Race conditions entre acceptMatch, autoAcceptForBots e processMatchAcceptanceFromDB?\n');
    
    const results = [];
    
    // Executar testes
    results.push(await test1_MonitorMultipleCreations());
    results.push(await test2_ManualAcceptanceTest());
    
    // Análise final
    console.log('\n📋 ANÁLISE FINAL:');
    console.log('=====================================');
    
    const passedTests = results.filter(r => r === true).length;
    const totalTests = results.length;
    
    console.log(`🧪 Testes executados: ${totalTests}`);
    console.log(`✅ Testes passou: ${passedTests}`);
    console.log(`❌ Testes falharam: ${totalTests - passedTests}`);
    
    if (passedTests === totalTests) {
      console.log('\n🎉 ✅ TODOS OS TESTES PASSARAM!');
      console.log('✨ Sistema não está fazendo múltiplas chamadas');
    } else {
      console.log('\n❌ PROBLEMAS DETECTADOS!');
      console.log('\n🔧 POSSÍVEIS CAUSAS:');
      console.log('   - handleAllPlayersAccepted chamado em 3 lugares diferentes');
      console.log('   - Race condition entre acceptMatch() e autoAcceptForBots()');
      console.log('   - Monitoramento MySQL processMatchAcceptanceFromDB() conflitando');
      console.log('   - Falta de proteção contra múltiplas execuções');
      console.log('\n💡 RECOMENDAÇÕES:');
      console.log('   - Adicionar flag de proteção em handleAllPlayersAccepted');
      console.log('   - Verificar se partida já foi processada antes de executar');
      console.log('   - Centralizar lógica de aceitação em um só lugar');
    }
    
    // Aguardar um pouco antes de limpar
    console.log('\n⏳ Aguardando 5 segundos antes de limpar...');
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    // Limpar dados de teste
    await cleanup();
    
  } catch (error) {
    console.error('\n❌ ERRO DURANTE OS TESTES:', error.message);
    console.log('\n🔧 Verifique se o backend está rodando e o MySQL acessível');
  }
}

// Executar testes
runMultipleCallsTest();
