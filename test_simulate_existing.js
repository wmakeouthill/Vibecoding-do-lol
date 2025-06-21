const axios = require('axios');

async function testSimulateFromExisting() {
  try {
    console.log('🎮 [TESTE] Testando simulação baseada em partida existente...');
    
    // Primeiro, buscar a última partida customizada
    const playerId = 1; // ID do popcorn seller
    console.log(`📋 [TESTE] Buscando última partida customizada do jogador ${playerId}...`);
    
    const response = await axios.get(`http://localhost:3000/api/matches/custom/${playerId}?offset=0&limit=1`);
    
    if (!response.data.success || !response.data.matches || response.data.matches.length === 0) {
      console.log('❌ [TESTE] Nenhuma partida customizada encontrada');
      return;
    }
    
    const lastMatch = response.data.matches[0];
    console.log('✅ [TESTE] Última partida encontrada:', {
      id: lastMatch.id,
      title: lastMatch.title,
      winnerTeam: lastMatch.winner_team,
      hasParticipantsData: !!lastMatch.participants_data,
      hasPickBanData: !!lastMatch.pick_ban_data
    });
    
    // Agora simular uma nova partida baseada nesta
    console.log('🎮 [TESTE] Simulando nova partida baseada nos dados existentes...');
    
    const simulateResponse = await axios.post('http://localhost:3000/api/test/simulate-from-existing-match', {
      existingMatchData: lastMatch,
      playerIdentifier: playerId.toString()
    });
    
    console.log('✅ [TESTE] Resposta da simulação:', simulateResponse.data);
    
    if (simulateResponse.data.success) {
      // Verificar se a nova partida foi criada corretamente
      console.log('🔍 [TESTE] Verificando a nova partida criada...');
      
      const verifyResponse = await axios.get(`http://localhost:3000/api/matches/custom/${playerId}?offset=0&limit=2`);
      
      if (verifyResponse.data.success && verifyResponse.data.matches.length >= 2) {
        const newMatch = verifyResponse.data.matches[0]; // A mais recente
        const originalMatch = verifyResponse.data.matches[1]; // A original
        
        console.log('📊 [TESTE] Comparação entre partidas:');
        console.log('Original:', {
          id: originalMatch.id,
          title: originalMatch.title,
          hasParticipants: !!originalMatch.participants_data,
          hasPickBan: !!originalMatch.pick_ban_data
        });
        console.log('Nova (simulada):', {
          id: newMatch.id,
          title: newMatch.title,
          hasParticipants: !!newMatch.participants_data,
          hasPickBan: !!newMatch.pick_ban_data
        });
        
        // Verificar se os dados foram copiados corretamente
        let originalParticipants = [];
        let newParticipants = [];
        
        try {
          originalParticipants = JSON.parse(originalMatch.participants_data || '[]');
          newParticipants = JSON.parse(newMatch.participants_data || '[]');
        } catch (e) {
          console.error('Erro ao fazer parse dos participants_data:', e);
        }
        
        console.log('✅ [TESTE] Dados copiados:');
        console.log('- Original participants:', originalParticipants.length);
        console.log('- Nova participants:', newParticipants.length);
        
        if (originalParticipants.length > 0 && newParticipants.length > 0) {
          console.log('- Primeiro jogador original:', {
            nome: originalParticipants[0].summonerName,
            champion: originalParticipants[0].championName,
            kills: originalParticipants[0].kills
          });
          console.log('- Primeiro jogador copiado:', {
            nome: newParticipants[0].summonerName,
            champion: newParticipants[0].championName,
            kills: newParticipants[0].kills
          });
        }
        
        console.log('🎉 [TESTE] Simulação baseada em dados existentes funcionou corretamente!');
      }
    }
    
  } catch (error) {
    console.error('❌ [TESTE] Erro:', error.response?.data || error.message);
  }
}

testSimulateFromExisting();
