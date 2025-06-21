const sqlite3 = require('sqlite3').verbose();
const path = require('path');

console.log('🔍 Verificando estrutura do banco de dados...');

// Tentar diferentes locais do banco
const possiblePaths = [
  path.join(__dirname, 'src', 'backend', 'database', 'database.sqlite'),
  path.join(__dirname, 'database.sqlite'),
  path.join(process.env.APPDATA || process.env.HOME || '.', 'lol-matchmaking', 'database.sqlite'),
  path.join(__dirname, 'data', 'database.sqlite'),
  path.join(__dirname, 'matchmaking.db')
];

for (const dbPath of possiblePaths) {
  console.log(`\n📁 Tentando: ${dbPath}`);
  
  try {
    const db = new sqlite3.Database(dbPath, sqlite3.OPEN_READONLY, (err) => {
      if (err) {
        console.log(`❌ Erro: ${err.message}`);
        return;
      }
      
      console.log(`✅ Banco encontrado: ${dbPath}`);
      
      // Listar tabelas
      db.all("SELECT name FROM sqlite_master WHERE type='table'", [], (err, rows) => {
        if (err) {
          console.log(`❌ Erro ao listar tabelas: ${err.message}`);
          db.close();
          return;
        }
        
        console.log('📋 Tabelas encontradas:');
        rows.forEach(row => {
          console.log(`  - ${row.name}`);
        });
        
        // Verificar se a tabela custom_matches existe
        const hasCustomMatches = rows.some(row => row.name === 'custom_matches');
        if (hasCustomMatches) {
          console.log('\n🎮 Verificando estrutura da tabela custom_matches:');
          db.all("PRAGMA table_info(custom_matches)", [], (err, columns) => {
            if (err) {
              console.log(`❌ Erro: ${err.message}`);
            } else {
              columns.forEach(col => {
                console.log(`  - ${col.name} (${col.type})`);
              });
              
              // Verificar quantas partidas customizadas existem
              db.get("SELECT COUNT(*) as count FROM custom_matches", [], (err, result) => {
                if (err) {
                  console.log(`❌ Erro: ${err.message}`);
                } else {
                  console.log(`\n📊 Total de partidas customizadas: ${result.count}`);
                  
                  // Mostrar as últimas 3 partidas
                  if (result.count > 0) {
                    db.all("SELECT id, title, status, winner_team, created_at FROM custom_matches ORDER BY created_at DESC LIMIT 3", [], (err, matches) => {
                      if (err) {
                        console.log(`❌ Erro: ${err.message}`);
                      } else {
                        console.log('\n🎯 Últimas partidas customizadas:');
                        matches.forEach(match => {
                          console.log(`  ID: ${match.id} | ${match.title} | Status: ${match.status} | Vencedor: ${match.winner_team} | ${match.created_at}`);
                        });
                      }
                      db.close();
                    });
                  } else {
                    db.close();
                  }
                }
              });
            }
          });
        } else {
          console.log('⚠️ Tabela custom_matches não encontrada');
          db.close();
        }
      });
    });
    
    // Só tentar o primeiro banco que der certo
    break;
    
  } catch (error) {
    console.log(`❌ Erro ao abrir: ${error.message}`);
  }
}
