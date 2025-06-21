const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'src', 'backend', 'database', 'database.sqlite');

function checkParticipantsDataFormat() {
    const db = new sqlite3.Database(dbPath);
    
    console.log('🔍 Verificando formato dos dados de participantes...\n');
    
    // Buscar partidas completed com dados reais
    db.all(`
        SELECT id, riot_game_id, status, participants_data, created_at
        FROM custom_matches 
        WHERE status = 'completed'
        AND participants_data IS NOT NULL
        ORDER BY created_at DESC
        LIMIT 2
    `, (err, rows) => {
        if (err) {
            console.error('❌ Erro ao buscar partidas:', err);
            db.close();
            return;
        }
        
        if (!rows || rows.length === 0) {
            console.log('❌ Nenhuma partida completed encontrada');
            db.close();
            return;
        }
        
        console.log(`✅ ${rows.length} partida(s) completed encontrada(s):\n`);
        
        rows.forEach(row => {
            try {
                const participants = JSON.parse(row.participants_data);
                console.log(`🎮 Partida ID ${row.id} (Game: ${row.riot_game_id}):`);
                console.log(`   Status: ${row.status} | Data: ${row.created_at}`);
                console.log(`   Participantes: ${participants.length}`);
                
                participants.slice(0, 3).forEach((p, i) => {
                    console.log(`   ${i+1}. summonerName: "${p.summonerName}"`);
                    console.log(`      gameName: "${p.gameName || 'N/A'}"`);
                    console.log(`      tagLine: "${p.tagLine || 'N/A'}"`);
                    console.log(`      teamId: ${p.teamId}`);
                    console.log(`      championId: ${p.championId}`);
                    console.log(`      KDA: ${p.kills}/${p.deaths}/${p.assists}`);
                    console.log(`      Gold: ${p.goldEarned}`);
                    console.log('');
                });
                
                console.log('---\n');
            } catch (e) {
                console.log(`❌ Erro ao parsear participantes da partida ${row.id}:`, e.message);
            }
        });
        
        db.close();
    });
}

checkParticipantsDataFormat();
