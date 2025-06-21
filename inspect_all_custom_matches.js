const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'src', 'backend', 'database', 'database.sqlite');

function inspectAllCustomMatches() {
    const db = new sqlite3.Database(dbPath);
    
    console.log('🔍 Verificando todas as partidas personalizadas no banco...\n');
    
    // Buscar todas as partidas personalizadas
    db.all(`
        SELECT id, riot_game_id, detected_by_lcu, created_at, updated_at,
               CASE WHEN participants_data IS NOT NULL THEN 1 ELSE 0 END as has_participants,
               CASE WHEN pick_ban_data IS NOT NULL THEN 1 ELSE 0 END as has_pickban
        FROM custom_matches 
        ORDER BY created_at DESC
    `, (err, rows) => {
        if (err) {
            console.error('❌ Erro ao buscar partidas:', err);
            db.close();
            return;
        }
        
        if (!rows || rows.length === 0) {
            console.log('❌ Nenhuma partida personalizada encontrada no banco');
            db.close();
            return;
        }
        
        console.log('✅ Partidas personalizadas encontradas:');
        rows.forEach(row => {
            console.log(`ID ${row.id}: Game ${row.riot_game_id} | LCU: ${row.detected_by_lcu} | Data: ${row.created_at} | Participants: ${row.has_participants} | PickBan: ${row.has_pickban}`);
        });
        
        // Agora vamos verificar qual tem dados reais (KDA diferente de 0/0/0)
        console.log('\n🔍 Verificando quais têm dados reais (KDA não zerado)...\n');
        
        const checkPromises = rows.map(row => {
            return new Promise((resolve) => {
                db.get(`SELECT participants_data FROM custom_matches WHERE id = ?`, [row.id], (err, data) => {
                    if (err || !data || !data.participants_data) {
                        resolve({ id: row.id, hasRealData: false, reason: 'Sem dados de participantes' });
                        return;
                    }
                    
                    try {
                        const participants = JSON.parse(data.participants_data);
                        const hasRealData = participants.some(p => p.kills > 0 || p.deaths > 0 || p.assists > 0 || p.goldEarned > 0);
                        resolve({ 
                            id: row.id, 
                            hasRealData, 
                            reason: hasRealData ? 'Tem dados reais' : 'Dados zerados',
                            sample: participants[0] ? `${participants[0].summonerName}: ${participants[0].kills}/${participants[0].deaths}/${participants[0].assists}` : 'N/A'
                        });
                    } catch (e) {
                        resolve({ id: row.id, hasRealData: false, reason: 'Erro ao parsear JSON' });
                    }
                });
            });
        });
        
        Promise.all(checkPromises).then(results => {
            results.forEach(result => {
                const status = result.hasRealData ? '✅' : '❌';
                console.log(`${status} ID ${result.id}: ${result.reason} ${result.sample ? `(${result.sample})` : ''}`);
            });
            
            const realDataMatches = results.filter(r => r.hasRealData);
            if (realDataMatches.length > 0) {
                console.log(`\n✅ ${realDataMatches.length} partida(s) com dados reais encontrada(s)!`);
            } else {
                console.log('\n❌ Nenhuma partida com dados reais encontrada!');
            }
            
            db.close();
        });
    });
}

inspectAllCustomMatches();
