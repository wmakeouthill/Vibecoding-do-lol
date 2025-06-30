const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

console.log('🧪 TESTANDO BACKEND ISOLADAMENTE\n');

// 1. Verificar se o arquivo compilado existe
console.log('1. VERIFICANDO ARQUIVO COMPILADO:');
const backendPath = path.join(__dirname, 'dist', 'backend', 'server.js');
if (fs.existsSync(backendPath)) {
  console.log('   ✅ server.js encontrado:', backendPath);
} else {
  console.log('   ❌ server.js não encontrado');
  console.log('   💡 Execute: npm run build:backend');
  process.exit(1);
}

// 2. Verificar dependências
console.log('\n2. VERIFICANDO DEPENDÊNCIAS:');
const nodeModulesPath = path.join(__dirname, 'dist', 'backend', 'node_modules');
if (fs.existsSync(nodeModulesPath)) {
  console.log('   ✅ node_modules encontrado');
  
  // Verificar dependências críticas
  const criticalDeps = ['express', 'mysql2', 'discord.js', 'dotenv', 'cors'];
  criticalDeps.forEach(dep => {
    const depPath = path.join(nodeModulesPath, dep);
    if (fs.existsSync(depPath)) {
      console.log(`   ✅ ${dep}: encontrado`);
    } else {
      console.log(`   ❌ ${dep}: não encontrado`);
    }
  });
} else {
  console.log('   ❌ node_modules não encontrado');
  console.log('   💡 Execute: cd dist/backend && npm install');
  process.exit(1);
}

// 3. Verificar arquivo .env
console.log('\n3. VERIFICANDO ARQUIVO .ENV:');
const envPath = path.join(__dirname, '.env');
if (fs.existsSync(envPath)) {
  console.log('   ✅ .env encontrado');
  const envContent = fs.readFileSync(envPath, 'utf8');
  const requiredVars = ['PORT', 'DB_HOST', 'DB_USER', 'DB_PASSWORD', 'DB_NAME', 'DISCORD_TOKEN', 'RIOT_API_KEY'];
  requiredVars.forEach(varName => {
    if (envContent.includes(varName + '=')) {
      console.log(`   ✅ ${varName}: definido`);
    } else {
      console.log(`   ❌ ${varName}: não encontrado`);
    }
  });
} else {
  console.log('   ❌ .env não encontrado');
  console.log('   💡 Crie um arquivo .env com as variáveis necessárias');
  process.exit(1);
}

// 4. Testar inicialização do backend
console.log('\n4. TESTANDO INICIALIZAÇÃO DO BACKEND:');
console.log('   🚀 Iniciando backend...');

const backendDir = path.dirname(backendPath);
const env = {
  ...process.env,
  NODE_PATH: nodeModulesPath,
  NODE_ENV: 'production'
};

const backendProcess = spawn('node', [backendPath], {
  stdio: 'pipe',
  env: env,
  cwd: backendDir
});

let backendStarted = false;
let backendError = false;

// Timeout para parar o teste após 30 segundos
const timeout = setTimeout(() => {
  if (!backendStarted) {
    console.log('   ⏰ Timeout: backend não iniciou em 30 segundos');
    backendProcess.kill();
    process.exit(1);
  }
}, 30000);

backendProcess.stdout.on('data', (data) => {
  const output = data.toString();
  console.log(`   📤 ${output.trim()}`);
  
  if (output.includes('Servidor rodando na porta')) {
    backendStarted = true;
    console.log('   ✅ Backend iniciado com sucesso!');
    
    // Parar o backend após 5 segundos
    setTimeout(() => {
      console.log('   🛑 Parando backend...');
      backendProcess.kill();
      clearTimeout(timeout);
      process.exit(0);
    }, 5000);
  }
});

backendProcess.stderr.on('data', (data) => {
  const error = data.toString();
  console.log(`   ❌ ${error.trim()}`);
  backendError = true;
});

backendProcess.on('close', (code) => {
  clearTimeout(timeout);
  if (code === 0) {
    console.log('   ✅ Backend encerrado normalmente');
  } else {
    console.log(`   ❌ Backend encerrado com código ${code}`);
  }
});

backendProcess.on('error', (error) => {
  clearTimeout(timeout);
  console.log(`   ❌ Erro ao iniciar backend: ${error.message}`);
  process.exit(1);
});

// 5. Instruções para debug
console.log('\n5. INSTRUÇÕES PARA DEBUG:');
console.log('   📝 Se o backend não iniciar:');
console.log('   1. Verifique se o MySQL está rodando');
console.log('   2. Verifique se as credenciais no .env estão corretas');
console.log('   3. Verifique se o Discord token é válido');
console.log('   4. Verifique se a Riot API key é válida');
console.log('');
console.log('   📝 Para testar manualmente:');
console.log('   1. cd dist/backend');
console.log('   2. node server.js');
console.log('   3. Verifique os logs de erro');
console.log('');
console.log('   📝 Para testar a API:');
console.log('   1. curl http://localhost:3000/api/health');
console.log('   2. Deve retornar: {"status":"ok","timestamp":"..."}'); 