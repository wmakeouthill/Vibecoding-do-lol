const axios = require('axios');
const BASE_URL = 'http://localhost:3000/api';

async function testBotMatchmaking() {
  try {
    console.log('🔍 [Test] Testando matchmaking completo com bots...');
    
    // 1. Adicionar 10 bots rapidamente
    console.log('\n1️⃣ Adicionando 10 bots rapidamente...');
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
    
    const results = await Promise.allSettled(botPromises);
    const successful = results.filter(r => r.status === 'fulfilled').length;
    const failed = results.filter(r => r.status === 'rejected').length;
    
    console.log(`   ✅ Bots adicionados: ${successful}/${10}`);
    console.log(`   ❌ Falhas: ${failed}`);
    
    // 2. Aguardar um pouco e verificar se partida foi criada
    console.log('\n2️⃣ Aguardando processamento (10 segundos)...');
    await new Promise(resolve => setTimeout(resolve, 10000));
    
    // 3. Verificar se há partidas novas
    console.log('\n3️⃣ Verificando partidas criadas...');
    const matches = await axios.get(`${BASE_URL}/matches/recent`);
    const recentMatches = matches.data.filter(m => {
      const createdTime = new Date(m.created_at);
      const now = new Date();
      const diffMinutes = (now - createdTime) / (1000 * 60);
      return diffMinutes < 1; // Criada nos últimos 1 minuto
    });
    
    console.log(`   📊 Partidas recentes: ${recentMatches.length}`);
    
    if (recentMatches.length > 0) {
      const match = recentMatches[0];
      console.log(`   🎮 Partida encontrada: ${match.id} - ${match.title}`);
      console.log(`   📊 Status: ${match.status}`);
      
      // Analisar jogadores
      try {
        const team1 = typeof match.team1_players === 'string' ? JSON.parse(match.team1_players) : match.team1_players;
        const team2 = typeof match.team2_players === 'string' ? JSON.parse(match.team2_players) : match.team2_players;
        const allPlayers = [...team1, ...team2];
        const botCount = allPlayers.filter(p => p.toLowerCase().includes('testbot')).length;
        
        console.log(`   🤖 TestBots na partida: ${botCount}/${allPlayers.length}`);
        console.log(`   👥 Jogadores: ${allPlayers.join(', ')}`);
        
        if (match.status === 'pending') {
          console.log('\n4️⃣ Aguardando aceitação automática dos bots...');
          for (let i = 1; i <= 30; i++) {
            await new Promise(resolve => setTimeout(resolve, 1000));
            
            const updatedMatches = await axios.get(`${BASE_URL}/matches/recent`);
            const currentMatch = updatedMatches.data.find(m => m.id === match.id);
            
            if (currentMatch) {
              console.log(`   [${i}s] Status: ${currentMatch.status}`);
              
              if (currentMatch.status === 'accepted') {
                console.log('   ✅ SUCESSO: Partida aceita pelos bots!');
                
                // Aguardar transição para draft
                console.log('\n5️⃣ Aguardando transição para draft...');
                await new Promise(resolve => setTimeout(resolve, 5000));
                
                const finalMatches = await axios.get(`${BASE_URL}/matches/recent`);
                const finalMatch = finalMatches.data.find(m => m.id === match.id);
                
                if (finalMatch) {
                  console.log(`   📊 Status final: ${finalMatch.status}`);
                  
                  if (finalMatch.status === 'draft') {
                    console.log('   🎯 SUCESSO COMPLETO: Avançou para draft!');
                  } else {
                    console.log('   ⚠️ PROBLEMA: Não avançou para draft');
                    console.log('   🔍 Investigando...');
                    
                    // Verificar se há erro no draft
                    try {
                      const draftStatus = await axios.get(`${BASE_URL}/draft/status/${match.id}`);
                      console.log('   📋 Status do draft:', draftStatus.data);
                    } catch (error) {
                      console.log('   ❌ Erro ao verificar draft:', error.response?.data?.message || error.message);
                    }
                  }
                }
                return;
              }
            }
          }
          
          console.log('   ⏰ Timeout na aceitação');
        } else {
          console.log(`   ⚠️ Partida não está pendente (status: ${match.status})`);
        }
      } catch (error) {
        console.log(`   ❌ Erro ao analisar jogadores: ${error.message}`);
      }
    } else {
      console.log('   ❌ Nenhuma partida recente encontrada');
    }
    
    // 4. Verificar fila final
    console.log('\n6️⃣ Verificando fila final...');
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

testBotMatchmaking();
