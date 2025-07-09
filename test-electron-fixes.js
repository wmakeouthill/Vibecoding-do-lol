const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

console.log('🧪 TESTE RÁPIDO - INICIALIZAÇÃO ELECTRON');
console.log('========================================\n');

// Verificar se a aplicação foi buildada
const requiredFiles = [
  'dist/electron/main.js',
  'dist/backend/server.js',
  'dist/frontend/browser/index.html'
];

console.log('📁 Verificando arquivos necessários...');
let allFilesExist = true;

requiredFiles.forEach(file => {
  const exists = fs.existsSync(file);
  console.log(`${exists ? '✅' : '❌'} ${file}`);
  if (!exists) allFilesExist = false;
});

if (!allFilesExist) {
  console.log('\n❌ Arquivos necessários estão faltando!');
  console.log('💡 Execute: npm run build:complete');
  process.exit(1);
}

console.log('\n🚀 Iniciando teste do Electron...');
console.log('📋 Observações:');
console.log('   - A janela DEVE abrir mesmo se o backend falhar');
console.log('   - Deve usar 127.0.0.1 em produção (não localhost)');
console.log('   - Se backend falhar, deve mostrar página de diagnóstico');
console.log('   - DevTools deve abrir automaticamente para debug');
console.log('\n⏰ Iniciando em 3 segundos...\n');

setTimeout(() => {
  const startTime = Date.now();
  
  const electronProcess = spawn('npx', ['electron', '.'], {
    stdio: 'pipe',
    env: {
      ...process.env,
      NODE_ENV: 'production',
      ELECTRON_ENABLE_LOGGING: '1'
    },
    cwd: __dirname
  });

  console.log('🔄 Processo Electron iniciado...');

  electronProcess.stdout.on('data', (data) => {
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    const lines = data.toString().split('\n').filter(line => line.trim());
    
    lines.forEach(line => {
      console.log(`[${elapsed}s] 📤 ${line}`);
    });
  });

  electronProcess.stderr.on('data', (data) => {
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    const lines = data.toString().split('\n').filter(line => line.trim());
    
    lines.forEach(line => {
      console.log(`[${elapsed}s] 🔧 ${line}`);
    });
  });

  electronProcess.on('close', (code) => {
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`\n[${elapsed}s] 🏁 Electron fechado com código: ${code}`);
    
    if (code === 0) {
      console.log('✅ Teste completado normalmente');
    } else {
      console.log('⚠️ Electron fechou com código de erro');
    }
  });

  electronProcess.on('error', (error) => {
    console.log('❌ Erro ao iniciar Electron:', error.message);
  });

  // Finalizar teste após 30 segundos se não fechado
  setTimeout(() => {
    console.log('\n⏰ Finalizando teste após 30 segundos...');
    electronProcess.kill();
  }, 30000);

  // Capturar Ctrl+C para finalizar
  process.on('SIGINT', () => {
    console.log('\n\n⏹️ Finalizando teste...');
    electronProcess.kill();
    process.exit(0);
  });

}, 3000);

console.log('💡 Pressione Ctrl+C para finalizar o teste a qualquer momento');
