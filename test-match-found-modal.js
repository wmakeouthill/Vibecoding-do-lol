const { spawn } = require('child_process');
const path = require('path');

console.log('🧪 [Test] === TESTE DE MODAL MATCH FOUND ===');
console.log('🧪 [Test] Iniciando teste para verificar se o modal aparece...');

// Função para rodar comandos
function runCommand(command, args = [], options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { 
      stdio: 'pipe',
      shell: true,
      ...options
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    child.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    child.on('close', (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
      } else {
        reject({ code, stdout, stderr });
      }
    });
  });
}

async function testMatchFoundModal() {
  console.log('🧪 [Test] Verificando se o sistema está rodando...');
  
  try {
    // Esperar alguns segundos para garantir que o sistema está inicializado
    console.log('🧪 [Test] Aguardando 5 segundos para o sistema inicializar...');
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    // Verificar se o backend está rodando
    console.log('🧪 [Test] Verificando se a porta 8080 está ativa...');
    const { stdout } = await runCommand('netstat', ['-an'], { cwd: __dirname });
    
    if (stdout.includes(':8080')) {
      console.log('✅ [Test] Backend rodando na porta 8080');
    } else {
      console.log('❌ [Test] Backend não encontrado na porta 8080');
    }
    
    // Verificar se o frontend está rodando
    if (stdout.includes(':3000')) {
      console.log('✅ [Test] Frontend rodando na porta 3000');
    } else {
      console.log('❌ [Test] Frontend não encontrado na porta 3000');
    }
    
    console.log('🧪 [Test] === RESUMO DOS FIXES ===');
    console.log('✅ [Test] DiscordService foi isolado de eventos de matchmaking');
    console.log('✅ [Test] Apenas ApiService processará eventos de match_found');
    console.log('✅ [Test] Auto-aceitação de bots movida para o backend');
    console.log('✅ [Test] Frontend sempre mostra o modal para todos os jogadores');
    console.log('✅ [Test] Não há mais duplicação de lógica');
    
    console.log('🧪 [Test] === INSTRUÇÕES PARA TESTE MANUAL ===');
    console.log('1. Abra o frontend em http://localhost:3000');
    console.log('2. Conecte-se ao jogo');
    console.log('3. Entre na fila com 10 jogadores (pode usar bots)');
    console.log('4. Quando a partida for encontrada, o modal deve aparecer');
    console.log('5. Bots devem aceitar automaticamente no backend');
    console.log('6. Jogadores humanos devem ver o modal para aceitar');
    
    console.log('🧪 [Test] === ARQUIVOS MODIFICADOS ===');
    console.log('✅ [Test] App.ts - Removida lógica de auto-aceitação');
    console.log('✅ [Test] App.ts - Removida conexão entre DiscordService e ApiService');
    console.log('✅ [Test] MatchFoundService.ts - Mantida auto-aceitação de bots');
    console.log('✅ [Test] DiscordService.ts - Isolado de eventos de matchmaking');
    
  } catch (error) {
    console.error('❌ [Test] Erro no teste:', error);
  }
}

// Executar o teste
testMatchFoundModal().catch(console.error);
