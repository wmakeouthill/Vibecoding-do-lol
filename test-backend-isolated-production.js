const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const http = require('http');

console.log('🧪 TESTE ISOLADO DO BACKEND EM PRODUÇÃO');
console.log('=====================================\n');

// Verificar se os arquivos necessários existem
const requiredFiles = [
  'dist/backend/server.js',
  'dist/backend/node_modules',
  'dist/.env'
];

console.log('📁 Verificando arquivos necessários...');
for (const file of requiredFiles) {
  const exists = fs.existsSync(file);
  console.log(`${exists ? '✅' : '❌'} ${file}`);
  if (!exists) {
    console.log(`\n❌ Arquivo necessário não encontrado: ${file}`);
    console.log('💡 Execute: npm run build:quick');
    process.exit(1);
  }
}

console.log('\n🚀 Iniciando backend em modo produção...\n');

// Definir variáveis de ambiente para produção
const env = {
  ...process.env,
  NODE_ENV: 'production',
  PORT: '3000'
};

// Iniciar o backend
const backendProcess = spawn('node', ['dist/backend/server.js'], {
  stdio: 'pipe',
  env: env,
  cwd: __dirname
});

let backendStarted = false;
const startTime = Date.now();

// Capturar saída do backend
backendProcess.stdout.on('data', (data) => {
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  const lines = data.toString().split('\n').filter(line => line.trim());
  
  lines.forEach(line => {
    console.log(`[${elapsed}s] 🔧 Backend: ${line}`);
    
    // Detectar se o backend iniciou
    if (line.includes('Servidor iniciado') || line.includes('listening') || line.includes('ready')) {
      backendStarted = true;
    }
  });
});

backendProcess.stderr.on('data', (data) => {
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  const lines = data.toString().split('\n').filter(line => line.trim());
  
  lines.forEach(line => {
    console.log(`[${elapsed}s] ❌ Backend Error: ${line}`);
  });
});

backendProcess.on('close', (code) => {
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\n[${elapsed}s] 🏁 Backend process closed with code ${code}`);
  process.exit(code);
});

backendProcess.on('error', (error) => {
  console.log('❌ Erro ao iniciar backend:', error.message);
  process.exit(1);
});

// Função para testar conectividade
async function testConnectivity() {
  return new Promise((resolve) => {
    const req = http.get('http://127.0.0.1:3000/api/health', (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        console.log(`✅ Backend respondeu: ${res.statusCode}`);
        console.log(`📄 Resposta: ${data}`);
        resolve(true);
      });
    });

    req.on('error', (error) => {
      console.log(`❌ Erro de conectividade: ${error.message}`);
      resolve(false);
    });

    req.setTimeout(2000, () => {
      req.destroy();
      console.log(`⏰ Timeout na conexão`);
      resolve(false);
    });
  });
}

// Testar conectividade periodicamente
let connectivityAttempts = 0;
const maxAttempts = 30;

const connectivityInterval = setInterval(async () => {
  connectivityAttempts++;
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  
  console.log(`\n[${elapsed}s] 🔍 Teste ${connectivityAttempts}/${maxAttempts}: Verificando conectividade...`);
  
  const isConnected = await testConnectivity();
  
  if (isConnected) {
    console.log(`\n🎉 [${elapsed}s] SUCESSO! Backend está funcionando!`);
    console.log('💡 O problema não é o backend - pode ser a inicialização do Electron');
    clearInterval(connectivityInterval);
    
    // Manter rodando para testes adicionais
    console.log('\n⏰ Backend continuará rodando. Pressione Ctrl+C para finalizar');
    return;
  }
  
  if (connectivityAttempts >= maxAttempts) {
    console.log(`\n❌ [${elapsed}s] Backend não ficou pronto após ${maxAttempts} tentativas`);
    console.log('🔍 Verifique os logs acima para identificar o problema');
    clearInterval(connectivityInterval);
    backendProcess.kill();
  }
}, 1000);

// Aguardar pelo menos 30 segundos antes de finalizar
setTimeout(() => {
  if (connectivityAttempts < maxAttempts) {
    console.log('\n⏰ Teste de 30 segundos completado');
    if (!backendStarted) {
      console.log('❌ Backend não iniciou corretamente');
      backendProcess.kill();
    }
  }
}, 30000);

// Capturar Ctrl+C
process.on('SIGINT', () => {
  console.log('\n\n⏹️ Finalizando teste...');
  clearInterval(connectivityInterval);
  backendProcess.kill();
  process.exit(0);
});

console.log('💡 Pressione Ctrl+C para finalizar o teste');
console.log('📋 Logs do backend aparecerão abaixo:\n');
console.log('=' .repeat(50)); 