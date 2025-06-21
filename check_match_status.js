const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'src', 'backend', 'database', 'database.sqlite');

function checkMatchStatus() {
    const db = new sqlite3.Database(dbPath);
    
    console.log('🔍 Verificando status das partidas...\n');
    
    db.all(`
        SELECT id, riot_game_id, status, created_at, 
               CASE WHEN participants_data IS NOT NULL THEN 1 ELSE 0 END as has_participants
        FROM custom_matches 
        WHERE participants_data IS NOT NULL
        ORDER BY created_at DESC
    `, (err, rows) => {
        if (err) {
            console.error('❌ Erro:', err);
            db.close();
            return;
        }
        
        console.log('📊 Status das partidas com dados de participantes:');
        rows.forEach(row => {
            console.log(`ID ${row.id}: status="${row.status}" | Game: ${row.riot_game_id} | Data: ${row.created_at}`);
        });
        
        const statuses = [...new Set(rows.map(r => r.status))];
        console.log(`\n📈 Status únicos encontrados: ${statuses.join(', ')}`);
        
        // Testar busca sem filtro de status
        console.log('\n🔍 Testando busca sem filtro de status...');
        
        db.all(`
            SELECT id, riot_game_id, status, created_at FROM custom_matches 
            WHERE (team1_players LIKE '%Let me Reset#KAT%' OR team2_players LIKE '%Let me Reset#KAT%')
            ORDER BY created_at DESC 
        `, (err, matches) => {
            if (err) {
                console.error('❌ Erro na busca:', err);
                db.close();
                return;
            }
            
            console.log(`✅ Partidas encontradas sem filtro de status: ${matches.length}`);
            matches.forEach(match => {
                console.log(`  - ID ${match.id} | status="${match.status}" | Game: ${match.riot_game_id} | Data: ${match.created_at}`);
            });
            
            db.close();
        });
    });
}

checkMatchStatus();
