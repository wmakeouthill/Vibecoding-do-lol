require('dotenv').config();
const mysql = require('mysql2/promise');

async function clearQueue() {
  let connection;
  
  try {
    // Configuração do banco usando variáveis de ambiente
    connection = await mysql.createConnection({
      host: process.env.DB_HOST || 'localhost',
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || '',
      database: process.env.DB_NAME || 'lol_matchmaking'
    });

    console.log('🔍 Conectado ao banco de dados');

    // Verificar quantos jogadores estão na fila
    const [countResult] = await connection.execute('SELECT COUNT(*) as count FROM queue_players WHERE is_active = 1');
    const currentCount = countResult[0].count;
    
    console.log(`📊 Jogadores atualmente na fila: ${currentCount}`);

    if (currentCount > 0) {
      // Mostrar jogadores que serão removidos
      const [playersResult] = await connection.execute(`
        SELECT qp.*, p.summoner_name 
        FROM queue_players qp 
        LEFT JOIN players p ON qp.player_id = p.id 
        WHERE qp.is_active = 1
      `);
      
      console.log('🗑️ Jogadores que serão removidos:');
      playersResult.forEach((player, index) => {
        console.log(`${index + 1}. ID: ${player.player_id}, Nome: ${player.summoner_name || 'N/A'}, Entrada: ${player.join_time}`);
      });

      // Limpar a fila (marcar todos como inativos)
      const [updateResult] = await connection.execute('UPDATE queue_players SET is_active = 0');
      
      console.log(`✅ Fila limpa! ${updateResult.affectedRows} jogadores removidos da fila`);
      
      // Verificar se foi limpo
      const [verifyResult] = await connection.execute('SELECT COUNT(*) as count FROM queue_players WHERE is_active = 1');
      const remainingCount = verifyResult[0].count;
      
      console.log(`📊 Jogadores restantes na fila: ${remainingCount}`);
      
      if (remainingCount === 0) {
        console.log('🎉 Fila completamente limpa!');
      } else {
        console.log('⚠️ Ainda há jogadores na fila');
      }
    } else {
      console.log('✅ Fila já está vazia!');
    }

  } catch (error) {
    console.error('❌ Erro ao limpar fila:', error);
  } finally {
    if (connection) {
      await connection.end();
      console.log('🔌 Conexão fechada');
    }
  }
}

// Executar o script
clearQueue().then(() => {
  console.log('🏁 Script concluído');
  process.exit(0);
}).catch(error => {
  console.error('💥 Erro fatal:', error);
  process.exit(1);
}); 