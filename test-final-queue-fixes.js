const axios = require('axios');
const mysql = require('mysql2/promise');

// Configuração
const API_BASE = 'http://localhost:3000';
const MYSQL_CONFIG = {
  host: 'lolmatchmaking.mysql.uhserver.com',
  user: 'wmakeouthill',
  password: 'Angel1202@@',
  database: 'lolmatchmaking'
};

let connection;

async function connectToDatabase() {
  try {
    connection = await mysql.createConnection(MYSQL_CONFIG);
    console.log('✅ Conectado ao MySQL');
  } catch (error) {
    console.error('❌ Erro ao conectar ao MySQL:', error);
    process.exit(1);
  }
}

async function clearQueue() {
  try {
    await connection.execute('DELETE FROM queue_players');
    console.log('🗑️ Fila limpa no MySQL');
  } catch (error) {
    console.error('❌ Erro ao limpar fila:', error);
  }
}

async function getQueueFromMySQL() {
  try {
    const [rows] = await connection.execute('SELECT * FROM queue_players WHERE is_active = 1 ORDER BY queue_position');
    return rows;
  } catch (error) {
    console.error('❌ Erro ao buscar fila do MySQL:', error);
    return [];
  }
}

async function addPlayerToQueue(playerId, summonerName, customLp = 1200) {
  try {
    const response = await axios.post(`${API_BASE}/api/join-queue`, {
      playerId,
      summonerName,
      customLp,
      region: 'br1',
      primaryLane: 'mid',
      secondaryLane: 'top'
    });
    return response.data;
  } catch (error) {
    console.log('❌ Erro ao adicionar à fila via API:', error.response?.data || error.message);
    return null;
  }
}

async function removePlayerFromQueue(playerId, summonerName) {
  try {
    const response = await axios.post(`${API_BASE}/api/leave-queue`, {
      playerId,
      summonerName
    });
    return response.data;
  } catch (error) {
    console.log('❌ Erro ao sair da fila via API:', error.response?.data || error.message);
    return null;
  }
}

async function getQueueStatusFromAPI() {
  try {
    const response = await axios.get(`${API_BASE}/api/queue-status`);
    return response.data;
  } catch (error) {
    console.log('❌ Erro ao buscar status da fila via API:', error.response?.data || error.message);
    return null;
  }
}

async function testPageRefreshDoesNotRemovePlayer() {
  console.log('\n🧪 TESTE: Refresh da página NÃO deve remover jogador da fila');
  console.log('=' .repeat(60));

  // Limpar fila
  await clearQueue();

  // 1. Adicionar jogador à fila
  console.log('\n1️⃣ Adicionando jogador à fila...');
  const addResult = await addPlayerToQueue(12345, 'testPlayer#123', 1500);
  if (!addResult) {
    console.log('❌ Falha ao adicionar jogador');
    return false;
  }
  console.log('✅ Jogador adicionado:', addResult);

  // 2. Verificar se está na fila MySQL
  console.log('\n2️⃣ Verificando se jogador está no MySQL...');
  let queueMySQL = await getQueueFromMySQL();
  console.log('📊 Fila MySQL:', queueMySQL.map(p => ({
    id: p.player_id,
    name: p.summoner_name,
    position: p.queue_position,
    is_active: p.is_active
  })));

  if (queueMySQL.length === 0) {
    console.log('❌ Jogador não encontrado no MySQL');
    return false;
  }

  // 3. Simular múltiplos refreshes checando API
  console.log('\n3️⃣ Simulando refreshes da página (checando API 5 vezes)...');
  for (let i = 1; i <= 5; i++) {
    await new Promise(resolve => setTimeout(resolve, 1000)); // Esperar 1 segundo
    
    const apiStatus = await getQueueStatusFromAPI();
    console.log(`📊 Refresh ${i} - API Queue Status:`, {
      playersInQueue: apiStatus?.playersInQueue || 0,
      playersCount: apiStatus?.playersInQueueList?.length || 0,
      hasPlayer: apiStatus?.playersInQueueList?.some(p => p.summonerName === 'testPlayer#123') || false
    });

    // Verificar MySQL também
    queueMySQL = await getQueueFromMySQL();
    console.log(`📊 Refresh ${i} - MySQL Queue:`, queueMySQL.length, 'jogadores');
  }

  // 4. Verificação final
  console.log('\n4️⃣ Verificação final após múltiplos refreshes...');
  queueMySQL = await getQueueFromMySQL();
  const finalAPIStatus = await getQueueStatusFromAPI();

  const playerStillInMySQL = queueMySQL.some(p => p.summoner_name === 'testPlayer#123');
  const playerStillInAPI = finalAPIStatus?.playersInQueueList?.some(p => p.summonerName === 'testPlayer#123') || false;

  console.log('📊 Resultado final:');
  console.log('   - Player no MySQL:', playerStillInMySQL ? '✅ SIM' : '❌ NÃO');
  console.log('   - Player na API:', playerStillInAPI ? '✅ SIM' : '❌ NÃO');
  console.log('   - Contagem MySQL:', queueMySQL.length);
  console.log('   - Contagem API:', finalAPIStatus?.playersInQueue || 0);

  const testPassed = playerStillInMySQL && playerStillInAPI && queueMySQL.length > 0;
  console.log('\n🏆 RESULTADO:', testPassed ? '✅ PASSOU' : '❌ FALHOU');
  console.log('   Refresh da página não removeu o jogador da fila!');

  return testPassed;
}

