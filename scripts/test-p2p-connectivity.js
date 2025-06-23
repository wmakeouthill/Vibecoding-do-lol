// Script para testar P2P em produção
const WebSocket = require('ws');

console.log('🔍 Testando conectividade P2P...');

function testP2PSignaling() {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket('ws://localhost:8080');
    
    const timeout = setTimeout(() => {
      ws.close();
      reject(new Error('Timeout: P2P Signaling não respondeu em 5 segundos'));
    }, 5000);
    
    ws.on('open', () => {
      console.log('✅ P2P Signaling Server está funcionando na porta 8080!');
      clearTimeout(timeout);
      ws.close();
      resolve(true);
    });
    
    ws.on('error', (error) => {
      console.error('❌ Erro ao conectar P2P Signaling:', error.message);
      clearTimeout(timeout);
      reject(error);
    });
    
    ws.on('close', () => {
      console.log('🔌 Conexão P2P fechada');
    });
  });
}

function testBackend() {
  return new Promise((resolve, reject) => {
    const http = require('http');
    
    const req = http.get('http://localhost:3000/health', (res) => {
      if (res.statusCode === 200) {
        console.log('✅ Backend está funcionando na porta 3000!');
        resolve(true);
      } else {
        console.log('⚠️ Backend respondeu com status:', res.statusCode);
        resolve(false);
      }
    });
    
    req.on('error', (error) => {
      console.error('❌ Erro ao conectar Backend:', error.message);
      reject(error);
    });
    
    req.setTimeout(3000, () => {
      req.destroy();
      reject(new Error('Timeout: Backend não respondeu em 3 segundos'));
    });
  });
}

async function runTests() {
  console.log('');
  console.log('='.repeat(50));
  console.log('🧪 TESTANDO CONECTIVIDADE DOS SERVIÇOS');
  console.log('='.repeat(50));
  
  try {
    console.log('\n1️⃣ Testando P2P Signaling Server (porta 8080)...');
    await testP2PSignaling();
  } catch (error) {
    console.error('💥 P2P Signaling falhou:', error.message);
    console.log('🔍 Verifique se o servidor P2P foi iniciado corretamente');
  }
  
  try {
    console.log('\n2️⃣ Testando Backend Principal (porta 3000)...');
    await testBackend();
  } catch (error) {
    console.error('💥 Backend falhou:', error.message);
    console.log('🔍 Verifique se o backend foi iniciado corretamente');
  }
  
  console.log('\n' + '='.repeat(50));
  console.log('✅ Teste de conectividade concluído!');
  console.log('='.repeat(50));
}

runTests().catch(console.error);
