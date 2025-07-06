const axios = require('axios');
const BASE_URL = 'http://localhost:3000/api';

async function testCorrectBotFlow() {
  try {
    console.log('🔍 [Test] Testando fluxo correto com bots do sistema...');
    
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
    
    // 3. Adicionar 10 bots usando o endpoint correto do sistema
    console.log('\n3️⃣ Adicionando 10 bots usando endpoint do sistema...');
    for (let i = 1; i <= 10; i++) {
      try {
        const response = await axios.post(`${BASE_URL}/queue/add-bot`);
        console.log(`   ✅ Bot ${i} adicionado: ${response.data.message}`);
      } catch (error) {
        console.log(`   ❌ Erro ao adicionar bot ${i}:`, error.response?.data?.message || error.message);
      }
    }
    
    // 4. Verificar se fila tem 10 jogadores
    console.log('\n4️⃣ Verificando se fila tem 10 jogadores...');
    const queueAfterBots = await axios.get(`${BASE_URL}/queue/status`);
    console.log('   📊 Jogadores na fila:', queueAfterBots.data.playersInQueue);
    
    if (queueAfterBots.data.playersInQueueList) {
      console.log('   👥 Jogadores:');
      queueAfterBots.data.playersInQueueList.forEach((player, index) => {
        console.log(`     ${index + 1}. ${player.summonerName} (${player.primaryLane}) - MMR: ${player.mmr}`);
      });
    }
    
    if (queueAfterBots.data.playersInQueue >= 10) {
      console.log('   ✅ Fila tem 10+ jogadores, aguardando matchmaking automático...');
      
      // 5. Aguardar o matchmaking automático
      console.log('\n5️⃣ Aguardando matchmaking automático (30 segundos)...');
      for (let i = 1; i <= 30; i++) {
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // Verificar se partida foi criada
        const matches = await axios.get(`${BASE_URL}/matches/recent`);
        const recentMatches = matches.data.filter(m => {
          const createdTime = new Date(m.created_at);
          const now = new Date();
          const diffMinutes = (now - createdTime) / (1000 * 60);
          return diffMinutes < 2; // Criada nos últimos 2 minutos
        });
        
        // Verificar se fila diminuiu
        const currentQueue = await axios.get(`${BASE_URL}/queue/status`);
        
        console.log(`   [${i}s] Fila: ${currentQueue.data.playersInQueue} jogadores, Partidas recentes: ${recentMatches.length}`);
        
        if (recentMatches.length > 0) {
          console.log('   🎉 SUCESSO: Partida criada automaticamente!');
          const match = recentMatches[0];
          console.log(`   📋 Partida: ${match.id} - ${match.title} - Status: ${match.status}`);
          
          // Verificar se é uma partida de bots do sistema
          const team1 = typeof match.team1_players === 'string' ? JSON.parse(match.team1_players) : match.team1_players;
          const team2 = typeof match.team2_players === 'string' ? JSON.parse(match.team2_players) : match.team2_players;
          const allPlayers = [...team1, ...team2];
          const botCount = allPlayers.filter(p => p.toLowerCase().includes('bot')).length;
          
          console.log(`   🤖 Bots na partida: ${botCount}/${allPlayers.length}`);
          console.log(`   👥 Jogadores: ${allPlayers.join(', ')}`);
          
          if (match.status === 'pending') {
            // Aguardar aceitação automática dos bots
            console.log('\n6️⃣ Aguardando aceitação automática dos bots do sistema...');
            for (let j = 1; j <= 30; j++) {
              await new Promise(resolve => setTimeout(resolve, 1000));
              
              const updatedMatch = await axios.get(`${BASE_URL}/matches/recent`);
              const currentMatch = updatedMatch.data.find(m => m.id === match.id);
              
              if (currentMatch) {
                console.log(`   [${j}s] Status da partida: ${currentMatch.status}`);
                
                if (currentMatch.status === 'accepted') {
                  console.log('   ✅ SUCESSO: Partida aceita pelos bots!');
                  
                  // Aguardar transição para draft
                  console.log('\n7️⃣ Aguardando transição para draft...');
                  await new Promise(resolve => setTimeout(resolve, 3000));
                  
                  const finalMatch = await axios.get(`${BASE_URL}/matches/recent`);
                  const draftMatch = finalMatch.data.find(m => m.id === match.id);
                  
                  if (draftMatch) {
                    console.log(`   📊 Status final: ${draftMatch.status}`);
                    
                    if (draftMatch.status === 'draft') {
                      console.log('   🏆 SUCESSO COMPLETO: Fluxo completo funcionando!');
                      console.log('   🎯 Matchmaking → Aceitação automática → Draft ✅');
                    } else {
                      console.log('   ⚠️ PROBLEMA: Não avançou para draft');
                      console.log('   🔍 Investigando por que não avançou...');
                      
                      // Verificar acceptance_status na base de dados
                      console.log('\n🔍 Verificando status de aceitação na base de dados...');
                      try {
                        const acceptanceCheck = await axios.get(`${BASE_URL}/matchmaking/check-acceptance`);
                        console.log('   📊 Status de aceitação:', acceptanceCheck.data);
                      } catch (checkError) {
                        console.log('   ❌ Erro ao verificar aceitação:', checkError.response?.data?.message || checkError.message);
                      }
                    }
                  }
                  return;
                  
                } else if (currentMatch.status === 'cancelled' || currentMatch.status === 'expired') {
                  console.log(`   ❌ Partida foi ${currentMatch.status}`);
                  return;
                }
              }
            }
            
            console.log('   ⏰ Timeout na aceitação dos bots');
          } else {
            console.log(`   ℹ️ Partida não está pendente (status: ${match.status})`);
          }
          return;
        }
      }
      
      console.log('   ⏰ Timeout - matchmaking não foi executado automaticamente');
    } else {
      console.log('   ❌ Fila não tem 10 jogadores suficientes');
    }
    
    console.log('\n✅ [Test] Teste concluído!');
    
  } catch (error) {
    console.error('❌ [Test] Erro durante teste:', error.message);
    if (error.response) {
      console.error('   Response data:', error.response.data);
    }
  }
}

testCorrectBotFlow();
