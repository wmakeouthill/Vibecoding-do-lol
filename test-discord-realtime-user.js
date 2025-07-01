#!/usr/bin/env node

/**
 * Teste do Sistema de Identificação do Usuário em Tempo Real
 * 
 * Este script testa se o sistema está identificando o usuário atual em tempo real
 * baseado nos dados do LCU enviados via WebSocket.
 */

const WebSocket = require('ws');

console.log('🧪 [TEST] Iniciando teste da identificação do usuário em tempo real...');

// Configuração do teste
const WS_URL = 'ws://localhost:3000/ws';
const TEST_DURATION = 20000; // 20 segundos
let messageCount = 0;
let currentUserReceived = false;
let usersReceived = false;

// Dados de teste do LCU (simular dados reais)
const testLCUData = {
  gameName: 'popcorn seller',
  tagLine: 'coup'
};

// Conectar ao WebSocket
console.log(`🔗 [TEST] Conectando ao WebSocket: ${WS_URL}`);
const ws = new WebSocket(WS_URL);

ws.on('open', () => {
  console.log('✅ [TEST] WebSocket conectado com sucesso');
  
  // Solicitar status inicial do Discord
  console.log('🔍 [TEST] Solicitando status inicial do Discord...');
  ws.send(JSON.stringify({ type: 'get_discord_status' }));
  ws.send(JSON.stringify({ type: 'get_discord_users_online' }));
  
  // Aguardar um pouco e enviar dados do LCU
  setTimeout(() => {
    console.log('🎮 [TEST] Enviando dados do LCU para identificação...');
    ws.send(JSON.stringify({
      type: 'update_lcu_data',
      lcuData: testLCUData
    }));
  }, 2000);
  
  // Configurar timer para finalizar o teste
  setTimeout(() => {
    console.log('\n📊 [TEST] Resultados do teste:');
    console.log(`   - Total de mensagens recebidas: ${messageCount}`);
    console.log(`   - Usuários Discord recebidos: ${usersReceived}`);
    console.log(`   - Usuário atual identificado: ${currentUserReceived}`);
    
    if (currentUserReceived) {
      console.log('✅ [TEST] Sistema de identificação em tempo real funcionando!');
    } else {
      console.log('⚠️ [TEST] Usuário atual não foi identificado');
    }
    
    ws.close();
    process.exit(0);
  }, TEST_DURATION);
});

ws.on('message', (data) => {
  try {
    const message = JSON.parse(data.toString());
    messageCount++;
    
    console.log(`📥 [TEST] Mensagem #${messageCount}:`, {
      type: message.type,
      timestamp: message.timestamp,
      usersCount: message.users?.length || 0,
      hasCurrentUser: !!message.currentUser,
      currentUserDisplayName: message.currentUser?.displayName || 'N/A'
    });
    
    if (message.type === 'discord_users_online') {
      usersReceived = true;
      console.log(`👥 [TEST] Usuários Discord online:`, message.users?.map(u => ({
        username: u.username,
        displayName: u.displayName,
        linkedNickname: u.linkedNickname ? `${u.linkedNickname.gameName}#${u.linkedNickname.tagLine}` : 'Não vinculado'
      })) || []);
      
      // Verificar se inclui usuário atual
      if (message.currentUser) {
        currentUserReceived = true;
        console.log(`👤 [TEST] Usuário atual incluído no broadcast:`, message.currentUser);
      }
    }
    
    if (message.type === 'discord_current_user') {
      currentUserReceived = true;
      console.log(`👤 [TEST] Usuário atual recebido:`, message.currentUser);
    }
    
    if (message.type === 'lcu_data_updated') {
      console.log(`✅ [TEST] Dados do LCU atualizados com sucesso`);
    }
    
  } catch (error) {
    console.error('❌ [TEST] Erro ao processar mensagem:', error);
  }
});

ws.on('close', () => {
  console.log('🔌 [TEST] WebSocket desconectado');
});

ws.on('error', (error) => {
  console.error('❌ [TEST] Erro no WebSocket:', error);
});

// Instruções para o usuário
console.log('\n📋 [TEST] Instruções:');
console.log('1. Certifique-se de que o servidor está rodando na porta 3000');
console.log('2. Certifique-se de que o Discord Bot está conectado');
console.log('3. Certifique-se de que há usuários no canal Discord');
console.log('4. O teste enviará dados do LCU e verificará se o usuário é identificado');
console.log('5. Dados de teste:', testLCUData);
console.log('\n⏱️ [TEST] Aguardando mensagens...\n'); 