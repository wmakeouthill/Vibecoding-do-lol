const Database = require('better-sqlite3');
const path = require('path');

// Conectar ao banco de dados
const dbPath = path.join(__dirname, 'src', 'backend', 'database', 'database.sqlite');
console.log('📍 Caminho do banco:', dbPath);

const db = new Database(dbPath);

try {
    console.log('🔍 INVESTIGANDO TAMANHOS DOS TIMES...\n');
    
    // Buscar todas as partidas customizadas
    const matches = db.prepare(`
        SELECT 
            id,
            team1_players,
            team2_players,
            created_at,
            winner_team
        FROM custom_matches 
        ORDER BY created_at DESC
    `).all();
    
    console.log(`📊 Total de partidas encontradas: ${matches.length}\n`);
    
    matches.forEach((match, index) => {
        console.log(`🎮 PARTIDA ${index + 1} (ID: ${match.id})`);
        console.log(`📅 Criada em: ${match.created_at}`);
        console.log(`🏆 Time vencedor: ${match.winner_team}`);
        
        let team1Players = [];
        let team2Players = [];
        
        try {
            team1Players = JSON.parse(match.team1_players || '[]');
            team2Players = JSON.parse(match.team2_players || '[]');
        } catch (e) {
            console.log('❌ Erro ao fazer parse dos times:', e.message);
        }
        
        console.log(`👥 Time 1: ${team1Players.length} jogadores`);
        if (team1Players.length > 0) {
            console.log(`   Jogadores: ${team1Players.join(', ')}`);
        }
        
        console.log(`👥 Time 2: ${team2Players.length} jogadores`);
        if (team2Players.length > 0) {
            console.log(`   Jogadores: ${team2Players.join(', ')}`);
        }
        
        // Detectar problemas
        if (team1Players.length !== 5 || team2Players.length !== 5) {
            console.log('⚠️  PROBLEMA DETECTADO! Times não têm 5 jogadores cada');
            
            // Verificar duplicatas
            const team1Duplicates = team1Players.filter((item, index) => team1Players.indexOf(item) !== index);
            const team2Duplicates = team2Players.filter((item, index) => team2Players.indexOf(item) !== index);
            
            if (team1Duplicates.length > 0) {
                console.log(`🔴 Duplicatas no Time 1: ${team1Duplicates.join(', ')}`);
            }
            
            if (team2Duplicates.length > 0) {
                console.log(`🔴 Duplicatas no Time 2: ${team2Duplicates.join(', ')}`);
            }
        }
        
        console.log('─'.repeat(50));
    });
    
    // Estatísticas gerais
    console.log('\n📈 ESTATÍSTICAS GERAIS:');
    
    const problemMatches = matches.filter(match => {
        try {
            const team1 = JSON.parse(match.team1_players || '[]');
            const team2 = JSON.parse(match.team2_players || '[]');
            return team1.length !== 5 || team2.length !== 5;
        } catch (e) {
            return true;
        }
    });
    
    console.log(`🔢 Partidas com times incorretos: ${problemMatches.length}/${matches.length}`);
    
    if (problemMatches.length > 0) {
        console.log('\n🔍 DETALHES DAS PARTIDAS PROBLEMÁTICAS:');
        problemMatches.forEach(match => {
            try {
                const team1 = JSON.parse(match.team1_players || '[]');
                const team2 = JSON.parse(match.team2_players || '[]');
                console.log(`- Partida ${match.id}: Time 1 = ${team1.length}, Time 2 = ${team2.length}`);
            } catch (e) {
                console.log(`- Partida ${match.id}: Erro no parse dos dados`);
            }
        });
    }
    
} catch (error) {
    console.error('❌ Erro ao executar consulta:', error);
} finally {
    db.close();
    console.log('\n✅ Investigação concluída');
}
