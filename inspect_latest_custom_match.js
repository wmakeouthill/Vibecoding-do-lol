const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'src', 'backend', 'database', 'database.sqlite');

function inspectLatestCustomMatch() {
    const db = new sqlite3.Database(dbPath);
    
    console.log('🔍 Verificando última partida personalizada no banco...\n');
    
    // Buscar a última partida personalizada
    db.get(`
        SELECT * FROM custom_matches 
        ORDER BY created_at DESC 
        LIMIT 1
    `, (err, row) => {
        if (err) {
            console.error('❌ Erro ao buscar última partida:', err);
            db.close();
            return;
        }
        
        if (!row) {
            console.log('❌ Nenhuma partida personalizada encontrada no banco');
            db.close();
            return;
        }
        
        console.log('✅ Última partida personalizada encontrada:');
        console.log('ID:', row.id);
        console.log('Riot Game ID:', row.riot_game_id);
        console.log('Detectada pelo LCU:', row.detected_by_lcu);
        console.log('Data criação:', row.created_at);
        console.log('Data atualização:', row.updated_at);
        console.log('Tem participants_data:', !!row.participants_data);
        console.log('Tem pick_ban_data:', !!row.pick_ban_data);
        
        if (row.participants_data) {
            try {
                const participants = JSON.parse(row.participants_data);
                console.log('\n📊 Dados dos participantes:');
                participants.forEach((p, index) => {
                    console.log(`  ${index + 1}. ${p.summonerName}: ${p.championName} (KDA: ${p.kills}/${p.deaths}/${p.assists})`);
                });
            } catch (e) {
                console.log('❌ Erro ao parsear participants_data:', e.message);
            }
        }
        
        if (row.pick_ban_data) {
            try {
                const pickBan = JSON.parse(row.pick_ban_data);
                console.log('\n🎯 Dados de pick/ban:');
                console.log('  Picks:', pickBan.picks?.length || 0);
                console.log('  Bans:', pickBan.bans?.length || 0);
            } catch (e) {
                console.log('❌ Erro ao parsear pick_ban_data:', e.message);
            }
        }
        
        db.close();
    });
}

inspectLatestCustomMatch();
