const axios = require('axios');
const BASE_URL = 'http://localhost:3000/api';

async function testMatchmakingInterval() {
  try {
    console.log('🔍 [Test] Testando intervalo de matchmaking...');
    
    // 1. Limpar fila
    console.log('\n1️⃣ Limpando fila...');
    try {
      await axios.post(`${BASE_URL}/queue/clear`);
      console.log('   ✅ Fila limpa');
    } catch (error) {
      console.log('   ⚠️ Erro ao limpar fila');
    }
    
    // 2. Adicionar 10 bots rapidamente
    console.log('\n2️⃣ Adicionando 10 bots...');
    const botPromises = [];
    for (let i = 1; i <= 10; i++) {
      const promise = axios.post(`${BASE_URL}/queue/join`, {
        player: {
          summonerName: `TestBot${i}`,
          gameName: `TestBot${i}`,
          tagLine: 'TEST',
          region: 'br1',
          customLp: 1200
        },
        preferences: {
          primaryLane: 'fill',
          secondaryLane: 'fill'
        }
      });
      botPromises.push(promise);
    }
    
    await Promise.allSettled(botPromises);
    console.log('   ✅ Bots adicionados');
    
    // 3. Verificar fila imediatamente
    console.log('\n3️⃣ Verificando fila imediatamente...');
    const queueStatus = await axios.get(`${BASE_URL}/queue/status`);
    console.log('   📊 Jogadores na fila:', queueStatus.data.playersInQueue);
    
    // 4. Aguardar 10 segundos (2 ciclos do matchmaking)
    console.log('\n4️⃣ Aguardando 10 segundos para matchmaking automático...');
    for (let i = 1; i <= 10; i++) {
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      const currentQueue = await axios.get(`${BASE_URL}/queue/status`);
      const matches = await axios.get(`${BASE_URL}/matches/recent`);
      const pendingMatches = matches.data.filter(m => m.status === 'pending');
      
      console.log(`   [${i}s] Fila: ${currentQueue.data.playersInQueue}, Partidas: ${pendingMatches.length}`);
      
      if (pendingMatches.length > 0) {
        console.log('   🎉 SUCESSO: Partida criada!');
        const match = pendingMatches[0];
        console.log(`   📋 Partida: ${match.id} - ${match.title}`);
        
        // Verificar se os bots estão na partida
        try {
          const team1 = typeof match.team1_players === 'string' ? JSON.parse(match.team1_players) : match.team1_players;
          const team2 = typeof match.team2_players === 'string' ? JSON.parse(match.team2_players) : match.team2_players;
          const allPlayers = [...team1, ...team2];
          const testBotCount = allPlayers.filter(p => p.toLowerCase().includes('testbot')).length;
          
          console.log(`   🤖 TestBots na partida: ${testBotCount}/${allPlayers.length}`);
          
          if (testBotCount > 0) {
            console.log('   ✅ CONFIRMADO: Matchmaking funcionou!');
            
            // Aguardar aceitação automática
            console.log('\n5️⃣ Aguardando aceitação automática...');
            for (let j = 1; j <= 30; j++) {
              await new Promise(resolve => setTimeout(resolve, 1000));
              
              const updatedMatches = await axios.get(`${BASE_URL}/matches/recent`);
              const currentMatch = updatedMatches.data.find(m => m.id === match.id);
              
              if (currentMatch) {
                console.log(`   [${j}s] Status: ${currentMatch.status}`);
                
                if (currentMatch.status === 'accepted') {
                  console.log('   ✅ SUCESSO: Partida aceita pelos bots!');
                  return;
                } else if (currentMatch.status === 'cancelled') {
                  console.log('   ❌ FALHA: Partida foi cancelada');
                  return;
                }
              }
            }
            
            console.log('   ⏰ Timeout na aceitação');
          }
        } catch (error) {
          console.log(`   ❌ Erro ao analisar jogadores: ${error.message}`);
        }
        
        return;
      }
    }
    
    console.log('   ❌ Nenhuma partida criada após 10 segundos');
    
    // 5. Forçar matchmaking manualmente
    console.log('\n5️⃣ Tentando forçar matchmaking...');
    try {
      const forceResult = await axios.post(`${BASE_URL}/matchmaking/process-complete`);
      console.log('   📊 Resultado:', forceResult.data);
    } catch (error) {
      console.log('   ❌ Erro ao forçar matchmaking:', error.response?.data?.message || error.message);
    }
    
    console.log('\n✅ [Test] Teste concluído!');
    
  } catch (error) {
    console.error('❌ [Test] Erro:', error.message);
    if (error.response) {
      console.error('Response data:', error.response.data);
    }
  }
}

testMatchmakingInterval();
