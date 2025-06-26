const WebSocket = require('ws');

async function testDiscordCommunication() {
  console.log('🔍 Testando comunicação WebSocket com Discord...');
  
  const ws = new WebSocket('ws://localhost:3000/ws');
  
  ws.on('open', () => {
    console.log('✅ WebSocket conectado!');
    
    // Testar solicitação de status do Discord
    const statusMessage = {
      type: 'get_discord_status'
    };
    ws.send(JSON.stringify(statusMessage));
    console.log('📤 Enviado: get_discord_status');
    
    // Testar solicitação de usuários no canal
    const usersMessage = {
      type: 'get_discord_users_online'
    };
    ws.send(JSON.stringify(usersMessage));
    console.log('📤 Enviado: get_discord_users_online');
    
    // Testar solicitação de vinculações
    const linksMessage = {
      type: 'get_discord_links'
    };
    ws.send(JSON.stringify(linksMessage));
    console.log('📤 Enviado: get_discord_links');
  });
  
  ws.on('message', (data) => {
    try {
      const message = JSON.parse(data.toString());
      console.log('📥 Recebido:', message.type, message);
      
      // Analisar resposta específica
      switch (message.type) {
        case 'discord_status':
          console.log('🎮 Status Discord:', {
            isConnected: message.isConnected,
            botUsername: message.botUsername,
            queueSize: message.queueSize,
            activeMatches: message.activeMatches,
            inChannel: message.inChannel
          });
          break;
          
        case 'discord_users_online':
          console.log(`👥 Usuários no canal: ${message.users?.length || 0}`);
          if (message.users && message.users.length > 0) {
            message.users.forEach(user => {
              console.log(`  - ${user.username} (${user.hasAppOpen ? 'App Aberto' : 'Apenas Discord'})`);
            });
          }
          break;
          
        case 'discord_links_update':
          console.log(`🔗 Vinculações: ${message.links?.length || 0}`);
          break;
      }
    } catch (error) {
      console.error('❌ Erro ao processar mensagem:', error);
    }
  });
  
  ws.on('error', (error) => {
    console.error('❌ Erro na conexão WebSocket:', error);
  });
  
  ws.on('close', () => {
    console.log('🔌 WebSocket desconectado');
  });
  
  // Fechar após 10 segundos
  setTimeout(() => {
    console.log('⏰ Teste concluído, fechando conexão...');
    ws.close();
    process.exit(0);
  }, 10000);
}

testDiscordCommunication().catch(console.error); 