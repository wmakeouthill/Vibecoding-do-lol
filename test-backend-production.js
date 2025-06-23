// Script para testar o backend em produção
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

// Simular o ambiente de produção
const appPath = path.join(__dirname, 'release', 'win-unpacked');
const backendPath = path.join(appPath, 'backend', 'server.js');
const nodeModulesPath = path.join(appPath, 'backend', 'node_modules');

console.log('=== DIAGNÓSTICO DO BACKEND EM PRODUÇÃO ===');
console.log('App path:', appPath);
console.log('Backend path:', backendPath);
console.log('Node modules path:', nodeModulesPath);
console.log('');

// Verificar se os arquivos existem
console.log('=== VERIFICAÇÃO DE ARQUIVOS ===');
console.log('Backend exists:', fs.existsSync(backendPath));
console.log('Node modules exists:', fs.existsSync(nodeModulesPath));

if (fs.existsSync(nodeModulesPath)) {
  const nodeModulesContents = fs.readdirSync(nodeModulesPath);
  console.log('Node modules contents:', nodeModulesContents.slice(0, 10)); // Mostrar apenas primeiros 10
}

console.log('');

if (!fs.existsSync(backendPath)) {
  console.error('❌ Backend não encontrado!');
  process.exit(1);
}

if (!fs.existsSync(nodeModulesPath)) {
  console.error('❌ Node modules não encontrado!');
  process.exit(1);
}

// Tentar iniciar o backend
console.log('=== INICIANDO BACKEND ===');
const backendDir = path.dirname(backendPath);
const env = {
  ...process.env,
  NODE_PATH: nodeModulesPath,
  NODE_ENV: 'production'
};

console.log('Working directory:', backendDir);
console.log('Environment NODE_PATH:', env.NODE_PATH);
console.log('');

const backendProcess = spawn('node', [backendPath], {
  stdio: 'pipe',
  env: env,
  cwd: backendDir
});

backendProcess.stdout.on('data', (data) => {
  console.log(`✅ Backend: ${data}`);
});

backendProcess.stderr.on('data', (data) => {
  console.error(`❌ Backend Error: ${data}`);
});

backendProcess.on('close', (code) => {
  console.log(`Backend process closed with code ${code}`);
});

backendProcess.on('error', (error) => {
  console.error('❌ Erro ao iniciar backend:', error);
});

// Aguardar um pouco e tentar fazer uma requisição de teste
setTimeout(() => {
  console.log('');
  console.log('=== TESTANDO CONECTIVIDADE ===');
  
  const http = require('http');
  const req = http.get('http://localhost:3000/api/health', (res) => {
    console.log('✅ Backend respondeu com status:', res.statusCode);
    
    let data = '';
    res.on('data', (chunk) => {
      data += chunk;
    });
    
    res.on('end', () => {
      console.log('✅ Resposta do backend:', data);
      backendProcess.kill();
      process.exit(0);
    });
  });
  
  req.on('error', (err) => {
    console.error('❌ Erro ao conectar no backend:', err.message);
    backendProcess.kill();
    process.exit(1);
  });
  
  req.setTimeout(5000, () => {
    console.error('❌ Timeout ao conectar no backend');
    backendProcess.kill();
    process.exit(1);
  });
}, 3000);
