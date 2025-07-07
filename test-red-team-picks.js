/**
 * TESTE ESPECÍFICO PARA PICKS DO TIME VERMELHO
 * Valida se os picks do time vermelho estão sendo salvos corretamente
 */

const path = require('path');
const { spawn } = require('child_process');

// Configurações
const TEST_CONFIG = {
  backend: {
    port: 3000, // ✅ CORREÇÃO: Porta correta
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
  console.log(`${color}[RED TEAM TEST]${colors.reset} ${message}`);
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
    const response = await fetch(`http://${TEST_CONFIG.backend.host}:${TEST_CONFIG.backend.port}/api/queue/status`);
    return response.ok;
  } catch (error) {
    return false;
  }
}

// Função para buscar dados de uma partida específica
async function getMatchData(matchId) {
  try {
    const response = await fetch(`http://${TEST_CONFIG.backend.host}:${TEST_CONFIG.backend.port}/api/matches/${matchId}`);
    if (response.ok) {
      return await response.json();
    }
  } catch (error) {
    warning(`Erro ao buscar dados da partida ${matchId}: ${error.message}`);
  }
  return null;
}

// Função para simular pick/ban com logs detalhados
async function simulatePickBanDetailed(matchId, playerId, championId, action) {
  info(`Simulando ${action} do campeão ${championId} por jogador ${playerId}...`);
  
  try {
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
      success(`${action} realizado com sucesso por jogador ${playerId} (campeão ${championId})`);
      
      // Verificar se os dados foram salvos
      const matchData = await getMatchData(matchId);
      if (matchData && matchData.pick_ban_data) {
        const pickBanData = typeof matchData.pick_ban_data === 'string' 
          ? JSON.parse(matchData.pick_ban_data) 
          : matchData.pick_ban_data;
        
        info(`Dados salvos no banco:`, {
          team1Picks: Object.keys(pickBanData.picks?.team1 || {}),
          team2Picks: Object.keys(pickBanData.picks?.team2 || {}),
          team1Bans: pickBanData.bans?.team1?.length || 0,
          team2Bans: pickBanData.bans?.team2?.length || 0,
          totalActions: pickBanData.actions?.length || 0
        });
      }
      
      return true;
    } else {
      const errorText = await response.text();
      error(`Erro ao realizar ${action}: ${response.status} - ${errorText}`);
      return false;
    }
  } catch (error) {
    error(`Erro ao realizar ${action}: ${error.message}`);
    return false;
  }
}

