const axios = require('axios');
const BASE_URL = 'http://localhost:3000/api';

async function quickMatchCheck() {
  try {
    console.log('🔍 [Quick] Verificando partidas recentes...');
    
    const matches = await axios.get(`${BASE_URL}/matches/recent`);
    console.log('📊 Total de partidas:', matches.data.length);
    
    if (matches.data.length > 0) {
      console.log('\n📋 Partidas recentes:');
      matches.data.slice(0, 5).forEach((match, index) => {
        console.log(`${index + 1}. ID: ${match.id} - ${match.title} - Status: ${match.status}`);
        console.log(`   Criada: ${match.created_at}`);
        
        // Verificar se é partida de bots
        try {
          const team1 = typeof match.team1_players === 'string' ? JSON.parse(match.team1_players) : match.team1_players;
          const team2 = typeof match.team2_players === 'string' ? JSON.parse(match.team2_players) : match.team2_players;
          const allPlayers = [...team1, ...team2];
          const botCount = allPlayers.filter(p => p.toLowerCase().includes('bot')).length;
          
          console.log(`   🤖 Bots: ${botCount}/${allPlayers.length}`);
          console.log(`   👥 Jogadores: ${allPlayers.join(', ')}`);
        } catch (error) {
          console.log(`   ❌ Erro ao analisar jogadores: ${error.message}`);
        }
        console.log('');
      });
    }
    
    // Verificar status da fila
    const queueStatus = await axios.get(`${BASE_URL}/queue/status`);
    console.log('📊 Fila atual:', queueStatus.data.playersInQueue, 'jogadores');
    
    if (queueStatus.data.playersInQueueList && queueStatus.data.playersInQueueList.length > 0) {
      console.log('👥 Jogadores na fila:');
      queueStatus.data.playersInQueueList.forEach((player, index) => {
        console.log(`   ${index + 1}. ${player.summonerName} (${player.primaryLane})`);
      });
    }
    
    console.log('\n✅ Verificação concluída!');
    
  } catch (error) {
    console.error('❌ Erro:', error.message);
    if (error.response) {
      console.error('Response data:', error.response.data);
    }
  }
}

quickMatchCheck();
