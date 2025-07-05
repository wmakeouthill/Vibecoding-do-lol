/**
 * Teste final para verificar:
 * 1. Modal de match-found só exibido para jogadores humanos
 * 2. Ícones e nomes de lanes exibidos corretamente
 * 3. Mapeamento correto de assignedLane
 */

const { exec } = require('child_process');
const path = require('path');

const workspaceRoot = __dirname;
const buildDir = path.join(workspaceRoot, 'build');

console.log('🧪 [Test] ============================================');
console.log('🧪 [Test] TESTE FINAL - MODAL MATCH-FOUND');
console.log('🧪 [Test] ============================================');

// Verificar se o build está disponível
const fs = require('fs');
const electronPath = path.join(buildDir, 'Vibecoding do lol.exe');

if (!fs.existsSync(electronPath)) {
  console.log('❌ [Test] Build não encontrado em:', electronPath);
  console.log('🔧 [Test] Executando build do projeto...');
  
  exec('npm run build', { cwd: workspaceRoot }, (error, stdout, stderr) => {
    if (error) {
      console.log('❌ [Test] Erro no build:', error.message);
      return;
    }
    
    if (stderr) {
      console.log('⚠️ [Test] Warnings no build:', stderr);
    }
    
    console.log('✅ [Test] Build concluído com sucesso!');
    console.log('📦 [Test] Stdout:', stdout);
    
    // Agora executar o teste
    runTest();
  });
} else {
  console.log('✅ [Test] Build encontrado, executando teste...');
  runTest();
}

function runTest() {
  console.log('🧪 [Test] ============================================');
  console.log('🧪 [Test] INICIANDO TESTE DE MATCH-FOUND');
  console.log('🧪 [Test] ============================================');

  // Executar o executável
  const child = exec(`"${electronPath}"`, { cwd: workspaceRoot }, (error, stdout, stderr) => {
    if (error) {
      console.log('❌ [Test] Erro ao executar:', error.message);
      return;
    }
    
    if (stderr) {
      console.log('⚠️ [Test] Stderr:', stderr);
    }
    
    console.log('📦 [Test] Stdout:', stdout);
  });

  // Aguardar um pouco para o app inicializar
  setTimeout(() => {
    console.log('🧪 [Test] ============================================');
    console.log('🧪 [Test] INSTRUÇÕES DO TESTE');
    console.log('🧪 [Test] ============================================');
    console.log('🧪 [Test] O aplicativo foi iniciado.');
    console.log('🧪 [Test] ');
    console.log('🧪 [Test] 📋 CHECKLIST DE TESTE:');
    console.log('🧪 [Test] ');
    console.log('🧪 [Test] 1. ENTRAR NA FILA:');
    console.log('🧪 [Test]    - Clique em "Entrar na Fila"');
    console.log('🧪 [Test]    - Aguarde a partida ser encontrada');
    console.log('🧪 [Test] ');
    console.log('🧪 [Test] 2. VERIFICAR MODAL DE MATCH-FOUND:');
    console.log('🧪 [Test]    ✅ Modal deve aparecer APENAS para jogadores humanos');
    console.log('🧪 [Test]    ✅ Bots NÃO devem ver o modal (auto-aceita no backend)');
    console.log('🧪 [Test] ');
    console.log('🧪 [Test] 3. VERIFICAR EXIBIÇÃO DAS LANES:');
    console.log('🧪 [Test]    ✅ Sua lane atribuída deve mostrar ícone correto');
    console.log('🧪 [Test]    ✅ Nome da lane deve estar em formato amigável:');
    console.log('🧪 [Test]       - TOP → ⚔️ Topo');
    console.log('🧪 [Test]       - JUNGLE → 🌲 Selva');
    console.log('🧪 [Test]       - MID → ⚡ Meio');
    console.log('🧪 [Test]       - ADC → 🏹 Atirador');
    console.log('🧪 [Test]       - SUPPORT → 🛡️ Suporte');
    console.log('🧪 [Test] ');
    console.log('🧪 [Test] 4. VERIFICAR LOGS NO CONSOLE:');
    console.log('🧪 [Test]    ✅ Logs de getLaneIcon devem mostrar mapeamento correto');
    console.log('🧪 [Test]    ✅ Logs de getLaneName devem mostrar conversão correta');
    console.log('🧪 [Test]    ✅ Não deve aparecer ícone ❓ ou nomes em maiúsculas');
    console.log('🧪 [Test] ');
    console.log('🧪 [Test] 5. VERIFICAR TIMES:');
    console.log('🧪 [Test]    ✅ Times devem estar organizados corretamente');
    console.log('🧪 [Test]    ✅ Jogador atual deve estar destacado');
    console.log('🧪 [Test]    ✅ Todas as lanes devem ter ícones/nomes corretos');
    console.log('🧪 [Test] ');
    console.log('🧪 [Test] ============================================');
    console.log('🧪 [Test] VERIFICAÇÃO DE CÓDIGO');
    console.log('🧪 [Test] ============================================');
    
    // Verificar se as alterações foram aplicadas corretamente
    verifyCodeChanges();
    
    // Aguardar mais tempo antes de encerrar
    setTimeout(() => {
      console.log('🧪 [Test] ============================================');
      console.log('🧪 [Test] FINALIZANDO TESTE');
      console.log('🧪 [Test] ============================================');
      console.log('🧪 [Test] O teste foi concluído.');
      console.log('🧪 [Test] Verifique o console do aplicativo para logs detalhados.');
      console.log('🧪 [Test] ');
      console.log('🧪 [Test] ✅ SUCESSO se:');
      console.log('🧪 [Test]    - Modal aparece apenas para humanos');
      console.log('🧪 [Test]    - Ícones e nomes de lanes estão corretos');
      console.log('🧪 [Test]    - Não há erros no console');
      console.log('🧪 [Test] ');
      console.log('🧪 [Test] ❌ FALHA se:');
      console.log('🧪 [Test]    - Modal aparece para bots');
      console.log('🧪 [Test]    - Ícones aparecem como ❓');
      console.log('🧪 [Test]    - Nomes aparecem em maiúsculas');
      
      // Não encerrar o processo automaticamente para permitir testes manuais
      console.log('🧪 [Test] ');
      console.log('🧪 [Test] 🔄 Processo mantido em execução para testes manuais...');
      console.log('🧪 [Test] 🔄 Pressione Ctrl+C para encerrar quando terminar os testes.');
      
    }, 60000); // 1 minuto para testes
    
  }, 5000); // 5 segundos para inicializar
}

