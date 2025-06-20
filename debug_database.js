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
          console.log('  Times: erro ao fazer parse');
        }
      });
    }
      db.close();
  });
});

// Paths to check for database
const possiblePaths = [
  path.join(__dirname, 'src', 'backend', 'database', 'database.sqlite'),
  path.join(__dirname, 'matchmaking.db'),
  path.join(os.homedir(), 'AppData', 'Roaming', 'lol-matchmaking', 'matchmaking.db'),
  path.join(process.cwd(), 'matchmaking.db'),
  path.join(process.cwd(), 'src', 'backend', 'database', 'matchmaking.db')
];

async function checkDatabase(dbPath) {
  return new Promise((resolve) => {
    console.log(`\n🔍 Verificando: ${dbPath}`);
    
    const db = new Database(dbPath, (err) => {
      if (err) {
        console.log(`❌ Não foi possível abrir: ${err.message}`);
        resolve(null);
        return;
      }
      
      console.log('✅ Banco aberto com sucesso');
      
      // Verificar quais tabelas existem
      db.all("SELECT name FROM sqlite_master WHERE type='table'", (err, tables) => {
        if (err) {
          console.error('❌ Erro ao buscar tabelas:', err);
          db.close();
          resolve(null);
          return;
        }
        
        console.log('📋 Tabelas encontradas:');
        tables.forEach(table => {
          console.log('  -', table.name);
        });
        
        // Verificar se custom_matches existe
        const hasCustomMatches = tables.some(table => table.name === 'custom_matches');
        
        if (hasCustomMatches) {
          console.log('✅ Tabela custom_matches encontrada!');
          
          // Verificar as partidas
          db.all('SELECT * FROM custom_matches ORDER BY created_at DESC', (err, rows) => {
            if (err) {
              console.error('❌ Erro ao buscar partidas:', err);
            } else {
              console.log('🎮 Partidas customizadas encontradas:', rows.length);
              
              rows.forEach((match, index) => {
                console.log(`\n📋 Partida ${index + 1}:`);
                console.log('  ID:', match.id);
                console.log('  Título:', match.title);
                console.log('  Status:', match.status);
                console.log('  Vencedor:', match.winner_team);
                console.log('  Duração:', match.duration);
                console.log('  Criado em:', match.created_at);
                console.log('  Completado em:', match.completed_at);
                console.log('  SessionId:', match.session_id);
                console.log('  Riot Game ID:', match.riot_game_id);
                console.log('  Detectado pelo LCU:', match.detected_by_lcu);
              });
            }
            
            db.close();
            resolve(dbPath);
          });
        } else {
          console.log('⚠️ Tabela custom_matches não encontrada');
          db.close();
          resolve(null);
        }
      });
    });
  });
}

async function main() {
  console.log('🔍 Procurando banco de dados...');
  
  for (const dbPath of possiblePaths) {
    const result = await checkDatabase(dbPath);
    if (result) {
      console.log(`\n✅ Banco de dados correto encontrado em: ${result}`);
      return;
    }
  }
  
  console.log('\n❌ Nenhum banco de dados válido encontrado nos caminhos verificados');
}

main().catch(console.error);
