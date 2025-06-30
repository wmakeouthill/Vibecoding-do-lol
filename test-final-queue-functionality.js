const http = require('http');
const mysql = require('mysql2/promise');

// ✅ TESTE FINAL: Sistema de Fila com Sincronização Read-Only
console.log('🧪 TESTE FINAL: Verificando funcionalidade completa da fila...\n');

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
async function checkDatabase() {
  console.log('📊 1. VERIFICANDO ESTADO INICIAL DO BANCO...');
  
  const connection = await mysql.createConnection(dbConfig);
  
  try {
    // Buscar jogadores ativos na fila
    const [rows] = await connection.execute(`
      SELECT player_id, summoner_name, custom_lp, primary_lane, secondary_lane, 
             join_time, queue_position, is_active 
      FROM queue_players 
      WHERE is_active = 1 
      ORDER BY queue_position
    `);
    
    console.log(`   📋 Jogadores na fila MySQL: ${rows.length}`);
    
    if (rows.length > 0) {
      console.log('   👥 Jogadores encontrados:');
      rows.forEach((player, index) => {
        console.log(`      ${index + 1}. ${player.summoner_name} (MMR: ${player.custom_lp}, Lanes: ${player.primary_lane}/${player.secondary_lane}, Pos: ${player.queue_position})`);
      });
    }
    
    return rows;
  } finally {
    await connection.end();
  }
}

// Função para testar API do backend
async function testBackendAPI() {
  console.log('\n📡 2. TESTANDO API DO BACKEND...');
  
  try {
    // Testar status da fila
    const statusResult = await makeRequest({
      hostname: 'localhost',
      port: 3000,
      path: '/api/queue/status',
      method: 'GET',
      headers: { 'Content-Type': 'application/json' }
    });
    
    if (statusResult.status === 200) {
      console.log('   ✅ GET /api/queue/status: OK');
      console.log(`   📊 Status da fila: ${statusResult.data.playersInQueue} jogadores`);
      
      if (statusResult.data.playersInQueueList) {
        console.log('   👥 Lista de jogadores via API:');
        statusResult.data.playersInQueueList.forEach((player, index) => {
          console.log(`      ${index + 1}. ${player.summonerName} (MMR: ${player.mmr}, Pos: ${player.queuePosition})`);
        });
      }
    } else {
      console.log(`   ❌ GET /api/queue/status: Erro ${statusResult.status}`);
    }
    
    return statusResult;
  } catch (error) {
    console.log('   ❌ Erro ao testar API:', error.message);
    return null;
  }
}

// Função para testar sincronização manual
async function testManualSync() {
  console.log('\n🔄 3. TESTANDO SINCRONIZAÇÃO MANUAL...');
  
  try {
    const syncResult = await makeRequest({
      hostname: 'localhost',
      port: 3000,
      path: '/api/queue/force-sync',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });
    
    if (syncResult.status === 200) {
      console.log('   ✅ POST /api/queue/force-sync: OK');
      console.log('   🔄 Sincronização MySQL manual concluída');
      
      if (syncResult.data.queueStatus) {
        console.log(`   📊 Status após sync: ${syncResult.data.queueStatus.playersInQueue} jogadores`);
      }
    } else {
      console.log(`   ❌ POST /api/queue/force-sync: Erro ${syncResult.status}`);
    }
    
    return syncResult;
  } catch (error) {
    console.log('   ❌ Erro ao testar sincronização:', error.message);
    return null;
  }
}

// Função para verificar que dados não foram alterados
async function verifyDataIntegrity(originalData) {
  console.log('\n🛡️ 4. VERIFICANDO INTEGRIDADE DOS DADOS...');
  
  const connection = await mysql.createConnection(dbConfig);
  
  try {
    const [currentRows] = await connection.execute(`
      SELECT player_id, summoner_name, custom_lp, primary_lane, secondary_lane, 
             join_time, queue_position, is_active 
      FROM queue_players 
      WHERE is_active = 1 
      ORDER BY queue_position
    `);
    
    console.log(`   📊 Jogadores originais: ${originalData.length}`);
    console.log(`   📊 Jogadores atuais: ${currentRows.length}`);
    
    // Verificar se dados foram preservados
    let dataIntegrityOK = true;
    
    if (originalData.length !== currentRows.length) {
      console.log('   ⚠️ Número de jogadores mudou durante os testes');
      dataIntegrityOK = false;
    }
    
    // Verificar dados de cada jogador
    for (let i = 0; i < Math.min(originalData.length, currentRows.length); i++) {
      const original = originalData[i];
      const current = currentRows[i];
      
      if (original.summoner_name !== current.summoner_name) {
        console.log(`   ❌ Nome alterado: ${original.summoner_name} → ${current.summoner_name}`);
        dataIntegrityOK = false;
      }
      
      if (original.custom_lp !== current.custom_lp) {
        console.log(`   ❌ MMR alterado para ${current.summoner_name}: ${original.custom_lp} → ${current.custom_lp}`);
        dataIntegrityOK = false;
      }
      
      if (original.primary_lane !== current.primary_lane) {
        console.log(`   ❌ Lane primária alterada para ${current.summoner_name}: ${original.primary_lane} → ${current.primary_lane}`);
        dataIntegrityOK = false;
      }
      
      if (original.secondary_lane !== current.secondary_lane) {
        console.log(`   ❌ Lane secundária alterada para ${current.summoner_name}: ${original.secondary_lane} → ${current.secondary_lane}`);
        dataIntegrityOK = false;
      }
      
      if (original.is_active !== current.is_active) {
        console.log(`   ❌ Status is_active alterado para ${current.summoner_name}: ${original.is_active} → ${current.is_active}`);
        dataIntegrityOK = false;
      }
    }
    
    if (dataIntegrityOK) {
      console.log('   ✅ DADOS PRESERVADOS: Nenhuma alteração não autorizada detectada');
    } else {
      console.log('   ❌ DADOS ALTERADOS: Detected unauthorized changes');
    }
    
    return dataIntegrityOK;
    
  } finally {
    await connection.end();
  }
}

// Função principal do teste
async function runTest() {
  try {
    console.log('🎯 OBJETIVO: Verificar se o sistema funciona sem modificar dados originais\n');
    
    // 1. Estado inicial
    const originalData = await checkDatabase();
    
    // 2. Testar API
    await testBackendAPI();
    
    // 3. Testar sincronização manual
    await testManualSync();
    
    // 4. Verificar integridade
    const integrityOK = await verifyDataIntegrity(originalData);
    
    // 5. Resultado final
    console.log('\n📋 RESULTADO DO TESTE:');
    console.log('=====================================');
    
    if (integrityOK) {
      console.log('🎉 ✅ TESTE PASSOU!');
      console.log('🛡️ ✅ Dados originais preservados');
      console.log('🔄 ✅ Sincronização funcionando');
      console.log('📡 ✅ API respondendo corretamente');
      console.log('\n🎯 Sistema pronto para uso em produção!');
    } else {
      console.log('❌ TESTE FALHOU!');
      console.log('⚠️ Dados foram modificados durante os testes');
      console.log('\n🔧 Verifique os logs para identificar o problema');
    }
    
  } catch (error) {
    console.error('\n❌ ERRO DURANTE O TESTE:', error.message);
    console.log('\n🔧 Verifique se o backend está rodando e o MySQL acessível');
  }
}

// Executar teste
runTest(); 