const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

console.log('🔬 TESTE DEBUG DO EXECUTÁVEL');
console.log('===========================\n');

// Verificar se há executável na pasta release
const releaseDir = path.join(__dirname, 'release');
const possibleExes = [
  'LoL Matchmaking Setup 1.0.0.exe',
  'LoL Matchmaking.exe',
  path.join('win-unpacked', 'LoL Matchmaking.exe')
];

let exePath = null;

if (fs.existsSync(releaseDir)) {
  console.log('📁 Verificando pasta release...');
  const files = fs.readdirSync(releaseDir);
  console.log('📄 Arquivos encontrados:', files);
  
  for (const possibleExe of possibleExes) {
    const fullPath = path.join(releaseDir, possibleExe);
    if (fs.existsSync(fullPath)) {
      exePath = fullPath;
      console.log('✅ Executável encontrado:', fullPath);
      break;
    }
  }
}

if (!exePath) {
  console.log('❌ Executável não encontrado na pasta release');
  console.log('💡 Execute: npm run build:complete');
  process.exit(1);
}

console.log('\n🚀 Iniciando aplicação em modo debug...');
console.log('📋 Logs detalhados aparecerão abaixo:\n');
console.log('=' .repeat(60));

const startTime = Date.now();

// Executar com máximo detalhamento de logs
const app = spawn(exePath, [], {
  stdio: 'pipe',
  detached: false,
  env: {
    ...process.env,
    ELECTRON_ENABLE_LOGGING: '1',
    ELECTRON_LOG_LEVEL: 'verbose',
    DEBUG: '*'
  }
});

// Capturar STDOUT
app.stdout.on('data', (data) => {
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  const lines = data.toString().split('\n').filter(line => line.trim());
  
  lines.forEach(line => {
    console.log(`[${elapsed}s] 📤 STDOUT: ${line}`);
  });
});

// Capturar STDERR (onde ficam os logs do Electron)
app.stderr.on('data', (data) => {
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  const lines = data.toString().split('\n').filter(line => line.trim());
  
  lines.forEach(line => {
    console.log(`[${elapsed}s] 🔧 STDERR: ${line}`);
  });
});

app.on('close', (code) => {
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\n[${elapsed}s] 🏁 Aplicação fechada com código ${code}`);
  
  if (code === 0) {
    console.log('✅ Aplicação fechou normalmente');
  } else {
    console.log('❌ Aplicação fechou com erro');
  }
});

app.on('error', (error) => {
  console.log('❌ Erro ao iniciar aplicação:', error.message);
  console.log('🔧 Detalhes:', {
    code: error.code,
    errno: error.errno,
    syscall: error.syscall,
    path: error.path
  });
});

// Log de progresso a cada 5 segundos
const progressInterval = setInterval(() => {
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
  console.log(`⏰ [${elapsed}s] Aguardando inicialização...`);
}, 5000);

// Finalizar teste após 60 segundos se não fechar sozinho
setTimeout(() => {
  console.log('\n⏰ Tempo limite de 60 segundos atingido');
  console.log('🔍 Se a janela não abriu, há um problema na inicialização');
  clearInterval(progressInterval);
  
  if (!app.killed) {
    console.log('🔄 Tentando finalizar aplicação...');
    app.kill('SIGTERM');
    
    setTimeout(() => {
      if (!app.killed) {
        console.log('💀 Forçando finalização...');
        app.kill('SIGKILL');
      }
    }, 5000);
  }
}, 60000);

// Capturar Ctrl+C para finalizar o processo
process.on('SIGINT', () => {
  console.log('\n\n⏹️ Finalizando teste...');
  clearInterval(progressInterval);
  app.kill();
  process.exit(0);
});

console.log('💡 Pressione Ctrl+C para finalizar o teste');
console.log('⏰ Teste será finalizado automaticamente em 60 segundos'); 