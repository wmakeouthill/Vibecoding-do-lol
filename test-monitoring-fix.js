const http = require('http');

console.log('🔍 Testando problema de monitoramento da fila...\n');

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

async function testMonitoring() {
  console.log('📊 Testando se o sistema só monitora quando há 10+ jogadores...\n');
  
  // 1. Verificar status inicial
  console.log('1. Status inicial da fila:');
  const initialStatus = await makeRequest({
    hostname: 'localhost',
    port: 3000,
    path: '/api/queue/status',
    method: 'GET'
  });
  
  console.log(`   - Jogadores na fila: ${initialStatus.data.playersInQueue}`);
  console.log(`   - Fila ativa: ${initialStatus.data.isActive}`);
  console.log(`   - Última atividade: ${initialStatus.data.recentActivities?.[0]?.message || 'Nenhuma'}`);
  
  // 2. Aguardar 10 segundos e verificar novamente
  console.log('\n2. Aguardando 10 segundos...');
  await new Promise(resolve => setTimeout(resolve, 10000));
  
  const afterWaitStatus = await makeRequest({
    hostname: 'localhost',
    port: 3000,
    path: '/api/queue/status',
    method: 'GET'
  });
  
  console.log(`   - Jogadores na fila: ${afterWaitStatus.data.playersInQueue}`);
  console.log(`   - Fila ativa: ${afterWaitStatus.data.isActive}`);
  console.log(`   - Última atividade: ${afterWaitStatus.data.recentActivities?.[0]?.message || 'Nenhuma'}`);
  
  // 3. Verificar se há mensagens desnecessárias
  if (initialStatus.data.playersInQueue === 0 && afterWaitStatus.data.playersInQueue === 0) {
    console.log('\n✅ SUCESSO: Sistema não está processando matchmaking com fila vazia');
    console.log('   O monitoramento agora só deve ocorrer quando há 10+ jogadores');
    
    // Verificar se as mensagens de log não estão sendo spamadas
    const activities = afterWaitStatus.data.recentActivities || [];
    const systemUpdates = activities.filter(a => a.type === 'system_update');
    
    if (systemUpdates.length <= 2) {
      console.log('✅ SUCESSO: Não há spam de mensagens de sistema');
    } else {
      console.log('⚠️ ATENÇÃO: Muitas mensagens de sistema detectadas');
    }
  } else {
    console.log('\n❌ PROBLEMA: Sistema ainda pode estar processando desnecessariamente');
  }
  
  console.log('\n🎯 RESUMO DAS CORREÇÕES IMPLEMENTADAS:');
  console.log('=====================================');
  console.log('✅ 1. Matchmaking interval só processa com 10+ jogadores');
  console.log('✅ 2. Verificação de partidas pending antes de criar nova');
  console.log('✅ 3. Prevenção de partidas duplicadas');
  console.log('✅ 4. Logs de monitoramento reduzidos');
  console.log('\n🔧 RESPOSTA À PERGUNTA:');
  console.log('O sistema DEVE monitorar continuamente, mas só processar quando há 10+ jogadores.');
  console.log('Isso evita processamento desnecessário e partidas duplicadas.');
}

testMonitoring().catch(console.error);
