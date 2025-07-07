/**
 * Script para testar diretamente a API de draft
 */

const fetch = require('node-fetch');

async function testDraftAPI() {
  console.log('🧪 [TestDraftAPI] === TESTE DIRETO DA API DE DRAFT ===');
  
  try {
    // Dados de teste
    const testData = {
      matchId: 587, // Usar um ID de partida existente
      playerId: 0,   // teamIndex 0 (primeiro jogador do time azul)
      championId: 266, // Aatrox
      action: 'pick'
    };
    
    const url = 'http://localhost:3000/api/match/draft-action';
    
    console.log('🧪 [TestDraftAPI] Fazendo POST para:', url);
    console.log('🧪 [TestDraftAPI] Dados:', JSON.stringify(testData, null, 2));
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify(testData)
    });
    
    const responseText = await response.text();
    
    console.log('🧪 [TestDraftAPI] Status:', response.status);
    console.log('🧪 [TestDraftAPI] StatusText:', response.statusText);
    console.log('🧪 [TestDraftAPI] Headers:', Object.fromEntries(response.headers.entries()));
    console.log('🧪 [TestDraftAPI] Response body:', responseText);
    
    if (response.ok) {
      console.log('✅ [TestDraftAPI] API funcionando corretamente!');
      try {
        const jsonResponse = JSON.parse(responseText);
        console.log('✅ [TestDraftAPI] Resposta JSON:', jsonResponse);
      } catch (parseError) {
        console.log('ℹ️ [TestDraftAPI] Resposta não é JSON válido');
      }
    } else {
      console.error('❌ [TestDraftAPI] API retornou erro:', response.status, response.statusText);
    }
    
  } catch (error) {
    console.error('❌ [TestDraftAPI] Erro na requisição:', error.message);
    console.error('❌ [TestDraftAPI] Stack:', error.stack);
  }
  
  console.log('🧪 [TestDraftAPI] === FIM DO TESTE ===');
}

// Executar teste
testDraftAPI();
