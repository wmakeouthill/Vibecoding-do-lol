// Script para deletar todos os dados da tabela custom_matches do database.sqlite
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// Caminho do banco de dados (ajuste se necessário)
const dbPath = path.join(__dirname, 'database.sqlite');

const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Erro ao abrir o banco:', err.message);
    process.exit(1);
  }
});

db.serialize(() => {
  db.run('DELETE FROM custom_matches;', function(err) {
    if (err) {
      console.error('Erro ao deletar dados:', err.message);
    } else {
      console.log('Todos os dados da tabela custom_matches foram removidos.');
    }
  });
});

db.close();
