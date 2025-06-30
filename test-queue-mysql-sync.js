const mysql = require('mysql2/promise');

// Configuração do banco de dados
const dbConfig = {
  host: 'lolmatchmaking.mysql.uhserver.com',
  port: 3306,
  user: 'wmakeouthill',
  password: 'Angel1202@@',
  database: 'lolmatchmaking'
};

async function testQueueMySQLSync() {
  let connection;
  
  try {
    console.log('🧪 Testando sincronização MySQL da fila...');
    console.log('🔗 Conectando ao banco:', dbConfig.host);
    
    connection = await mysql.createConnection(dbConfig);
    console.log('✅ Conectado ao banco de dados');
    
    // 1. Verificar estado atual da fila
    console.log('\n📊 Estado atual da fila:');
    const [activePlayers] = await connection.execute(
      'SELECT * FROM queue_players WHERE is_active = 1 ORDER BY join_time ASC'
    );
    
    console.log(`Jogadores ativos na fila: ${activePlayers.length}`);
    activePlayers.forEach((player, index) => {
      const joinTime = new Date(player.join_time);
      const now = new Date();
      const timeInQueue = Math.floor((now.getTime() - joinTime.getTime()) / (1000 * 60));
      
      console.log(`  ${index + 1}. ${player.summoner_name} (ID: ${player.player_id})`);
      console.log(`     Posição: ${player.queue_position}, Tempo: ${timeInQueue}min`);
      console.log(`     Lane: ${player.primary_lane || 'fill'} / ${player.secondary_lane || 'fill'}`);
      console.log(`     MMR: ${player.custom_lp || 0}`);
    });
    
    // 2. Verificar jogadores disponíveis na tabela players
    console.log('\n👥 Jogadores disponíveis na tabela players:');
    const [availablePlayers] = await connection.execute(
      'SELECT id, summoner_name FROM players ORDER BY id ASC LIMIT 10'
    );
    
    console.log(`Jogadores disponíveis: ${availablePlayers.length}`);
    availablePlayers.forEach((player, index) => {
      console.log(`  ${index + 1}. ${player.summoner_name} (ID: ${player.id})`);
    });
    
    // Criar objeto testPlayer
    let testPlayer = {
      player_id: 999999,
      summoner_name: 'TestPlayer#1234',
      region: 'br1',
      custom_lp: 1500,
      primary_lane: 'mid',
      secondary_lane: 'top'
    };
    
    if (availablePlayers.length === 0) {
      console.log('⚠️ Nenhum jogador disponível na tabela players. Criando jogador de teste...');
      
      // Criar jogador de teste
      await connection.execute(
        `INSERT INTO players (
          summoner_name, summoner_id, puuid, region, current_mmr, peak_mmr, 
          games_played, wins, losses, win_streak, custom_lp
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          'TestPlayer#1234',
          'test123',
          'test-puuid-123',
          'br1',
          1500,
          1500,
          0,
          0,
          0,
          0,
          1500
        ]
      );
      
      const [newPlayer] = await connection.execute(
        'SELECT id FROM players WHERE summoner_name = ?',
        ['TestPlayer#1234']
      );
      
      if (newPlayer.length > 0) {
        console.log(`✅ Jogador de teste criado com ID: ${newPlayer[0].id}`);
        testPlayer.player_id = newPlayer[0].id;
      }
    } else {
      // Usar o primeiro jogador disponível
      testPlayer.player_id = availablePlayers[0].id;
      testPlayer.summoner_name = availablePlayers[0].summoner_name;
      console.log(`✅ Usando jogador existente: ${testPlayer.summoner_name} (ID: ${testPlayer.player_id})`);
    }
    
    // 3. Simular entrada de jogador na fila
    console.log('\n➕ Simulando entrada de jogador na fila...');
    
    // Verificar se já existe
    const [existing] = await connection.execute(
      'SELECT id FROM queue_players WHERE player_id = ? AND is_active = 1',
      [testPlayer.player_id]
    );
    
    if (existing.length === 0) {
      // Adicionar jogador de teste
      await connection.execute(
        `INSERT INTO queue_players (
          player_id, summoner_name, region, custom_lp, primary_lane, secondary_lane, queue_position
        ) VALUES (?, ?, ?, ?, ?, ?, (SELECT COALESCE(MAX(queue_position), 0) + 1 FROM queue_players qp WHERE is_active = 1))`,
        [
          testPlayer.player_id,
          testPlayer.summoner_name,
          testPlayer.region,
          testPlayer.custom_lp,
          testPlayer.primary_lane,
          testPlayer.secondary_lane
        ]
      );
      console.log('✅ Jogador de teste adicionado à fila');
    } else {
      console.log('⚠️ Jogador de teste já está na fila');
    }
    
    // 4. Verificar estado após adição
    console.log('\n📊 Estado após adição:');
    const [updatedPlayers] = await connection.execute(
      'SELECT * FROM queue_players WHERE is_active = 1 ORDER BY join_time ASC'
    );
    
    console.log(`Jogadores ativos na fila: ${updatedPlayers.length}`);
    updatedPlayers.forEach((player, index) => {
      const joinTime = new Date(player.join_time);
      const now = new Date();
      const timeInQueue = Math.floor((now.getTime() - joinTime.getTime()) / (1000 * 60));
      
      console.log(`  ${index + 1}. ${player.summoner_name} (ID: ${player.player_id})`);
      console.log(`     Posição: ${player.queue_position}, Tempo: ${timeInQueue}min`);
    });
    
    // 5. Simular remoção de jogador da fila
    console.log('\n➖ Simulando remoção de jogador da fila...');
    await connection.execute(
      'UPDATE queue_players SET is_active = 0 WHERE player_id = ?',
      [testPlayer.player_id]
    );
    console.log('✅ Jogador de teste removido da fila');
    
    // 6. Verificar estado após remoção
    console.log('\n📊 Estado após remoção:');
    const [finalPlayers] = await connection.execute(
      'SELECT * FROM queue_players WHERE is_active = 1 ORDER BY join_time ASC'
    );
    
    console.log(`Jogadores ativos na fila: ${finalPlayers.length}`);
    finalPlayers.forEach((player, index) => {
      const joinTime = new Date(player.join_time);
      const now = new Date();
      const timeInQueue = Math.floor((now.getTime() - joinTime.getTime()) / (1000 * 60));
      
      console.log(`  ${index + 1}. ${player.summoner_name} (ID: ${player.player_id})`);
      console.log(`     Posição: ${player.queue_position}, Tempo: ${timeInQueue}min`);
    });
    
    // 7. Verificar duplicatas
    console.log('\n🔍 Verificando duplicatas...');
    const [duplicates] = await connection.execute(`
      SELECT player_id, COUNT(*) as count 
      FROM queue_players 
      WHERE is_active = 1 
      GROUP BY player_id 
      HAVING COUNT(*) > 1
    `);
    
    if (duplicates.length > 0) {
      console.log('⚠️ Encontradas duplicatas:');
      duplicates.forEach(dup => {
        console.log(`  - Player ID ${dup.player_id}: ${dup.count} entradas`);
      });
    } else {
      console.log('✅ Nenhuma duplicata encontrada');
    }
    
    // 8. Verificar integridade das posições
    console.log('\n🔍 Verificando integridade das posições...');
    const [positionCheck] = await connection.execute(`
      SELECT queue_position, COUNT(*) as count
      FROM queue_players 
      WHERE is_active = 1 
      GROUP BY queue_position 
      HAVING COUNT(*) > 1
    `);
    
    if (positionCheck.length > 0) {
      console.log('⚠️ Posições duplicadas encontradas:');
      positionCheck.forEach(pos => {
        console.log(`  - Posição ${pos.queue_position}: ${pos.count} jogadores`);
      });
    } else {
      console.log('✅ Posições da fila estão corretas');
    }
    
    console.log('\n✅ Teste de sincronização MySQL concluído!');
    
  } catch (error) {
    console.error('❌ Erro no teste:', error);
  } finally {
    if (connection) {
      await connection.end();
      console.log('🔌 Conexão fechada');
    }
  }
}

// Executar teste
testQueueMySQLSync(); 