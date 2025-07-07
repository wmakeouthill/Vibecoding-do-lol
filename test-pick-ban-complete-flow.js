const axios = require('axios');

const BASE_URL = 'http://localhost:3000';

async function testCompletePickBanFlow() {
  console.log('🧪 [TESTE] Iniciando teste completo do fluxo pick/ban...\n');

  try {
    // 1. Verificar se há partidas ativas para usar como teste
    console.log('📋 [TESTE] Buscando partidas ativas...');
    const matchesResponse = await axios.get(`${BASE_URL}/api/admin/matches`);
    const matches = matchesResponse.data.matches || [];
    
    if (matches.length === 0) {
      console.log('❌ [TESTE] Nenhuma partida ativa encontrada. Crie uma partida primeiro.');
      return;
    }

    // Pegar a primeira partida ativa
    const testMatch = matches.find(m => m.status === 'draft') || matches[0];
    console.log(`✅ [TESTE] Usando partida ${testMatch.id} para teste`);
    console.log(`   Status: ${testMatch.status}`);
    
    // 2. Verificar estrutura dos jogadores da partida
    let team1Players = [];
    let team2Players = [];
    
    try {
      team1Players = typeof testMatch.team1_players === 'string' 
        ? JSON.parse(testMatch.team1_players) 
        : (testMatch.team1_players || []);
      team2Players = typeof testMatch.team2_players === 'string' 
        ? JSON.parse(testMatch.team2_players) 
        : (testMatch.team2_players || []);
    } catch (parseError) {
      console.log('❌ [TESTE] Erro ao parsear jogadores da partida:', parseError);
      return;
    }

    console.log(`\n👥 [TESTE] Jogadores encontrados:`);
    console.log(`   Time 1 (Azul): ${team1Players.join(', ')}`);
    console.log(`   Time 2 (Vermelho): ${team2Players.join(', ')}`);

    if (team1Players.length === 0 || team2Players.length === 0) {
      console.log('❌ [TESTE] Partida não tem jogadores suficientes para testar');
      return;
    }

    // 3. Simular algumas ações de pick/ban
    const testActions = [
      {
        player: team1Players[0], // Top do time azul
        championId: 1, // Annie
        action: 'ban',
        description: 'Ban do Top azul'
      },
      {
        player: team2Players[0], // Top do time vermelho  
        championId: 2, // Olaf
        action: 'ban',
        description: 'Ban do Top vermelho'
      },
      {
        player: team1Players[1], // Jungle do time azul
        championId: 3, // Galio
        action: 'pick',
        description: 'Pick do Jungle azul'
      },
      {
        player: team2Players[2], // Mid do time vermelho
        championId: 4, // Twisted Fate
        action: 'pick', 
        description: 'Pick do Mid vermelho'
      }
    ];

    console.log(`\n🎯 [TESTE] Testando ${testActions.length} ações de draft...\n`);

    // 4. Executar cada ação e verificar resposta
    for (let i = 0; i < testActions.length; i++) {
      const testAction = testActions[i];
      
      console.log(`🔹 [TESTE ${i+1}/${testActions.length}] ${testAction.description}`);
      console.log(`   Jogador: ${testAction.player}`);
      console.log(`   Campeão: ${testAction.championId}`);
      console.log(`   Ação: ${testAction.action}`);

      try {
        const actionResponse = await axios.post(`${BASE_URL}/api/match/draft-action`, {
          matchId: testMatch.id,
          playerId: testAction.player, // ✅ Usando summonerName como playerId
          championId: testAction.championId,
          action: testAction.action
        });

        if (actionResponse.data.success) {
          console.log(`   ✅ Ação processada com sucesso!`);
        } else {
          console.log(`   ❌ Falha na ação:`, actionResponse.data.error);
        }

      } catch (actionError) {
        console.log(`   ❌ Erro na requisição:`, actionError.response?.data || actionError.message);
      }

      // Pequena pausa entre ações
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    // 5. Verificar estado final da partida
    console.log(`\n📊 [TESTE] Verificando estado final da partida...\n`);
    
    const finalMatchResponse = await axios.get(`${BASE_URL}/api/admin/matches`);
    const finalMatches = finalMatchResponse.data.matches || [];
    const finalMatch = finalMatches.find(m => m.id === testMatch.id);

    if (finalMatch && finalMatch.pick_ban_data) {
      let pickBanData = {};
      try {
        pickBanData = typeof finalMatch.pick_ban_data === 'string' 
          ? JSON.parse(finalMatch.pick_ban_data)
          : finalMatch.pick_ban_data;
        
        console.log('✅ [TESTE] Dados de pick/ban encontrados no banco:');
        console.log(`   Picks Time Azul: ${pickBanData.team1Picks?.length || 0}`);
        console.log(`   Bans Time Azul: ${pickBanData.team1Bans?.length || 0}`);
        console.log(`   Picks Time Vermelho: ${pickBanData.team2Picks?.length || 0}`);
        console.log(`   Bans Time Vermelho: ${pickBanData.team2Bans?.length || 0}`);
        console.log(`   Total de ações: ${pickBanData.actions?.length || 0}`);

        // Mostrar detalhes das ações
        if (pickBanData.actions && pickBanData.actions.length > 0) {
          console.log('\n📝 [TESTE] Detalhes das ações registradas:');
          pickBanData.actions.forEach((action, index) => {
            console.log(`   ${index + 1}. ${action.action.toUpperCase()} - ${action.playerName} (${action.playerLane}) - Campeão ${action.championId} - Time ${action.teamIndex === 1 ? 'Azul' : 'Vermelho'}`);
          });
        }

      } catch (parseError) {
        console.log('❌ [TESTE] Erro ao parsear dados finais de pick/ban:', parseError);
      }
    } else {
      console.log('❌ [TESTE] Nenhum dado de pick/ban encontrado na partida final');
    }

    console.log(`\n🎉 [TESTE] Teste completo finalizado!`);

  } catch (error) {
    console.error('❌ [TESTE] Erro durante o teste:', error.message);
    if (error.response) {
      console.error('   Resposta do servidor:', error.response.data);
    }
  }
}

// Executar teste
testCompletePickBanFlow().catch(console.error);
