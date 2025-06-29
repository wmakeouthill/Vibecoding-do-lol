const axios = require('axios');

// Teste da Data Dragon API
async function testDataDragon() {
  try {
    console.log('🔍 Testando Data Dragon API...');
    
    const url = 'https://ddragon.leagueoflegends.com/cdn/15.13.1/data/pt_BR/champion.json';
    const response = await axios.get(url);
    
    console.log('✅ Data Dragon API funcionando!');
    console.log(`📊 Total de campeões: ${Object.keys(response.data.data).length}`);
    
    // Testar alguns campeões específicos
    const testChampions = [
      { id: 266, expectedName: 'Aatrox' },
      { id: 103, expectedName: 'Ahri' },
      { id: 84, expectedName: 'Akali' },
      { id: 166, expectedName: 'Akshan' }
    ];
    
    const championIdToNameMap = {};
    Object.values(response.data.data).forEach(champion => {
      const championId = parseInt(champion.key);
      championIdToNameMap[championId] = champion.name;
    });
    
    console.log('\n🧪 Testando conversão de IDs:');
    testChampions.forEach(test => {
      const actualName = championIdToNameMap[test.id];
      const status = actualName === test.expectedName ? '✅' : '❌';
      console.log(`${status} ID ${test.id} -> ${actualName} (esperado: ${test.expectedName})`);
    });
    
    console.log('\n📋 Exemplo de dados de um campeão:');
    const aatrox = response.data.data.Aatrox;
    console.log(`Nome: ${aatrox.name}`);
    console.log(`ID: ${aatrox.key}`);
    console.log(`Título: ${aatrox.title}`);
    console.log(`Tags: ${aatrox.tags.join(', ')}`);
    console.log(`Imagem: ${aatrox.image.full}`);
    
  } catch (error) {
    console.error('❌ Erro ao testar Data Dragon:', error.message);
  }
}

// Executar teste
testDataDragon(); 