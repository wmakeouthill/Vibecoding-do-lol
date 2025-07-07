/**
 * TESTE SIMPLES PARA PARTIDA ESPECÍFICA EM DRAFT
 * Testa picks do time vermelho na partida 587
 */

async function testDraftPicksPartida587() {
  const matchId = 587;
  const baseUrl = 'http://localhost:3000';
  
  console.log('🎯 Testando picks na partida 587...');
  
  try {
    // 1. Verificar status atual da partida
    console.log('1. Verificando status da partida...');
    const matchResponse = await fetch(`${baseUrl}/api/custom-matches/${matchId}`);
    if (!matchResponse.ok) {
      console.error('❌ Erro ao buscar partida:', matchResponse.status);
      return;
    }
    
    const matchData = await matchResponse.json();
    console.log('✅ Partida encontrada:', {
      id: matchData.id,
      status: matchData.status,
      hasDraftData: !!matchData.draft_data,
      hasPickBanData: !!matchData.pick_ban_data
    });
    
    // 2. Simular alguns picks alternados
    console.log('2. Simulando picks dos times...');
    
    const actions = [
      // Time azul (0-4)
      { playerId: 0, championId: 92, action: 'pick', team: 'azul', player: 'Bot628275#BOT (top)' },
      // Time vermelho (5-9) 
      { playerId: 5, championId: 23, action: 'pick', team: 'vermelho', player: 'Bot474070#BOT (top)' },
      { playerId: 6, championId: 11, action: 'pick', team: 'vermelho', player: 'Bot510425#BOT (jungle)' },
      // Time azul
      { playerId: 1, championId: 64, action: 'pick', team: 'azul', player: 'Bot699638#BOT (jungle)' },
      // Time vermelho
      { playerId: 7, championId: 91, action: 'pick', team: 'vermelho', player: 'popcorn seller#coup (mid)' },
    ];
    
    for (const actionData of actions) {
      console.log(`\n🎮 ${actionData.team} - ${actionData.player} vai fazer ${actionData.action} do campeão ${actionData.championId}...`);
      
      const actionResponse = await fetch(`${baseUrl}/api/match/draft-action`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          matchId: matchId,
          playerId: actionData.playerId,
          championId: actionData.championId,
          action: actionData.action
        })
      });
      
      if (actionResponse.ok) {
        const result = await actionResponse.json();
        console.log(`✅ ${actionData.action} realizado com sucesso!`);
        
        // Verificar se foi salvo no banco
        const updatedMatch = await fetch(`${baseUrl}/api/custom-matches/${matchId}`).then(r => r.json());
        if (updatedMatch.pick_ban_data) {
          const pickBanData = JSON.parse(updatedMatch.pick_ban_data);
          console.log('📊 Dados salvos:', {
            team1Picks: Object.keys(pickBanData.picks?.team1 || {}),
            team2Picks: Object.keys(pickBanData.picks?.team2 || {}),
            totalActions: pickBanData.actions?.length || 0
          });
          
          // Verificar se o time vermelho tem picks salvos
          if (actionData.team === 'vermelho' && actionData.action === 'pick') {
            const team2Picks = pickBanData.picks?.team2 || {};
            if (Object.keys(team2Picks).length > 0) {
              console.log('🎉 TIME VERMELHO TEM PICKS SALVOS!');
              Object.entries(team2Picks).forEach(([lane, pick]) => {
                console.log(`   ${lane}: Campeão ${pick.championId} por ${pick.playerName}`);
              });
            } else {
              console.log('❌ Time vermelho não tem picks salvos');
            }
          }
        }
      } else {
        const errorText = await actionResponse.text();
        console.error(`❌ Erro ao fazer ${actionData.action}:`, actionResponse.status, errorText);
      }
      
      // Aguardar um pouco entre ações
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    // 3. Verificar dados finais
    console.log('\n3. Verificando dados finais...');
    const finalMatch = await fetch(`${baseUrl}/api/custom-matches/${matchId}`).then(r => r.json());
    
    if (finalMatch.pick_ban_data) {
      const finalPickBanData = JSON.parse(finalMatch.pick_ban_data);
      console.log('📋 RESULTADO FINAL:');
      console.log('Team1 (Azul) picks:', finalPickBanData.picks?.team1 || {});
      console.log('Team2 (Vermelho) picks:', finalPickBanData.picks?.team2 || {});
      console.log('Total de ações:', finalPickBanData.actions?.length || 0);
      
      const team2PicksCount = Object.keys(finalPickBanData.picks?.team2 || {}).length;
      if (team2PicksCount > 0) {
        console.log('🎉 SUCESSO! Time vermelho tem picks salvos!');
        return true;
      } else {
        console.log('❌ FALHA! Time vermelho não tem picks salvos!');
        return false;
      }
    } else {
      console.log('❌ Nenhum dado de pick/ban encontrado');
      return false;
    }
    
  } catch (error) {
    console.error('❌ Erro durante o teste:', error);
    return false;
  }
}

// Executar teste
testDraftPicksPartida587()
  .then(success => {
    if (success) {
      console.log('\n🎉 TESTE PASSOU! Time vermelho salvando picks corretamente!');
    } else {
      console.log('\n❌ TESTE FALHOU! Time vermelho não está salvando picks!');
    }
  })
  .catch(error => {
    console.error('\n💥 Erro fatal:', error);
  });
