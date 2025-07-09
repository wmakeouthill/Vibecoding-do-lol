const fs = require('fs');
const path = require('path');
const { spawn, exec } = require('child_process');
const http = require('http');
const net = require('net');

console.log('🔍 DIAGNÓSTICO DE PROBLEMAS DE CONEXÃO');
console.log('=====================================\n');

// 1. Verificar se Node.js está instalado
console.log('1. VERIFICANDO NODE.JS:');
try {
  const nodeVersion = require('child_process').execSync('node --version', { encoding: 'utf8' }).trim();
  console.log(`   ✅ Node.js instalado: ${nodeVersion}`);
} catch (error) {
  console.log('   ❌ Node.js NÃO INSTALADO ou não está no PATH');
  console.log('   💡 Solução: Instale o Node.js de https://nodejs.org/');
  console.log('   💡 Versão recomendada: LTS (18.x ou superior)');
}

// 2. Verificar se NPM está instalado
console.log('\n2. VERIFICANDO NPM:');
try {
  const npmVersion = require('child_process').execSync('npm --version', { encoding: 'utf8' }).trim();
  console.log(`   ✅ NPM instalado: ${npmVersion}`);
} catch (error) {
  console.log('   ❌ NPM não encontrado');
  console.log('   💡 NPM normalmente vem com Node.js');
}

// 3. Verificar porta 3000
console.log('\n3. VERIFICANDO PORTA 3000:');
const server = net.createServer();
server.listen(3000, () => {
  console.log('   ✅ Porta 3000 está livre');
  server.close();
  continueTest();
}).on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.log('   ⚠️ Porta 3000 já está em uso');
    console.log('   💡 Finalize outros processos que usam a porta 3000');
    console.log('   💡 Comando: netstat -ano | findstr :3000');
  } else {
    console.log('   ❌ Erro ao testar porta 3000:', err.message);
  }
  continueTest();
});

function continueTest() {
  // 4. Verificar firewall/antivírus
  console.log('\n4. VERIFICANDO POSSÍVEIS BLOQUEIOS:');
  console.log('   ⚠️ Possíveis causas de bloqueio:');
  console.log('   - Windows Firewall bloqueando Node.js');
  console.log('   - Antivírus bloqueando execução de scripts');
  console.log('   - Política de execução do PowerShell restritiva');
  console.log('   - VPN interferindo com localhost');
  console.log('');
  console.log('   💡 Soluções:');
  console.log('   - Adicionar exceção no Windows Firewall para Node.js');
  console.log('   - Temporariamente desabilitar antivírus para teste');
  console.log('   - Executar como administrador');

  // 5. Verificar arquivos da aplicação
  console.log('\n5. VERIFICANDO ARQUIVOS DA APLICAÇÃO:');
  checkApplicationFiles();
}

function checkApplicationFiles() {
  const requiredFiles = [
    { path: 'dist/backend/server.js', name: 'Backend compilado' },
    { path: 'dist/backend/node_modules', name: 'Dependências do backend' },
    { path: 'dist/frontend/browser/index.html', name: 'Frontend compilado' },
    { path: 'dist/electron/main.js', name: 'Electron main' },
    { path: '.env', name: 'Arquivo de configuração' }
  ];

  let allFilesOk = true;
  requiredFiles.forEach(file => {
    const exists = fs.existsSync(file.path);
    console.log(`   ${exists ? '✅' : '❌'} ${file.name}: ${file.path}`);
    if (!exists) allFilesOk = false;
  });

  if (!allFilesOk) {
    console.log('\n   💡 Arquivos faltando - execute: npm run build:complete');
  }

  // 6. Verificar dependências críticas
  console.log('\n6. VERIFICANDO DEPENDÊNCIAS CRÍTICAS:');
  const backendModules = 'dist/backend/node_modules';
  if (fs.existsSync(backendModules)) {
    const criticalDeps = ['express', 'mysql2', 'discord.js', 'dotenv', 'cors', 'ws'];
    criticalDeps.forEach(dep => {
      const depPath = path.join(backendModules, dep);
      const exists = fs.existsSync(depPath);
      console.log(`   ${exists ? '✅' : '❌'} ${dep}`);
    });
  } else {
    console.log('   ❌ Pasta node_modules não encontrada');
  }

  // 7. Teste de conectividade local
  console.log('\n7. TESTANDO CONECTIVIDADE LOCAL:');
  testLocalConnectivity();
}

function testLocalConnectivity() {
  console.log('   🔄 Testando resolução de localhost...');
  
  const testUrls = [
    'http://127.0.0.1:3000',
    'http://localhost:3000'
  ];
  
  testUrls.forEach(url => {
    try {
      const parsedUrl = new URL(url);
      console.log(`   📍 Testando: ${parsedUrl.hostname}`);
      
      // Tentar resolver o hostname
      require('dns').lookup(parsedUrl.hostname, (err, address) => {
        if (err) {
          console.log(`   ❌ Erro de resolução DNS para ${parsedUrl.hostname}: ${err.message}`);
        } else {
          console.log(`   ✅ ${parsedUrl.hostname} resolve para: ${address}`);
        }
      });
    } catch (error) {
      console.log(`   ❌ URL inválida: ${url}`);
    }
  });

  // 8. Gerar script de teste
  console.log('\n8. GERANDO SCRIPT DE TESTE:');
  generateTestScript();
}

function generateTestScript() {
  const testScript = `
@echo off
title Teste de Conectividade LoL Matchmaking
echo ========================================
echo TESTE DE CONECTIVIDADE - LoL Matchmaking
echo ========================================
echo.

echo [1/3] Verificando Node.js...
node --version >nul 2>&1
if %errorlevel% neq 0 (
    echo ERRO: Node.js nao encontrado!
    echo Baixe em: https://nodejs.org/
    pause
    exit /b 1
)
echo OK: Node.js encontrado

echo.
echo [2/3] Verificando porta 3000...
netstat -an | findstr :3000 >nul 2>&1
if %errorlevel% equ 0 (
    echo AVISO: Porta 3000 ja esta em uso
    echo Execute: netstat -ano | findstr :3000
) else (
    echo OK: Porta 3000 livre
)

echo.
echo [3/3] Testando backend standalone...
cd /d "%~dp0"
if exist "dist\\backend\\server.js" (
    echo Iniciando backend...
    cd dist\\backend
    node server.js
) else (
    echo ERRO: Backend nao encontrado!
    echo Execute: npm run build:backend
)

pause
`;

  fs.writeFileSync('test-connectivity.bat', testScript);
  console.log('   ✅ Script de teste criado: test-connectivity.bat');
  console.log('   💡 Execute este arquivo para testar conectividade');

  // 9. Relatório final
  console.log('\n9. RELATÓRIO FINAL:');
  console.log('   📝 Passos para resolver problemas de conexão:');
  console.log('   1. Certifique-se que Node.js está instalado');
  console.log('   2. Execute: npm run build:complete');
  console.log('   3. Execute: test-connectivity.bat');
  console.log('   4. Se necessário, execute como administrador');
  console.log('   5. Adicione exceção no firewall para Node.js');
  console.log('');
  console.log('   🔧 Para debug avançado:');
  console.log('   - Execute: npm run test:backend:isolated');
  console.log('   - Verifique logs no terminal');
  console.log('   - Pressione F12 no Electron para ver erros');
}
