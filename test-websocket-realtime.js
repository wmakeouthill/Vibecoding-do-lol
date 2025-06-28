const WebSocket = require('ws');

console.log('🧪 Testando WebSocket em tempo real...');

const ws = new WebSocket('ws://localhost:3000/ws');

let messageCount = 0;
let lastMessageTime = 0;

ws.on('open', () => {
  console.log('✅ WebSocket conectado');
  
  // Solicitar status da fila
  ws.send(JSON.stringify({ type: 'get_queue_status' }));
  
  // Simular entrada na fila
  setTimeout(() => {
    console.log('🎮 Simulando entrada na fila...');
    ws.send(JSON.stringify({
      type: 'join_queue',
      data: {
        player: {
          summonerName: 'TestPlayer#123',
          gameName: 'TestPlayer',
          tagLine: '123',
          region: 'br1'
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
    messageCount++;
    const now = Date.now();
    const timeSinceLast = lastMessageTime > 0 ? now - lastMessageTime : 0;
    lastMessageTime = now;
    
    console.log(`📥 [${messageCount}] Mensagem recebida (${timeSinceLast}ms desde última):`, {
      type: message.type,
      timestamp: message.timestamp,
      data: message.data ? {
        playersInQueue: message.data.playersInQueue,
        playersList: message.data.playersInQueueList?.map(p => p.summonerName)
      } : null
    });
    
    // Verificar se é uma atualização da fila
    if (message.type === 'queue_update') {
      console.log('🔄 Atualização da fila em tempo real detectada!');
      console.log('   - Jogadores na fila:', message.data.playersInQueue);
      console.log('   - Lista de jogadores:', message.data.playersInQueueList?.map(p => p.summonerName));
    }
    
  } catch (error) {
    console.error('❌ Erro ao processar mensagem:', error);
  }
});

ws.on('close', () => {
  console.log('🔌 WebSocket desconectado');
});

ws.on('error', (error) => {
  console.error('❌ Erro no WebSocket:', error);
});

// Manter conexão ativa por 30 segundos
setTimeout(() => {
  console.log('⏰ Teste concluído, desconectando...');
  ws.close();
  process.exit(0);
}, 30000); 