const Database = require('sqlite3').Database;
const path = require('path');
const os = require('os');

// Path to the database (using the same path as the backend)
const dbPath = path.join(os.homedir(), 'AppData', 'Roaming', 'lol-matchmaking', 'matchmaking.db');

console.log('📂 Caminho do banco:', dbPath);

const db = new Database(dbPath, (err) => {
  if (err) {
    console.error('❌ Erro ao conectar com o banco:', err);
    return;
  }
  
  console.log('✅ Conectado ao banco de dados SQLite');
  
  // Verificar se custom_matches existe e buscar todas as partidas
  db.all('SELECT * FROM custom_matches ORDER BY created_at DESC', (err, rows) => {
    if (err) {
      console.error('❌ Erro ao buscar partidas:', err);
      return;
    }
    
    console.log('🎮 Partidas customizadas encontradas:', rows.length);
    
    if (rows.length === 0) {
      console.log('⚠️ Nenhuma partida encontrada na tabela custom_matches');
    } else {
      rows.forEach((match, index) => {
        console.log(`\n📋 Partida ${index + 1}:`);
        console.log('  ID:', match.id);
        console.log('  Match ID:', match.match_id);
        console.log('  Título:', match.title);
        console.log('  Status:', match.status);
        console.log('  Vencedor:', match.winner_team);
        console.log('  Duração:', match.duration);
        console.log('  Criado em:', match.created_at);
        console.log('  Completado em:', match.completed_at);
        console.log('  Riot Game ID:', match.riot_game_id);
        console.log('  Detectado pelo LCU:', match.detected_by_lcu);
        
        // Parse team players
        try {
          const team1 = JSON.parse(match.team1_players || '[]');
          const team2 = JSON.parse(match.team2_players || '[]');
          console.log('  Time 1:', team1);
          console.log('  Time 2:', team2);
        } catch (e) {
          console.log('  Times: erro ao fazer parse', e);
        }
      });
    }
    
    db.close();
  });
});
