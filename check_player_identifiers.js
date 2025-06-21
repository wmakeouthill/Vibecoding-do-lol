const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'src', 'backend', 'database', 'database.sqlite');

function checkPlayerIdentifiers() {
    const db = new sqlite3.Database(dbPath);
    
    console.log('🔍 Verificando player_identifiers usados nas partidas customizadas...\n');
    
    // Buscar todas as partidas personalizadas com dados reais
    db.all(`
        SELECT id, riot_game_id, player_identifier, created_at, updated_at,
               CASE WHEN participants_data IS NOT NULL THEN 1 ELSE 0 END as has_participants
        FROM custom_matches 
        WHERE participants_data IS NOT NULL
        ORDER BY created_at DESC
    `, (err, rows) => {
        if (err) {
            console.error('❌ Erro ao buscar partidas:', err);
            db.close();
            return;
        }
        
        if (!rows || rows.length === 0) {
            console.log('❌ Nenhuma partida personalizada com dados encontrada no banco');
            db.close();
            return;
        }
        
        console.log('✅ Player identifiers encontrados:');
        const identifiers = new Set();
        
        rows.forEach(row => {
            identifiers.add(row.player_identifier);
            console.log(`ID ${row.id}: Player "${row.player_identifier}" | Game ${row.riot_game_id} | ${row.created_at}`);
        });
        
        console.log('\n📋 Resumo dos player identifiers únicos:');
        identifiers.forEach(identifier => {
            console.log(`- "${identifier}"`);
        });
        
        console.log('\n🔍 Agora vou verificar qual tem dados reais (KDA não zerado)...');
        
        // Verificar qual partida tem dados reais
        db.get(`
            SELECT id, player_identifier, participants_data 
            FROM custom_matches 
            WHERE participants_data IS NOT NULL 
            ORDER BY created_at DESC LIMIT 1
        `, (err, row) => {
            if (err || !row) {
                console.error('❌ Erro ao buscar última partida');
                db.close();
                return;
            }
            
            try {
                const participants = JSON.parse(row.participants_data);
                const hasRealData = participants.some(p => p.kills > 0 || p.deaths > 0 || p.assists > 0 || p.goldEarned > 0);
                
                console.log(`\n✅ Última partida (ID ${row.id}):`);
                console.log(`   Player Identifier: "${row.player_identifier}"`);
                console.log(`   Tem dados reais: ${hasRealData ? 'SIM' : 'NÃO'}`);
                
                if (hasRealData && participants[0]) {
                    console.log(`   Exemplo: ${participants[0].summonerName}: ${participants[0].kills}/${participants[0].deaths}/${participants[0].assists} (${participants[0].goldEarned} gold)`);
                }
                
                console.log(`\n🌐 Para testar no frontend, use este player identifier: "${row.player_identifier}"`);
                console.log(`🔗 URL do endpoint: GET /api/matches/custom/${encodeURIComponent(row.player_identifier)}`);
                
            } catch (e) {
                console.error('❌ Erro ao parsear dados dos participantes:', e);
            }
            
            db.close();
        });
    });
}

checkPlayerIdentifiers();
