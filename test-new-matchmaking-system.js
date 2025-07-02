const axios = require('axios');

const BASE_URL = 'http://localhost:3000/api';

async function testNewMatchmakingSystem() {
  console.log('🧪 Testando novo sistema de matchmaking com status de aceitação...\n');

  try {
    // 1. Adicionar bots na fila para ter 10 jogadores
    console.log('1️⃣ Adicionando bots na fila...');
    for (let i = 1; i <= 10; i++) {
      try {
        await axios.post(`${BASE_URL}/queue/add-bot`);
        console.log(`   ✅ Bot ${i} adicionado`);
      } catch (error) {
        console.log(`   ⚠️ Bot ${i} já existe ou erro:`, error.response?.data?.message || error.message);
      }
    }

    // 2. Verificar status da fila
    console.log('\n2️⃣ Verificando status da fila...');
    const queueStatus = await axios.get(`${BASE_URL}/queue/status`);
    console.log(`   📊 Jogadores na fila: ${queueStatus.data.playersInQueue}`);

    if (queueStatus.data.playersInQueue >= 10) {
      // 3. Processar matchmaking completo
      console.log('\n3️⃣ Processando matchmaking completo...');
      const matchmakingResult = await axios.post(`${BASE_URL}/matchmaking/process-complete`);
      console.log('   ✅ Matchmaking processado:', matchmakingResult.data.message);

      // 4. Verificar status de aceitação
      console.log('\n4️⃣ Verificando status de aceitação...');
      const acceptanceStatus = await axios.get(`${BASE_URL}/matchmaking/check-acceptance`);
      console.log('   📊 Status de aceitação:', acceptanceStatus.data);

      // 5. Simular aceitação de alguns jogadores
      console.log('\n5️⃣ Simulando aceitação de jogadores...');
      const queuePlayers = await axios.get(`${BASE_URL}/queue/status`);
      const players = queuePlayers.data.playersInQueueList || [];
      
      // Aceitar os primeiros 5 jogadores
      for (let i = 0; i < Math.min(5, players.length); i++) {
        const player = players[i];
        try {
          await axios.post(`${BASE_URL}/match/accept`, {
            matchId: 1,
            summonerName: player.summonerName
          });
          console.log(`   ✅ Jogador ${player.summonerName} aceitou`);
        } catch (error) {
          console.log(`   ❌ Erro ao aceitar ${player.summonerName}:`, error.response?.data?.message || error.message);
        }
      }

      // 6. Verificar status novamente
      console.log('\n6️⃣ Verificando status após aceitações...');
      const newAcceptanceStatus = await axios.get(`${BASE_URL}/matchmaking/check-acceptance`);
      console.log('   📊 Novo status de aceitação:', newAcceptanceStatus.data);

      // 7. Simular recusa de um jogador
      console.log('\n7️⃣ Simulando recusa de um jogador...');
      if (players.length > 5) {
        const playerToDecline = players[5];
        try {
          await axios.post(`${BASE_URL}/match/decline`, {
            matchId: 1,
            summonerName: playerToDecline.summonerName
          });
          console.log(`   ❌ Jogador ${playerToDecline.summonerName} recusou`);
        } catch (error) {
          console.log(`   ❌ Erro ao recusar ${playerToDecline.summonerName}:`, error.response?.data?.message || error.message);
        }
      }

      // 8. Verificar status final
      console.log('\n8️⃣ Verificando status final...');
      const finalQueueStatus = await axios.get(`${BASE_URL}/queue/status`);
      console.log(`   📊 Jogadores restantes na fila: ${finalQueueStatus.data.playersInQueue}`);

    } else {
      console.log('   ⚠️ Não há jogadores suficientes para testar matchmaking');
    }

  } catch (error) {
    console.error('❌ Erro no teste:', error.response?.data || error.message);
  }
}

// Executar teste
testNewMatchmakingSystem().then(() => {
  console.log('\n✅ Teste concluído!');
}).catch(error => {
  console.error('❌ Erro fatal no teste:', error);
}); 