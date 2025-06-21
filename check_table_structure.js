const Database = require('sqlite3').Database;
const path = require('path');
const os = require('os');

// Path to the database (using the same path as the backend)
const dbPath = path.join(os.homedir(), 'AppData', 'Roaming', 'lol-matchmaking', 'matchmaking.db');

// console.log('📂 Caminho do banco:', dbPath);

const db = new Database(dbPath, (err) => {
  if (err) {
    console.error('❌ Erro ao conectar com o banco:', err);
    return;
  }
  
  // console.log('✅ Conectado ao banco de dados SQLite');
  
  // Verificar a estrutura da tabela
  db.all("PRAGMA table_info(custom_matches)", (err, columns) => {
    if (err) {
      console.error('❌ Erro ao buscar estrutura:', err);
      return;
    }
    
    // console.log('🏗️ Estrutura da tabela custom_matches:');
    columns.forEach(col => {
      // console.log(`  - ${col.name}: ${col.type} (${col.notnull ? 'NOT NULL' : 'NULL'})`);
    });
    
    // Verificar se o campo participants_data existe
    const hasParticipantsData = columns.some(col => col.name === 'participants_data');
    // console.log('\n🔍 Campo participants_data existe:', hasParticipantsData);
    
    if (hasParticipantsData) {
      // Verificar quantas partidas têm dados de participantes
      db.get("SELECT COUNT(*) as total FROM custom_matches WHERE participants_data IS NOT NULL AND participants_data != ''", (err, result) => {
        if (err) {
          console.error('❌ Erro ao contar partidas com dados:', err);
          return;
        }
        
        // console.log('📊 Partidas com participants_data:', result.total);
        
        // Verificar quantas partidas existem no total
        db.get("SELECT COUNT(*) as total FROM custom_matches", (err, totalResult) => {
          if (err) {
            console.error('❌ Erro ao contar total de partidas:', err);
            return;
          }
          
          // console.log('📋 Total de partidas:', totalResult.total);
          // console.log('📈 Porcentagem com dados reais:', ((result.total / totalResult.total) * 100).toFixed(1) + '%');
          
          db.close();
        });
      });
    } else {
      // console.log('❌ Campo participants_data não existe na tabela!');
      db.close();
    }
  });
});
