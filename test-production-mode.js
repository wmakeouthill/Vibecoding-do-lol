const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

console.log('🔍 TESTE DO MODO PRODUÇÃO');
console.log('=========================');

// Verificar se o executável existe
const executablePath = path.join(__dirname, 'release', 'LoL Matchmaking Setup 1.0.0.exe');
console.log('📍 Procurando executável em:', executablePath);

if (!fs.existsSync(executablePath)) {
  console.error('❌ Executável não encontrado!');
  console.log('📂 Listando arquivos em release/:');
  
  const releasePath = path.join(__dirname, 'release');
  if (fs.existsSync(releasePath)) {
    const files = fs.readdirSync(releasePath);
    files.forEach(file => {
      console.log(`   - ${file}`);
    });
  } else {
    console.log('❌ Diretório release/ não encontrado');
  }
  
  process.exit(1);
}

console.log('✅ Executável encontrado');

// Função para testar conectividade
function testConnectivity() {
  console.log('\n🧪 Testando conectividade com backend...');
  
  const testUrls = [
    'http://localhost:3000/api/health',
    'http://127.0.0.1:3000/api/health'
  ];
  
  testUrls.forEach(url => {
    console.log(`🔍 Testando: ${url}`);
    
    fetch(url)
      .then(response => response.json())
      .then(data => {
        console.log(`✅ ${url} - Resposta:`, data);
      })
      .catch(error => {
        console.log(`❌ ${url} - Erro:`, error.message);
      });
  });
}

// Aguardar um tempo antes de testar
setTimeout(() => {
  testConnectivity();
}, 5000);

setTimeout(() => {
  testConnectivity();
}, 10000);

setTimeout(() => {
  testConnectivity();
}, 15000);

console.log('\n📝 Instruções para teste manual:');
console.log('1. Execute o arquivo:', executablePath);
console.log('2. Aguarde o aplicativo abrir');
console.log('3. Abra o DevTools (F12) no Electron');
console.log('4. Verifique os logs no console');
console.log('5. Tente acessar: http://localhost:3000/api/health');
console.log('6. Verifique se o backend está rodando nos logs');

console.log('\n🔧 Logs esperados no backend:');
console.log('- "🔧 Configuração do servidor"');
console.log('- "🚀 Servidor rodando na porta 3000"');
console.log('- "🌐 CORS request from origin: ..." (requisições do frontend)');
console.log('- "✅ CORS allowed for production origin"');
console.log('- "✅ Banco de dados inicializado"');
console.log('- "✅ LCU Service inicializado" (se LoL estiver aberto)');
console.log('- "🧪 Testando conectividade interna..."');

console.log('\n🔧 Logs esperados no frontend:');
console.log('- "🔍 Electron detection"');
console.log('- "isElectron: true"');
console.log('- "🖥️ Platform detection" (Windows/não-Windows)');
console.log('- "🔧 Backend URL primária para Windows: http://127.0.0.1:3000/api"');
console.log('- "🔄 Tentando requisição: GET http://127.0.0.1:3000/api/health"');

console.log('\n⚠️ Problemas comuns:');
console.log('- Backend não inicia: verificar se porta 3000 está livre');
console.log('- CORS errors: verificar logs de origem das requisições');
console.log('- 503 errors: LCU ou serviços não conectados (normal se LoL não estiver aberto)');
console.log('- Frontend branco: verificar se arquivos estão sendo servidos');

console.log('\n🏁 Pressione Ctrl+C para encerrar este script quando terminar os testes');

// Manter o script vivo para os testes de conectividade
setInterval(() => {
  // Script mantido vivo
}, 30000); 