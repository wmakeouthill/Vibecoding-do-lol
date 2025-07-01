#!/usr/bin/env node

/**
 * Teste do Sistema de Broadcast em Tempo Real do Discord
 * 
 * Este script testa se o DiscordService está enviando atualizações em tempo real
 * quando usuários entram/saem do canal Discord.
 */

const WebSocket = require('ws');

console.log('🧪 [TEST] Iniciando teste do sistema de broadcast em tempo real do Discord...');

// Configuração do teste
const WS_URL = 'ws://localhost:3000/ws';
const TEST_DURATION = 30000; // 30 segundos
let messageCount = 0;
let criticalMessageCount = 0;
let lastMessageTime = 0;

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
    console.log(`   - Broadcasts críticos: ${criticalMessageCount}`);
    console.log(`   - Última mensagem há: ${Date.now() - lastMessageTime}ms`);
    
    if (criticalMessageCount > 0) {
      console.log('✅ [TEST] Sistema de broadcast crítico funcionando!');
    } else {
      console.log('⚠️ [TEST] Nenhum broadcast crítico detectado');
    }
    
    ws.close();
    process.exit(0);
  }, TEST_DURATION);
});

ws.on('message', (data) => {
  try {
    const message = JSON.parse(data.toString());
    messageCount++;
    lastMessageTime = Date.now();
    
    console.log(`📥 [TEST] Mensagem #${messageCount}:`, {
      type: message.type,
      timestamp: message.timestamp,
      critical: message.critical || false,
      usersCount: message.users?.length || 0
    });
    
    if (message.critical) {
      criticalMessageCount++;
      console.log(`🚨 [TEST] BROADCAST CRÍTICO DETECTADO!`);
    }
    
    // Se receber usuários online, logar detalhes
    if (message.type === 'discord_users_online' && message.users) {
      console.log(`👥 [TEST] Usuários no canal:`, message.users.map(u => ({
        username: u.username,
        linkedNickname: u.linkedNickname ? `${u.linkedNickname.gameName}#${u.linkedNickname.tagLine}` : 'Não vinculado'
      })));
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
console.log('3. Entre/saia do canal Discord para testar broadcasts em tempo real');
console.log('4. O teste durará 30 segundos e mostrará os resultados');
console.log('\n⏱️ [TEST] Aguardando mensagens...\n'); 