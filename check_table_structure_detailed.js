const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'src', 'backend', 'database', 'database.sqlite');

function checkTableStructure() {
    const db = new sqlite3.Database(dbPath);
    
    console.log('🔍 Verificando estrutura da tabela custom_matches...\n');
    
    // Verificar a estrutura da tabela
    db.all("PRAGMA table_info(custom_matches)", (err, columns) => {
        if (err) {
            console.error('❌ Erro ao verificar estrutura da tabela:', err);
            db.close();
            return;
        }
        
        console.log('📊 Estrutura da tabela custom_matches:');
        columns.forEach(col => {
            console.log(`  - ${col.name}: ${col.type} ${col.notnull ? '(NOT NULL)' : ''} ${col.pk ? '(PRIMARY KEY)' : ''}`);
        });
        
        // Verificar se há coluna player_identifier
        const hasPlayerIdentifier = columns.some(col => col.name === 'player_identifier');
        console.log(`\n🎯 Player Identifier Column: ${hasPlayerIdentifier ? '✅ Existe' : '❌ Não existe'}\n`);
        
        // Mostrar algumas partidas para entender como identificar o player
        db.all(`
            SELECT id, riot_game_id, created_at, participants_data
            FROM custom_matches 
            WHERE participants_data IS NOT NULL
            ORDER BY created_at DESC
            LIMIT 3
        `, (err, rows) => {
            if (err) {
                console.error('❌ Erro ao buscar partidas:', err);
                db.close();
                return;
            }
            
            if (rows && rows.length > 0) {
                console.log('🔍 Analisando participantes das últimas partidas:');
                rows.forEach(row => {
                    try {
                        const participants = JSON.parse(row.participants_data);
                        console.log(`\nPartida ID ${row.id} (Game: ${row.riot_game_id}):`);
                        participants.forEach((p, i) => {
                            console.log(`  ${i+1}. ${p.summonerName} | gameName: ${p.gameName || 'N/A'} | tagLine: ${p.tagLine || 'N/A'}`);
                        });
                    } catch (e) {
                        console.log(`Partida ID ${row.id}: Erro ao parsear participantes`);
                    }
                });
            }
            
            db.close();
        });
    });
}

checkTableStructure();
