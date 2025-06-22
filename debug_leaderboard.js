const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'src', 'backend', 'database', 'database.sqlite');
const db = new sqlite3.Database(dbPath);

console.log('🔍 Verificando dados das partidas customizadas...\n');

db.get('SELECT participants_data FROM custom_matches LIMIT 1', (err, row) => {
  if (err) {
    console.error('❌ Erro:', err);
    return;
  }
  
  if (row && row.participants_data) {
    const participants = JSON.parse(row.participants_data);
    console.log('👥 Amostra de participante:');
    console.log(JSON.stringify(participants[0], null, 2));
    
    // Verificar se profile_icon_id existe
    if (participants[0].profileIconId !== undefined) {
      console.log('\n✅ profileIconId encontrado:', participants[0].profileIconId);
    } else {
      console.log('\n❌ profileIconId não encontrado');
      console.log('Campos disponíveis:', Object.keys(participants[0]));
    }
  } else {
    console.log('❌ Nenhum dado encontrado');
  }
  
  db.close();
});
