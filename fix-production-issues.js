const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

console.log('🔧 CORRIGINDO PROBLEMAS DE PRODUÇÃO\n');

// 1. Verificar e corrigir configuração do Angular
console.log('1. CORRIGINDO CONFIGURAÇÃO DO ANGULAR:');
try {
  const angularConfigPath = 'src/frontend/angular.json';
  const angularConfig = JSON.parse(fs.readFileSync(angularConfigPath, 'utf8'));
  const buildConfig = angularConfig.projects['lol-matchmaking'].architect.build;
  
  // Corrigir base href para produção
  if (!buildConfig.options.baseHref || buildConfig.options.baseHref === '/') {
    buildConfig.options.baseHref = './';
    console.log('   ✅ Base href corrigido para "./"');
  }
  
  // Garantir que outputPath está correto
  if (buildConfig.options.outputPath !== 'dist/frontend/dist/lol-matchmaking/browser') {
    buildConfig.options.outputPath = 'dist/frontend/dist/lol-matchmaking/browser';
    console.log('   ✅ Output path corrigido');
  }
  
  // Salvar configuração corrigida
  fs.writeFileSync(angularConfigPath, JSON.stringify(angularConfig, null, 2));
  console.log('   ✅ Configuração do Angular salva');
  
} catch (error) {
  console.log(`   ❌ Erro ao corrigir Angular: ${error.message}`);
}

// 2. Verificar e corrigir index.html
console.log('\n2. CORRIGINDO INDEX.HTML:');
const indexPath = 'dist/frontend/browser/index.html';
if (fs.existsSync(indexPath)) {
  try {
    let content = fs.readFileSync(indexPath, 'utf8');
    
    // Corrigir base href se necessário
    if (!content.includes('<base href="./"')) {
      content = content.replace('<base href="/">', '<base href="./">');
      content = content.replace('<base href="/"', '<base href="./"');
      console.log('   ✅ Base href corrigido no index.html');
    }
    
    // Verificar se tem scripts
    if (!content.includes('<script')) {
      console.log('   ⚠️ index.html não tem scripts - pode ser problema de build');
    } else {
      console.log('   ✅ index.html tem scripts');
    }
    
    fs.writeFileSync(indexPath, content);
    
  } catch (error) {
    console.log(`   ❌ Erro ao corrigir index.html: ${error.message}`);
  }
} else {
  console.log('   ❌ index.html não encontrado - execute o build primeiro');
}

// 3. Verificar e corrigir dependências do backend
console.log('\n3. VERIFICANDO DEPENDÊNCIAS DO BACKEND:');
const backendPackagePath = 'src/backend/package.json';
if (fs.existsSync(backendPackagePath)) {
  try {
    const backendPackage = JSON.parse(fs.readFileSync(backendPackagePath, 'utf8'));
    const deps = { ...backendPackage.dependencies, ...backendPackage.devDependencies };
    
    // Verificar dependências críticas
    const criticalDeps = ['express', 'mysql2', 'discord.js', 'dotenv', 'cors'];
    const missingDeps = criticalDeps.filter(dep => !deps[dep]);
    
    if (missingDeps.length > 0) {
      console.log(`   ⚠️ Dependências faltando: ${missingDeps.join(', ')}`);
      console.log('   💡 Execute: cd src/backend && npm install');
    } else {
      console.log('   ✅ Todas as dependências críticas estão presentes');
    }
    
  } catch (error) {
    console.log(`   ❌ Erro ao verificar dependências: ${error.message}`);
  }
} else {
  console.log('   ❌ src/backend/package.json não encontrado');
}

// 4. Verificar e corrigir .env
console.log('\n4. VERIFICANDO ARQUIVO .ENV:');
const envPath = '.env';
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8');
  const requiredVars = ['PORT', 'DB_HOST', 'DB_USER', 'DB_PASSWORD', 'DB_NAME', 'DISCORD_TOKEN', 'RIOT_API_KEY'];
  const missingVars = requiredVars.filter(varName => !envContent.includes(varName + '='));
  
  if (missingVars.length > 0) {
    console.log(`   ⚠️ Variáveis faltando: ${missingVars.join(', ')}`);
    console.log('   💡 Adicione as variáveis faltando ao arquivo .env');
  } else {
    console.log('   ✅ Todas as variáveis de ambiente estão presentes');
  }
} else {
  console.log('   ❌ Arquivo .env não encontrado');
  console.log('   💡 Crie um arquivo .env com as variáveis necessárias');
}

// 5. Verificar estrutura de pastas
console.log('\n5. VERIFICANDO ESTRUTURA DE PASTAS:');
const requiredPaths = [
  'dist/backend',
  'dist/frontend/browser',
  'src/backend',
  'src/frontend',
  'src/electron'
];

requiredPaths.forEach(p => {
  if (!fs.existsSync(p)) {
    console.log(`   ❌ ${p}: não existe`);
  } else {
    console.log(`   ✅ ${p}: existe`);
  }
});

// 6. Sugestões de correção
console.log('\n6. SUGESTÕES DE CORREÇÃO:');
console.log('   📝 Se o frontend não carrega em produção:');
console.log('   1. Execute: npm run build:frontend');
console.log('   2. Verifique se dist/frontend/browser/index.html existe');
console.log('   3. Verifique se o base href está correto');
console.log('');
console.log('   📝 Se o backend não conecta:');
console.log('   1. Execute: npm run build:backend');
console.log('   2. Verifique se dist/backend/server.js existe');
console.log('   3. Execute: cd dist/backend && node server.js');
console.log('   4. Verifique se não há erros de dependências');
console.log('');
console.log('   📝 Para testar o executável:');
console.log('   1. Execute: npm run electron:build');
console.log('   2. Abra o executável gerado');
console.log('   3. Pressione F12 para ver logs de erro');
console.log('   4. Verifique o terminal para logs do backend');

console.log('\n🔧 CORREÇÕES CONCLUÍDAS'); 