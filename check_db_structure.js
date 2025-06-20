const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'matchmaking.db');
console.log('Verificando banco em:', dbPath);

const db = new sqlite3.Database(dbPath);

db.serialize(() => {
  // Verificar se a tabela matches existe e sua estrutura
  db.all("PRAGMA table_info(matches)", (err, rows) => {
    if (err) {
      console.error('Erro ao verificar estrutura da tabela matches:', err);
    } else {
      console.log('\n=== Estrutura da tabela matches ===');
      rows.forEach(row => {
        console.log(`${row.name}: ${row.type} (${row.notnull ? 'NOT NULL' : 'NULL'}) ${row.pk ? 'PRIMARY KEY' : ''}`);
      });
    }
  });

  // Verificar se existem partidas na tabela
  db.get("SELECT COUNT(*) as count FROM matches", (err, row) => {
    if (err) {
      console.error('Erro ao contar partidas:', err);
    } else {
      console.log(`\nTotal de partidas na tabela: ${row.count}`);
    }
    
    db.close();
  });
});
