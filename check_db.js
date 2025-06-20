const sqlite3 = require('./node_modules/sqlite3');
const path = require('path');

const dbPath = path.join(process.env.APPDATA, 'lol-matchmaking', 'matchmaking.db');
console.log('📁 Verificando banco em:', dbPath);

const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('❌ Erro ao abrir banco:', err);
    return;
  }
  
  console.log('✅ Banco conectado');
  
  // Verificar partidas
  db.all('SELECT COUNT(*) as total FROM matches', (err, rows) => {
    if (err) {
      console.error('❌ Erro ao contar partidas:', err);
      db.close();
      return;
    }
    
    console.log('📊 Total de partidas no banco:', rows[0].total);
    
    // Se há partidas, mostrar algumas
    if (rows[0].total > 0) {
      db.all('SELECT id, match_id, team1_players, team2_players, winner_team, created_at FROM matches ORDER BY created_at DESC LIMIT 5', (err, matches) => {
        if (err) {
          console.error('❌ Erro ao buscar partidas:', err);
        } else {
          console.log('🎮 Últimas 5 partidas:');
          matches.forEach((match, i) => {
            const team1 = JSON.parse(match.team1_players || '[]');
            const team2 = JSON.parse(match.team2_players || '[]');
            console.log(`${i+1}. ID: ${match.id}, MatchID: ${match.match_id}, Vencedor: ${match.winner_team}`);
            console.log(`   Team1 IDs: [${team1.join(', ')}]`);
            console.log(`   Team2 IDs: [${team2.join(', ')}]`);
            console.log(`   Data: ${match.created_at}`);
            console.log('');
          });
        }
        db.close();
      });
    } else {
      console.log('❌ Nenhuma partida encontrada no banco');
      db.close();
    }
  });
});
