const Database = require('better-sqlite3');
const path = require('path');
const os = require('os');

const dbPath = path.join(os.homedir(), 'AppData', 'Roaming', 'lol-matchmaking', 'matchmaking.db');
// console.log('📁 Caminho do banco:', dbPath);

try {
  const db = new Database(dbPath);

  // Buscar as 3 partidas mais recentes
  const matches = db.prepare('SELECT * FROM custom_matches ORDER BY id DESC LIMIT 3').all();

  if (matches.length > 0) {
    // console.log('🔍 Últimas partidas encontradas:', matches.length);
    
    matches.forEach((match, index) => {
      // console.log(`\n📊 =============== PARTIDA ${index + 1} ===============`);
      // console.log('🆔 ID:', match.id);
      // console.log('📋 Título:', match.title);
      // console.log('📅 Criado em:', match.created_at);
      // console.log('✅ Status:', match.status);
      // console.log('🎮 Detectado pelo LCU:', match.detected_by_lcu);
      // console.log('🏆 Vencedor:', match.winner_team);
      
      try {
        const team1 = JSON.parse(match.team1_players);
        const team2 = JSON.parse(match.team2_players);
        // console.log('👥 Team 1:', team1.length, 'jogadores');
        // console.log('👥 Team 2:', team2.length, 'jogadores');
        
        // console.log('📊 Tem participants_data:', !!match.participants_data);
        // console.log('🎯 Tem pick_ban_data:', !!match.pick_ban_data);
        // console.log('💰 Tem lp_changes:', !!match.lp_changes);
        
        if (match.participants_data) {
          const participants = JSON.parse(match.participants_data);
          // console.log('   ✅ Participants count:', participants.length);
        }
        
        if (match.pick_ban_data) {
          const pickBan = JSON.parse(match.pick_ban_data);
          // console.log('   ✅ Pick/Ban real:', pickBan.isReal || false);
        }
        
        // console.log('🔗 Riot Game ID:', match.riot_game_id);
        // console.log('⏱️ Duração:', match.duration);
      } catch (e) {
        // console.log('❌ Erro ao processar dados:', e.message);
      }
    });
  } else {
    // console.log('❌ Nenhuma partida encontrada');
  }

  db.close();
} catch (error) {
  console.error('❌ Erro ao conectar ao banco:', error);
}
