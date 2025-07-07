const mysql = require('mysql2/promise');

async function checkQueue() {
  const conn = await mysql.createConnection({
    host: 'lolmatchmaking.mysql.uhserver.com', 
    user: 'wmakeouthill', 
    password: 'Angel1202@@', 
    database: 'lolmatchmaking'
  });
  
  const [rows] = await conn.execute('SELECT summoner_name, is_active FROM queue_players ORDER BY join_time DESC LIMIT 10');
  console.log('Jogadores recentes na fila MySQL:');
  rows.forEach(r => console.log(`- ${r.summoner_name} (ativo: ${r.is_active})`));
  
  const [count] = await conn.execute('SELECT COUNT(*) as total FROM queue_players WHERE is_active = 1');
  console.log(`Total de jogadores ativos: ${count[0].total}`);
  
  await conn.end();
}

checkQueue().catch(console.error);
