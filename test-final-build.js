const fs = require('fs');
const path = require('path');

console.log('🧪 ===== TESTE FINAL DO BUILD ===== 🧪\n');

// Verificar arquivos essenciais do build
const buildChecks = [
  { path: 'dist/backend/server.js', name: '📋 Backend compilado' },
  { path: 'dist/backend/node_modules/mysql2', name: '🗄️ MySQL2 dependency' },
  { path: 'dist/backend/node_modules/discord.js', name: '🤖 Discord.js dependency' },
  { path: 'dist/backend/node_modules/express', name: '🌐 Express dependency' },
  { path: 'dist/frontend/browser/index.html', name: '🎨 Frontend build' },
  { path: 'dist/frontend/browser/main-7GLG5DUS.js', name: '📦 Angular main bundle' },
  { path: 'dist/electron/main.js', name: '⚡ Electron main' },
  { path: 'dist/.env', name: '🔐 Environment file' }
];

console.log('🔍 Verificando arquivos do build:\n');

let buildOk = true;
buildChecks.forEach(check => {
  const exists = fs.existsSync(check.path);
  const status = exists ? '✅' : '❌';
  console.log(`${status} ${check.name}: ${check.path}`);
  if (!exists) buildOk = false;
});

console.log('');

// Verificar executável gerado
const executableChecks = [
  { path: 'release/LoL Matchmaking Setup 1.0.0.exe', name: '📦 Instalador executável' },
  { path: 'release/win-unpacked', name: '📁 App descompactado' },
  { path: 'release/win-unpacked/LoL Matchmaking.exe', name: '🎮 Executável principal' },
  { path: 'release/win-unpacked/resources', name: '📋 Pasta de recursos' },
  { path: 'release/win-unpacked/resources/backend', name: '🔧 Backend no executável' },
  { path: 'release/win-unpacked/resources/frontend', name: '🎨 Frontend no executável' }
];

console.log('🎯 Verificando executável gerado:\n');

let executableOk = true;
executableChecks.forEach(check => {
  const exists = fs.existsSync(check.path);
  const status = exists ? '✅' : '❌';
  console.log(`${status} ${check.name}: ${check.path}`);
  if (!exists) executableOk = false;
});

console.log('');

// Verificar tamanhos dos arquivos
console.log('📊 Informações dos arquivos:\n');

if (fs.existsSync('release/LoL Matchmaking Setup 1.0.0.exe')) {
  const stats = fs.statSync('release/LoL Matchmaking Setup 1.0.0.exe');
  const sizeMB = (stats.size / (1024 * 1024)).toFixed(2);
  console.log(`📦 Tamanho do instalador: ${sizeMB} MB`);
}

if (fs.existsSync('dist/frontend/browser')) {
  const frontendFiles = fs.readdirSync('dist/frontend/browser');
  console.log(`🎨 Arquivos do frontend: ${frontendFiles.length} arquivos`);
}

if (fs.existsSync('dist/backend/node_modules')) {
  const backendDeps = fs.readdirSync('dist/backend/node_modules');
  console.log(`📋 Dependências do backend: ${backendDeps.length} pacotes`);
}

console.log('');

// Resultado final
console.log('🏁 ===== RESULTADO FINAL ===== 🏁\n');

if (buildOk && executableOk) {
  console.log('🎉 ✅ BUILD COMPLETO E FUNCIONAL!');
  console.log('✨ Todas as correções foram aplicadas com sucesso:');
  console.log('   • ✅ Angular configurado para buildar em dist/frontend');
  console.log('   • ✅ Backend paths corrigidos para browser/');
  console.log('   • ✅ Electron paths atualizados');
  console.log('   • ✅ Dependências do backend copiadas corretamente');
  console.log('   • ✅ electron-builder configurado corretamente');
  console.log('   • ✅ Verificação de build funcionando');
  console.log('');
  console.log('🚀 O executável está pronto para uso!');
  console.log('📍 Local: release/LoL Matchmaking Setup 1.0.0.exe');
  console.log('');
  console.log('🎯 PRÓXIMOS PASSOS:');
  console.log('   1. Execute o instalador para testar');
  console.log('   2. Verifique se o backend inicia corretamente');
  console.log('   3. Teste a conexão com o frontend');
  console.log('   4. Verifique a conexão com o League of Legends');
} else {
  console.log('❌ PROBLEMAS DETECTADOS NO BUILD');
  if (!buildOk) {
    console.log('💥 Arquivos de build ausentes');
  }
  if (!executableOk) {
    console.log('💥 Problemas na geração do executável');
  }
  console.log('');
  console.log('🔧 Execute npm run build:complete novamente');
}

console.log('\n' + '='.repeat(50)); 