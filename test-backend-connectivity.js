const http = require('http');

console.log('🔍 TESTE DE CONECTIVIDADE BACKEND');
console.log('=================================');

const testUrls = [
  { url: 'http://localhost:3000/api/health', name: 'localhost' },
  { url: 'http://127.0.0.1:3000/api/health', name: '127.0.0.1' }
];

function testUrl(urlObj) {
  return new Promise((resolve) => {
    console.log(`\n🧪 Testando ${urlObj.name}: ${urlObj.url}`);
    
    const startTime = Date.now();
    
    const req = http.get(urlObj.url, (res) => {
      const endTime = Date.now();
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        try {
          const jsonData = JSON.parse(data);
          console.log(`✅ ${urlObj.name} - Status: ${res.statusCode}`);
          console.log(`   Tempo: ${endTime - startTime}ms`);
          console.log(`   Resposta:`, jsonData);
          resolve({ success: true, url: urlObj.url, time: endTime - startTime });
        } catch (parseError) {
          console.log(`❌ ${urlObj.name} - Erro ao parsear JSON:`, parseError.message);
          resolve({ success: false, url: urlObj.url, error: 'JSON parse error' });
        }
      });
    });
    
    req.on('error', (error) => {
      const endTime = Date.now();
      console.log(`❌ ${urlObj.name} - Erro de conexão:`, error.message);
      console.log(`   Código: ${error.code}`);
      console.log(`   Tempo: ${endTime - startTime}ms`);
      resolve({ success: false, url: urlObj.url, error: error.message });
    });
    
    req.setTimeout(5000, () => {
      console.log(`⏰ ${urlObj.name} - Timeout (5s)`);
      req.destroy();
      resolve({ success: false, url: urlObj.url, error: 'Timeout' });
    });
  });
}

async function runTests() {
  console.log('🚀 Iniciando testes de conectividade...');
  
  const results = [];
  
  for (const urlObj of testUrls) {
    const result = await testUrl(urlObj);
    results.push(result);
    
    // Esperar um pouco entre testes
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  
  console.log('\n📊 RESUMO DOS TESTES');
  console.log('==================');
  
  let successCount = 0;
  results.forEach((result, index) => {
    const status = result.success ? '✅' : '❌';
    console.log(`${status} ${testUrls[index].name}: ${result.success ? 'OK' : result.error}`);
    if (result.success) {
      successCount++;
      console.log(`   Tempo de resposta: ${result.time}ms`);
    }
  });
  
  console.log(`\n🎯 Resultado: ${successCount}/${results.length} URLs funcionando`);
  
  if (successCount === 0) {
    console.log('\n💥 NENHUMA URL FUNCIONOU!');
    console.log('📝 Possíveis causas:');
    console.log('- Backend não está rodando');
    console.log('- Porta 3000 bloqueada por firewall');
    console.log('- Backend travou durante inicialização');
    console.log('- Backend rodando em porta diferente');
  } else if (successCount === 1) {
    console.log('\n⚠️ APENAS UMA URL FUNCIONOU!');
    console.log('📝 Isso explica o problema de resolução DNS');
    console.log('📝 O frontend deve usar a URL que funciona');
  } else {
    console.log('\n🎉 AMBAS AS URLs FUNCIONARAM!');
    console.log('📝 O problema pode estar em outro lugar');
  }
  
  console.log('\n🔧 Para debug adicional:');
  console.log('1. Verifique os logs do backend');
  console.log('2. Teste manualmente no navegador');
  console.log('3. Verifique se há processos na porta 3000: netstat -ano | findstr :3000');
  
  process.exit(0);
}

// Executar testes
runTests().catch(error => {
  console.error('💥 Erro durante os testes:', error);
  process.exit(1);
}); 