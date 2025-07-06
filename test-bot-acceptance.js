const axios = require('axios');
const BASE_URL = 'http://localhost:3000/api';

async function testBotAcceptance() {
  try {
    console.log('🔍 [Test] Testando fluxo completo: Matchmaking → Aceitação → Draft...');
    
    // 1. Limpar fila primeiro
    console.log('\n1️⃣ Limpando fila...');
    try {
      await axios.post(`${BASE_URL}/queue/clear`);
      console.log('   ✅ Fila limpa');
    } catch (error) {
      console.log('   ⚠️ Erro ao limpar fila (pode não existir endpoint)');
    }
    
    // 2. Verificar status inicial da fila
    console.log('\n2️⃣ Verificando status inicial da fila...');
    const queueStatus = await axios.get(`${BASE_URL}/queue/status`);
    console.log('   📊 Jogadores na fila:', queueStatus.data.playersInQueue);
    console.log('   📋 Lista:', queueStatus.data.playersInQueueList?.map(p => p.summonerName) || []);
    
    // 3. Verificar se há partidas pendentes
    console.log('\n3️⃣ Verificando partidas pendentes...');
    const matches = await axios.get(`${BASE_URL}/matches/recent`);
    const pendingMatches = matches.data.filter(m => m.status === 'pending');
    console.log('   🎮 Partidas pendentes:', pendingMatches.length);
    
    if (pendingMatches.length > 0) {
      console.log('   📋 Partidas pendentes:');
      pendingMatches.forEach(match => {
        console.log(`     - Partida ${match.id}: ${match.title} - Status: ${match.status}`);
      });
    }
    
    // 4. Adicionar 10 bots usando o método correto (mesmo do botão "Adicionar bots")
    console.log('\n4️⃣ Adicionando 10 bots usando o método correto...');
    
    for (let i = 0; i < 10; i++) {
      try {
        await axios.post(`${BASE_URL}/queue/add-bot`);
        console.log(`   ✅ Bot ${i + 1} adicionado à fila`);
      } catch (error) {
        console.log(`   ❌ Erro ao adicionar bot ${i + 1}:`, error.response?.data?.message || error.message);
      }
    }
    
    // 5. Aguardar matchmaking automático
    console.log('\n5️⃣ Aguardando criação automática de partida...');
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    const newMatches = await axios.get(`${BASE_URL}/matches/recent`);
    const newPendingMatches = newMatches.data.filter(m => m.status === 'pending');
    console.log('   🎮 Novas partidas criadas:', newPendingMatches.length);
    
    if (newPendingMatches.length > 0) {
      const latestMatch = newPendingMatches[0];
      console.log(`   📋 Partida mais recente: ${latestMatch.id} - ${latestMatch.title}`);
      console.log(`   📊 Status: ${latestMatch.status}`);
      
      // 6. Verificar status de aceitação
      console.log('\n6️⃣ Verificando status de aceitação...');
      const acceptanceStatus = await axios.get(`${BASE_URL}/matchmaking/check-acceptance`);
      console.log('   📊 Status inicial:', acceptanceStatus.data);
      
      // 7. Aguardar aceitação automática dos bots
      console.log('\n7️⃣ Aguardando aceitação automática dos bots...');
      let attempts = 0;
      const maxAttempts = 30; // 30 segundos
      
      while (attempts < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, 1000));
        attempts++;
        
        const currentStatus = await axios.get(`${BASE_URL}/matchmaking/check-acceptance`);
        console.log(`   [${attempts}s] Progresso: ${currentStatus.data.acceptedCount || 0}/10 jogadores`);
        
        if (currentStatus.data.acceptedCount >= 10) {
          console.log('   ✅ Todos os jogadores aceitaram!');
          break;
        }
        
        if (attempts >= maxAttempts) {
          console.log('   ⏰ Timeout - nem todos os bots aceitaram automaticamente');
          break;
        }
      }
      
      // 8. Verificar se avançou para draft
      console.log('\n8️⃣ Verificando se avançou para draft...');
      const finalMatches = await axios.get(`${BASE_URL}/matches/recent`);
      const draftMatches = finalMatches.data.filter(m => m.status === 'draft');
      const acceptedMatches = finalMatches.data.filter(m => m.status === 'accepted');
      
      console.log('   🎮 Partidas em draft:', draftMatches.length);
      console.log('   ✅ Partidas aceitas:', acceptedMatches.length);
      console.log('   ⏳ Partidas pendentes:', finalMatches.data.filter(m => m.status === 'pending').length);
      
      if (draftMatches.length > 0) {
        console.log('   🎉 SUCESSO: Partida avançou para draft!');
        const draftMatch = draftMatches[0];
        console.log(`   📋 Partida em draft: ${draftMatch.id} - ${draftMatch.title}`);
      } else if (acceptedMatches.length > 0) {
        console.log('   ⚠️ PROBLEMA: Partida foi aceita mas não avançou para draft');
        const acceptedMatch = acceptedMatches[0];
        console.log(`   📋 Partida aceita: ${acceptedMatch.id} - ${acceptedMatch.title}`);
        
        // Verificar logs do backend
        console.log('\n🔍 Investigando problema...');
        try {
          const draftStatus = await axios.get(`${BASE_URL}/draft/status/${acceptedMatch.id}`);
          console.log('   📊 Status do draft:', draftStatus.data);
        } catch (error) {
          console.log('   ❌ Erro ao verificar status do draft:', error.response?.data?.message || error.message);
        }
      } else {
        console.log('   ❌ FALHA: Nenhuma partida foi aceita ou avançou para draft');
      }
    } else {
      console.log('   ❌ FALHA: Nenhuma partida foi criada automaticamente');
    }
    
    console.log('\n✅ [Test] Teste concluído!');
    
  } catch (error) {
    console.error('❌ [Test] Erro durante teste:', error.message);
    if (error.response) {
      console.error('   Response data:', error.response.data);
    }
  }
}

testBotAcceptance();
