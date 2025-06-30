const fs = require('fs');
const path = require('path');

console.log('🧪 TESTE DE BUILD PARA PRODUÇÃO\n');

// 1. Verificar se o build foi feito
console.log('📁 1. VERIFICANDO ARQUIVOS DO BUILD:');
const buildFiles = [
  { path: 'dist/backend/server.js', name: 'Backend compilado' },
  { path: 'dist/backend/node_modules/mysql2', name: 'MySQL2' },
  { path: 'dist/backend/node_modules/discord.js', name: 'Discord.js' },
  { path: 'dist/frontend/dist/lol-matchmaking/browser/index.html', name: 'Frontend index.html' },
  { path: 'dist/frontend/dist/lol-matchmaking/browser/main.js', name: 'Frontend main.js' },
  { path: 'dist/electron/main.js', name: 'Electron main' },
  { path: 'dist/.env', name: 'Arquivo .env' }
];

let buildOk = true;
buildFiles.forEach(file => {
  const exists = fs.existsSync(file.path);
  console.log(`  ${exists ? '✅' : '❌'} ${file.name}: ${file.path}`);
  if (!exists) buildOk = false;
});

// 2. Verificar estrutura do frontend
console.log('\n🌐 2. VERIFICANDO ESTRUTURA DO FRONTEND:');
const frontendDir = 'dist/frontend/dist/lol-matchmaking/browser';
if (fs.existsSync(frontendDir)) {
  const files = fs.readdirSync(frontendDir);
  console.log(`  ✅ Pasta encontrada: ${frontendDir}`);
  console.log(`  📄 Arquivos encontrados: ${files.length}`);
  
  const importantFiles = ['index.html', 'main.js', 'polyfills.js', 'styles.css'];
  importantFiles.forEach(file => {
    const exists = files.includes(file) || files.some(f => f.includes(file.replace('.js', '')));
    console.log(`    ${exists ? '✅' : '❌'} ${file}`);
  });
} else {
  console.log(`  ❌ Pasta não encontrada: ${frontendDir}`);
  buildOk = false;
}

// 3. Verificar dependências do backend
console.log('\n📦 3. VERIFICANDO DEPENDÊNCIAS DO BACKEND:');
const backendModules = 'dist/backend/node_modules';
if (fs.existsSync(backendModules)) {
  const requiredModules = ['mysql2', 'discord.js', 'express', 'cors'];
  requiredModules.forEach(module => {
    const modulePath = path.join(backendModules, module);
    const exists = fs.existsSync(modulePath);
    console.log(`  ${exists ? '✅' : '❌'} ${module}`);
  });
} else {
  console.log(`  ❌ node_modules não encontrado: ${backendModules}`);
  buildOk = false;
}

// 4. Verificar configuração do electron-builder
console.log('\n⚙️ 4. VERIFICANDO CONFIGURAÇÃO DO ELECTRON-BUILDER:');
const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
const buildConfig = packageJson.build;

if (buildConfig && buildConfig.extraResources) {
  console.log('  ✅ Configuração extraResources encontrada');
  buildConfig.extraResources.forEach((resource, index) => {
    console.log(`    📁 Resource ${index + 1}: ${resource.from} → ${resource.to}`);
  });
} else {
  console.log('  ❌ Configuração extraResources não encontrada');
  buildOk = false;
}

// 5. Resumo
console.log('\n📊 RESUMO:');
if (buildOk) {
  console.log('🎉 BUILD ESTÁ PRONTO PARA PRODUÇÃO!');
  console.log('✨ Todos os arquivos necessários foram encontrados');
  console.log('🚀 Execute: npm run create:executable');
} else {
  console.log('❌ BUILD INCOMPLETO');
  console.log('🔧 Execute: npm run build:complete');
}

console.log('\n💡 DICAS:');
console.log('- Certifique-se de ter um arquivo .env na raiz do projeto');
console.log('- Verifique se o MySQL está rodando e configurado');
console.log('- Teste o executável na pasta release/'); 