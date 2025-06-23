const sqlite3 = require('sqlite3').verbose();

const db = new sqlite3.Database('src/backend/database/database.sqlite');

db.all('SELECT * FROM custom_matches', (err, rows) => {
  if (err) {
    console.error('Erro ao consultar:', err);
    return;
  }
  console.log('Partidas encontradas:', rows.length);
  rows.forEach((row, i) => {
    console.log(`\n--- Partida ${i + 1} ---`);
    console.log(row);
  });
  db.close();
});