const mysql = require('mysql2/promise');

const dbConfig = {
  host: 'lolmatchmaking.mysql.uhserver.com',
  user: 'wmakeouthill',
  password: 'Angel1202@@',
  database: 'lolmatchmaking'
};

async function checkTables() {
  const connection = await mysql.createConnection(dbConfig);
  
  try {
    console.log('🔍 Verificando estrutura do banco...\n');
    
    // Listar todas as tabelas
    const [tables] = await connection.execute('SHOW TABLES');
    console.log('📊 Tabelas existentes:');
    tables.forEach(table => {
      console.log(`  - ${Object.values(table)[0]}`);
    });
    
    // Verificar se existe alguma tabela relacionada ao Discord
    const discordTables = tables.filter(table => 
      Object.values(table)[0].toLowerCase().includes('discord')
    );
    
    if (discordTables.length > 0) {
      console.log('\n🤖 Tabelas relacionadas ao Discord:');
      for (const table of discordTables) {
        const tableName = Object.values(table)[0];
        console.log(`\n📋 Estrutura da tabela ${tableName}:`);
        const [structure] = await connection.execute(`DESCRIBE ${tableName}`);
        structure.forEach(col => {
          console.log(`  ${col.Field} - ${col.Type} - ${col.Null} - ${col.Key}`);
        });
        
        // Mostrar alguns dados de exemplo
        const [data] = await connection.execute(`SELECT * FROM ${tableName} LIMIT 3`);
        if (data.length > 0) {
          console.log(`\n📝 Dados de exemplo:`);
          data.forEach((row, index) => {
            console.log(`  Linha ${index + 1}:`, row);
          });
        }
      }
    }
    
    // Verificar partida atual
    console.log('\n🎮 Dados da partida atual:');
    const [matches] = await connection.execute(`
      SELECT id, status, team1_players, team2_players, created_at, updated_at
      FROM custom_matches 
      WHERE id = 618
    `);
    
    if (matches.length > 0) {
      const match = matches[0];
      console.log('Match ID:', match.id);
      console.log('Status:', match.status);
      console.log('Team 1:', JSON.parse(match.team1_players));
      console.log('Team 2:', JSON.parse(match.team2_players));
      console.log('Created:', match.created_at);
      console.log('Updated:', match.updated_at);
    }
    
  } finally {
    await connection.end();
  }
}

checkTables().catch(console.error);
