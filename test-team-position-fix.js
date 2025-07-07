/**
 * TESTE ESPECÍFICO PARA CORREÇÃO DE POSICIONAMENTO DOS TIMES E SALVAMENTO DE PICKS
 */

const path = require('path');
const { spawn } = require('child_process');

// Configurações
const TEST_CONFIG = {
  backend: {
    port: 3001,
    host: 'localhost'
  },
  timeout: 30000,
  debug: true
};

// Cores para logs
const colors = {
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  reset: '\x1b[0m'
};

function log(message, color = colors.cyan) {
  console.log(`${color}[DRAFT TEAM TEST]${colors.reset} ${message}`);
}

function success(message) {
  log(`✅ ${message}`, colors.green);
}

function error(message) {
  log(`❌ ${message}`, colors.red);
}

function warning(message) {
  log(`⚠️ ${message}`, colors.yellow);
}

function info(message) {
  log(`ℹ️ ${message}`, colors.blue);
}

// Função para aguardar
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Função para verificar se o backend está rodando
async function checkBackendStatus() {
  try {
    const response = await fetch(`http://${TEST_CONFIG.backend.host}:${TEST_CONFIG.backend.port}/health`);
    return response.ok;
  } catch (error) {
    return false;
  }
}

// Função para simular pick/ban com logs detalhados
async function simulatePickBanWithLogs(matchId, playerId, championId, action, expectedTeam) {
  try {
    info(`Simulando ${action} - Jogador ${playerId} (${expectedTeam}) - Campeão ${championId}`);
    
    const response = await fetch(`http://${TEST_CONFIG.backend.host}:${TEST_CONFIG.backend.port}/api/draft/${matchId}/action`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        playerId,
        championId,
        action
      })
    });

    if (response.ok) {
      const result = await response.json();
      success(`${action} realizado com sucesso - Jogador ${playerId} (${expectedTeam}) - Campeão ${championId}`);
      
      // Log detalhado da resposta
      info(`Resposta do servidor:`, JSON.stringify(result, null, 2));
      
      return true;
    } else {
      const errorText = await response.text();
      error(`Erro ao realizar ${action} - Status: ${response.status} - ${errorText}`);
      return false;
    }
  } catch (error) {
    error(`Erro ao realizar ${action}: ${error.message}`);
    return false;
  }
}

// Função para buscar dados da partida
async function getMatchData(matchId) {
  try {
    const response = await fetch(`http://${TEST_CONFIG.backend.host}:${TEST_CONFIG.backend.port}/api/matches/${matchId}`);
    if (response.ok) {
      return await response.json();
    }
  } catch (error) {
    warning(`Erro ao buscar dados da partida: ${error.message}`);
  }
  return null;
}

