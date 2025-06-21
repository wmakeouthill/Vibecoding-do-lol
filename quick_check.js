console.log('🔍 Verificando última partida personalizada...');

const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'src', 'backend', 'database', 'database.sqlite');
console.log(`📁 Conectando ao banco: ${dbPath}`);

const db = new sqlite3.Database(dbPath, sqlite3.OPEN_READONLY, (err) => {
    if (err) {
        console.error('❌ Erro:', err.message);
        return;
    }
    
    console.log('✅ Conectado!');
    
    db.get("SELECT COUNT(*) as count FROM custom_matches", [], (err, result) => {
        if (err) {
            console.error('❌ Erro ao contar:', err.message);
            db.close();
            return;
        }
        
        console.log(`📊 Total de partidas: ${result.count}`);
        
        if (result.count > 0) {
            db.get(`
                SELECT id, title, status, riot_game_id, detected_by_lcu, 
                       participants_data IS NOT NULL as has_participants,
                       pick_ban_data IS NOT NULL as has_pickban,
                       created_at, completed_at
                FROM custom_matches 
                ORDER BY created_at DESC 
                LIMIT 1
            `, [], (err, match) => {
                if (err) {
                    console.error('❌ Erro ao buscar partida:', err.message);
                } else if (match) {
                    console.log('\n📋 Última partida:');
                    console.log(`  - ID: ${match.id}`);
                    console.log(`  - Título: ${match.title}`);
                    console.log(`  - Status: ${match.status}`);
                    console.log(`  - Riot Game ID: ${match.riot_game_id || 'N/A'}`);
                    console.log(`  - Detectado pelo LCU: ${match.detected_by_lcu ? 'Sim' : 'Não'}`);
                    console.log(`  - Tem dados dos participantes: ${match.has_participants ? 'Sim' : 'Não'}`);
                    console.log(`  - Tem pick/ban data: ${match.has_pickban ? 'Sim' : 'Não'}`);
                    console.log(`  - Criado em: ${match.created_at}`);
                    console.log(`  - Completado em: ${match.completed_at || 'Não completado'}`);
                }
                db.close();
            });
        } else {
            console.log('❌ Nenhuma partida encontrada');
            db.close();
        }
    });
});
