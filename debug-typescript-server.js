const { spawn } = require('child_process');
const path = require('path');

console.log('🔍 DEBUGANDO SERVIDOR TYPESCRIPT');
console.log('================================');

// Executar o servidor TypeScript com ts-node
const serverPath = path.join(__dirname, 'src', 'backend', 'server.ts');

console.log('📍 Caminho do servidor:', serverPath);
console.log('🚀 Iniciando servidor com ts-node...\n');

const child = spawn('npx', ['ts-node', serverPath], {
  cwd: __dirname,
  stdio: 'pipe'
});

let errorOutput = '';
let standardOutput = '';

child.stdout.on('data', (data) => {
  const output = data.toString();
  standardOutput += output;
  console.log(output);
});

child.stderr.on('data', (data) => {
  const output = data.toString();
  errorOutput += output;
  console.error(output);
});

child.on('close', (code) => {
  console.log(`\n📊 Processo encerrado com código: ${code}`);
  
  if (code !== 0) {
    console.log('\n🔍 ANÁLISE DO ERRO:');
    console.log('==================');
    
    if (errorOutput.includes('pathToRegexpError') || errorOutput.includes('Missing parameter name')) {
      console.log('✅ Erro de path-to-regexp detectado!');
      
      // Procurar pela linha específica do erro
      const lines = errorOutput.split('\n');
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].includes('Missing parameter name')) {
          console.log(`📍 Linha do erro: ${lines[i]}`);
          
          // Mostrar contexto (linhas antes e depois)
          console.log('\n📋 Contexto:');
          for (let j = Math.max(0, i - 3); j <= Math.min(lines.length - 1, i + 3); j++) {
            const marker = j === i ? '>>> ' : '    ';
            console.log(`${marker}${j}: ${lines[j]}`);
          }
          break;
        }
      }
    }
    
    if (standardOutput.includes('Definindo rota') || standardOutput.includes('Rotas de campeões')) {
      console.log('\n📝 Últimas rotas definidas antes do erro:');
      const lines = standardOutput.split('\n');
      const routeLines = lines.filter(line => 
        line.includes('Definindo rota') || 
        line.includes('Rotas de campeões') ||
        line.includes('setupChampionRoutes')
      );
      routeLines.slice(-10).forEach(line => console.log('   ', line));
    }
  } else {
    console.log('✅ Servidor iniciado com sucesso!');
  }
});

child.on('error', (error) => {
  console.error('💥 Erro ao iniciar processo:', error);
});

// Timeout para evitar que o script rode indefinidamente
setTimeout(() => {
  if (!child.killed) {
    console.log('\n⏰ Timeout atingido, encerrando processo...');
    child.kill('SIGTERM');
  }
}, 30000); // 30 segundos 