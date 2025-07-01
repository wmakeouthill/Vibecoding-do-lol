const http = require('http');
const mysql = require('mysql2/promise');

// ✅ TESTE: Verificar correções da fila (DELETE e fila vazia)
console.log('🧪 TESTE: Verificando correções do sistema de fila...\n');

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

// Função para verificar banco diretamente
async function checkQueueTable() {
  const connection = await mysql.createConnection(dbConfig);
  
  try {
    // Buscar TODAS as entradas (ativas e inativas)
    const [allRows] = await connection.execute(`
      SELECT player_id, summoner_name, is_active, queue_position 
      FROM queue_players 
      ORDER BY join_time
    `);
    
    // Buscar apenas ativas
    const [activeRows] = await connection.execute(`
      SELECT player_id, summoner_name, queue_position 
      FROM queue_players 
      WHERE is_active = 1 
      ORDER BY queue_position
    `);
    
    return {
      allEntries: allRows,
      activeEntries: activeRows
    };
  } finally {
    await connection.end();
  }
}

// Teste 1: Verificar estado inicial
async function test1_InitialState() {
  console.log('📊 1. VERIFICANDO ESTADO INICIAL...');
  
  const { allEntries, activeEntries } = await checkQueueTable();
  
  console.log(`   📋 Total de entradas na tabela: ${allEntries.length}`);
  console.log(`   ✅ Entradas ativas (is_active=1): ${activeEntries.length}`);
  console.log(`   ❌ Entradas inativas (is_active=0): ${allEntries.length - activeEntries.length}`);
  
  if (allEntries.length > activeEntries.length) {
    console.log('   ⚠️ PROBLEMA: Existem entradas inativas (is_active=0) que deveriam ter sido deletadas');
    console.log('   🗑️ Entradas inativas encontradas:');
    allEntries.forEach(entry => {
      if (entry.is_active === 0) {
        console.log(`      - ${entry.summoner_name} (ID: ${entry.player_id})`);
      }
    });
  } else {
    console.log('   ✅ OK: Não há entradas inativas na tabela');
  }
  
  return { allEntries, activeEntries };
}