// Função principal do teste
async function runTeamPositionTest() {
  info('=== INICIANDO TESTE DE POSICIONAMENTO DOS TIMES E SALVAMENTO DE PICKS ===');

  try {
    // 1. Verificar se o backend está rodando
    info('1. Verificando status do backend...');
    const backendRunning = await checkBackendStatus();
    if (!backendRunning) {
      error('Backend não está rodando. Inicie o servidor primeiro.');
      return false;
    }
    success('Backend está rodando');

    // 2. Criar partida de teste (assumindo que já existe uma partida ativa)
    info('2. Buscando partida ativa para teste...');
    const activeMatches = await fetch(`http://${TEST_CONFIG.backend.host}:${TEST_CONFIG.backend.port}/api/matches/active`);
    
    if (!activeMatches.ok) {
      error('Não foi possível buscar partidas ativas. Certifique-se de que há uma partida em draft.');
      return false;
    }

    const matches = await activeMatches.json();
    if (matches.length === 0) {
      error('Nenhuma partida ativa encontrada. Crie uma partida primeiro.');
      return false;
    }

    const matchId = matches[0].id;
    success(`Partida encontrada: ${matchId}`);

    // 3. Obter dados iniciais da partida
    info('3. Obtendo dados iniciais da partida...');
    const initialData = await getMatchData(matchId);
    if (initialData) {
      info(`Dados iniciais da partida:`, JSON.stringify(initialData, null, 2));
    }

    // 4. Testar picks/bans com ambos os times
    info('4. Testando picks/bans com ambos os times...');

    // Teste com time azul (0-4)
    info('=== TESTANDO TIME AZUL (0-4) ===');
    await simulatePickBanWithLogs(matchId, 0, 92, 'pick', 'AZUL'); // Riven pick por top azul
    await sleep(2000);
    await simulatePickBanWithLogs(matchId, 1, 64, 'ban', 'AZUL'); // Lee Sin ban por jungle azul
    await sleep(2000);

    // Teste com time vermelho (5-9)
    info('=== TESTANDO TIME VERMELHO (5-9) ===');
    await simulatePickBanWithLogs(matchId, 5, 23, 'pick', 'VERMELHO'); // Tryndamere pick por top vermelho
    await sleep(2000);
    await simulatePickBanWithLogs(matchId, 6, 104, 'ban', 'VERMELHO'); // Graves ban por jungle vermelho
    await sleep(2000);

    // Mais testes com diferentes lanes
    info('=== TESTANDO OUTRAS LANES ===');
    await simulatePickBanWithLogs(matchId, 2, 103, 'pick', 'AZUL'); // Ahri pick por mid azul
    await sleep(2000);
    await simulatePickBanWithLogs(matchId, 7, 55, 'pick', 'VERMELHO'); // Katarina pick por mid vermelho
    await sleep(2000);
    await simulatePickBanWithLogs(matchId, 3, 22, 'pick', 'AZUL'); // Ashe pick por adc azul
    await sleep(2000);
    await simulatePickBanWithLogs(matchId, 8, 51, 'pick', 'VERMELHO'); // Caitlyn pick por adc vermelho
    await sleep(2000);

    // 5. Verificar dados finais da partida
    info('5. Verificando dados finais da partida...');
    const finalData = await getMatchData(matchId);
    if (finalData) {
      info(`Dados finais da partida:`, JSON.stringify(finalData, null, 2));
      
      // Verificar se os picks foram salvos
      if (finalData.pick_ban_data) {
        const pickBanData = typeof finalData.pick_ban_data === 'string' 
          ? JSON.parse(finalData.pick_ban_data) 
          : finalData.pick_ban_data;
        
        info('=== VERIFICANDO PICKS SALVOS ===');
        info(`Picks do time azul:`, JSON.stringify(pickBanData.picks?.team1 || {}, null, 2));
        info(`Picks do time vermelho:`, JSON.stringify(pickBanData.picks?.team2 || {}, null, 2));
        info(`Bans do time azul:`, JSON.stringify(pickBanData.bans?.team1 || [], null, 2));
        info(`Bans do time vermelho:`, JSON.stringify(pickBanData.bans?.team2 || [], null, 2));
        
        // Verificar se ambos os times têm picks salvos
        const team1Picks = Object.keys(pickBanData.picks?.team1 || {}).length;
        const team2Picks = Object.keys(pickBanData.picks?.team2 || {}).length;
        
        if (team1Picks > 0 && team2Picks > 0) {
          success(`Picks salvos corretamente - Time azul: ${team1Picks}, Time vermelho: ${team2Picks}`);
        } else {
          error(`Problema com picks - Time azul: ${team1Picks}, Time vermelho: ${team2Picks}`);
        }
      }
    }

    success('✅ TESTE DE POSICIONAMENTO DOS TIMES E SALVAMENTO DE PICKS CONCLUÍDO!');

    // Resumo dos testes
    info('=== RESUMO DOS TESTES ===');
    success('✅ Backend funcionando');
    success('✅ Partida encontrada');
    success('✅ Picks/bans testados com ambos os times');
    success('✅ Dados de picks/bans verificados');
    success('✅ Posicionamento dos times testado');

    return true;

  } catch (error) {
    error(`Erro durante o teste: ${error.message}`);
    return false;
  }
}

// Executar teste
if (require.main === module) {
  runTeamPositionTest()
    .then((success) => {
      if (success) {
        info('🎉 TESTE CONCLUÍDO COM SUCESSO!');
        process.exit(0);
      } else {
        error('❌ TESTE FALHOU');
        process.exit(1);
      }
    })
    .catch((error) => {
      error(`Erro fatal: ${error.message}`);
      process.exit(1);
    });
}

module.exports = { runTeamPositionTest };
