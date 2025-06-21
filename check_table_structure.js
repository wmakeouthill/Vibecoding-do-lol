const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'src', 'backend', 'database', 'database.sqlite');

function checkTableStructure() {
    const db = new sqlite3.Database(dbPath);
    
    console.log('🔍 Verificando estrutura da tabela custom_matches...\n');
    
    // Ver estrutura da tabela
    db.all(`PRAGMA table_info(custom_matches)`, (err, columns) => {
        if (err) {
            console.error('❌ Erro ao buscar estrutura:', err);
            db.close();
            return;
        }
        
        console.log('📋 Colunas da tabela custom_matches:');
        columns.forEach(col => {
            console.log(`- ${col.name} (${col.type}) ${col.notnull ? 'NOT NULL' : ''} ${col.pk ? 'PRIMARY KEY' : ''}`);
        });
        
        // Agora buscar algumas partidas para ver os dados
        console.log('\n🔍 Verificando últimas partidas...');
        db.all(`
            SELECT * FROM custom_matches 
            WHERE participants_data IS NOT NULL 
            ORDER BY created_at DESC LIMIT 3
        `, (err, rows) => {
            if (err) {
                console.error('❌ Erro ao buscar partidas:', err);
                db.close();
                return;
            }
            
            if (!rows || rows.length === 0) {
                console.log('❌ Nenhuma partida encontrada');
                db.close();
                return;
            }
            
            console.log(`\n✅ ${rows.length} partida(s) encontrada(s):`);
            rows.forEach((row, index) => {
                console.log(`\n--- Partida ${index + 1} ---`);
                Object.keys(row).forEach(key => {
                    if (key === 'participants_data' || key === 'pick_ban_data') {
                        console.log(`${key}: ${row[key] ? 'SIM (dados presentes)' : 'NÃO'}`);
                    } else {
                        console.log(`${key}: ${row[key]}`);
                    }
                });
            });
            
            db.close();
        });
    });
}

checkTableStructure();
