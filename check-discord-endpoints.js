const axios = require('axios');

async function checkDiscordEndpoints() {
  console.log('🔍 Verificando endpoints Discord disponíveis...\n');
  
  const endpoints = [
    'status',
    'channels', 
    'create-match-channels',
    'move-players',
    'test',
    'users',
    'guilds'
  ];
  
  for (const endpoint of endpoints) {
    try {
      const response = await axios.get(`http://localhost:3000/api/discord/${endpoint}`);
      console.log(`✅ GET /api/discord/${endpoint} - Status: ${response.status}`);
      console.log(`   Resposta:`, response.data);
    } catch (error) {
      if (error.response) {
        console.log(`❌ GET /api/discord/${endpoint} - Status: ${error.response.status}`);
      } else {
        console.log(`❌ GET /api/discord/${endpoint} - Erro: ${error.message}`);
      }
    }
    console.log('');
  }
}

checkDiscordEndpoints().catch(console.error);
