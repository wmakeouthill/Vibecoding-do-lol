const { spawn } = require('child_process');
const path = require('path');

console.log('🧪 [Test] === TESTE AVANÇADO - CORREÇÕES TIMER RESET ===');
console.log('🧪 [Test] Investigando reset a cada 4 segundos e criação de novas partidas...');

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

async function testTimerResetFixes() {
  console.log('🧪 [Test] === PROBLEMAS IDENTIFICADOS ===');
  
  console.log('❌ [PROBLEMA 1] Timer resetando a cada 4 segundos');
  console.log('   Causa: handleMatchFound sendo chamado repetidamente');
  console.log('   Causa: ngOnChanges processando mesmos dados');
  console.log('   Causa: Backend enviando messages duplicadas');
  
  console.log('❌ [PROBLEMA 2] Criando novas partidas constantemente');
  console.log('   Causa: Sem controle de lastMatchId');
  console.log('   Causa: Verificação insuficiente de partida ativa');
  console.log('   Causa: Sem throttling de mensagens backend');
  
  console.log('❌ [PROBLEMA 3] Partida deveria durar 30s únicos');
  console.log('   Causa: Timer sendo reiniciado a cada mensagem');
  console.log('   Causa: Múltiplas instâncias de timer ativo');
  
  console.log('🧪 [Test] === CORREÇÕES IMPLEMENTADAS ===');
  
  console.log('✅ [CORREÇÃO 1] Controle rigoroso de partidas únicas');
  console.log('   - lastMatchId: Rastreia última partida processada');
  console.log('   - Verificação tripla antes de processar nova partida');
  console.log('   - Limpeza de lastMatchId em todos os finais de partida');
  
  console.log('✅ [CORREÇÃO 2] Throttling avançado de mensagens');
  console.log('   - Backend messages: Máximo 1 por segundo');
  console.log('   - Timer updates: Máximo 2 por segundo (500ms)');
  console.log('   - lastMessageTimestamp para controle global');
  
  console.log('✅ [CORREÇÃO 3] ngOnChanges super-rigoroso');
  console.log('   - Verificação de dados idênticos (JSON.stringify)');
  console.log('   - Verificação de timer já ativo');
  console.log('   - Logs detalhados para debug');
  
  console.log('✅ [CORREÇÃO 4] Controle de estado global');
  console.log('   - handleMatchFound: 3 verificações antes de processar');
  console.log('   - Estado limpo em accept/decline/cancel/draft');
  console.log('   - Proteção contra partidas duplicadas');
  
  console.log('🧪 [Test] === FLUXO ESPERADO APÓS CORREÇÕES ===');
  
  console.log('1. 🎮 Backend encontra partida → Envia match_found');
  console.log('2. 🔍 Frontend verifica: lastMatchId, partida ativa, dados únicos');
  console.log('3. ✅ Se nova: lastMatchId = matchId, processa UMA VEZ');
  console.log('4. ⏰ Timer inicia: 30s únicos, sem resets');
  console.log('5. 🔄 Timer updates: Throttled, sem duplicatas');
  console.log('6. 🎯 Resultado: Accept → Draft, Decline → Fila, Timeout → Cancel');
  console.log('7. 🧹 Estado limpo: lastMatchId = null, pronto para próxima');
  
  console.log('🧪 [Test] === LOGS PARA MONITORAR ===');
  
  console.log('📍 [LOGS POSITIVOS - devem aparecer]:');
  console.log('   🎮 [App] ✅ PROCESSANDO NOVA PARTIDA: {matchId}');
  console.log('   🎮 [MatchFound] ✅ NOVA PARTIDA CONFIRMADA');
  console.log('   ⏰ [MatchFound] Backend assumiu controle - parando timer local');
  console.log('   🧹 [App] Estado limpo após {ação}');
  
  console.log('⚠️ [LOGS NEGATIVOS - NÃO devem aparecer]:');
  console.log('   ❌ [App] ❌ PARTIDA JÁ PROCESSADA - ignorando duplicata');
  console.log('   ❌ [App] ❌ JÁ EXISTE UMA PARTIDA ATIVA');
  console.log('   ❌ [MatchFound] ❌ MESMA PARTIDA - ignorando ngOnChanges');
  console.log('   ❌ [App] Throttling mensagem backend - muito frequente');
  
  console.log('🧪 [Test] === CENÁRIOS DE TESTE ===');
  
  console.log('📋 [TESTE A] Timer Único de 30s');
  console.log('   1. Entre na fila e aguarde match found');
  console.log('   2. OBSERVAR: Timer deve contar 30→29→28...→0 SEM RESETAR');
  console.log('   3. VERIFICAR: Logs não mostram "PARTIDA JÁ PROCESSADA"');
  console.log('   4. RESULTADO: Timer estável, sem interrupções');
  
  console.log('📋 [TESTE B] Partida Única (sem duplicatas)');
  console.log('   1. Entre na fila e aguarde match found');
  console.log('   2. OBSERVAR: Apenas UM "PROCESSANDO NOVA PARTIDA" no log');
  console.log('   3. VERIFICAR: Sem logs de "ignorando duplicata"');
  console.log('   4. RESULTADO: Uma partida processada, uma vez apenas');
  
  console.log('📋 [TESTE C] Recusa Remove da Fila');
  console.log('   1. Entre na fila, aguarde match found');
  console.log('   2. Clique "Recusar"');
  console.log('   3. OBSERVAR: "Estado limpo após recusa" no log');
  console.log('   4. VERIFICAR: lastMatchId = null, status = fora da fila');
  console.log('   5. RESULTADO: Completamente fora da fila');
  
  console.log('📋 [TESTE D] Throttling Efetivo');
  console.log('   1. Com match found ativo, observar logs');
  console.log('   2. VERIFICAR: Máximo 1 timer update por 500ms');
  console.log('   3. VERIFICAR: Máximo 1 backend message por 1000ms');
  console.log('   4. RESULTADO: Performance otimizada, sem spam');
  
  console.log('🧪 [Test] === ARQUIVOS MODIFICADOS ===');
  console.log('✅ app.ts:');
  console.log('   - lastMatchId: Nova propriedade de controle');
  console.log('   - lastMessageTimestamp: Throttling de mensagens');
  console.log('   - handleBackendMessage: Throttling geral implementado');
  console.log('   - handleMatchFound: Verificação tripla antes de processar');
  console.log('   - accept/decline/cancel/draft: Limpeza de lastMatchId');
  
  console.log('✅ match-found.ts:');
  console.log('   - ngOnChanges: Verificação super-rigorosa de dados');
  console.log('   - JSON.stringify: Comparação de dados idênticos');
  console.log('   - Logs detalhados: Debug avançado para investigação');
  
  try {
    // Verificar se o sistema está rodando
    console.log('\n🧪 [Test] Verificando sistema...');
    const { stdout } = await runCommand('netstat', ['-an'], { cwd: __dirname });
    
    if (stdout.includes(':8080')) {
      console.log('✅ [Test] Backend rodando na porta 8080');
    } else {
      console.log('❌ [Test] Backend não encontrado - execute: npm run dev:backend');
    }
    
    if (stdout.includes(':3000')) {
      console.log('✅ [Test] Frontend rodando na porta 3000');
    } else {
      console.log('❌ [Test] Frontend não encontrado - execute: npm run dev:frontend');
    }
    
  } catch (error) {
    console.error('❌ [Test] Erro ao verificar sistema:', error);
  }
  
  console.log('\n🎯 [Test] === INSTRUÇÕES FINAIS ===');
  console.log('1. 🚀 Inicie: npm run dev');
  console.log('2. 🔍 Abra DevTools → Console para monitorar logs');
  console.log('3. 🧪 Execute os 4 cenários de teste acima');
  console.log('4. ✅ Confirme que logs negativos NÃO aparecem');
  console.log('5. 🎉 Validar que timer funciona 30s únicos sem reset');
  
  console.log('\n📈 [Test] === EXPECTATIVA DE SUCESSO ===');
  console.log('✅ Timer: 30s únicos, sem resets');
  console.log('✅ Partidas: Uma criada, uma processada');
  console.log('✅ Performance: Throttling efetivo');
  console.log('✅ Estado: Limpeza completa após ações');
  console.log('✅ UX: Fluída e previsível');
  
  console.log('\n🏆 [Test] CORREÇÕES AVANÇADAS IMPLEMENTADAS - PRONTAS PARA TESTE!');
}

// Executar o teste
testTimerResetFixes().catch(console.error);
