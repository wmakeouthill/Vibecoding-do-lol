const WebSocket = require('ws');

console.log('🧪 Testando conexão WebSocket como frontend...');

const ws = new WebSocket('ws://localhost:3000/ws');

let messageCount = 0;

ws.on('open', () => {
  console.log('✅ Frontend conectado ao WebSocket!');
  
  // Simular comportamento do frontend
  const messages = [
    { type: 'get_discord_status' },
    { type: 'get_discord_users' },
    { type: 'ping' }
  ];
  
  messages.forEach((msg, index) => {
    setTimeout(() => {
      ws.send(JSON.stringify(msg));
      console.log(`📤 [${index + 1}] Enviado:`, msg.type);
    }, index * 1000);
  });
});

ws.on('message', (data) => {
  try {
    const message = JSON.parse(data.toString());
    messageCount++;
    console.log(`📥 [${messageCount}] Recebido:`, message.type);
    
    if (message.type === 'discord_status') {
      console.log('🎮 Status do Discord:', {
        isConnected: message.isConnected,
        botUsername: message.botUsername,
        queueSize: message.queueSize,
        inChannel: message.inChannel
      });
    } else if (message.type === 'discord_users_online') {
      console.log(`👥 Usuários Discord: ${message.users?.length || 0}`);
      if (message.users && message.users.length > 0) {
        message.users.forEach(user => {
          console.log(`  - ${user.username} (${user.hasAppOpen ? 'App Aberto' : 'Apenas Discord'})`);
        });
      }
    } else if (message.type === 'pong') {
      console.log('🏓 Pong recebido - conexão ativa');
    }
    
    // Fechar após receber todas as respostas
    if (messageCount >= 3) {
      setTimeout(() => {
        console.log('🔌 Fechando conexão após receber todas as respostas');
        ws.close();
      }, 1000);
    }
    
  } catch (error) {
    console.error('❌ Erro ao processar mensagem:', error);
  }
});

ws.on('close', () => {
  console.log('🔌 Frontend desconectado do WebSocket');
});

ws.on('error', (error) => {
  console.error('❌ Erro no WebSocket:', error);
});

// Timeout de 10 segundos
setTimeout(() => {
  if (ws.readyState === WebSocket.OPEN) {
    ws.close();
  }
  console.log('⏰ Timeout - teste concluído');
}, 10000); 