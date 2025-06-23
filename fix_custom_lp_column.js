const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'src', 'backend', 'database', 'database.sqlite');
console.log(`Corrigindo estrutura do banco: ${dbPath}`);

const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Erro ao conectar no banco:', err);
    return;
  }
  console.log('Conectado ao banco SQLite');
});

// Verificar estrutura atual da tabela players
db.all("PRAGMA table_info(players)", (err, rows) => {
  if (err) {
    console.error('Erro ao verificar tabela players:', err);
    return;
  }
  
  console.log('\n=== ESTRUTURA TABELA PLAYERS ===');
  const columnNames = rows.map(row => row.name);
  rows.forEach(row => {
    console.log(`${row.name} (${row.type}) - Default: ${row.dflt_value}`);
  });
  
  // Verificar se custom_lp existe
  if (!columnNames.includes('custom_lp')) {
    console.log('\n❌ Coluna custom_lp NÃO encontrada na tabela players');
    console.log('Adicionando coluna custom_lp...');
    
    db.run('ALTER TABLE players ADD COLUMN custom_lp INTEGER DEFAULT 0', (err) => {
      if (err) {
        console.error('Erro ao adicionar coluna custom_lp:', err);
      } else {
        console.log('✅ Coluna custom_lp adicionada com sucesso!');
      }
      
      // Verificar estrutura da tabela custom_matches também
      checkCustomMatchesTable();
    });
  } else {
    console.log('\n✅ Coluna custom_lp já existe na tabela players');
    checkCustomMatchesTable();
  }
});

function checkCustomMatchesTable() {
  db.all("PRAGMA table_info(custom_matches)", (err, rows) => {
    if (err) {
      console.error('Erro ao verificar tabela custom_matches:', err);
      db.close();
      return;
    }
    
    console.log('\n=== ESTRUTURA TABELA CUSTOM_MATCHES ===');
    const columnNames = rows.map(row => row.name);
    rows.forEach(row => {
      console.log(`${row.name} (${row.type}) - Default: ${row.dflt_value}`);
    });
    
    if (columnNames.includes('custom_lp')) {
      console.log('\n✅ Coluna custom_lp encontrada na tabela custom_matches');
    } else {
      console.log('\n❌ Coluna custom_lp NÃO encontrada na tabela custom_matches');
    }
    
    db.close((err) => {
      if (err) {
        console.error('Erro ao fechar banco:', err);
      } else {
        console.log('\n🗃️ Banco fechado');
      }
    });
  });
}
