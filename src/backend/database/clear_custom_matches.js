// Script para deletar todos os dados da tabela custom_matches do database.sqlite
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const mysql = require('mysql2/promise');

// Caminho do banco de dados (ajuste se necessário)
const dbPath = path.join(__dirname, 'database.sqlite');

const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Erro ao abrir o banco:', err.message);
    process.exit(1);
  }
});

db.serialize(() => {
  db.run('DELETE FROM custom_matches;', function(err) {
    if (err) {
      console.error('Erro ao deletar dados:', err.message);
    } else {
      console.log('Todos os dados da tabela custom_matches foram removidos.');
    }
  });
});

db.close();

// Configuração do banco de dados
const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '3306'),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'lol_matchmaking',
  ssl: {
    rejectUnauthorized: false
  }
};

async function clearCorruptedQueueData() {
  let connection;
  
  try {
    console.log('🔧 Conectando ao banco de dados...');
    connection = await mysql.createConnection(dbConfig);
    
    console.log('✅ Conectado ao banco de dados');
    
    // Verificar dados corrompidos na fila
    const [queuePlayers] = await connection.execute(`
      SELECT * FROM queue_players 
      WHERE is_active = 1
    `);
    
    console.log(`📊 Encontrados ${queuePlayers.length} jogadores na fila`);
    
    const now = new Date();
    const corruptedPlayers = [];
    
    for (const player of queuePlayers) {
      const joinTime = new Date(player.join_time);
      const timeInQueue = now.getTime() - joinTime.getTime();
      const timeInQueueMinutes = Math.floor(timeInQueue / (1000 * 60));
      
      // Verificar se os dados estão corrompidos
      if (timeInQueue < 0 || timeInQueue > (3 * 60 * 60 * 1000)) {
        corruptedPlayers.push({
          id: player.id,
          player_id: player.player_id,
          summoner_name: player.summoner_name,
          join_time: player.join_time,
          timeInQueueMinutes: timeInQueueMinutes,
          reason: timeInQueue < 0 ? 'Tempo negativo' : 'Muito antigo'
        });
      }
    }
    
    if (corruptedPlayers.length === 0) {
      console.log('✅ Nenhum dado corrompido encontrado na fila');
      return;
    }
    
    console.log(`⚠️ Encontrados ${corruptedPlayers.length} jogadores com dados corrompidos:`);
    corruptedPlayers.forEach(player => {
      console.log(`   - ${player.summoner_name}: ${player.timeInQueueMinutes}min (${player.reason})`);
    });
    
    // Perguntar se deve limpar
    console.log('\n🧹 Deseja remover esses jogadores da fila? (s/n)');
    
    // Para execução automática, vamos limpar diretamente
    console.log('🔄 Removendo jogadores com dados corrompidos...');
    
    for (const player of corruptedPlayers) {
      await connection.execute(
        'UPDATE queue_players SET is_active = 0 WHERE id = ?',
        [player.id]
      );
      console.log(`✅ Removido: ${player.summoner_name}`);
    }
    
    console.log(`✅ Limpeza concluída: ${corruptedPlayers.length} jogadores removidos`);
    
  } catch (error) {
    console.error('❌ Erro:', error);
  } finally {
    if (connection) {
      await connection.end();
      console.log('🔌 Conexão fechada');
    }
  }
}

// Executar se chamado diretamente
if (require.main === module) {
  clearCorruptedQueueData();
}

module.exports = { clearCorruptedQueueData };