// Teste 2: Adicionar jogador de teste
async function test2_AddTestPlayer() {
  console.log('\n👤 2. ADICIONANDO JOGADOR DE TESTE...');
  
  const testPlayer = {
    player: {
      id: 999999,
      summonerName: 'TestPlayer#TEST',
      region: 'br1',
      currentMMR: 1500
    },
    preferences: {
      primaryLane: 'jungle',
      secondaryLane: 'support'
    }
  };
  
  try {
    const result = await makeRequest({
      hostname: 'localhost',
      port: 3000,
      path: '/api/queue/join',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, testPlayer);
    
    if (result.status === 200) {
      console.log('   ✅ Jogador de teste adicionado com sucesso');
      
      // Verificar no banco
      const { allEntries, activeEntries } = await checkQueueTable();
      
      const testEntry = allEntries.find(e => e.player_id === 999999);
      if (testEntry) {
        console.log(`   📊 Entrada no banco: ${testEntry.summoner_name} (is_active: ${testEntry.is_active})`);
        
        if (testEntry.is_active === 1) {
          console.log('   ✅ Entrada marcada corretamente como ativa');
        } else {
          console.log('   ❌ PROBLEMA: Entrada não está marcada como ativa');
        }
      } else {
        console.log('   ❌ PROBLEMA: Entrada não encontrada no banco');
      }
      
      return true;
    } else {
      console.log(`   ❌ Erro ao adicionar jogador: ${result.status}`);
      return false;
    }
  } catch (error) {
    console.log(`   ❌ Erro na requisição: ${error.message}`);
    return false;
  }
}

// Teste 3: Remover jogador e verificar DELETE
async function test3_RemoveTestPlayer() {
  console.log('\n🗑️ 3. REMOVENDO JOGADOR DE TESTE...');
  
  try {
    const result = await makeRequest({
      hostname: 'localhost',
      port: 3000,
      path: '/api/queue/leave',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, {
      playerId: 999999,
      summonerName: 'TestPlayer#TEST'
    });
    
    if (result.status === 200) {
      console.log('   ✅ Jogador removido com sucesso via API');
      
      // Verificar no banco se foi DELETADO
      const { allEntries, activeEntries } = await checkQueueTable();
      
      const testEntry = allEntries.find(e => e.player_id === 999999);
      
      if (!testEntry) {
        console.log('   ✅ SUCESSO: Entrada foi DELETADA da tabela (não existe mais)');
        return true;
      } else {
        console.log('   ❌ PROBLEMA: Entrada ainda existe na tabela:');
        console.log(`      - Summoner: ${testEntry.summoner_name}`);
        console.log(`      - is_active: ${testEntry.is_active}`);
        
        if (testEntry.is_active === 0) {
          console.log('   ❌ ERRO CRÍTICO: Sistema ainda usa is_active=0 em vez de DELETE');
        }
        return false;
      }
    } else {
      console.log(`   ❌ Erro ao remover jogador: ${result.status}`);
      return false;
    }
  } catch (error) {
    console.log(`   ❌ Erro na requisição: ${error.message}`);
    return false;
  }
}

// Teste 4: Verificar fila vazia via API
async function test4_EmptyQueueAPI() {
  console.log('\n📭 4. TESTANDO FILA VAZIA VIA API...');
  
  try {
    const result = await makeRequest({
      hostname: 'localhost',
      port: 3000,
      path: '/api/queue/status',
      method: 'GET',
      headers: { 'Content-Type': 'application/json' }
    });
    
    if (result.status === 200) {
      const queueData = result.data;
      
      console.log('   📊 Dados da API:');
      console.log(`      - playersInQueue: ${queueData.playersInQueue}`);
      console.log(`      - playersInQueueList: ${queueData.playersInQueueList?.length || 0} jogadores`);
      console.log(`      - isActive: ${queueData.isActive}`);
      
      const isAPIEmpty = queueData.playersInQueue === 0;
      
      // Verificar banco
      const { activeEntries } = await checkQueueTable();
      const isBankEmpty = activeEntries.length === 0;
      
      console.log(`   📊 Comparação:`);
      console.log(`      - API reporta fila vazia: ${isAPIEmpty}`);
      console.log(`      - Banco realmente vazio: ${isBankEmpty}`);
      
      if (isAPIEmpty && isBankEmpty) {
        console.log('   ✅ SUCESSO: API e banco estão sincronizados (ambos vazios)');
        return true;
      } else if (!isAPIEmpty && !isBankEmpty) {
        console.log('   ✅ OK: API e banco estão sincronizados (ambos com dados)');
        return true;
      } else {
        console.log('   ❌ PROBLEMA: API e banco estão dessincronizados');
        return false;
      }
    } else {
      console.log(`   ❌ Erro na API: ${result.status}`);
      return false;
    }
  } catch (error) {
    console.log(`   ❌ Erro na requisição: ${error.message}`);
    return false;
  }
}

// Teste 5: Verificar sincronização manual
async function test5_ManualSync() {
  console.log('\n🔄 5. TESTANDO SINCRONIZAÇÃO MANUAL...');
  
  try {
    const result = await makeRequest({
      hostname: 'localhost',
      port: 3000,
      path: '/api/queue/force-sync',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });
    
    if (result.status === 200) {
      console.log('   ✅ Sincronização manual executada com sucesso');
      
      const queueData = result.data.queueStatus;
      if (queueData) {
        console.log(`   📊 Estado após sync: ${queueData.playersInQueue} jogadores`);
        
        // Verificar banco
        const { activeEntries } = await checkQueueTable();
        
        if (queueData.playersInQueue === activeEntries.length) {
          console.log('   ✅ Sincronização funcionando: API e banco coincidem');
          return true;
        } else {
          console.log(`   ❌ Dessincronização: API reporta ${queueData.playersInQueue}, banco tem ${activeEntries.length}`);
          return false;
        }
      } else {
        console.log('   ⚠️ Sync executado mas sem dados de status');
        return true;
      }
    } else {
      console.log(`   ❌ Erro na sincronização: ${result.status}`);
      return false;
    }
  } catch (error) {
    console.log(`   ❌ Erro na requisição: ${error.message}`);
    return false;
  }
}

// Função principal do teste
async function runTests() {
  try {
    console.log('🎯 OBJETIVO: Verificar se as correções funcionaram\n');
    console.log('✅ Correção 1: Usar DELETE em vez de is_active=0');
    console.log('✅ Correção 2: Interface atualizar quando fila está vazia\n');
    
    const results = [];
    
    // Executar testes
    await test1_InitialState();
    results.push(await test2_AddTestPlayer());
    results.push(await test3_RemoveTestPlayer());
    results.push(await test4_EmptyQueueAPI());
    results.push(await test5_ManualSync());
    
    // Resultado final
    const passedTests = results.filter(r => r === true).length;
    const totalTests = results.length;
    
    console.log('\n📋 RESULTADO DOS TESTES:');
    console.log('=====================================');
    console.log(`🧪 Testes executados: ${totalTests}`);
    console.log(`✅ Testes passou: ${passedTests}`);
    console.log(`❌ Testes falharam: ${totalTests - passedTests}`);
    
    if (passedTests === totalTests) {
      console.log('\n🎉 ✅ TODOS OS TESTES PASSARAM!');
      console.log('🛡️ ✅ Correção DELETE funcionando');
      console.log('📭 ✅ Fila vazia sendo detectada corretamente');
      console.log('\n🎯 Sistema pronto para uso!');
    } else {
      console.log('\n❌ ALGUNS TESTES FALHARAM!');
      console.log('\n🔧 Verifique os logs acima para identificar problemas');
    }
    
  } catch (error) {
    console.error('\n❌ ERRO DURANTE OS TESTES:', error.message);
    console.log('\n🔧 Verifique se o backend está rodando e o MySQL acessível');
  }
}

// Executar testes
runTests(); 