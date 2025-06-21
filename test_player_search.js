const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'src', 'backend', 'database', 'database.sqlite');

function testPlayerSearch() {
    const db = new sqlite3.Database(dbPath);
    
    console.log('🔍 Testando busca de partidas por player...\n');
    
    // Vamos testar com diferentes identificadores
    const testIdentifiers = [
        'Let me Reset#KAT',
        'popcorn seller#coup', 
        'Let me Reset',
        'popcorn seller'
    ];
    
    function testSearch(identifier) {
        return new Promise((resolve) => {
            console.log(`\n🎯 Testando busca para: "${identifier}"`);
            
            // Primeiro ver como está salvo nas colunas team1_players e team2_players
            db.all(`
                SELECT id, riot_game_id, team1_players, team2_players, created_at
                FROM custom_matches 
                WHERE participants_data IS NOT NULL
                ORDER BY created_at DESC
                LIMIT 3
            `, (err, rows) => {
                if (err) {
                    console.error('❌ Erro:', err);
                    resolve(null);
                    return;
                }
                
                console.log('📊 Conteúdo de team1_players e team2_players:');
                rows.forEach(row => {
                    console.log(`  ID ${row.id}: team1_players="${row.team1_players}" | team2_players="${row.team2_players}"`);
                });
                
                // Agora testar a busca como o backend faz
                db.all(`
                    SELECT id, riot_game_id, created_at FROM custom_matches 
                    WHERE (team1_players LIKE '%' || ? || '%' OR team2_players LIKE '%' || ? || '%')
                    AND status = 'completed'
                    ORDER BY created_at DESC 
                `, [identifier, identifier], (err, matches) => {
                    if (err) {
                        console.error('❌ Erro na busca:', err);
                        resolve(null);
                        return;
                    }
                    
                    console.log(`✅ Partidas encontradas para "${identifier}": ${matches.length}`);
                    matches.forEach(match => {
                        console.log(`  - ID ${match.id} (Game: ${match.riot_game_id}) - ${match.created_at}`);
                    });
                    
                    resolve(matches);
                });
            });
        });
    }
    
    // Testar todos os identificadores sequencialmente
    async function runAllTests() {
        for (const identifier of testIdentifiers) {
            await testSearch(identifier);
        }
        
        // Mostrar como buscar usando participants_data
        console.log('\n🔍 Alternativa: buscar nos participants_data...');
        
        db.all(`
            SELECT id, riot_game_id, participants_data, created_at
            FROM custom_matches 
            WHERE participants_data IS NOT NULL
            ORDER BY created_at DESC
            LIMIT 3
        `, (err, rows) => {
            if (err) {
                console.error('❌ Erro:', err);
                db.close();
                return;
            }
            
            const searchName = 'Let me Reset#KAT';
            console.log(`🎯 Buscando "${searchName}" nos participants_data:`);
            
            rows.forEach(row => {
                try {
                    const participants = JSON.parse(row.participants_data);
                    const found = participants.some(p => 
                        p.summonerName === searchName || 
                        p.summonerName?.includes('Let me Reset') ||
                        (p.gameName && p.tagLine && `${p.gameName}#${p.tagLine}` === searchName)
                    );
                    
                    console.log(`  ID ${row.id}: ${found ? '✅ ENCONTRADO' : '❌ NÃO ENCONTRADO'}`);
                    if (found) {
                        const player = participants.find(p => 
                            p.summonerName === searchName || 
                            p.summonerName?.includes('Let me Reset') ||
                            (p.gameName && p.tagLine && `${p.gameName}#${p.tagLine}` === searchName)
                        );
                        console.log(`    Player: ${player.summonerName} | KDA: ${player.kills}/${player.deaths}/${player.assists}`);
                    }
                } catch (e) {
                    console.log(`  ID ${row.id}: ❌ Erro ao parsear participantes`);
                }
            });
            
            db.close();
        });
    }
    
    runAllTests();
}

testPlayerSearch();