function verifyCodeChanges() {
  console.log('🧪 [Test] ============================================');
  console.log('🧪 [Test] VERIFICANDO ALTERAÇÕES NO CÓDIGO');
  console.log('🧪 [Test] ============================================');
  
  const fs = require('fs');
  
  // Verificar se a correção do app.ts foi aplicada
  const appPath = path.join(workspaceRoot, 'src', 'frontend', 'src', 'app', 'app.ts');
  
  if (fs.existsSync(appPath)) {
    const appContent = fs.readFileSync(appPath, 'utf8');
    
    // Verificar se contém a correção para não exibir modal para bots
    if (appContent.includes('if (this.isCurrentPlayerBot())')) {
      console.log('✅ [Test] Correção aplicada - modal só para humanos');
    } else {
      console.log('❌ [Test] Correção não encontrada - modal pode aparecer para bots');
    }
    
    // Verificar se método isCurrentPlayerBot existe
    if (appContent.includes('isCurrentPlayerBot(): boolean')) {
      console.log('✅ [Test] Método isCurrentPlayerBot encontrado');
    } else {
      console.log('❌ [Test] Método isCurrentPlayerBot não encontrado');
    }
  } else {
    console.log('❌ [Test] Arquivo app.ts não encontrado');
  }
  
  // Verificar se o mapeamento de lanes está correto
  const matchFoundPath = path.join(workspaceRoot, 'src', 'frontend', 'src', 'app', 'components', 'match-found', 'match-found.ts');
  
  if (fs.existsSync(matchFoundPath)) {
    const matchFoundContent = fs.readFileSync(matchFoundPath, 'utf8');
    
    // Verificar se contém mapeamento de lanes em maiúsculas
    if (matchFoundContent.includes("'TOP': '⚔️'") && matchFoundContent.includes("'ADC': '🏹'") && matchFoundContent.includes("'SUPPORT': '🛡️'")) {
      console.log('✅ [Test] Mapeamento de ícones de lanes em maiúsculas encontrado');
    } else {
      console.log('❌ [Test] Mapeamento de ícones de lanes em maiúsculas não encontrado');
    }
    
    // Verificar se contém mapeamento de nomes em maiúsculas
    if (matchFoundContent.includes("'TOP': 'Topo'") && matchFoundContent.includes("'ADC': 'Atirador'") && matchFoundContent.includes("'SUPPORT': 'Suporte'")) {
      console.log('✅ [Test] Mapeamento de nomes de lanes em maiúsculas encontrado');
    } else {
      console.log('❌ [Test] Mapeamento de nomes de lanes em maiúsculas não encontrado');
    }
    
    // Verificar se contém logs de debug
    if (matchFoundContent.includes('getLaneIcon DEBUG') && matchFoundContent.includes('getLaneName DEBUG')) {
      console.log('✅ [Test] Logs de debug encontrados');
    } else {
      console.log('❌ [Test] Logs de debug não encontrados');
    }
  } else {
    console.log('❌ [Test] Arquivo match-found.ts não encontrado');
  }
  
  console.log('🧪 [Test] ============================================');
}
