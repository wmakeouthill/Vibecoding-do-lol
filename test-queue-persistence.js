const mysql = require('mysql2/promise');

// Configuração do banco de dados (usando as configurações do .env)
const dbConfig = {
  host: 'lolmatchmaking.mysql.uhserver.com',
  port: 3306,
  user: 'wmakeouthill',
  password: 'Angel1202@@',
  database: 'lolmatchmaking'
};

async function testQueuePersistence() {
  let connection;
  
  try {
    console.log('🧪 Testando persistência da fila...');
    console.log('🔗 Conectando ao banco:', dbConfig.host);
    
    connection = await mysql.createConnection(dbConfig);
    console.log('✅ Conectado ao banco de dados');
    
    // 1. Verificar estrutura da tabela
    console.log('\n📋 Verificando estrutura da tabela queue_players...');
    const [columns] = await connection.execute('DESCRIBE queue_players');
    console.log('Colunas da tabela:');
    columns.forEach(col => {
      console.log(`  - ${col.Field}: ${col.Type} ${col.Null === 'YES' ? 'NULL' : 'NOT NULL'}`);
    });
    
    // 2. Verificar todas as colunas disponíveis
    console.log('\n🔍 Verificando todas as colunas da tabela...');
    const [allColumns] = await connection.execute('SHOW COLUMNS FROM queue_players');
    const columnNames = allColumns.map(col => col.Field);
    console.log('Colunas disponíveis:', columnNames.join(', '));
    
    // 3. Verificar jogadores ativos na fila
    console.log('\n👥 Verificando jogadores ativos na fila...');
    const [activePlayers] = await connection.execute(
      'SELECT * FROM queue_players WHERE is_active = 1'
    );
    
    console.log(`Encontrados ${activePlayers.length} jogadores ativos na fila:`);
    activePlayers.forEach(player => {
      console.log(`  - ${player.summoner_name} (ID: ${player.player_id})`);
      console.log(`    Lane: ${player.primary_lane || 'fill'} / ${player.secondary_lane || 'fill'}`);
      console.log(`    MMR: ${player.custom_lp || 0}`);
      console.log(`    Região: ${player.region}`);
    });
    
    // 4. Verificar duplicatas
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
    
    // 5. Verificar dados corrompidos (se houver coluna de timestamp)
    if (columnNames.includes('join_time') || columnNames.includes('created_at')) {
      const timeColumn = columnNames.includes('join_time') ? 'join_time' : 'created_at';
      console.log(`\n🔍 Verificando dados corrompidos (coluna: ${timeColumn})...`);
      
      const [corrupted] = await connection.execute(`
        SELECT * FROM queue_players 
        WHERE is_active = 1 
        AND (${timeColumn} > NOW() OR ${timeColumn} < DATE_SUB(NOW(), INTERVAL 6 HOUR))
      `);
      
      if (corrupted.length > 0) {
        console.log('⚠️ Encontrados dados corrompidos:');
        corrupted.forEach(player => {
          console.log(`  - ${player.summoner_name}: ${timeColumn} = ${player[timeColumn]}`);
        });
      } else {
        console.log('✅ Nenhum dado corrompido encontrado');
      }
    }
    
    // 6. Estatísticas gerais
    console.log('\n📊 Estatísticas da fila:');
    const [stats] = await connection.execute(`
      SELECT 
        COUNT(*) as total_active,
        COUNT(DISTINCT player_id) as unique_players,
        AVG(custom_lp) as avg_mmr
      FROM queue_players 
      WHERE is_active = 1
    `);
    
    const stat = stats[0];
    console.log(`  - Total de entradas ativas: ${stat.total_active}`);
    console.log(`  - Jogadores únicos: ${stat.unique_players}`);
    console.log(`  - MMR médio: ${Math.round(stat.avg_mmr || 0)}`);
    
    // 7. Verificar histórico total
    console.log('\n📈 Histórico total da tabela:');
    const [totalStats] = await connection.execute(`
      SELECT 
        COUNT(*) as total_records,
        COUNT(DISTINCT player_id) as total_unique_players
      FROM queue_players
    `);
    
    const totalStat = totalStats[0];
    console.log(`  - Total de registros na tabela: ${totalStat.total_records}`);
    console.log(`  - Total de jogadores únicos: ${totalStat.total_unique_players}`);
    
    console.log('\n✅ Teste de persistência concluído!');
    
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
testQueuePersistence(); 