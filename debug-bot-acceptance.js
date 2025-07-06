const axios = require('axios');

async function debugBotAcceptance() {
  try {
    console.log('🔍 [Debug] Investigando problema de aceitação automática dos bots...');
    
    // 1. Verificar se os bots estão sendo identificados corretamente
    console.log('\n1️⃣ Testando identificação de bots...');
    
    const testBotNames = [
      'Bot123456#BOT',
      'Bot789012#BOT',
      'AIBot#AI',
      'ComputerPlayer#CPU',
      'NormalPlayer#USER'
    ];
    
    for (const name of testBotNames) {
      const isBot = name.toLowerCase().includes('bot') || 
                   name.toLowerCase().includes('ai') ||
                   name.toLowerCase().includes('computer') ||
                   name.toLowerCase().includes('cpu');
      console.log(`   ${name}: ${isBot ? '✅ BOT' : '❌ HUMANO'}`);
    }
    
    // 2. Verificar estrutura do banco de dados
    console.log('\n2️⃣ Verificando estrutura do banco...');
    
    try {
      const response = await axios.get('http://localhost:3000/api/queue/status');
      console.log('   ✅ API funcionando');
      console.log('   📊 Jogadores na fila:', response.data.playersInQueue);
      
      if (response.data.playersInQueueList && response.data.playersInQueueList.length > 0) {
        console.log('   📋 Jogadores na fila:');
        response.data.playersInQueueList.forEach((player, index) => {
          console.log(`     ${index + 1}. ${player.summonerName} (${player.primaryLane})`);
        });
      }
    } catch (error) {
      console.log('   ❌ Erro na API:', error.message);
    }
    
    // 3. Testar um fluxo simples de aceitação
    console.log('\n3️⃣ Testando fluxo de aceitação manual...');
    
    try {
      // Simular aceitação manual de um bot
      const testBotName = 'Bot123456#BOT';
      const testResponse = await axios.post('http://localhost:3000/api/match/accept', {
        matchId: 1,
        summonerName: testBotName
      });
      console.log('   ✅ Aceitação manual funcionou:', testResponse.data);
    } catch (error) {
      console.log('   ❌ Erro na aceitação manual:', error.response?.data?.message || error.message);
    }
    
    // 4. Verificar se a coluna acceptance_status existe
    console.log('\n4️⃣ Verificando coluna acceptance_status...');
    
    try {
      const dbResponse = await axios.get('http://localhost:3000/api/debug/db-structure');
      console.log('   ✅ Estrutura do banco verificada');
    } catch (error) {
      console.log('   ⚠️ Endpoint de debug não disponível');
    }
    
    console.log('\n✅ [Debug] Investigação concluída!');
    
  } catch (error) {
    console.error('❌ [Debug] Erro durante debug:', error.message);
  }
}

debugBotAcceptance();
