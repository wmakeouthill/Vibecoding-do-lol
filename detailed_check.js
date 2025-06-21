const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'src', 'backend', 'database', 'database.sqlite');

console.log('🔍 Verificando dados completos da última partida...\n');

const db = new sqlite3.Database(dbPath, sqlite3.OPEN_READONLY, (err) => {
    if (err) {
        console.error('❌ Erro:', err.message);
        return;
    }
    
    db.get(`
        SELECT id, title, riot_game_id, participants_data, pick_ban_data, 
               team1_players, team2_players, lp_changes, detected_by_lcu
        FROM custom_matches 
        ORDER BY created_at DESC 
        LIMIT 1
    `, [], (err, match) => {
        if (err) {
            console.error('❌ Erro ao buscar partida:', err.message);
            db.close();
            return;
        }
        
        if (!match) {
            console.log('❌ Nenhuma partida encontrada');
            db.close();
            return;
        }
        
        console.log(`📋 Partida ID: ${match.id} - ${match.title}`);
        console.log(`🎮 Riot Game ID: ${match.riot_game_id}`);
        console.log(`🤖 Detectado pelo LCU: ${match.detected_by_lcu ? 'SIM' : 'NÃO'}\n`);
        
        // Verificar dados dos participantes
        if (match.participants_data) {
            try {
                const participants = JSON.parse(match.participants_data);
                console.log(`👥 PARTICIPANTES (${participants.length}):`);
                participants.forEach((p, i) => {
                    console.log(`  ${i+1}. ${p.summonerName} - ${p.championName} (Time ${p.teamId}) - ${p.kills}/${p.deaths}/${p.assists} - ${p.goldEarned}g`);
                });
            } catch (e) {
                console.log('❌ Erro ao fazer parse dos participantes:', e.message);
            }
        } else {
            console.log('❌ Nenhum dado de participantes');
        }
        
        console.log('\n🎯 PICK & BAN DATA:');
        if (match.pick_ban_data) {
            try {
                const pickBan = JSON.parse(match.pick_ban_data);
                console.log(`🔵 Time 1: ${pickBan.team1Picks?.length || 0} picks`);
                console.log(`🔴 Time 2: ${pickBan.team2Picks?.length || 0} picks`);
                if (pickBan.team1Picks) {
                    pickBan.team1Picks.forEach((pick, i) => {
                        console.log(`  ${i+1}. ${pick.champion} (${pick.player}) - ${pick.lane}`);
                    });
                }
            } catch (e) {
                console.log('❌ Erro ao fazer parse do pick/ban:', e.message);
            }
        } else {
            console.log('❌ Nenhum dado de pick/ban');
        }
        
        console.log('\n👥 TIMES:');
        try {
            const team1 = JSON.parse(match.team1_players);
            const team2 = JSON.parse(match.team2_players);
            console.log(`🔵 Time 1: ${team1.join(', ')}`);
            console.log(`🔴 Time 2: ${team2.join(', ')}`);
        } catch (e) {
            console.log('❌ Erro ao fazer parse dos times:', e.message);
        }
        
        console.log('\n💰 LP CHANGES:');
        if (match.lp_changes) {
            try {
                const lpChanges = JSON.parse(match.lp_changes);
                Object.keys(lpChanges).forEach(player => {
                    const change = lpChanges[player];
                    console.log(`  ${player}: ${change.lp > 0 ? '+' : ''}${change.lp} LP, ${change.mmr > 0 ? '+' : ''}${change.mmr} MMR`);
                });
            } catch (e) {
                console.log('❌ Erro ao fazer parse do LP:', e.message);
            }
        } else {
            console.log('❌ Nenhuma mudança de LP');
        }
        
        console.log('\n✅ Verificação completa!');
        db.close();
    });
});
