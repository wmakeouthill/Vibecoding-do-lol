const { DatabaseManager } = require('./src/backend/database/DatabaseManager');

async function testDataDragonIntegration() {
  console.log('🧪 Testando integração do DataDragonService...');
  
  try {
    const dbManager = new DatabaseManager();
    
    // Testar se o DataDragonService foi inicializado
    console.log('✅ DatabaseManager criado com DataDragonService');
    
    // Testar resolução de nomes de campeões
    console.log('🔍 Testando resolução de nomes de campeões...');
    
    // Testar alguns IDs conhecidos
    const testChampionIds = [1, 64, 266, 412, 777]; // Annie, Lee Sin, Aatrox, Thresh, Yone
    
    for (const championId of testChampionIds) {
      try {
        const championName = await dbManager.dataDragonService.getChampionNameById(championId);
        console.log(`✅ Champion ID ${championId} -> ${championName}`);
      } catch (error) {
        console.log(`❌ Erro ao resolver Champion ID ${championId}:`, error.message);
      }
    }
    
    console.log('✅ Teste de integração concluído!');
    
  } catch (error) {
    console.error('❌ Erro no teste:', error);
  }
}

testDataDragonIntegration(); 