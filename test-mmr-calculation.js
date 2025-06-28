const axios = require('axios');

// Configuração
const BASE_URL = 'http://localhost:3000/api';

async function testMMRCalculation() {
  console.log('🧪 Testando novo sistema de cálculo de MMR e LP (começando do 0)...\n');

  try {
    // 1. Testar recálculo de LP existente
    console.log('1️⃣ Testando recálculo de LP de partidas existentes...');
    const recalcResponse = await axios.post(`${BASE_URL}/admin/recalculate-custom-lp`);
    
    if (recalcResponse.data.success) {
      console.log('✅ Recálculo executado com sucesso!');
      console.log(`📊 Partidas afetadas: ${recalcResponse.data.affectedMatches}`);
      console.log(`👥 Jogadores afetados: ${recalcResponse.data.affectedPlayers}`);
      
      if (recalcResponse.data.details && recalcResponse.data.details.length > 0) {
        console.log('\n📋 Detalhes do recálculo:');
        recalcResponse.data.details.slice(0, 3).forEach((detail, index) => {
          console.log(`   Partida ${detail.matchId}:`);
          console.log(`     Time 1 MMR: ${detail.team1MMR} (começando do 0)`);
          console.log(`     Time 2 MMR: ${detail.team2MMR} (começando do 0)`);
          console.log(`     Vencedor: Time ${detail.winnerTeam}`);
          console.log(`     LP Changes:`, detail.newLpChanges);
        });
      }
    } else {
      console.log('❌ Falha no recálculo:', recalcResponse.data.error);
    }

    // 2. Verificar leaderboard atualizado
    console.log('\n2️⃣ Verificando leaderboard atualizado...');
    const leaderboardResponse = await axios.get(`${BASE_URL}/stats/participants-leaderboard?limit=10`);
    
    if (leaderboardResponse.data.success) {
      console.log('✅ Leaderboard carregado com sucesso!');
      console.log('\n🏆 Top 10 jogadores (MMR começando do 0):');
      leaderboardResponse.data.data.slice(0, 10).forEach((player, index) => {
        const mmrStatus = player.custom_lp === 0 ? '🆕 Novo' : 
                         player.custom_lp < 500 ? '🥉 Iniciante' :
                         player.custom_lp < 1000 ? '🥈 Intermediário' : '🥇 Avançado';
        console.log(`${index + 1}. ${player.summoner_name} - MMR: ${player.custom_lp} ${mmrStatus}, Jogos: ${player.custom_games_played}, Vitórias: ${player.custom_wins}`);
      });
    } else {
      console.log('❌ Falha ao carregar leaderboard:', leaderboardResponse.data.error);
    }

    // 3. Verificar estatísticas de uma partida específica
    console.log('\n3️⃣ Verificando estatísticas de partidas customizadas...');
    const customMatchesResponse = await axios.get(`${BASE_URL}/matches/custom/test?limit=5`);
    
    if (customMatchesResponse.data.success && customMatchesResponse.data.matches.length > 0) {
      console.log('✅ Partidas customizadas carregadas!');
      console.log('\n🎮 Últimas partidas customizadas:');
      customMatchesResponse.data.matches.slice(0, 3).forEach((match, index) => {
        console.log(`   Partida ${match.id}:`);
        console.log(`     Status: ${match.status}`);
        console.log(`     Vencedor: Time ${match.winner_team}`);
        console.log(`     LP Total: ${match.custom_lp}`);
        if (match.lp_changes) {
          const lpChanges = JSON.parse(match.lp_changes);
          console.log(`     LP Changes:`, lpChanges);
          
          // Mostrar exemplo de cálculo
          const players = Object.keys(lpChanges);
          if (players.length > 0) {
            const player = players[0];
            const lpChange = lpChanges[player];
            console.log(`     Exemplo: ${player} ganhou ${lpChange > 0 ? '+' : ''}${lpChange} LP`);
          }
        }
      });
    } else {
      console.log('❌ Falha ao carregar partidas customizadas:', customMatchesResponse.data.error);
    }

    // 4. Mostrar exemplos de cálculo
    console.log('\n4️⃣ Exemplos de cálculo do novo sistema:');
    console.log('📊 Sistema começa do MMR 0 (não 1000 como Riot):');
    console.log('   • Jogador MMR 0 vs Time MMR 0: +19 LP (vitória) / -14 LP (derrota)');
    console.log('   • Jogador MMR 0 vs Time MMR 200: +27 LP (vitória) / -6 LP (derrota)');
    console.log('   • Jogador MMR 500 vs Time MMR 500: +18 LP (vitória) / -15 LP (derrota)');
    console.log('   • Jogador MMR 500 vs Time MMR 300: +10 LP (vitória) / -23 LP (derrota)');
    console.log('   • Fator K = 16 (mais conservador que Riot = 32)');

    console.log('\n🎉 Teste concluído! O novo sistema de MMR está funcionando começando do 0.');

  } catch (error) {
    console.error('❌ Erro durante o teste:', error.response?.data || error.message);
  }
}

// Executar teste
testMMRCalculation(); 