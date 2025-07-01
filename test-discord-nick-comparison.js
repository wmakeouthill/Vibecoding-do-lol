const WebSocket = require('ws');

// Configuração
const WS_URL = 'ws://localhost:3000/ws';
const TEST_LCU_DATA = {
  gameName: 'popcorn seller',
  tagLine: 'coup'
};

console.log('🧪 [Test] Iniciando teste de comparação de nicks Discord vs LoL');
console.log('🧪 [Test] Dados do LCU:', TEST_LCU_DATA);

let ws;
let testResults = {
  connected: false,
  discordUsers: [],
  currentUser: null,
  nickMatch: false,
  errors: []
};

function connectWebSocket() {
  console.log('🔗 [Test] Conectando ao WebSocket...');
  
  ws = new WebSocket(WS_URL);
  
  ws.on('open', () => {
    console.log('✅ [Test] WebSocket conectado');
    testResults.connected = true;
    
    // Solicitar status do Discord
    console.log('🔍 [Test] Solicitando status do Discord...');
    ws.send(JSON.stringify({ type: 'get_discord_status' }));
  });
  
  ws.on('message', (data) => {
    try {
      const message = JSON.parse(data.toString());
      console.log('📥 [Test] Mensagem recebida:', message.type);
      
      if (message.type === 'discord_status') {
        handleDiscordStatus(message);
      } else if (message.type === 'current_user_identified') {
        handleCurrentUserIdentified(message);
      }
    } catch (error) {
      console.error('❌ [Test] Erro ao processar mensagem:', error);
      testResults.errors.push(error.message);
    }
  });
  
  ws.on('close', () => {
    console.log('🔌 [Test] WebSocket desconectado');
    testResults.connected = false;
  });
  
  ws.on('error', (error) => {
    console.error('❌ [Test] Erro no WebSocket:', error);
    testResults.errors.push(error.message);
  });
}

function handleDiscordStatus(message) {
  console.log('📊 [Test] Status do Discord recebido');
  testResults.discordUsers = message.users || [];
  
  console.log('👥 [Test] Usuários Discord online:', testResults.discordUsers.length);
  testResults.discordUsers.forEach((user, index) => {
    console.log(`  ${index + 1}. ${user.displayName || user.username} (${user.id})`);
    if (user.linkedNickname) {
      console.log(`     Vinculado: ${user.linkedNickname.gameName}#${user.linkedNickname.tagLine}`);
    } else {
      console.log(`     Não vinculado`);
    }
  });
  
  // Enviar dados do LCU para identificação
  console.log('🎮 [Test] Enviando dados do LCU para identificação...');
  ws.send(JSON.stringify({
    type: 'update_lcu_data',
    lcuData: TEST_LCU_DATA
  }));
}

function handleCurrentUserIdentified(message) {
  console.log('👤 [Test] Usuário atual identificado:', message.user);
  testResults.currentUser = message.user;
  
  // Fazer comparação manual
  performNickComparison();
}

function performNickComparison() {
  console.log('🔍 [Test] === COMPARAÇÃO DE NICKS ===');
  
  if (!testResults.currentUser) {
    console.log('❌ [Test] Usuário atual não identificado');
    return;
  }
  
  // Buscar usuário na lista de usuários online
  const currentUser = testResults.discordUsers.find(u => u.id === testResults.currentUser.id);
  
  if (!currentUser) {
    console.log('❌ [Test] Usuário não encontrado na lista de usuários online');
    return;
  }
  
  if (!currentUser.linkedNickname) {
    console.log('❌ [Test] Usuário não tem nickname vinculado');
    return;
  }
  
  const linkedGameName = currentUser.linkedNickname.gameName?.trim();
  const linkedTagLine = currentUser.linkedNickname.tagLine?.trim();
  const currentGameName = TEST_LCU_DATA.gameName?.trim();
  const currentTagLine = TEST_LCU_DATA.tagLine?.trim();
  
  console.log('🔍 [Test] Comparando:');
  console.log(`  Discord: "${linkedGameName}#${linkedTagLine}"`);
  console.log(`  LoL:     "${currentGameName}#${currentTagLine}"`);
  
  // Comparação case-insensitive
  const gameNameMatch = linkedGameName?.toLowerCase() === currentGameName?.toLowerCase();
  const tagLineMatch = linkedTagLine?.toLowerCase() === currentTagLine?.toLowerCase();
  const fullMatch = gameNameMatch && tagLineMatch;
  
  console.log('🔍 [Test] Resultados:');
  console.log(`  gameName: ${gameNameMatch ? '✅' : '❌'}`);
  console.log(`  tagLine:  ${tagLineMatch ? '✅' : '❌'}`);
  console.log(`  Total:    ${fullMatch ? '✅' : '❌'}`);
  
  testResults.nickMatch = fullMatch;
  
  // Finalizar teste
  finishTest();
}

function finishTest() {
  console.log('\n📋 [Test] === RESULTADO DO TESTE ===');
  console.log(`Conexão WebSocket: ${testResults.connected ? '✅' : '❌'}`);
  console.log(`Usuários Discord: ${testResults.discordUsers.length}`);
  console.log(`Usuário identificado: ${testResults.currentUser ? '✅' : '❌'}`);
  console.log(`Nicks coincidem: ${testResults.nickMatch ? '✅' : '❌'}`);
  
  if (testResults.errors.length > 0) {
    console.log('❌ [Test] Erros encontrados:');
    testResults.errors.forEach(error => console.log(`  - ${error}`));
  }
  
  if (testResults.nickMatch) {
    console.log('🎉 [Test] TESTE APROVADO - Nicks coincidem!');
  } else {
    console.log('⚠️ [Test] TESTE REPROVADO - Nicks não coincidem');
  }
  
  // Fechar conexão
  if (ws) {
    ws.close();
  }
  
  process.exit(testResults.nickMatch ? 0 : 1);
}

// Iniciar teste
connectWebSocket();

// Timeout de segurança
setTimeout(() => {
  console.log('⏰ [Test] Timeout - finalizando teste');
  finishTest();
}, 10000); 