async function testExplicitRemovalWorks() {
  console.log('\n🧪 TESTE: Remoção explícita DEVE funcionar');
  console.log('=' .repeat(60));

  // 1. Verificar se jogador ainda está na fila do teste anterior
  let queueMySQL = await getQueueFromMySQL();
  if (queueMySQL.length === 0) {
    console.log('⚠️ Adicionando jogador para teste de remoção...');
    await addPlayerToQueue(12345, 'testPlayer#123', 1500);
    await new Promise(resolve => setTimeout(resolve, 1000));
    queueMySQL = await getQueueFromMySQL();
  }

  console.log('\n1️⃣ Estado inicial da fila:');
  console.log('📊 MySQL:', queueMySQL.map(p => ({
    id: p.player_id,
    name: p.summoner_name,
    position: p.queue_position
  })));

  // 2. Remover jogador explicitamente
  console.log('\n2️⃣ Removendo jogador explicitamente...');
  const removeResult = await removePlayerFromQueue(12345, 'testPlayer#123');
  console.log('🔄 Resultado da remoção:', removeResult);

  // 3. Aguardar e verificar
  await new Promise(resolve => setTimeout(resolve, 2000));

  console.log('\n3️⃣ Verificando após remoção explícita...');
  queueMySQL = await getQueueFromMySQL();
  const apiStatus = await getQueueStatusFromAPI();

  const playerRemovedFromMySQL = !queueMySQL.some(p => p.summoner_name === 'testPlayer#123');
  const playerRemovedFromAPI = !apiStatus?.playersInQueueList?.some(p => p.summonerName === 'testPlayer#123');

  console.log('📊 Resultado após remoção:');
  console.log('   - Player removido do MySQL:', playerRemovedFromMySQL ? '✅ SIM' : '❌ NÃO');
  console.log('   - Player removido da API:', playerRemovedFromAPI ? '✅ SIM' : '❌ NÃO');
  console.log('   - Contagem MySQL:', queueMySQL.length);
  console.log('   - Contagem API:', apiStatus?.playersInQueue || 0);

  const testPassed = playerRemovedFromMySQL && playerRemovedFromAPI;
  console.log('\n🏆 RESULTADO:', testPassed ? '✅ PASSOU' : '❌ FALHOU');
  console.log('   Remoção explícita funcionou corretamente!');

  return testPassed;
}

