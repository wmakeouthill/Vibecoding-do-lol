#!/usr/bin/env node

/**
 * Teste da Identificação do Usuário Discord
 * 
 * Este script testa se o sistema está identificando corretamente o usuário atual
 * baseado nos dados do LCU e vinculações Discord.
 */

const WebSocket = require('ws');

console.log('🧪 [TEST] Iniciando teste da identificação do usuário Discord...');

// Configuração do teste
const WS_URL = 'ws://localhost:3000/ws';
const TEST_DURATION = 15000; // 15 segundos
let messageCount = 0;
let usersReceived = false;
let statusReceived = false;

// Conectar ao WebSocket
console.log(`🔗 [TEST] Conectando ao WebSocket: ${WS_URL}`);
const ws = new WebSocket(WS_URL);

ws.on('open', () => {
  console.log('✅ [TEST] WebSocket conectado com sucesso');
  
  // Solicitar status inicial do Discord
  console.log('🔍 [TEST] Solicitando status inicial do Discord...');
  ws.send(JSON.stringify({ type: 'get_discord_status' }));
  ws.send(JSON.stringify({ type: 'get_discord_users_online' }));
  
  // Configurar timer para finalizar o teste
  setTimeout(() => {
    console.log('\n📊 [TEST] Resultados do teste:');
    console.log(`   - Total de mensagens recebidas: ${messageCount}`);
    console.log(`   - Status do Discord recebido: ${statusReceived}`);
    console.log(`   - Usuários Discord recebidos: ${usersReceived}`);
    
    if (statusReceived && usersReceived) {
      console.log('✅ [TEST] Sistema de identificação funcionando!');
    } else {
      console.log('⚠️ [TEST] Alguns dados não foram recebidos');
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
      isConnected: message.isConnected,
      inChannel: message.inChannel
    });
    
    if (message.type === 'discord_status') {
      statusReceived = true;
      console.log(`🎮 [TEST] Status do Discord:`, {
        isConnected: message.isConnected,
        inChannel: message.inChannel,
        botUsername: message.botUsername,
        queueSize: message.queueSize
      });
    }
    
    if (message.type === 'discord_users_online') {
      usersReceived = true;
      console.log(`👥 [TEST] Usuários Discord online:`, message.users?.map(u => ({
        username: u.username,
        displayName: u.displayName,
        linkedNickname: u.linkedNickname ? `${u.linkedNickname.gameName}#${u.linkedNickname.tagLine}` : 'Não vinculado'
      })) || []);
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
console.log('4. O teste verificará se os dados estão sendo recebidos corretamente');
console.log('\n⏱️ [TEST] Aguardando mensagens...\n'); 