// Função para testar picks do time vermelho
async function testRedTeamPicks() {
  info('=== TESTE DE PICKS DO TIME VERMELHO ===');

  try {
    // 1. Verificar se o backend está rodando
    info('1. Verificando status do backend...');
    const backendRunning = await checkBackendStatus();
    if (!backendRunning) {
      error('Backend não está rodando. Inicie o servidor primeiro.');
      return false;
    }
    success('Backend está rodando');

    // 2. Buscar partidas em draft ativo
    info('2. Buscando partidas em draft...');
    const response = await fetch(`http://${TEST_CONFIG.backend.host}:${TEST_CONFIG.backend.port}/api/matches/active`);
    if (!response.ok) {
      error('Não foi possível buscar partidas ativas');
      return false;
    }

    const matches = await response.json();
    const draftMatch = matches.find(match => match.status === 'draft');
    
    if (!draftMatch) {
      warning('Nenhuma partida em draft encontrada. Criando uma nova partida...');
      
      // Criar jogadores para teste
      const testPlayers = [
        { name: 'RedTestPlayer1', lane1: 'top', lane2: 'jungle', mmr: 1300 },
        { name: 'RedTestPlayer2', lane1: 'jungle', lane2: 'top', mmr: 1250 },
        { name: 'RedTestPlayer3', lane1: 'mid', lane2: 'top', mmr: 1400 },
        { name: 'RedTestPlayer4', lane1: 'adc', lane2: 'mid', mmr: 1200 },
        { name: 'RedTestPlayer5', lane1: 'support', lane2: 'adc', mmr: 1350 },
        { name: 'RedTestPlayer6', lane1: 'top', lane2: 'jungle', mmr: 1280 },
        { name: 'RedTestPlayer7', lane1: 'jungle', lane2: 'top', mmr: 1320 },
        { name: 'RedTestPlayer8', lane1: 'mid', lane2: 'jungle', mmr: 1380 },
        { name: 'RedTestPlayer9', lane1: 'adc', lane2: 'mid', mmr: 1220 },
        { name: 'RedTestPlayer10', lane1: 'support', lane2: 'adc', mmr: 1360 }
      ];

      // Adicionar jogadores à fila e aguardar partida
      for (const player of testPlayers) {
        await fetch(`http://${TEST_CONFIG.backend.host}:${TEST_CONFIG.backend.port}/api/queue/join`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            summonerName: player.name,
            primaryLane: player.lane1,
            secondaryLane: player.lane2,
            mmr: player.mmr
          })
        });
      }

      await sleep(10000); // Aguardar matchmaking

      // Buscar nova partida
      const newMatches = await fetch(`http://${TEST_CONFIG.backend.host}:${TEST_CONFIG.backend.port}/api/matches/active`).then(r => r.json());
      const newMatch = newMatches.find(match => match.status === 'found');
      
      if (newMatch) {
        // Aceitar com todos os jogadores
        for (const player of testPlayers) {
          await fetch(`http://${TEST_CONFIG.backend.host}:${TEST_CONFIG.backend.port}/api/matches/${newMatch.id}/accept`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ summonerName: player.name })
          });
        }

        await sleep(3000); // Aguardar draft iniciar
        
        // Verificar se draft iniciou
        const draftMatches = await fetch(`http://${TEST_CONFIG.backend.host}:${TEST_CONFIG.backend.port}/api/matches/active`).then(r => r.json());
        const draftStarted = draftMatches.find(match => match.status === 'draft');
        
        if (draftStarted) {
          draftMatch = draftStarted;
          success('Nova partida criada e draft iniciado');
        } else {
          error('Não foi possível iniciar draft');
          return false;
        }
      } else {
        error('Não foi possível criar nova partida');
        return false;
      }
    }

    const matchId = draftMatch.id;
    success(`Partida em draft encontrada: ${matchId}`);

    // 3. Testar picks dos times azul e vermelho
    info('3. Testando picks dos times azul e vermelho...');
    
    // Simular algumas ações alternadas
    const actions = [
      { playerId: 0, championId: 64, action: 'ban' },   // Time azul ban (Top)
      { playerId: 5, championId: 55, action: 'ban' },   // Time vermelho ban (Top)
      { playerId: 1, championId: 104, action: 'ban' },  // Time azul ban (Jungle)
      { playerId: 6, championId: 121, action: 'ban' },  // Time vermelho ban (Jungle)
      { playerId: 2, championId: 238, action: 'ban' },  // Time azul ban (Mid)
      { playerId: 7, championId: 91, action: 'ban' },   // Time vermelho ban (Mid)
      
      { playerId: 0, championId: 92, action: 'pick' },  // Time azul pick (Top)
      { playerId: 5, championId: 23, action: 'pick' },  // Time vermelho pick (Top) ⭐ TESTE PRINCIPAL
      { playerId: 6, championId: 11, action: 'pick' },  // Time vermelho pick (Jungle) ⭐ TESTE PRINCIPAL
      { playerId: 1, championId: 64, action: 'pick' },  // Time azul pick (Jungle)
      { playerId: 2, championId: 238, action: 'pick' }, // Time azul pick (Mid)
      { playerId: 7, championId: 91, action: 'pick' },  // Time vermelho pick (Mid) ⭐ TESTE PRINCIPAL
    ];

    for (const actionData of actions) {
      await simulatePickBanDetailed(matchId, actionData.playerId, actionData.championId, actionData.action);
      await sleep(2000); // Aguardar entre ações
    }

    // 4. Verificar dados finais salvos
    info('4. Verificando dados finais salvos no banco...');
    const finalMatchData = await getMatchData(matchId);
    
    if (finalMatchData && finalMatchData.pick_ban_data) {
      const pickBanData = typeof finalMatchData.pick_ban_data === 'string' 
        ? JSON.parse(finalMatchData.pick_ban_data) 
        : finalMatchData.pick_ban_data;
      
      info('Dados finais salvos:', {
        team1Picks: pickBanData.picks?.team1 || {},
        team2Picks: pickBanData.picks?.team2 || {},
        team1Bans: pickBanData.bans?.team1 || [],
        team2Bans: pickBanData.bans?.team2 || [],
        totalActions: pickBanData.actions?.length || 0
      });

      // Verificar se time vermelho tem picks salvos
      const team2Picks = pickBanData.picks?.team2 || {};
      const team2PicksCount = Object.keys(team2Picks).length;
      
      if (team2PicksCount > 0) {
        success(`✅ Time vermelho tem ${team2PicksCount} picks salvos corretamente!`);
        
        // Mostrar detalhes dos picks do time vermelho
        Object.entries(team2Picks).forEach(([lane, pickData]) => {
          info(`Time vermelho ${lane}: Campeão ${pickData.championId} por ${pickData.playerName}`);
        });
        
        return true;
      } else {
        error('❌ Time vermelho não tem picks salvos!');
        return false;
      }
    } else {
      error('Não foi possível verificar dados salvos da partida');
      return false;
    }

  } catch (error) {
    error(`Erro durante o teste: ${error.message}`);
    return false;
  }
}

// Executar teste
if (require.main === module) {
  testRedTeamPicks()
    .then((success) => {
      if (success) {
        info('🎉 TESTE DE PICKS DO TIME VERMELHO PASSOU!');
        process.exit(0);
      } else {
        error('❌ TESTE DE PICKS DO TIME VERMELHO FALHOU');
        process.exit(1);
      }
    })
    .catch((error) => {
      error(`Erro fatal: ${error.message}`);
      process.exit(1);
    });
}

module.exports = { testRedTeamPicks };
