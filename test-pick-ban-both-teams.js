/**
 * TESTE ESPECÍFICO PARA VERIFICAR SALVAMENTO DE PICKS/BANS DOS DOIS TIMES
 * Este teste foca especificamente no problema do time vermelho não salvar picks
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
  console.log(`${color}[PICK/BAN TEST]${colors.reset} ${message}`);
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

// Função para buscar dados da partida
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
async function simulatePickBanDetailed(matchId, playerId, championId, action, expectedTeam) {
  info(`Simulando ${action} - Jogador ${playerId} (time ${expectedTeam}) - Campeão ${championId}`);
  
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
      success(`${action.toUpperCase()} realizado com sucesso por jogador ${playerId}`);
      
      // Verificar se foi salvo corretamente
      await sleep(1000);
      const matchData = await getMatchData(matchId);
      
      if (matchData && matchData.pick_ban_data) {
        const pickBanData = typeof matchData.pick_ban_data === 'string' 
          ? JSON.parse(matchData.pick_ban_data) 
          : matchData.pick_ban_data;
        
        info(`Estado atual do draft:`, {
          picksAzul: pickBanData.team1Picks?.length || 0,
          picksVermelho: pickBanData.team2Picks?.length || 0,
          bansAzul: pickBanData.team1Bans?.length || 0,
          bansVermelho: pickBanData.team2Bans?.length || 0
        });
        
        // Verificar se a ação foi salva no time correto
        const teamPicks = expectedTeam === 'azul' ? pickBanData.team1Picks : pickBanData.team2Picks;
        const teamBans = expectedTeam === 'azul' ? pickBanData.team1Bans : pickBanData.team2Bans;
        
        let found = false;
        
        if (action === 'pick') {
          found = teamPicks?.some(pick => pick.championId === championId && pick.playerIndex === playerId);
        } else if (action === 'ban') {
          found = teamBans?.some(ban => ban.championId === championId && ban.playerIndex === playerId);
        }
        
        if (found) {
          success(`${action.toUpperCase()} foi salvo corretamente para o time ${expectedTeam}`);
        } else {
          error(`${action.toUpperCase()} NÃO foi salvo corretamente para o time ${expectedTeam}`);
          
          // Log detalhado para debug
          if (action === 'pick') {
            info(`Picks do time ${expectedTeam}:`, teamPicks);
          } else {
            info(`Bans do time ${expectedTeam}:`, teamBans);
          }
        }
      } else {
        warning('Dados de pick/ban não encontrados na partida');
      }
      
      return true;
    } else {
      error(`Erro ao realizar ${action} na partida ${matchId}: ${response.status}`);
      const errorText = await response.text();
      error(`Detalhes do erro: ${errorText}`);
      return false;
    }
  } catch (error) {
    error(`Erro ao realizar ${action} na partida ${matchId}: ${error.message}`);
    return false;
  }
}

// Função principal do teste
async function runPickBanTest() {
  info('=== INICIANDO TESTE DE PICKS/BANS DOS DOIS TIMES ===');

  try {
    // 1. Verificar se o backend está rodando
    info('1. Verificando status do backend...');
    const backendRunning = await checkBackendStatus();
    if (!backendRunning) {
      error('Backend não está rodando. Inicie o servidor primeiro.');
      return false;
    }
    success('Backend está rodando');

    // 2. Buscar partida ativa em draft
    info('2. Buscando partida ativa em draft...');
    const activeMatches = await fetch(`http://${TEST_CONFIG.backend.host}:${TEST_CONFIG.backend.port}/api/matches/active`);
    
    if (!activeMatches.ok) {
      error('Erro ao buscar partidas ativas');
      return false;
    }
    
    const matches = await activeMatches.json();
    const draftMatch = matches.find(match => match.status === 'draft');
    
    if (!draftMatch) {
      warning('Nenhuma partida em draft encontrada. Você precisa ter uma partida em draft para testar.');
      return false;
    }
    
    const matchId = draftMatch.id;
    success(`Partida em draft encontrada: ${matchId}`);

    // 3. Testar sequência de picks/bans alternados
    info('3. Testando sequência de picks/bans alternados...');
    
    // Simular sequência real de draft
    const draftSequence = [
      // Primeira fase de bans
      { playerId: 0, championId: 64, action: 'ban', team: 'azul' },    // Top azul bane Lee Sin
      { playerId: 5, championId: 55, action: 'ban', team: 'vermelho' }, // Top vermelho bane Katarina
      { playerId: 1, championId: 104, action: 'ban', team: 'azul' },   // Jungle azul bane Graves
      { playerId: 6, championId: 157, action: 'ban', team: 'vermelho' }, // Jungle vermelho bane Yasuo
      { playerId: 2, championId: 238, action: 'ban', team: 'azul' },   // Mid azul bane Zed
      { playerId: 7, championId: 91, action: 'ban', team: 'vermelho' }, // Mid vermelho bane Talon
      
      // Primeira fase de picks
      { playerId: 0, championId: 92, action: 'pick', team: 'azul' },    // Top azul pick Riven
      { playerId: 5, championId: 23, action: 'pick', team: 'vermelho' }, // Top vermelho pick Tryndamere
      { playerId: 6, championId: 121, action: 'pick', team: 'vermelho' }, // Jungle vermelho pick Khazix
      { playerId: 1, championId: 107, action: 'pick', team: 'azul' },   // Jungle azul pick Rengar
      { playerId: 2, championId: 134, action: 'pick', team: 'azul' },   // Mid azul pick Syndra
      { playerId: 7, championId: 61, action: 'pick', team: 'vermelho' }, // Mid vermelho pick Orianna
    ];
    
    for (const [index, draftAction] of draftSequence.entries()) {
      info(`\n--- Ação ${index + 1}/12 ---`);
      await simulatePickBanDetailed(
        matchId, 
        draftAction.playerId, 
        draftAction.championId, 
        draftAction.action, 
        draftAction.team
      );
      
      // Pequeno delay entre ações
      await sleep(2000);
    }

    // 4. Verificar estado final do draft
    info('4. Verificando estado final do draft...');
    const finalMatchData = await getMatchData(matchId);
    
    if (finalMatchData && finalMatchData.pick_ban_data) {
      const pickBanData = typeof finalMatchData.pick_ban_data === 'string' 
        ? JSON.parse(finalMatchData.pick_ban_data) 
        : finalMatchData.pick_ban_data;
      
      success('\n=== RESULTADO FINAL DO DRAFT ===');
      success(`Picks do time azul: ${pickBanData.team1Picks?.length || 0}`);
      success(`Picks do time vermelho: ${pickBanData.team2Picks?.length || 0}`);
      success(`Bans do time azul: ${pickBanData.team1Bans?.length || 0}`);
      success(`Bans do time vermelho: ${pickBanData.team2Bans?.length || 0}`);
      
      // Verificar se ambos os times têm picks/bans
      const azulTemPicks = (pickBanData.team1Picks?.length || 0) > 0;
      const vermelhoTemPicks = (pickBanData.team2Picks?.length || 0) > 0;
      const azulTemBans = (pickBanData.team1Bans?.length || 0) > 0;
      const vermelhoTemBans = (pickBanData.team2Bans?.length || 0) > 0;
      
      if (azulTemPicks && vermelhoTemPicks && azulTemBans && vermelhoTemBans) {
        success('✅ TODOS OS TIMES ESTÃO SALVANDO PICKS/BANS CORRETAMENTE!');
      } else {
        error('❌ PROBLEMA DETECTADO:');
        if (!azulTemPicks) error('  - Time azul não tem picks salvos');
        if (!vermelhoTemPicks) error('  - Time vermelho não tem picks salvos');
        if (!azulTemBans) error('  - Time azul não tem bans salvos');
        if (!vermelhoTemBans) error('  - Time vermelho não tem bans salvos');
      }
    } else {
      error('Não foi possível verificar o estado final do draft');
    }

    return true;

  } catch (error) {
    error(`Erro durante o teste: ${error.message}`);
    return false;
  }
}

// Executar teste
if (require.main === module) {
  runPickBanTest()
    .then((success) => {
      if (success) {
        info('🎉 TESTE DE PICKS/BANS CONCLUÍDO!');
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

module.exports = { runPickBanTest };
