const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

console.log('🧪 Teste de Inicialização do Executável');
console.log('=====================================\n');

// Verificar se há executável na pasta release
const releaseDir = path.join(__dirname, 'release');
const possibleExes = [
  'Vibecoding do lol Setup 1.0.0.exe',
  'Vibecoding do lol-1.0.0.exe', 
  'vibecoding-do-lol.exe'
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
      break;
    }
  }
}

if (!exePath) {
  console.log('❌ Executável não encontrado na pasta release');
  console.log('💡 Compile primeiro com: npm run build:prod');
  process.exit(1);
}

console.log('✅ Executável encontrado:', exePath);
console.log('\n🚀 Iniciando aplicação...');
console.log('⏰ Monitorando sequência de inicialização:\n');

const startTime = Date.now();

const app = spawn(exePath, [], {
  stdio: 'pipe',
  detached: false
});

app.stdout.on('data', (data) => {
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  const lines = data.toString().split('\n').filter(line => line.trim());
  
  lines.forEach(line => {
    console.log(`[${elapsed}s] 📤 ${line}`);
  });
});

app.stderr.on('data', (data) => {
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  const lines = data.toString().split('\n').filter(line => line.trim());
  
  lines.forEach(line => {
    console.log(`[${elapsed}s] ❌ ${line}`);
  });
});

app.on('close', (code) => {
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\n[${elapsed}s] 🏁 Aplicação fechada com código ${code}`);
});

app.on('error', (error) => {
  console.log('❌ Erro ao iniciar aplicação:', error.message);
});

// Aguardar 30 segundos para capturar a inicialização
setTimeout(() => {
  console.log('\n⏰ Teste completado após 30 segundos');
  console.log('🔍 Verifique se a aplicação iniciou corretamente');
  console.log('💡 Se a janela estiver aberta, o teste foi bem-sucedido');
}, 30000);

// Capturar Ctrl+C para finalizar o processo
process.on('SIGINT', () => {
  console.log('\n\n⏹️ Finalizando teste...');
  app.kill();
  process.exit(0);
});

console.log('💡 Pressione Ctrl+C para finalizar o teste'); 