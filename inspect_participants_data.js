const sqlite3 = require('sqlite3').verbose();
const os = require('os');
const path = require('path');

// Caminho do banco de dados
const dbPath = path.join(os.homedir(), 'AppData', 'Roaming', 'lol-matchmaking', 'matchmaking.db');
console.log('📁 Caminho do banco:', dbPath);

const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('❌ Erro ao conectar ao banco:', err);
    return;
  }
  console.log('✅ Conectado ao banco de dados');
});

// Verificar as duas últimas partidas customizadas
const query = `
  SELECT 
    id,
    title,
    status,
    winner_team,
    created_at,
    CASE 
      WHEN participants_data IS NULL THEN 'NULL'
      WHEN participants_data = '' THEN 'EMPTY'
      WHEN typeof(participants_data) = 'text' THEN 'TEXT'
      WHEN typeof(participants_data) = 'blob' THEN 'BLOB'
      ELSE 'OTHER: ' || typeof(participants_data)
    END as participants_data_type,
    CASE 
      WHEN pick_ban_data IS NULL THEN 'NULL'
      WHEN pick_ban_data = '' THEN 'EMPTY'
      WHEN typeof(pick_ban_data) = 'text' THEN 'TEXT'
      WHEN typeof(pick_ban_data) = 'blob' THEN 'BLOB'
      ELSE 'OTHER: ' || typeof(pick_ban_data)
    END as pick_ban_data_type,
    length(participants_data) as participants_data_length,
    length(pick_ban_data) as pick_ban_data_length,
    substr(participants_data, 1, 100) as participants_data_preview,
    substr(pick_ban_data, 1, 100) as pick_ban_data_preview
  FROM custom_matches 
  ORDER BY created_at DESC 
  LIMIT 2
`;

db.all(query, [], (err, rows) => {
  if (err) {
    console.error('❌ Erro na consulta:', err);
    return;
  }

  console.log('\n📊 Últimas 2 partidas customizadas:');
  console.log('=====================================');
  
  rows.forEach((row, index) => {
    console.log(`\n🎮 Partida ${index + 1}:`);
    console.log(`  ID: ${row.id}`);
    console.log(`  Título: ${row.title}`);
    console.log(`  Status: ${row.status}`);
    console.log(`  Vencedor: ${row.winner_team}`);
    console.log(`  Data: ${row.created_at}`);
    console.log(`  Participants Data Type: ${row.participants_data_type}`);
    console.log(`  Participants Data Length: ${row.participants_data_length}`);
    console.log(`  Pick Ban Data Type: ${row.pick_ban_data_type}`);
    console.log(`  Pick Ban Data Length: ${row.pick_ban_data_length}`);
    
    if (row.participants_data_preview) {
      console.log(`  Participants Preview: ${row.participants_data_preview}...`);
    }
    
    if (row.pick_ban_data_preview) {
      console.log(`  Pick Ban Preview: ${row.pick_ban_data_preview}...`);
    }
  });

  // Fechar o banco
  db.close((err) => {
    if (err) {
      console.error('❌ Erro ao fechar banco:', err);
    } else {
      console.log('\n✅ Conexão com banco fechada');
    }
  });
});
