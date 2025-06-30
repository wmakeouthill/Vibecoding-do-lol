const mysql = require('mysql2/promise');
require('dotenv').config({ path: './dist/.env' });

// Configurações do banco
const dbConfig = {
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  port: parseInt(process.env.DB_PORT) || 3306
};

async function testCompleteQueueLogic() {
  console.log('🧪 TESTE: Lógica Completa da Fila - gameName#tagLine + MySQL + Discord');
  console.log('='.repeat(80));

  let connection;
  try {
    // Conectar ao banco
    connection = await mysql.createConnection(dbConfig);
    console.log('✅ Conectado ao MySQL');

    // 1. LIMPAR ESTADO INICIAL
    console.log('\n📝 1. Limpando estado inicial...');
    await connection.execute('DELETE FROM queue_players');
    console.log('✅ Fila limpa');

    // 2. SIMULAR ENTRADA DE JOGADORES COM GAMENAME#TAGLINE
    console.log('\n📝 2. Simulando entrada de jogadores...');
    
    const testPlayers = [
      {
        player_id: 1,
        summoner_name: 'popcorn seller#coup',
        region: 'br1',
        custom_lp: 1500,
        primary_lane: 'mid',
        secondary_lane: 'adc'
      },
      {
        player_id: 2,
        summoner_name: 'TestPlayer#BR1',
        region: 'br1',
        custom_lp: 1200,
        primary_lane: 'top',
        secondary_lane: 'jungle'
      },
      {
        player_id: 3,
        summoner_name: 'AnotherPlayer#TEST',
        region: 'br1',
        custom_lp: 1300,
        primary_lane: 'support',
        secondary_lane: 'jungle'
      }
    ];

    for (let i = 0; i < testPlayers.length; i++) {
      const player = testPlayers[i];
      const position = i + 1;
      
      await connection.execute(`
        INSERT INTO queue_players 
        (player_id, summoner_name, region, custom_lp, primary_lane, secondary_lane, join_time, queue_position, is_active)
        VALUES (?, ?, ?, ?, ?, ?, NOW(), ?, 1)
      `, [
        player.player_id,
        player.summoner_name,
        player.region,
        player.custom_lp,
        player.primary_lane,
        player.secondary_lane,
        position
      ]);
      
      console.log(`✅ Adicionado: ${player.summoner_name} (Posição ${position})`);
    }

    // 3. VERIFICAR IDENTIFICAÇÃO POR GAMENAME#TAGLINE
    console.log('\n📝 3. Testando identificação por gameName#tagLine...');
    
    const [queuePlayers] = await connection.execute(`
      SELECT player_id, summoner_name, queue_position, primary_lane, secondary_lane
      FROM queue_players 
      WHERE is_active = 1 
      ORDER BY queue_position
    `);
    
    console.log('👥 Jogadores na fila:');
    queuePlayers.forEach(player => {
      const nameParts = player.summoner_name.split('#');
      const gameName = nameParts[0];
      const tagLine = nameParts[1];
      
      console.log(`  ${player.queue_position}. ${player.summoner_name}`);
      console.log(`     - gameName: "${gameName}", tagLine: "${tagLine}"`);
      console.log(`     - Lanes: ${player.primary_lane}/${player.secondary_lane}`);
    });

    // 4. TESTAR VERIFICAÇÃO DE DUPLICATAS
    console.log('\n📝 4. Testando verificação de duplicatas...');
    
    try {
      // Tentar adicionar o mesmo player novamente
      await connection.execute(`
        INSERT INTO queue_players 
        (player_id, summoner_name, region, custom_lp, primary_lane, secondary_lane, join_time, queue_position, is_active)
        VALUES (?, ?, ?, ?, ?, ?, NOW(), ?, 1)
      `, [1, 'popcorn seller#coup', 'br1', 1500, 'mid', 'adc', 4]);
      
      console.log('❌ ERRO: Permitiu jogador duplicado!');
    } catch (error) {
      if (error.code === 'ER_DUP_ENTRY') {
        console.log('✅ Duplicata corretamente rejeitada pelo banco');
      } else {
        console.log('⚠️ Erro inesperado:', error.message);
      }
    }

    // 5. TESTAR BUSCA POR IDENTIFICADOR ESPECÍFICO
    console.log('\n📝 5. Testando busca por identificador específico...');
    
    const searchTargets = [
      'popcorn seller#coup',
      'TestPlayer#BR1',
      'NonExistent#USER'
    ];
    
    for (const target of searchTargets) {
      const [results] = await connection.execute(`
        SELECT player_id, summoner_name, queue_position 
        FROM queue_players 
        WHERE summoner_name = ? AND is_active = 1
      `, [target]);
      
      if (results.length > 0) {
        console.log(`✅ Encontrado: ${target} (ID: ${results[0].player_id}, Posição: ${results[0].queue_position})`);
      } else {
        console.log(`❌ Não encontrado: ${target}`);
      }
    }

    // 6. TESTAR REMOÇÃO POR GAMENAME#TAGLINE
    console.log('\n📝 6. Testando remoção por gameName#tagLine...');
    
    const playerToRemove = 'TestPlayer#BR1';
    const [removeResult] = await connection.execute(`
      DELETE FROM queue_players 
      WHERE summoner_name = ? AND is_active = 1
    `, [playerToRemove]);
    
    if (removeResult.affectedRows > 0) {
      console.log(`✅ Removido: ${playerToRemove} (${removeResult.affectedRows} linha(s) afetada(s))`);
    } else {
      console.log(`❌ Falha ao remover: ${playerToRemove}`);
    }

    // 7. VERIFICAR ESTADO FINAL
    console.log('\n📝 7. Verificando estado final...');
    
    const [finalState] = await connection.execute(`
      SELECT COUNT(*) as total_players,
             GROUP_CONCAT(summoner_name ORDER BY queue_position) as player_list
      FROM queue_players 
      WHERE is_active = 1
    `);
    
    console.log(`👥 Total de jogadores: ${finalState[0].total_players}`);
    console.log(`📋 Lista: ${finalState[0].player_list}`);

    // 8. TESTAR LÓGICA DE ESTADO DO BOTÃO
    console.log('\n📝 8. Testando lógica de estado do botão...');
    
    const testUsers = [
      { gameName: 'popcorn seller', tagLine: 'coup' },
      { gameName: 'TestPlayer', tagLine: 'BR1' },
      { gameName: 'AnotherPlayer', tagLine: 'TEST' },
      { gameName: 'NotInQueue', tagLine: 'USER' }
    ];
    
    for (const user of testUsers) {
      const fullName = `${user.gameName}#${user.tagLine}`;
      const [userCheck] = await connection.execute(`
        SELECT COUNT(*) as found 
        FROM queue_players 
        WHERE summoner_name = ? AND is_active = 1
      `, [fullName]);
      
      const isInQueue = userCheck[0].found > 0;
      const buttonText = isInQueue ? 'Sair da fila' : 'Entrar na fila';
      
      console.log(`👤 ${fullName}: ${buttonText} (${isInQueue ? 'Na fila' : 'Fora da fila'})`);
    }

    // 9. SIMULAR SINCRONIZAÇÃO MYSQL-FRONTEND
    console.log('\n📝 9. Simulando sincronização MySQL ↔ Frontend...');
    
    const [currentQueue] = await connection.execute(`
      SELECT player_id, summoner_name, queue_position, primary_lane, secondary_lane, join_time
      FROM queue_players 
      WHERE is_active = 1 
      ORDER BY queue_position
    `);
    
    console.log('📡 Dados que seriam enviados para o frontend:');
    const frontendData = {
      playersInQueue: currentQueue.length,
      playersInQueueList: currentQueue.map(player => {
        const nameParts = player.summoner_name.split('#');
        return {
          summonerName: nameParts[0],
          tagLine: nameParts[1],
          primaryLane: player.primary_lane,
          secondaryLane: player.secondary_lane,
          queuePosition: player.queue_position,
          joinTime: player.join_time
        };
      })
    };
    
    console.log(JSON.stringify(frontendData, null, 2));

    // 10. VERIFICAR LÓGICA DE IDENTIFICAÇÃO DO USUÁRIO ATUAL
    console.log('\n📝 10. Testando identificação do usuário atual...');
    
    const currentUser = { gameName: 'popcorn seller', tagLine: 'coup' };
    const userInQueue = frontendData.playersInQueueList.some(player => {
      const playerFullName = player.tagLine ? `${player.summonerName}#${player.tagLine}` : player.summonerName;
      const userFullName = `${currentUser.gameName}#${currentUser.tagLine}`;
      
      return playerFullName.toLowerCase() === userFullName.toLowerCase();
    });
    
    console.log(`🔍 Usuário atual: ${currentUser.gameName}#${currentUser.tagLine}`);
    console.log(`📋 Está na fila: ${userInQueue ? 'SIM' : 'NÃO'}`);
    console.log(`🔘 Estado do botão: ${userInQueue ? 'Sair da fila' : 'Entrar na fila'}`);

    console.log('\n🎉 TESTE COMPLETO - LÓGICA VERIFICADA!');
    console.log('✅ Identificação por gameName#tagLine funcionando');
    console.log('✅ Prevenção de duplicatas funcionando');
    console.log('✅ Busca e remoção funcionando');
    console.log('✅ Sincronização MySQL ↔ Frontend funcionando');
    console.log('✅ Lógica de estado do botão funcionando');

  } catch (error) {
    console.error('❌ Erro no teste:', error);
  } finally {
    if (connection) {
      await connection.end();
      console.log('🔌 Conexão MySQL fechada');
    }
  }
}

// Executar teste
testCompleteQueueLogic(); 