/**
 * Script de teste para verificar o fluxo completo de match found
 * Testa a criação de partida, envio de notificação WebSocket e exibição do modal
 */

const axios = require('axios');
const WebSocket = require('ws');

const BASE_URL = 'http://localhost:3000/api';
const WS_URL = 'ws://localhost:3000/ws';

let wsClient;
let testPlayerId = 'test-player-' + Date.now();

async function testMatchFoundFlow() {
  console.log('🚀 [Test] Iniciando teste do fluxo de match found...');

  try {
    // 1. Conectar ao WebSocket para escutar mensagens
    await connectWebSocket();

    // 2. Criar jogadores de teste na fila
    await createTestPlayers();

    // 3. Forçar criação de partida
    await forceCreateMatch();

    // 4. Aguardar mensagens WebSocket
    await waitForMessages();

  } catch (error) {
    console.error('❌ [Test] Erro no teste:', error);
  } finally {
    if (wsClient) {
      wsClient.close();
    }
  }
}

function connectWebSocket() {
  return new Promise((resolve, reject) => {
    console.log('🔌 [Test] Conectando ao WebSocket:', WS_URL);
    
    wsClient = new WebSocket(WS_URL);
    
    wsClient.on('open', () => {
      console.log('✅ [Test] WebSocket conectado');
      resolve();
    });
    
    wsClient.on('message', (data) => {
      try {
        const message = JSON.parse(data);
        console.log('📨 [Test] Mensagem WebSocket recebida:', {
          type: message.type,
          hasData: !!message.data,
          dataKeys: message.data ? Object.keys(message.data) : []
        });
        
        if (message.type === 'match_found') {
          console.log('🎮 [Test] === MATCH_FOUND RECEBIDO ===');
          console.log('🎮 [Test] Dados completos:', JSON.stringify(message.data, null, 2));
        }
        
        if (message.type === 'match_timer_update') {
          console.log('⏰ [Test] Timer update recebido:', message.data);
        }
      } catch (error) {
        console.error('❌ [Test] Erro ao processar mensagem WebSocket:', error);
      }
    });
    
    wsClient.on('error', (error) => {
      console.error('❌ [Test] Erro no WebSocket:', error);
      reject(error);
    });
    
    wsClient.on('close', () => {
      console.log('🔌 [Test] WebSocket desconectado');
    });
  });
}

async function createTestPlayers() {
  console.log('👥 [Test] Criando jogadores de teste...');
  
  const players = [];
  for (let i = 1; i <= 10; i++) {
    const player = {
      summonerName: `TestPlayer${i}#TEST`,
      displayName: `TestPlayer${i}#TEST`,
      gameName: `TestPlayer${i}`,
      tagLine: 'TEST',
      primaryLane: ['top', 'jungle', 'mid', 'adc', 'support'][i % 5],
      secondaryLane: 'fill',
      mmr: 1200,
      region: 'br1'
    };
    
    try {
      const response = await axios.post(`${BASE_URL}/queue/join`, player);
      console.log(`✅ [Test] Player ${i} adicionado à fila:`, response.status);
      players.push(player);
    } catch (error) {
      console.error(`❌ [Test] Erro ao adicionar player ${i}:`, error.response?.data || error.message);
    }
  }
  
  // Verificar status da fila
  try {
    const statusResponse = await axios.get(`${BASE_URL}/queue/status`);
    console.log('📊 [Test] Status da fila:', {
      playersInQueue: statusResponse.data.playersInQueue,
      totalPlayers: statusResponse.data.playersInQueueList?.length || 0
    });
  } catch (error) {
    console.error('❌ [Test] Erro ao verificar status da fila:', error.message);
  }
  
  return players;
}

async function forceCreateMatch() {
  console.log('🎮 [Test] Forçando criação de partida...');
  
  try {
    const response = await axios.post(`${BASE_URL}/admin/force-match`);
    console.log('✅ [Test] Partida forçada criada:', response.data);
    return response.data;
  } catch (error) {
    console.error('❌ [Test] Erro ao forçar criação de partida:', error.response?.data || error.message);
    throw error;
  }
}

function waitForMessages() {
  return new Promise((resolve) => {
    console.log('⏳ [Test] Aguardando mensagens WebSocket por 30 segundos...');
    
    setTimeout(() => {
      console.log('⌛ [Test] Tempo limite atingido');
      resolve();
    }, 30000);
  });
}

// Executar teste
if (require.main === module) {
  testMatchFoundFlow();
}

module.exports = { testMatchFoundFlow };
