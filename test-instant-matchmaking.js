const axios = require('axios');
const BASE_URL = 'http://localhost:3000/api';

async function testInstantMatchmaking() {
  try {
    console.log('🔍 [Test] Testando matchmaking instantâneo...');
    
    // 1. Verificar partidas antes
    console.log('\n1️⃣ Verificando partidas antes...');
    const beforeMatches = await axios.get(`${BASE_URL}/matches/recent`);
    console.log(`   📊 Partidas antes: ${beforeMatches.data.length}`);
    
    // 2. Adicionar 10 bots em lote
    console.log('\n2️⃣ Adicionando 10 bots...');
    const startTime = Date.now();
    
    const botPromises = [];
    for (let i = 1; i <= 10; i++) {
      const promise = axios.post(`${BASE_URL}/queue/join`, {
        player: {
          summonerName: `InstantBot${i}`,
          gameName: `InstantBot${i}`,
          tagLine: 'INST',
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
    const addTime = Date.now() - startTime;
    console.log(`   ✅ Bots adicionados em ${addTime}ms`);
    
    // 3. Verificar imediatamente
    console.log('\n3️⃣ Verificando imediatamente...');
    const afterMatches = await axios.get(`${BASE_URL}/matches/recent`);
    console.log(`   📊 Partidas depois: ${afterMatches.data.length}`);
    
    const newMatches = afterMatches.data.filter(m => 
      !beforeMatches.data.some(bm => bm.id === m.id)
    );
    
    console.log(`   🆕 Partidas novas: ${newMatches.length}`);
    
    if (newMatches.length > 0) {
      const match = newMatches[0];
      console.log(`   🎮 Partida criada: ${match.id} - ${match.title}`);
      console.log(`   📊 Status: ${match.status}`);
      
      // Verificar se são nossos bots
      try {
        const team1 = typeof match.team1_players === 'string' ? JSON.parse(match.team1_players) : match.team1_players;
        const team2 = typeof match.team2_players === 'string' ? JSON.parse(match.team2_players) : match.team2_players;
        const allPlayers = [...team1, ...team2];
        const instantBotCount = allPlayers.filter(p => p.toLowerCase().includes('instantbot')).length;
        
        console.log(`   🤖 InstantBots: ${instantBotCount}/${allPlayers.length}`);
        
        if (instantBotCount > 0) {
          console.log('   🎉 SUCESSO: Matchmaking funcionou instantaneamente!');
          
          // Monitorar aceitação em tempo real
          console.log('\n4️⃣ Monitorando aceitação automática...');
          for (let i = 1; i <= 30; i++) {
            await new Promise(resolve => setTimeout(resolve, 1000));
            
            const currentMatches = await axios.get(`${BASE_URL}/matches/recent`);
            const currentMatch = currentMatches.data.find(m => m.id === match.id);
            
            if (currentMatch) {
              console.log(`   [${i}s] Status: ${currentMatch.status}`);
              
              if (currentMatch.status === 'accepted') {
                console.log('   ✅ SUCESSO: Partida aceita pelos bots!');
                
                // Aguardar draft
                console.log('\n5️⃣ Aguardando draft...');
                await new Promise(resolve => setTimeout(resolve, 3000));
                
                const draftMatches = await axios.get(`${BASE_URL}/matches/recent`);
                const draftMatch = draftMatches.data.find(m => m.id === match.id);
                
                if (draftMatch) {
                  console.log(`   🎯 Status final: ${draftMatch.status}`);
                  
                  if (draftMatch.status === 'draft') {
                    console.log('   🏆 SUCESSO COMPLETO: Fluxo completo funcionando!');
                  } else {
                    console.log('   ⚠️ PROBLEMA: Não avançou para draft');
                    
                    // Verificar por que não avançou
                    console.log('\n🔍 Investigando por que não avançou para draft...');
                    
                    // Verificar se há algum serviço que deveria processar
                    try {
                      const draftCheck = await axios.get(`${BASE_URL}/draft/status/${match.id}`);
                      console.log('   📋 Status do draft:', draftCheck.data);
                    } catch (draftError) {
                      console.log('   ❌ Erro ao verificar draft:', draftError.response?.data?.message || draftError.message);
                    }
                  }
                }
                return;
              }
            }
          }
          
          console.log('   ⏰ Timeout na aceitação');
        } else {
          console.log('   ❌ Partida não contém nossos bots');
        }
      } catch (error) {
        console.log(`   ❌ Erro ao analisar jogadores: ${error.message}`);
      }
    } else {
      console.log('   ❌ Nenhuma partida nova criada');
    }
    
    // 4. Verificar fila final
    console.log('\n6️⃣ Status final da fila...');
    const finalQueue = await axios.get(`${BASE_URL}/queue/status`);
    console.log(`   📊 Jogadores na fila: ${finalQueue.data.playersInQueue}`);
    
    console.log('\n✅ [Test] Teste concluído!');
    
  } catch (error) {
    console.error('❌ [Test] Erro:', error.message);
    if (error.response) {
      console.error('Response data:', error.response.data);
    }
  }
}

testInstantMatchmaking();
