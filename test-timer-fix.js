/**
 * Teste para verificar se o problema do timer negativo foi corrigido
 */
const WebSocket = require('ws');
const axios = require('axios');

// Configuração
const BACKEND_URL = 'http://localhost:8080';
const WEBSOCKET_URL = 'ws://localhost:8080';

// Usuário de teste
const testUser = {
  summonerName: 'TestPlayer1',
  riotIdGameName: 'TestPlayer1',
  riotIdTagline: 'BR1',
  region: 'BR',
  primaryLane: 'ADC',
  secondaryLane: 'MID',
  mmr: 1500
};

async function testTimerFix() {
  console.log('🧪 [Test] Iniciando teste de correção do timer...');
  
  try {
    // 1. Conectar WebSocket
    const ws = new WebSocket(WEBSOCKET_URL);
    
    await new Promise((resolve, reject) => {
      ws.on('open', () => {
        console.log('✅ [Test] WebSocket conectado');
        resolve();
      });
      
      ws.on('error', (error) => {
        console.error('❌ [Test] Erro no WebSocket:', error);
        reject(error);
      });
    });

    // 2. Configurar listener para mensagens
    ws.on('message', (data) => {
      try {
        const message = JSON.parse(data.toString());
        console.log('📨 [Test] Mensagem recebida:', message.type);
        
        if (message.type === 'match_found') {
          console.log('🎮 [Test] Match Found recebido!');
          console.log('⏰ [Test] Timer data:', {
            acceptanceTimer: message.data.acceptanceTimer,
            acceptTimeout: message.data.acceptTimeout,
            acceptanceDeadline: message.data.acceptanceDeadline,
            phase: message.data.phase
          });
          
          // Verificar se os campos de timer estão corretos
          if (message.data.acceptanceTimer && message.data.acceptanceTimer > 0) {
            console.log('✅ [Test] acceptanceTimer está correto:', message.data.acceptanceTimer);
          } else {
            console.error('❌ [Test] acceptanceTimer inválido:', message.data.acceptanceTimer);
          }
          
          if (message.data.acceptTimeout && message.data.acceptTimeout > 0) {
            console.log('✅ [Test] acceptTimeout está correto:', message.data.acceptTimeout);
          } else {
            console.error('❌ [Test] acceptTimeout inválido:', message.data.acceptTimeout);
          }
          
          if (message.data.phase === 'accept') {
            console.log('✅ [Test] Phase está correto:', message.data.phase);
          } else {
            console.error('❌ [Test] Phase incorreto:', message.data.phase);
          }
          
          // Simular aceite da partida
          setTimeout(() => {
            console.log('✅ [Test] Simulando aceite da partida...');
            ws.send(JSON.stringify({
              type: 'accept_match',
              data: {
                matchId: message.data.matchId,
                summonerName: testUser.summonerName
              }
            }));
          }, 2000);
        }
        
        if (message.type === 'match_accepted') {
          console.log('✅ [Test] Match aceito com sucesso!');
        }
        
        if (message.type === 'match_declined') {
          console.log('❌ [Test] Match recusado!');
        }
        
      } catch (error) {
        console.error('❌ [Test] Erro ao processar mensagem:', error);
      }
    });

    // 3. Entrar na fila
    console.log('🎯 [Test] Entrando na fila...');
    const joinResponse = await axios.post(`${BACKEND_URL}/api/queue/join`, testUser);
    console.log('✅ [Test] Entrou na fila:', joinResponse.data);

    // 4. Aguardar um pouco para processar
    await new Promise(resolve => setTimeout(resolve, 5000));

    // 5. Verificar status da fila
    console.log('📊 [Test] Verificando status da fila...');
    const queueResponse = await axios.get(`${BACKEND_URL}/api/queue/status`);
    console.log('📊 [Test] Status da fila:', queueResponse.data);

    // 6. Limpar e fechar
    setTimeout(() => {
      console.log('🧹 [Test] Limpando e fechando...');
      ws.close();
      process.exit(0);
    }, 10000);

  } catch (error) {
    console.error('❌ [Test] Erro no teste:', error);
    process.exit(1);
  }
}

// Executar teste
testTimerFix().catch(console.error);
