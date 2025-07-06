const axios = require('axios');
const BASE_URL = 'http://localhost:3000/api';

async function testMatchmakingTrigger() {
  try {
    console.log('🔍 [Test] Testando trigger do matchmaking automático...');
    
    // 1. Limpar fila primeiro
    console.log('\n1️⃣ Limpando fila...');
    try {
      await axios.post(`${BASE_URL}/queue/clear`);
      console.log('   ✅ Fila limpa');
    } catch (error) {
      console.log('   ⚠️ Erro ao limpar fila (pode não existir endpoint)');
    }
    
    // 2. Verificar status inicial
    console.log('\n2️⃣ Verificando status inicial...');
    const initialStatus = await axios.get(`${BASE_URL}/queue/status`);
    console.log('   📊 Jogadores na fila:', initialStatus.data.playersInQueue);
    
    // 3. Adicionar exatamente 10 bots
    console.log('\n3️⃣ Adicionando 10 bots...');
    for (let i = 1; i <= 10; i++) {
      try {
        await axios.post(`${BASE_URL}/queue/join`, {
          player: {
            summonerName: `AutoBot${i}`,
            gameName: `AutoBot${i}`,
            tagLine: 'BOT',
            region: 'br1',
            customLp: 1200
          },
          preferences: {
            primaryLane: 'fill',
            secondaryLane: 'fill'
          }
        });
        console.log(`   ✅ Bot ${i} adicionado`);
      } catch (error) {
        console.log(`   ❌ Erro ao adicionar bot ${i}:`, error.response?.data?.message || error.message);
      }
    }
    
    // 4. Verificar se fila tem 10 jogadores
    console.log('\n4️⃣ Verificando se fila tem 10 jogadores...');
    const queueAfterBots = await axios.get(`${BASE_URL}/queue/status`);
    console.log('   📊 Jogadores na fila:', queueAfterBots.data.playersInQueue);
    
    if (queueAfterBots.data.playersInQueue >= 10) {
      console.log('   ✅ Fila tem 10+ jogadores, aguardando matchmaking automático...');
      
      // 5. Aguardar o matchmaking automático por 30 segundos
      console.log('\n5️⃣ Aguardando matchmaking automático (30 segundos)...');
      for (let i = 1; i <= 30; i++) {
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // Verificar se partida foi criada
        const matches = await axios.get(`${BASE_URL}/matches/recent`);
        const pendingMatches = matches.data.filter(m => m.status === 'pending');
        
        // Verificar se fila diminuiu
        const currentQueue = await axios.get(`${BASE_URL}/queue/status`);
        
        console.log(`   [${i}s] Fila: ${currentQueue.data.playersInQueue} jogadores, Partidas: ${pendingMatches.length}`);
        
        if (pendingMatches.length > 0) {
          console.log('   🎉 SUCESSO: Partida criada automaticamente!');
          const match = pendingMatches[0];
          console.log(`   📋 Partida: ${match.id} - ${match.title}`);
          
          // Verificar se é uma partida de bots
          const team1 = typeof match.team1_players === 'string' ? JSON.parse(match.team1_players) : match.team1_players;
          const team2 = typeof match.team2_players === 'string' ? JSON.parse(match.team2_players) : match.team2_players;
          const allPlayers = [...team1, ...team2];
          const botCount = allPlayers.filter(p => p.toLowerCase().includes('bot')).length;
          
          console.log(`   🤖 Bots na partida: ${botCount}/${allPlayers.length}`);
          
          // Aguardar aceitação automática dos bots
          console.log('\n6️⃣ Aguardando aceitação automática dos bots...');
          for (let j = 1; j <= 30; j++) {
            await new Promise(resolve => setTimeout(resolve, 1000));
            
            const updatedMatch = await axios.get(`${BASE_URL}/matches/recent`);
            const currentMatch = updatedMatch.data.find(m => m.id === match.id);
            
            if (currentMatch) {
              console.log(`   [${j}s] Status da partida: ${currentMatch.status}`);
              
              if (currentMatch.status === 'accepted') {
                console.log('   ✅ SUCESSO: Partida aceita pelos bots!');
                
                // Verificar se avançou para draft
                await new Promise(resolve => setTimeout(resolve, 2000));
                const finalMatch = await axios.get(`${BASE_URL}/matches/recent`);
                const draftMatch = finalMatch.data.find(m => m.id === match.id);
                
                if (draftMatch && draftMatch.status === 'draft') {
                  console.log('   🎯 SUCESSO COMPLETO: Partida avançou para draft!');
                } else {
                  console.log('   ⚠️ PROBLEMA: Partida não avançou para draft');
                  console.log('   📊 Status final:', draftMatch?.status || 'não encontrada');
                }
                return;
              }
            }
          }
          
          console.log('   ⏰ Timeout na aceitação dos bots');
          return;
        }
      }
      
      console.log('   ⏰ Timeout - matchmaking não foi executado automaticamente');
      
      // Tentar forçar matchmaking manualmente
      console.log('\n6️⃣ Tentando forçar matchmaking manualmente...');
      try {
        const forceResult = await axios.post(`${BASE_URL}/matchmaking/process-complete`);
        console.log('   📊 Resultado:', forceResult.data);
      } catch (error) {
        console.log('   ❌ Erro ao forçar matchmaking:', error.response?.data?.message || error.message);
      }
    } else {
      console.log('   ❌ Fila não tem 10 jogadores');
    }
    
    console.log('\n✅ [Test] Teste concluído!');
    
  } catch (error) {
    console.error('❌ [Test] Erro durante teste:', error.message);
    if (error.response) {
      console.error('   Response data:', error.response.data);
    }
  }
}

testMatchmakingTrigger();
