const http = require('http');

// Função para fazer requisições HTTP
function makeRequest(method, path, data = null) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'localhost',
      port: 3000,
      path: `/api${path}`,
      method: method,
      headers: {
        'Content-Type': 'application/json'
      }
    };

    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          const response = JSON.parse(body);
          resolve({ status: res.statusCode, data: response });
        } catch (error) {
          resolve({ status: res.statusCode, data: body });
        }
      });
    });

    req.on('error', reject);

    if (data) {
      req.write(JSON.stringify(data));
    }
    req.end();
  });
}

async function testSimulateFlow() {
  console.log('🧪 Testando fluxo de simulação...\n');

  try {
    // 1. Verificar se o servidor está rodando
    console.log('1️⃣ Verificando status do servidor...');
    const healthCheck = await makeRequest('GET', '/health');
    if (healthCheck.status !== 200) {
      console.error('❌ Servidor não está rodando. Status:', healthCheck.status);
      return;
    }
    console.log('✅ Servidor está online\n');    // 2. Buscar última partida customizada
    const playerIdForSearch = 'Let me Reset#KAT';
    console.log(`2️⃣ Buscando última partida customizada para: ${playerIdForSearch}`);
    
    const searchResult = await makeRequest('GET', `/matches/custom/${encodeURIComponent(playerIdForSearch)}?offset=0&limit=1`);
    console.log('Status da busca:', searchResult.status);
    console.log('Dados da busca:', searchResult.data);
      if (searchResult.status === 200 && searchResult.data.matches && searchResult.data.matches.length > 0) {
      const lastMatch = searchResult.data.matches[0];
      console.log('✅ Partida encontrada:', {
        id: lastMatch.id,
        matchId: lastMatch.match_id, // Corrigido: era matchId, agora é match_id
        title: lastMatch.title,
        hasParticipants: lastMatch.participants_data ? lastMatch.participants_data.length : 0,
        hasPickBan: lastMatch.pick_ban_data ? Object.keys(lastMatch.pick_ban_data).length : 0
      });

      // 3. Testar simulação baseada em dados existentes
      console.log('\n3️⃣ Testando simulação baseada em dados existentes...');
      
      const simulateResult = await makeRequest('POST', '/test/simulate-from-existing-match', {
        existingMatchData: lastMatch,
        playerIdentifier: playerIdForSearch
      });
        console.log('Status da simulação:', simulateResult.status);
      if (simulateResult.status === 200) {
        console.log('✅ Simulação criada com sucesso!');
        console.log('Resposta da simulação:', {
          newMatchId: simulateResult.data.newMatchId,
          originalMatchId: simulateResult.data.originalMatchId,
          hasCompleteData: simulateResult.data.hasCompleteData,
          message: simulateResult.data.message
        });
      } else {
        console.error('❌ Erro na simulação:', simulateResult.data);
      }

    } else if (searchResult.status === 404) {
      console.log('⚠️ Nenhuma partida encontrada - isso é o comportamento esperado quando não há partidas');
      console.log('💡 O frontend deve mostrar mensagem informativa ao usuário');
    } else {
      console.error('❌ Erro inesperado ao buscar partida:', searchResult);
    }

  } catch (error) {
    console.error('💥 Erro durante o teste:', error.message);
  }
}

// Executar teste
testSimulateFlow();
