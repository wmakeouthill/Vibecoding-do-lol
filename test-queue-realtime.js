const WebSocket = require('ws');

// Configuração
const WS_URL = 'ws://localhost:3000';
const TEST_PLAYER = {
  summonerName: 'TestPlayer#BR1',
  summonerId: 'test123',
  puuid: 'test-puuid-123',
  region: 'br1',
  gameName: 'TestPlayer',
  tagLine: 'BR1'
};

console.log('🧪 Teste de Fila em Tempo Real');
console.log('==============================');

// Função para criar conexão WebSocket
function createWebSocketConnection(name) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(WS_URL);
    
    ws.on('open', () => {
      console.log(`✅ [${name}] WebSocket conectado`);
      resolve(ws);
    });
    
    ws.on('message', (data) => {
      try {
        const message = JSON.parse(data);
        console.log(`📥 [${name}] Mensagem recebida:`, message.type);
        
        if (message.type === 'queue_update') {
          console.log(`🎯 [${name}] Fila atualizada:`, {
            playersInQueue: message.data.playersInQueue,
            playersList: message.data.playersInQueueList?.map(p => p.summonerName),
            timestamp: new Date(message.timestamp).toLocaleTimeString()
          });
        }
      } catch (error) {
        console.error(`❌ [${name}] Erro ao processar mensagem:`, error);
      }
    });
    
    ws.on('error', (error) => {
      console.error(`❌ [${name}] Erro WebSocket:`, error);
      reject(error);
    });
    
    ws.on('close', () => {
      console.log(`🔌 [${name}] WebSocket desconectado`);
    });
  });
}

// Função para entrar na fila
async function joinQueue(ws, playerName) {
  return new Promise((resolve) => {
    const message = {
      type: 'join_queue',
      data: {
        player: {
          ...TEST_PLAYER,
          summonerName: playerName
        },
        preferences: {
          primaryLane: 'mid',
          secondaryLane: 'top'
        }
      }
    };
    
    console.log(`🎯 [${playerName}] Entrando na fila...`);
    ws.send(JSON.stringify(message));
    
    // Aguardar confirmação
    setTimeout(() => {
      resolve();
    }, 1000);
  });
}

// Função para sair da fila
async function leaveQueue(ws, playerName) {
  return new Promise((resolve) => {
    const message = {
      type: 'leave_queue'
    };
    
    console.log(`👋 [${playerName}] Saindo da fila...`);
    ws.send(JSON.stringify(message));
    
    // Aguardar confirmação
    setTimeout(() => {
      resolve();
    }, 1000);
  });
}

// Função para solicitar status da fila
async function getQueueStatus(ws, playerName) {
  const message = {
    type: 'get_queue_status'
  };
  
  console.log(`🔍 [${playerName}] Solicitando status da fila...`);
  ws.send(JSON.stringify(message));
}

// Teste principal
async function runTest() {
  try {
    console.log('🚀 Iniciando teste...');
    
    // Criar múltiplas conexões para simular diferentes jogadores
    const ws1 = await createWebSocketConnection('Player1');
    const ws2 = await createWebSocketConnection('Player2');
    const ws3 = await createWebSocketConnection('Player3');
    
    // Aguardar um pouco para estabilizar
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Teste 1: Entrar na fila
    console.log('\n📋 Teste 1: Entrando na fila');
    await joinQueue(ws1, 'Player1#BR1');
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    await joinQueue(ws2, 'Player2#BR1');
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    await joinQueue(ws3, 'Player3#BR1');
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Teste 2: Verificar se todos receberam atualizações
    console.log('\n📋 Teste 2: Verificando atualizações em tempo real');
    getQueueStatus(ws1, 'Player1');
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Teste 3: Sair da fila
    console.log('\n📋 Teste 3: Saindo da fila');
    await leaveQueue(ws2, 'Player2');
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Teste 4: Verificar se a saída foi propagada
    console.log('\n📋 Teste 4: Verificando propagação da saída');
    getQueueStatus(ws1, 'Player1');
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Teste 5: Adicionar mais jogadores
    console.log('\n📋 Teste 5: Adicionando mais jogadores');
    const ws4 = await createWebSocketConnection('Player4');
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    await joinQueue(ws4, 'Player4#BR1');
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Teste 6: Verificar estado final
    console.log('\n📋 Teste 6: Estado final da fila');
    getQueueStatus(ws1, 'Player1');
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Limpeza
    console.log('\n🧹 Limpando conexões...');
    ws1.close();
    ws2.close();
    ws3.close();
    ws4.close();
    
    console.log('\n✅ Teste concluído!');
    console.log('\n📊 Resultados esperados:');
    console.log('- Todos os clientes devem receber atualizações em tempo real');
    console.log('- As posições na fila devem estar corretas');
    console.log('- O banco de dados deve estar sincronizado');
    console.log('- Não deve haver delays perceptíveis');
    
  } catch (error) {
    console.error('❌ Erro no teste:', error);
  }
}

// Executar teste
runTest(); 