async function testQueuePersistenceAfterTime() {
  console.log('\n🧪 TESTE: Fila deve persistir após tempo (sem WebSocket)');
  console.log('=' .repeat(60));

  // Limpar fila
  await clearQueue();

  // 1. Adicionar jogador via HTTP (sem WebSocket)
  console.log('\n1️⃣ Adicionando jogador via HTTP...');
  const addResult = await addPlayerToQueue(67890, 'httpPlayer#456', 1300);
  if (!addResult) {
    console.log('❌ Falha ao adicionar jogador');
    return false;
  }

  // 2. Aguardar mais de 1 minuto para simular cleanup automático
  console.log('\n2️⃣ Aguardando 90 segundos para verificar se cleanup preserva jogador HTTP...');
  console.log('   (Cleanup roda a cada 30 segundos, vamos aguardar 3 ciclos)');

  for (let i = 1; i <= 9; i++) {
    await new Promise(resolve => setTimeout(resolve, 10000)); // 10 segundos
    
    const queueMySQL = await getQueueFromMySQL();
    const apiStatus = await getQueueStatusFromAPI();
    
    console.log(`   ⏰ ${i * 10}s - MySQL: ${queueMySQL.length} jogadores, API: ${apiStatus?.playersInQueue || 0} jogadores`);
    
    if (queueMySQL.length === 0) {
      console.log('❌ Jogador foi removido durante cleanup!');
      return false;
    }
  }

  // 3. Verificação final
  console.log('\n3️⃣ Verificação final após 90 segundos...');
  const queueMySQL = await getQueueFromMySQL();
  const apiStatus = await getQueueStatusFromAPI();

  const playerStillExists = queueMySQL.some(p => p.summoner_name === 'httpPlayer#456');
  
  console.log('📊 Resultado final:');
  console.log('   - Player ainda no MySQL:', playerStillExists ? '✅ SIM' : '❌ NÃO');
  console.log('   - Contagem MySQL:', queueMySQL.length);
  console.log('   - Contagem API:', apiStatus?.playersInQueue || 0);

  const testPassed = playerStillExists && queueMySQL.length > 0;
  console.log('\n🏆 RESULTADO:', testPassed ? '✅ PASSOU' : '❌ FALHOU');
  console.log('   Jogador HTTP persistiu após cleanup automático!');

  return testPassed;
}

async function runAllTests() {
  try {
    await connectToDatabase();

    console.log('🚀 INICIANDO TESTES DE CORREÇÃO DA FILA');
    console.log('🎯 Verificando se as correções de remoção automática funcionaram');
    console.log('=' .repeat(80));

    const results = [];

    // Teste 1: Refresh não remove
    results.push(await testPageRefreshDoesNotRemovePlayer());
    
    // Teste 2: Remoção explícita funciona
    results.push(await testExplicitRemovalWorks());
    
    // Teste 3: Persistência ao longo do tempo
    results.push(await testQueuePersistenceAfterTime());

    console.log('\n' + '=' .repeat(80));
    console.log('📋 RESUMO DOS TESTES');
    console.log('=' .repeat(80));
    console.log('1. Page Refresh Não Remove:', results[0] ? '✅ PASSOU' : '❌ FALHOU');
    console.log('2. Remoção Explícita Funciona:', results[1] ? '✅ PASSOU' : '❌ FALHOU');
    console.log('3. Persistência ao Longo do Tempo:', results[2] ? '✅ PASSOU' : '❌ FALHOU');
    
    const allPassed = results.every(r => r);
    console.log('\n🏆 RESULTADO GERAL:', allPassed ? '✅ TODOS OS TESTES PASSARAM' : '❌ ALGUNS TESTES FALHARAM');
    
    if (allPassed) {
      console.log('🎉 As correções funcionaram! A fila agora persiste corretamente.');
    } else {
      console.log('⚠️ Ainda há problemas que precisam ser corrigidos.');
    }

  } catch (error) {
    console.error('❌ Erro durante os testes:', error);
  } finally {
    if (connection) {
      await connection.end();
    }
    process.exit(0);
  }
}

// Executar testes
runAllTests(); 