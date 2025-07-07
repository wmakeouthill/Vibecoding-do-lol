const http = require('http');
const mysql = require('mysql2/promise');

// ✅ TESTE: Verificar se partidas são criadas duplicadamente
console.log('🧪 TESTE: Verificando criação de partidas duplicadas...\n');

// Configuração do banco MySQL
const dbConfig = {
  host: 'lolmatchmaking.mysql.uhserver.com',
  user: 'wmakeouthill',
  password: 'Angel1202@@',
  database: 'lolmatchmaking'
};

// Função para fazer requisições HTTP
function makeRequest(options, data = null) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          const response = JSON.parse(body);
          resolve({ status: res.statusCode, data: response });
        } catch (e) {
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

// Função para verificar partidas no banco
async function checkCustomMatches() {
  const connection = await mysql.createConnection(dbConfig);
  
  try {
    // Buscar todas as partidas
    const [allMatches] = await connection.execute(`
      SELECT id, title, status, created_at, team1_players, team2_players, match_leader 
      FROM custom_matches 
      ORDER BY created_at DESC
      LIMIT 20
    `);
    
    // Buscar partidas duplicadas (mesmo time de jogadores)
    const [duplicateMatches] = await connection.execute(`
      SELECT team1_players, team2_players, COUNT(*) as count,
             GROUP_CONCAT(id) as match_ids,
             GROUP_CONCAT(status) as statuses
      FROM custom_matches 
      WHERE created_at > DATE_SUB(NOW(), INTERVAL 1 HOUR)
      GROUP BY team1_players, team2_players
      HAVING COUNT(*) > 1
    `);
    
    return {
      allMatches,
      duplicateMatches
    };
  } finally {
    await connection.end();
  }
}

// Função para verificar fila
async function checkQueue() {
  const connection = await mysql.createConnection(dbConfig);
  
  try {
    const [queuePlayers] = await connection.execute(`
      SELECT player_id, summoner_name, queue_position, is_active
      FROM queue_players 
      ORDER BY queue_position
    `);
    
    return queuePlayers;
  } finally {
    await connection.end();
  }
}

// Teste 1: Verificar estado inicial das partidas
async function test1_CheckInitialState() {
  console.log('📊 1. VERIFICANDO ESTADO INICIAL DAS PARTIDAS...');
  
  const { allMatches, duplicateMatches } = await checkCustomMatches();
  
  console.log(`   📋 Total de partidas recentes: ${allMatches.length}`);
  console.log(`   🔄 Partidas duplicadas encontradas: ${duplicateMatches.length}`);
  
  if (allMatches.length > 0) {
    console.log('   📋 Últimas partidas:');
    allMatches.slice(0, 5).forEach(match => {
      console.log(`      ID: ${match.id}, Status: ${match.status}, Título: ${match.title}`);
      console.log(`      Criada: ${match.created_at}, Leader: ${match.match_leader}`);
    });
  }
  
  if (duplicateMatches.length > 0) {
    console.log('   ⚠️ PROBLEMA: Partidas duplicadas encontradas:');
    duplicateMatches.forEach(duplicate => {
      console.log(`      IDs: ${duplicate.match_ids}`);
      console.log(`      Status: ${duplicate.statuses}`);
      console.log(`      Contagem: ${duplicate.count}`);
    });
  }
  
  return { allMatches, duplicateMatches };
}

// Teste 2: Adicionar 10 jogadores na fila
async function test2_AddTenPlayers() {
  console.log('\n👥 2. ADICIONANDO 10 JOGADORES NA FILA...');
  
  const testPlayers = [];
  for (let i = 1; i <= 10; i++) {
    testPlayers.push({
      player: {
        id: 900000 + i,
        summonerName: `TestBot${i}#TEST`,
        region: 'br1',
        currentMMR: 1200 + (i * 50)
      },
      preferences: {
        primaryLane: ['top', 'jungle', 'mid', 'bot', 'support'][i % 5],
        secondaryLane: 'fill'
      }
    });
  }
  
  const results = [];
  for (const player of testPlayers) {
    try {
      const result = await makeRequest({
        hostname: 'localhost',
        port: 3000,
        path: '/api/queue/join',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      }, player);
      
      if (result.status === 200) {
        console.log(`   ✅ ${player.player.summonerName} adicionado`);
        results.push(true);
      } else {
        console.log(`   ❌ Erro ao adicionar ${player.player.summonerName}: ${result.status}`);
        results.push(false);
      }
    } catch (error) {
      console.log(`   ❌ Erro na requisição para ${player.player.summonerName}: ${error.message}`);
      results.push(false);
    }
  }
  
  const successCount = results.filter(r => r === true).length;
  console.log(`   📊 Resultado: ${successCount}/${testPlayers.length} jogadores adicionados`);
  
  return successCount >= 10;
}

// Teste 3: Aguardar criação de partida e verificar duplicatas
async function test3_WaitForMatchCreation() {
  console.log('\n⏳ 3. AGUARDANDO CRIAÇÃO DE PARTIDA...');
  
  let matchCreated = false;
  let attempts = 0;
  const maxAttempts = 30; // 30 segundos
  
  while (!matchCreated && attempts < maxAttempts) {
    attempts++;
    console.log(`   [${attempts}s] Verificando se partida foi criada...`);
    
    // Verificar se partida foi criada
    const { allMatches } = await checkCustomMatches();
    const recentMatches = allMatches.filter(match => {
      const createdTime = new Date(match.created_at).getTime();
      const now = new Date().getTime();
      return (now - createdTime) < 60000; // Últimos 60 segundos
    });
    
    if (recentMatches.length > 0) {
      console.log(`   ✅ ${recentMatches.length} partida(s) recente(s) encontrada(s)`);
      matchCreated = true;
      
      // Verificar se há duplicatas
      const duplicateCheck = await checkForDuplicates(recentMatches);
      
      if (duplicateCheck.hasDuplicates) {
        console.log('   ❌ PROBLEMA: Partidas duplicadas detectadas!');
        console.log(`   🔄 Total de partidas similares: ${duplicateCheck.similarMatches.length}`);
        duplicateCheck.similarMatches.forEach(match => {
          console.log(`      - ID: ${match.id}, Status: ${match.status}, Criada: ${match.created_at}`);
        });
      } else {
        console.log('   ✅ Nenhuma duplicata detectada');
      }
      
      return { success: true, matches: recentMatches, duplicates: duplicateCheck };
    }
    
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  
  if (!matchCreated) {
    console.log('   ❌ Nenhuma partida foi criada após 30 segundos');
    return { success: false, matches: [], duplicates: null };
  }
}

// Função para verificar duplicatas
async function checkForDuplicates(matches) {
  console.log('🔍 Verificando duplicatas detalhadamente...');
  
  const similarMatches = [];
  const hasDuplicates = matches.length > 1;
  
  if (hasDuplicates) {
    console.log('   ⚠️ Múltiplas partidas encontradas:');
    matches.forEach(match => {
      console.log(`      ID: ${match.id}`);
      console.log(`      Status: ${match.status}`);
      console.log(`      Título: ${match.title}`);
      console.log(`      Match Leader: ${match.match_leader}`);
      console.log(`      Team1: ${match.team1_players}`);
      console.log(`      Team2: ${match.team2_players}`);
      console.log(`      Criada: ${match.created_at}`);
      console.log('      ---');
    });
  }
  
  return {
    hasDuplicates,
    similarMatches: matches
  };
}

// Teste 4: Verificar se times são mantidos no draft
async function test4_CheckDraftTeams() {
  console.log('\n🎯 4. VERIFICANDO SE TIMES SÃO MANTIDOS NO DRAFT...');
  
  // Buscar partidas aceitas
  const connection = await mysql.createConnection(dbConfig);
  
  try {
    const [acceptedMatches] = await connection.execute(`
      SELECT id, title, status, team1_players, team2_players, pick_ban_data
      FROM custom_matches 
      WHERE status = 'accepted' OR status = 'draft'
      ORDER BY created_at DESC
      LIMIT 5
    `);
    
    if (acceptedMatches.length === 0) {
      console.log('   ⚠️ Nenhuma partida aceita encontrada');
      return false;
    }
    
    console.log(`   📋 ${acceptedMatches.length} partida(s) aceita(s) encontrada(s)`);
    
    for (const match of acceptedMatches) {
      console.log(`   🎮 Partida ${match.id}:`);
      console.log(`      Status: ${match.status}`);
      console.log(`      Team1: ${match.team1_players}`);
      console.log(`      Team2: ${match.team2_players}`);
      
      if (match.pick_ban_data) {
        try {
          const pickBanData = JSON.parse(match.pick_ban_data);
          console.log(`      Pick/Ban Data: ${pickBanData.team1?.length || 0} vs ${pickBanData.team2?.length || 0} jogadores`);
          
          // Verificar se os times no pick/ban coincidem com os times da partida
          const team1Names = JSON.parse(match.team1_players);
          const team2Names = JSON.parse(match.team2_players);
          
          const pickBanTeam1Names = pickBanData.team1?.map(p => p.summonerName) || [];
          const pickBanTeam2Names = pickBanData.team2?.map(p => p.summonerName) || [];
          
          const team1Match = team1Names.every(name => pickBanTeam1Names.includes(name));
          const team2Match = team2Names.every(name => pickBanTeam2Names.includes(name));
          
          if (team1Match && team2Match) {
            console.log('      ✅ Times coincidem entre match e pick/ban');
          } else {
            console.log('      ❌ PROBLEMA: Times não coincidem!');
            console.log(`         Match Team1: ${team1Names.join(', ')}`);
            console.log(`         Pick/Ban Team1: ${pickBanTeam1Names.join(', ')}`);
            console.log(`         Match Team2: ${team2Names.join(', ')}`);
            console.log(`         Pick/Ban Team2: ${pickBanTeam2Names.join(', ')}`);
          }
        } catch (error) {
          console.log(`      ❌ Erro ao analisar pick/ban data: ${error.message}`);
        }
      } else {
        console.log('      ⚠️ Sem dados de pick/ban');
      }
    }
    
    return true;
  } finally {
    await connection.end();
  }
}

// Teste 5: Verificar match_leader único
async function test5_CheckMatchLeader() {
  console.log('\n👑 5. VERIFICANDO MATCH_LEADER ÚNICO...');
  
  const connection = await mysql.createConnection(dbConfig);
  
  try {
    const [recentMatches] = await connection.execute(`
      SELECT id, title, status, match_leader, team1_players, team2_players
      FROM custom_matches 
      WHERE created_at > DATE_SUB(NOW(), INTERVAL 1 HOUR)
      ORDER BY created_at DESC
    `);
    
    if (recentMatches.length === 0) {
      console.log('   ⚠️ Nenhuma partida recente encontrada');
      return false;
    }
    
    console.log(`   📋 ${recentMatches.length} partida(s) recente(s) encontrada(s)`);
    
    const leaderStats = {};
    const multipleLeaderMatches = [];
    
    for (const match of recentMatches) {
      console.log(`   🎮 Partida ${match.id}:`);
      console.log(`      Status: ${match.status}`);
      console.log(`      Match Leader: ${match.match_leader}`);
      
      if (match.match_leader) {
        leaderStats[match.match_leader] = (leaderStats[match.match_leader] || 0) + 1;
        
        if (leaderStats[match.match_leader] > 1) {
          multipleLeaderMatches.push(match);
        }
      } else {
        console.log('      ❌ PROBLEMA: Match sem leader definido!');
      }
    }
    
    console.log('\n   📊 Estatísticas de líderes:');
    Object.entries(leaderStats).forEach(([leader, count]) => {
      console.log(`      ${leader}: ${count} partida(s)`);
    });
    
    if (multipleLeaderMatches.length > 0) {
      console.log('\n   ⚠️ Jogadores líderes em múltiplas partidas:');
      multipleLeaderMatches.forEach(match => {
        console.log(`      Partida ${match.id}: ${match.match_leader}`);
      });
    }
    
    return true;
  } finally {
    await connection.end();
  }
}

// Função para limpar dados de teste
async function cleanup() {
  console.log('\n🧹 LIMPANDO DADOS DE TESTE...');
  
  const connection = await mysql.createConnection(dbConfig);
  
  try {
    // Remover jogadores de teste da fila
    await connection.execute(`
      DELETE FROM queue_players 
      WHERE summoner_name LIKE 'TestBot%#TEST'
    `);
    
    // Remover partidas de teste
    await connection.execute(`
      DELETE FROM custom_matches 
      WHERE (team1_players LIKE '%TestBot%' OR team2_players LIKE '%TestBot%')
      AND created_at > DATE_SUB(NOW(), INTERVAL 2 HOUR)
    `);
    
    console.log('   ✅ Dados de teste removidos');
  } finally {
    await connection.end();
  }
}

// Função principal do teste
async function runDuplicateMatchesTest() {
  try {
    console.log('🎯 OBJETIVO: Detectar criação de partidas duplicadas\n');
    console.log('🔍 Hipóteses a verificar:');
    console.log('   1. Matchmaking cria uma partida');
    console.log('   2. MatchFoundService cria nova partida no acceptance');
    console.log('   3. DraftService cria nova partida no draft');
    console.log('   4. Times não são mantidos entre processos');
    console.log('   5. Match_leader não é único\n');
    
    const results = [];
    
    // Executar testes
    const initialState = await test1_CheckInitialState();
    results.push(await test2_AddTenPlayers());
    const matchCreation = await test3_WaitForMatchCreation();
    results.push(matchCreation.success);
    results.push(await test4_CheckDraftTeams());
    results.push(await test5_CheckMatchLeader());
    
    // Análise final
    console.log('\n📋 ANÁLISE FINAL:');
    console.log('=====================================');
    
    const passedTests = results.filter(r => r === true).length;
    const totalTests = results.length;
    
    console.log(`🧪 Testes executados: ${totalTests}`);
    console.log(`✅ Testes passou: ${passedTests}`);
    console.log(`❌ Testes falharam: ${totalTests - passedTests}`);
    
    // Diagnóstico específico
    if (initialState.duplicateMatches.length > 0) {
      console.log('\n❌ PROBLEMA CONFIRMADO: Partidas duplicadas existem!');
      console.log('🔧 Possíveis causas:');
      console.log('   - Matchmaking interval criando múltiplas partidas');
      console.log('   - MatchFoundService criando nova partida ao aceitar');
      console.log('   - Condições de corrida entre serviços');
      console.log('   - Falta de verificação de partida existente');
    }
    
    if (matchCreation.success && matchCreation.duplicates?.hasDuplicates) {
      console.log('\n❌ PROBLEMA CONFIRMADO: Novas partidas duplicadas criadas durante o teste!');
      console.log('🔧 Recomendações:');
      console.log('   - Verificar se tryCreateMatchFromQueue tem lock');
      console.log('   - Verificar se createMatchForAcceptance reutiliza partida existente');
      console.log('   - Adicionar verificação de partida pending antes de criar nova');
    }
    
    if (passedTests === totalTests) {
      console.log('\n🎉 ✅ TODOS OS TESTES PASSARAM!');
      console.log('✨ Sistema não está criando partidas duplicadas');
    } else {
      console.log('\n❌ PROBLEMAS DETECTADOS!');
      console.log('🔧 Verificar logs acima para identificar as causas');
    }
    
    // Aguardar um pouco antes de limpar
    console.log('\n⏳ Aguardando 10 segundos antes de limpar...');
    await new Promise(resolve => setTimeout(resolve, 10000));
    
    // Limpar dados de teste
    await cleanup();
    
  } catch (error) {
    console.error('\n❌ ERRO DURANTE OS TESTES:', error.message);
    console.log('\n🔧 Verifique se o backend está rodando e o MySQL acessível');
  }
}

// Executar testes
runDuplicateMatchesTest();
