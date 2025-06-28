const WebSocket = require('ws');

console.log('🧪 Testando atualizações da fila via WebSocket...');

const ws = new WebSocket('ws://localhost:3000/ws');

let receivedQueueUpdates = 0;

ws.on('open', () => {
  console.log('✅ WebSocket conectado');
  
  // Solicitar status da fila
  ws.send(JSON.stringify({ type: 'get_queue_status' }));
  
  // Simular entrada na fila Discord
  setTimeout(() => {
    console.log('🎮 Simulando entrada na fila Discord...');
    ws.send(JSON.stringify({
      type: 'join_discord_queue',
      data: {
        discordId: 'test123',
        gameName: 'TestPlayer',
        tagLine: '123',
        lcuData: {
          gameName: 'TestPlayer',
          tagLine: '123'
        },
        preferences: {
          primaryLane: 'mid',
          secondaryLane: 'top'
        }
      }
    }));
  }, 1000);
});

ws.on('message', (data) => {
  try {
    const message = JSON.parse(data.toString());
    
    console.log(`📥 Mensagem recebida: ${message.type}`, {
      timestamp: new Date().toISOString(),
      data: message.data ? {
        playersInQueue: message.data.playersInQueue,
        playersList: message.data.playersInQueueList?.map(p => p.summonerName)
      } : null
    });
    
    // Verificar se é uma atualização da fila
    if (message.type === 'queue_update') {
      receivedQueueUpdates++;
      console.log(`🔄 Atualização da fila #${receivedQueueUpdates} recebida!`);
      console.log('   - Jogadores na fila:', message.data.playersInQueue);
      console.log('   - Lista de jogadores:', message.data.playersInQueueList?.map(p => p.summonerName));
    }
    
    // Verificar se é confirmação de entrada na fila
    if (message.type === 'queue_joined') {
      console.log('✅ Confirmação de entrada na fila recebida!');
    }
    
  } catch (error) {
    console.error('❌ Erro ao processar mensagem:', error);
  }
});

ws.on('close', () => {
  console.log('🔌 WebSocket desconectado');
  console.log(`📊 Total de atualizações da fila recebidas: ${receivedQueueUpdates}`);
});

ws.on('error', (error) => {
  console.error('❌ Erro no WebSocket:', error);
});

// Manter conexão ativa por 10 segundos
setTimeout(() => {
  console.log('⏰ Teste concluído, desconectando...');
  ws.close();
  process.exit(0);
}, 10000); 