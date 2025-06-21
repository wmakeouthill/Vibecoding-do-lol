// Script para verificar quantas partidas restam na tabela custom_matches
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'src/backend/database/database.sqlite');

const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Erro ao abrir o banco:', err.message);
    process.exit(1);
  }
});

db.serialize(() => {
  db.get('SELECT COUNT(*) as total FROM custom_matches;', (err, row) => {
    if (err) {
      console.error('Erro ao consultar dados:', err.message);
    } else {
      console.log(`Total de partidas na tabela custom_matches: ${row.total}`);
    }
    db.close();
  });
});
