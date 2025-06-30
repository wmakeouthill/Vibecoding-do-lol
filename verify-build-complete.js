const fs = require('fs');
const path = require('path');

console.log('🔍 Verificando build completo...\n');

// Verificar se o build foi feito
const checks = [
  {
    name: 'Backend compilado',
    path: 'dist/backend/server.js',
    required: true
  },
  {
    name: 'Backend node_modules',
    path: 'dist/backend/node_modules',
    required: true
  },
  {
    name: 'Backend dependências críticas',
    path: 'dist/backend/node_modules/mysql2',
    required: true
  },
  {
    name: 'Backend Discord.js',
    path: 'dist/backend/node_modules/discord.js',
    required: true
  },
  {
    name: 'Frontend build',
    path: 'dist/frontend/browser/index.html',
    required: true
  },
  {
    name: 'Frontend assets',
    path: 'dist/frontend/browser/assets',
    required: true
  },
  {
    name: 'Electron main',
    path: 'dist/electron/main.js',
    required: true
  },
  {
    name: 'Arquivo .env',
    path: 'dist/.env',
    required: false
  }
];

let allOk = true;
const results = [];

checks.forEach(check => {
  const exists = fs.existsSync(check.path);
  const status = exists ? '✅' : (check.required ? '❌' : '⚠️');
  const message = `${status} ${check.name}: ${check.path}`;
  
  console.log(message);
  results.push({ ...check, exists });
  
  if (check.required && !exists) {
    allOk = false;
  }
});

console.log('\n📊 Resumo:');
console.log(`- Total de verificações: ${checks.length}`);
console.log(`- Passou: ${results.filter(r => r.exists).length}`);
console.log(`- Falhou: ${results.filter(r => !r.exists && r.required).length}`);
console.log(`- Opcional: ${results.filter(r => !r.exists && !r.required).length}`);

if (allOk) {
  console.log('\n🎉 Build completo e pronto para produção!');
  console.log('\n📋 Próximos passos:');
  console.log('1. Execute: npm run create:executable');
  console.log('2. Verifique se release/win-unpacked/resources/backend/node_modules existe');
  console.log('3. Teste o executável');
} else {
  console.log('\n❌ Build incompleto! Execute:');
  console.log('npm run build:complete');
}

// Verificar se o release existe e tem a estrutura correta
if (fs.existsSync('release/win-unpacked')) {
  console.log('\n📦 Verificando release...');
  
  const releaseChecks = [
    'release/win-unpacked/resources/backend/server.js',
    'release/win-unpacked/resources/backend/node_modules',
    'release/win-unpacked/resources/frontend/browser/index.html',
    'release/win-unpacked/LoL Matchmaking.exe'
  ];
  
  releaseChecks.forEach(checkPath => {
    const exists = fs.existsSync(checkPath);
    const status = exists ? '✅' : '❌';
    console.log(`${status} ${checkPath}`);
  });
} 