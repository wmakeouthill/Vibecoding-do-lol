const Database = require('better-sqlite3');
const path = require('path');
const os = require('os');

const dbPath = path.join(os.homedir(), 'AppData', 'Roaming', 'lol-matchmaking', 'matchmaking.db');
console.log('📁 Caminho do banco:', dbPath);

try {
  const db = new Database(dbPath);  // Buscar as 3 partidas mais recentes
  const matches = db.prepare('SELECT * FROM custom_matches ORDER BY id DESC LIMIT 3').all();
  if (match) {
    console.log('🔍 Partida ID 12 encontrada:');
    console.log('📊 Título:', match.title);
    console.log('👥 Team 1 Players (raw):', match.team1_players);
    console.log('👥 Team 2 Players (raw):', match.team2_players);
    
    try {
      const team1 = typeof match.team1_players === 'string' ? JSON.parse(match.team1_players) : match.team1_players;
      const team2 = typeof match.team2_players === 'string' ? JSON.parse(match.team2_players) : match.team2_players;
      
      console.log('✅ Team 1 (parseado):', team1);
      console.log('📊 Team 1 count:', team1.length);
      console.log('✅ Team 2 (parseado):', team2);
      console.log('📊 Team 2 count:', team2.length);
      
      if (match.participants_data) {
        const participants = typeof match.participants_data === 'string' ? JSON.parse(match.participants_data) : match.participants_data;
        console.log('🎮 Participantes (count):', participants.length);
        console.log('🎮 Participantes por time:');
        const team100 = participants.filter(p => p.teamId === 100);
        const team200 = participants.filter(p => p.teamId === 200);
        console.log('   Team 100 (azul):', team100.length, 'jogadores');
        console.log('   Team 200 (vermelho):', team200.length, 'jogadores');
        
        console.log('👤 Jogadores Team 100:');
        team100.forEach(p => console.log('   -', p.summonerName, '(' + p.championName + ')'));
        console.log('👤 Jogadores Team 200:');
        team200.forEach(p => console.log('   -', p.summonerName, '(' + p.championName + ')'));
        
        // Comparar com os arrays team1_players e team2_players
        console.log('\n🔍 COMPARAÇÃO DE DADOS:');
        console.log('📊 team1_players.length:', team1.length);
        console.log('📊 participants team 100:', team100.length);
        console.log('📊 team2_players.length:', team2.length);
        console.log('📊 participants team 200:', team200.length);
        
        if (team1.length !== team100.length) {
          console.log('⚠️ PROBLEMA: team1_players tem', team1.length, 'mas participants team 100 tem', team100.length);
        }
        if (team2.length !== team200.length) {
          console.log('⚠️ PROBLEMA: team2_players tem', team2.length, 'mas participants team 200 tem', team200.length);
        }
      }
    } catch (e) {
      console.error('❌ Erro ao fazer parse:', e);
    }  } else {
    console.log('❌ Partida ID 12 não encontrada');
    
    // Listar algumas partidas para ver se há dados
    const matches = db.prepare('SELECT id, title, team1_players, team2_players FROM custom_matches ORDER BY id DESC LIMIT 3').all();
    console.log('📋 Últimas 3 partidas:');
    matches.forEach(m => {
      try {
        const t1 = JSON.parse(m.team1_players);
        const t2 = JSON.parse(m.team2_players);
        console.log(`  ID ${m.id}: ${t1.length} vs ${t2.length} - ${m.title}`);
      } catch (e) {
        console.log(`  ID ${m.id}: Erro no parse - ${m.title}`);
      }
    });
  }

  db.close();
} catch (error) {
  console.error('❌ Erro ao conectar ao banco:', error);
}
