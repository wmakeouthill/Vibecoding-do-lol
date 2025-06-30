const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

console.log('🔍 DIAGNÓSTICO DE PROBLEMAS DE PRODUÇÃO\n');

// 1. Verificar estrutura de pastas
console.log('1. VERIFICANDO ESTRUTURA DE PASTAS:');
const paths = {
  dist: path.join(__dirname, 'dist'),
  distBackend: path.join(__dirname, 'dist', 'backend'),
  distFrontend: path.join(__dirname, 'dist', 'frontend'),
  distFrontendBrowser: path.join(__dirname, 'dist', 'frontend', 'browser'),
  srcBackend: path.join(__dirname, 'src', 'backend'),
  srcFrontend: path.join(__dirname, 'src', 'frontend'),
  electron: path.join(__dirname, 'src', 'electron')
};

Object.entries(paths).forEach(([name, p]) => {
  const exists = fs.existsSync(p);
  console.log(`   ${exists ? '✅' : '❌'} ${name}: ${p} ${exists ? '' : '(NÃO EXISTE)'}`);
  
  if (exists && name.includes('dist')) {
    const files = fs.readdirSync(p);
    console.log(`      📁 Conteúdo: ${files.slice(0, 5).join(', ')}${files.length > 5 ? '...' : ''}`);
  }
});

// 2. Verificar arquivos críticos
console.log('\n2. VERIFICANDO ARQUIVOS CRÍTICOS:');
const criticalFiles = [
  'dist/backend/server.js',
  'dist/frontend/browser/index.html',
  'dist/frontend/browser/main.js',
  'dist/frontend/browser/polyfills.js',
  'dist/frontend/browser/runtime.js',
  'src/backend/server.ts',
  'src/electron/main.ts',
  '.env'
];

criticalFiles.forEach(file => {
  const fullPath = path.join(__dirname, file);
  const exists = fs.existsSync(fullPath);
  console.log(`   ${exists ? '✅' : '❌'} ${file} ${exists ? '' : '(NÃO EXISTE)'}`);
  
  if (exists && file.includes('index.html')) {
    const content = fs.readFileSync(fullPath, 'utf8');
    const hasBaseHref = content.includes('<base href');
    const hasScripts = content.includes('<script');
    console.log(`      📄 index.html: base href=${hasBaseHref}, scripts=${hasScripts}`);
  }
});

// 3. Verificar configurações do Angular
console.log('\n3. VERIFICANDO CONFIGURAÇÃO DO ANGULAR:');
try {
  const angularConfig = JSON.parse(fs.readFileSync('src/frontend/angular.json', 'utf8'));
  const buildConfig = angularConfig.projects['lol-matchmaking'].architect.build;
  console.log(`   ✅ Output path: ${buildConfig.options.outputPath}`);
  console.log(`   ✅ Base href: ${buildConfig.options.baseHref || '/ (padrão)'}`);
  console.log(`   ✅ Deploy url: ${buildConfig.options.deployUrl || 'não definido'}`);
} catch (error) {
  console.log(`   ❌ Erro ao ler angular.json: ${error.message}`);
}

// 4. Verificar package.json scripts
console.log('\n4. VERIFICANDO SCRIPTS DO PACKAGE.JSON:');
try {
  const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
  const scripts = packageJson.scripts;
  
  ['build', 'build:frontend', 'build:backend', 'electron:build'].forEach(script => {
    if (scripts[script]) {
      console.log(`   ✅ ${script}: ${scripts[script]}`);
    } else {
      console.log(`   ❌ ${script}: não encontrado`);
    }
  });
} catch (error) {
  console.log(`   ❌ Erro ao ler package.json: ${error.message}`);
}

// 5. Verificar dependências do backend
console.log('\n5. VERIFICANDO DEPENDÊNCIAS DO BACKEND:');
const backendPackagePath = path.join(__dirname, 'src', 'backend', 'package.json');
if (fs.existsSync(backendPackagePath)) {
  try {
    const backendPackage = JSON.parse(fs.readFileSync(backendPackagePath, 'utf8'));
    const deps = { ...backendPackage.dependencies, ...backendPackage.devDependencies };
    
    const criticalDeps = ['express', 'mysql2', 'discord.js', 'dotenv', 'cors'];
    criticalDeps.forEach(dep => {
      if (deps[dep]) {
        console.log(`   ✅ ${dep}: ${deps[dep]}`);
      } else {
        console.log(`   ❌ ${dep}: não encontrado`);
      }
    });
  } catch (error) {
    console.log(`   ❌ Erro ao ler backend package.json: ${error.message}`);
  }
} else {
  console.log('   ❌ src/backend/package.json não encontrado');
}

// 6. Verificar se o backend está rodando
console.log('\n6. VERIFICANDO SE O BACKEND ESTÁ RODANDO:');
try {
  const response = execSync('curl -s http://localhost:3000/api/health', { encoding: 'utf8', timeout: 5000 });
  console.log('   ✅ Backend está rodando na porta 3000');
  console.log(`   📄 Resposta: ${response}`);
} catch (error) {
  console.log('   ❌ Backend não está rodando na porta 3000');
}

// 7. Verificar variáveis de ambiente
console.log('\n7. VERIFICANDO VARIÁVEIS DE AMBIENTE:');
const envPath = path.join(__dirname, '.env');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8');
  const envVars = ['PORT', 'DB_HOST', 'DB_USER', 'DB_PASSWORD', 'DB_NAME', 'DISCORD_TOKEN', 'RIOT_API_KEY'];
  
  envVars.forEach(varName => {
    if (envContent.includes(varName + '=')) {
      console.log(`   ✅ ${varName}: definido`);
    } else {
      console.log(`   ❌ ${varName}: não encontrado`);
    }
  });
} else {
  console.log('   ❌ Arquivo .env não encontrado');
}

// 8. Verificar logs do Electron
console.log('\n8. SUGESTÕES PARA DEBUG:');
console.log('   📝 Para ver logs do Electron em produção:');
console.log('   - Pressione F12 para abrir DevTools');
console.log('   - Verifique a aba Console para erros');
console.log('   - Verifique a aba Network para falhas de carregamento');
console.log('');
console.log('   📝 Para ver logs do backend:');
console.log('   - Verifique o terminal onde o executável foi iniciado');
console.log('   - Procure por mensagens de erro do backend');
console.log('');
console.log('   📝 Para testar o backend diretamente:');
console.log('   - cd dist/backend');
console.log('   - node server.js');
console.log('   - Verifique se inicia sem erros');

console.log('\n🔍 DIAGNÓSTICO CONCLUÍDO'); 