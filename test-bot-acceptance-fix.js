const axios = require('axios');

const BASE_URL = 'http://localhost:3000/api';

async function testBotAcceptanceFix() {
  try {
    console.log('🔧 [Test] Testando correção do problema de aceitação de bots...');
    
    // 1. Limpar fila
    console.log('\n1️⃣ Limpando fila...');
    try {
      await axios.post(`${BASE_URL}/queue/clear`);
      console.log('   ✅ Fila limpa');
    } catch (error) {
      console.log('   ⚠️ Erro ao limpar fila (pode não existir endpoint)');
    }
    
    // 2. Adicionar 10 bots
    console.log('\n2️⃣ Adicionando 10 bots...');
    for (let i = 0; i < 10; i++) {
      try {
        await axios.post(`${BASE_URL}/queue/add-bot`);
        console.log(`   ✅ Bot ${i + 1} adicionado`);
      } catch (error) {
        console.log(`   ❌ Erro ao adicionar bot ${i + 1}:`, error.response?.data?.message || error.message);
      }
    }
    
    // 3. Verificar jogadores na fila
    console.log('\n3️⃣ Verificando jogadores na fila...');
    const queueStatus = await axios.get(`${BASE_URL}/queue/status`);
    console.log(`   📊 Jogadores na fila: ${queueStatus.data.playersInQueue}`);
    
    if (queueStatus.data.playersInQueueList && queueStatus.data.playersInQueueList.length > 0) {
      console.log('   📋 Jogadores:');
      queueStatus.data.playersInQueueList.forEach((player, index) => {
        console.log(`     ${index + 1}. ${player.summonerName} (${player.primaryLane})`);
      });
    }
    
    // 4. Aguardar matchmaking
    console.log('\n4️⃣ Aguardando matchmaking automático...');
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    // 5. Verificar se partida foi criada
    console.log('\n5️⃣ Verificando partidas criadas...');
    const matches = await axios.get(`${BASE_URL}/matches/recent`);
    const pendingMatches = matches.data.filter(m => m.status === 'pending');
    console.log(`   🎮 Partidas pendentes: ${pendingMatches.length}`);
    
    if (pendingMatches.length > 0) {
      const match = pendingMatches[0];
      console.log(`   📋 Partida: ${match.id} - ${match.title}`);
      
      // 6. Verificar se jogadores ainda estão na fila
      console.log('\n6️⃣ Verificando se jogadores ainda estão na fila...');
      const queueStatusAfterMatch = await axios.get(`${BASE_URL}/queue/status`);
      console.log(`   📊 Jogadores na fila após match: ${queueStatusAfterMatch.data.playersInQueue}`);
      
      if (queueStatusAfterMatch.data.playersInQueue === 10) {
        console.log('   ✅ CORREÇÃO FUNCIONOU: Jogadores permaneceram na fila!');
        
        // 7. Verificar status de aceitação
        console.log('\n7️⃣ Verificando status de aceitação...');
        let attempts = 0;
        const maxAttempts = 10;
        
        while (attempts < maxAttempts) {
          attempts++;
          const acceptanceStatus = await axios.get(`${BASE_URL}/matchmaking/check-acceptance`);
          console.log(`   [${attempts}] Aceitos: ${acceptanceStatus.data.acceptedCount}/10`);
          
          if (acceptanceStatus.data.acceptedCount === 10) {
            console.log('   🎉 SUCESSO: Todos os bots aceitaram automaticamente!');
            break;
          }
          
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
        
        if (attempts >= maxAttempts) {
          console.log('   ⚠️ TIMEOUT: Nem todos os bots aceitaram automaticamente');
        }
        
      } else {
        console.log('   ❌ PROBLEMA: Jogadores foram removidos da fila prematuramente');
      }
    } else {
      console.log('   ❌ PROBLEMA: Nenhuma partida foi criada');
    }
    
    console.log('\n✅ [Test] Teste de correção concluído!');
    
  } catch (error) {
    console.error('❌ [Test] Erro durante teste:', error.message);
  }
}

testBotAcceptanceFix();
