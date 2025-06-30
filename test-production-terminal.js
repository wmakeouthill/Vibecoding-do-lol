const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

console.log('🧪 TESTE PRODUÇÃO VIA TERMINAL');
console.log('==============================\n');

// Verificar se os arquivos necessários existem
const requiredFiles = [
  'dist/electron/main.js',
  'dist/backend/server.js',
  'dist/backend/node_modules',
  'dist/frontend/browser/index.html',
  'dist/.env'
];

console.log('📁 Verificando arquivos necessários...');
for (const file of requiredFiles) {
  const exists = fs.existsSync(file);
  console.log(`${exists ? '✅' : '❌'} ${file}`);
  if (!exists) {
    console.log(`\n❌ Arquivo necessário não encontrado: ${file}`);
    console.log('💡 Execute: npm run build:complete');
    process.exit(1);
  }
}

console.log('\n🚀 Iniciando aplicação Electron em modo produção...\n');

// Definir variáveis de ambiente para produção
const env = {
  ...process.env,
  NODE_ENV: 'production',
  ELECTRON_ENABLE_LOGGING: '1',
  ELECTRON_LOG_LEVEL: 'verbose'
};

// Iniciar o Electron
const electronProcess = spawn('npx', ['electron', '.'], {
  stdio: 'pipe',
  env: env,
  cwd: __dirname
});

const startTime = Date.now();

console.log('📋 Logs da aplicação:\n');
console.log('=' .repeat(60));

// Capturar saída do Electron
electronProcess.stdout.on('data', (data) => {
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  const lines = data.toString().split('\n').filter(line => line.trim());
  
  lines.forEach(line => {
    console.log(`[${elapsed}s] 📤 STDOUT: ${line}`);
  });
});

electronProcess.stderr.on('data', (data) => {
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  const lines = data.toString().split('\n').filter(line => line.trim());
  
  lines.forEach(line => {
    console.log(`[${elapsed}s] 🔧 STDERR: ${line}`);
  });
});

electronProcess.on('close', (code) => {
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\n[${elapsed}s] 🏁 Electron process closed with code ${code}`);
  
  if (code === 0) {
    console.log('✅ Aplicação fechou normalmente');
  } else {
    console.log('❌ Aplicação fechou com erro');
  }
  process.exit(code);
});

electronProcess.on('error', (error) => {
  console.log('❌ Erro ao iniciar Electron:', error.message);
  console.log('🔧 Detalhes:', {
    code: error.code,
    errno: error.errno,
    syscall: error.syscall,
    path: error.path
  });
  process.exit(1);
});

// Log de progresso a cada 5 segundos
let progressCount = 0;
const progressInterval = setInterval(() => {
  progressCount++;
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
  console.log(`\n⏰ [${elapsed}s] Progresso ${progressCount}: Aguardando inicialização...`);
  
  if (progressCount === 1) {
    console.log('🔍 Deveria estar iniciando o backend...');
  } else if (progressCount === 2) {
    console.log('🔍 Deveria estar testando conectividade...');
  } else if (progressCount === 3) {
    console.log('🔍 Deveria estar criando a janela...');
  } else {
    console.log('🔍 Se ainda não apareceu a janela, há um problema...');
  }
}, 5000);

// Finalizar teste após 60 segundos se não fechar sozinho
setTimeout(() => {
  console.log('\n⏰ Tempo limite de 60 segundos atingido');
  console.log('🔍 Se a janela não abriu, há um problema crítico na inicialização');
  clearInterval(progressInterval);
  
  if (!electronProcess.killed) {
    console.log('🔄 Tentando finalizar Electron...');
    electronProcess.kill('SIGTERM');
    
    setTimeout(() => {
      if (!electronProcess.killed) {
        console.log('💀 Forçando finalização...');
        electronProcess.kill('SIGKILL');
      }
    }, 5000);
  }
}, 60000);

// Capturar Ctrl+C para finalizar o processo
process.on('SIGINT', () => {
  console.log('\n\n⏹️ Finalizando teste...');
  clearInterval(progressInterval);
  electronProcess.kill();
  process.exit(0);
});

console.log('💡 Pressione Ctrl+C para finalizar o teste');
console.log('⏰ Teste será finalizado automaticamente em 60 segundos');
console.log('🎯 Se a janela aparecer, o problema estava no executável empacotado'); 