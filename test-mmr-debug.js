const mysql = require('mysql2/promise');

// Configuração do banco de dados
const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'vibecoding_lol',
  port: parseInt(process.env.DB_PORT || '3306')
};

async function testMMRSystem() {
  let connection;
  
  try {
    console.log('🔍 Conectando ao banco de dados...');
    connection = await mysql.createConnection(dbConfig);
    
    // 1. Verificar estrutura da tabela custom_matches
    console.log('\n📋 Verificando estrutura da tabela custom_matches...');
    const [customMatchesStructure] = await connection.execute('DESCRIBE custom_matches');
    console.log('Estrutura da tabela custom_matches:');
    customMatchesStructure.forEach(col => {
      console.log(`  ${col.Field}: ${col.Type} ${col.Null === 'YES' ? 'NULL' : 'NOT NULL'}`);
    });
    
    // 2. Verificar estrutura da tabela players
    console.log('\n📋 Verificando estrutura da tabela players...');
    const [playersStructure] = await connection.execute('DESCRIBE players');
    console.log('Estrutura da tabela players:');
    playersStructure.forEach(col => {
      console.log(`  ${col.Field}: ${col.Type} ${col.Null === 'YES' ? 'NULL' : 'NOT NULL'}`);
    });
    
    // 3. Verificar partidas recentes
    console.log('\n🎮 Verificando partidas customizadas recentes...');
    const [recentMatches] = await connection.execute(`
      SELECT id, title, team1_players, team2_players, winner_team, status, 
             lp_changes, custom_lp, created_at, completed_at
      FROM custom_matches 
      ORDER BY created_at DESC 
      LIMIT 5
    `);
    
    console.log(`Encontradas ${recentMatches.length} partidas recentes:`);
    recentMatches.forEach(match => {
      console.log(`\n  Partida ID: ${match.id}`);
      console.log(`  Título: ${match.title}`);
      console.log(`  Status: ${match.status}`);
      console.log(`  Vencedor: ${match.winner_team || 'N/A'}`);
      console.log(`  LP Changes: ${match.lp_changes || 'N/A'}`);
      console.log(`  Custom LP: ${match.custom_lp || 'N/A'}`);
      console.log(`  Criada: ${match.created_at}`);
      console.log(`  Finalizada: ${match.completed_at || 'N/A'}`);
      
      if (match.team1_players) {
        try {
          const team1 = JSON.parse(match.team1_players);
          console.log(`  Time 1 (${team1.length} jogadores): ${team1.join(', ')}`);
        } catch (e) {
          console.log(`  Time 1 (erro ao parsear): ${match.team1_players}`);
        }
      }
      
      if (match.team2_players) {
        try {
          const team2 = JSON.parse(match.team2_players);
          console.log(`  Time 2 (${team2.length} jogadores): ${team2.join(', ')}`);
        } catch (e) {
          console.log(`  Time 2 (erro ao parsear): ${match.team2_players}`);
        }
      }
    });
    
    // 4. Verificar jogadores e seus LP
    console.log('\n👥 Verificando jogadores e seus LP...');
    const [players] = await connection.execute(`
      SELECT id, summoner_name, custom_lp, custom_games_played, custom_wins, custom_losses
      FROM players 
      WHERE custom_games_played > 0
      ORDER BY custom_lp DESC 
      LIMIT 10
    `);
    
    console.log(`Encontrados ${players.length} jogadores com partidas customizadas:`);
    players.forEach(player => {
      console.log(`\n  Jogador ID: ${player.id}`);
      console.log(`  Nome: ${player.summoner_name}`);
      console.log(`  Custom LP: ${player.custom_lp || 0}`);
      console.log(`  Jogos: ${player.custom_games_played || 0}`);
      console.log(`  Vitórias: ${player.custom_wins || 0}`);
      console.log(`  Derrotas: ${player.custom_losses || 0}`);
    });
    
    // 5. Testar cálculo de LP manualmente
    console.log('\n🧮 Testando cálculo de LP manualmente...');
    
    function calculateLPChange(playerMMR, opponentMMR, isWin) {
      const baseLpWin = 15;
      const baseLpLoss = -18;
      
      const mmrDifference = opponentMMR - playerMMR;
      const mmrAdjustment = (mmrDifference / 100) * 6;
      
      let lpChange = isWin ? baseLpWin : baseLpLoss;
      lpChange += mmrAdjustment;
      
      if (playerMMR < 1200) {
        const mmrBelow1200 = 1200 - playerMMR;
        if (isWin) {
          lpChange += Math.floor(mmrBelow1200 / 100) * 0.5;
        } else {
          lpChange += Math.floor(mmrBelow1200 / 200) * 0.5;
        }
      } else if (playerMMR > 1800) {
        const mmrAbove1800 = playerMMR - 1800;
        if (isWin) {
          lpChange -= Math.floor(mmrAbove1800 / 100) * 0.5;
        } else {
          lpChange -= Math.floor(mmrAbove1800 / 100) * 0.5;
        }
      }
      
      if (isWin) {
        lpChange = Math.max(5, Math.min(25, lpChange));
      } else {
        lpChange = Math.max(-30, Math.min(-5, lpChange));
      }
      
      return Math.round(lpChange);
    }
    
    // Testar cenários
    const testScenarios = [
      { playerMMR: 0, opponentMMR: 0, isWin: true, description: 'Jogador novo vence jogador novo' },
      { playerMMR: 0, opponentMMR: 0, isWin: false, description: 'Jogador novo perde para jogador novo' },
      { playerMMR: 1000, opponentMMR: 1200, isWin: true, description: 'Jogador 1000 vence jogador 1200' },
      { playerMMR: 1000, opponentMMR: 1200, isWin: false, description: 'Jogador 1000 perde para jogador 1200' },
      { playerMMR: 1200, opponentMMR: 1000, isWin: true, description: 'Jogador 1200 vence jogador 1000' },
      { playerMMR: 1200, opponentMMR: 1000, isWin: false, description: 'Jogador 1200 perde para jogador 1000' }
    ];
    
    testScenarios.forEach(scenario => {
      const lpChange = calculateLPChange(scenario.playerMMR, scenario.opponentMMR, scenario.isWin);
      console.log(`  ${scenario.description}: ${lpChange > 0 ? '+' : ''}${lpChange} LP`);
    });
    
  } catch (error) {
    console.error('❌ Erro durante o teste:', error);
  } finally {
    if (connection) {
      await connection.end();
    }
  }
}

// Executar teste
testMMRSystem().then(() => {
  console.log('\n✅ Teste concluído');
  process.exit(0);
}).catch(error => {
  console.error('❌ Erro fatal:', error);
  process.exit(1);
}); 