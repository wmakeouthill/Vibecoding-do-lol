const { spawn } = require('child_process');
const path = require('path');

console.log('🔍 Diagnóstico do LoL Matchmaking...\n');

// Verificar se o backend pode ser iniciado manualmente
const backendPath = path.join(__dirname, 'dist', 'backend', 'server.js');
const nodeModulesPath = path.join(__dirname, 'dist', 'backend', 'node_modules');

console.log('📂 Verificando arquivos...');
console.log('- Backend:', backendPath);
console.log('- Node modules:', nodeModulesPath);
console.log('- Frontend index:', path.join(__dirname, 'dist', 'frontend', 'dist', 'lol-matchmaking', 'browser', 'index.html'));

const fs = require('fs');

console.log('\n✅ Arquivos existentes:');
console.log('- Backend existe:', fs.existsSync(backendPath));
console.log('- Node modules existe:', fs.existsSync(nodeModulesPath));
console.log('- Frontend existe:', fs.existsSync(path.join(__dirname, 'dist', 'frontend', 'dist', 'lol-matchmaking', 'browser', 'index.html')));

console.log('\n🚀 Tentando iniciar backend...');

const env = {
  ...process.env,
  NODE_PATH: nodeModulesPath,
  NODE_ENV: 'production'
};

const backendProcess = spawn('node', [backendPath], {
  stdio: 'inherit',
  env: env,
  cwd: path.dirname(backendPath)
});

backendProcess.on('error', (error) => {
  console.error('❌ Erro ao iniciar backend:', error);
});

backendProcess.on('exit', (code) => {
  console.log(`\n💀 Backend encerrado com código: ${code}`);
});

// Encerrar após 10 segundos
setTimeout(() => {
  console.log('\n⏰ Encerrando diagnóstico...');
  backendProcess.kill();
  process.exit(0);
}, 10000);
