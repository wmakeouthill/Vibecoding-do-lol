// Teste do Sistema de Bots para Draft-Pick-Ban
// Execute este arquivo para testar se os bots estão sendo detectados corretamente

console.log('🧪 TESTE DO SISTEMA DE BOTS');
console.log('============================');

// Simular dados de teste
const testBots = [
    { id: -1, summonerName: 'Bot1', teamIndex: 0, lane: 'top' },
    { id: -2, summonerName: 'Bot2', teamIndex: 1, lane: 'jungle' },
    { id: -3, summonerName: 'Bot3', teamIndex: 2, lane: 'mid' },
    { id: -4, summonerName: 'Bot4', teamIndex: 3, lane: 'adc' },
    { id: -5, summonerName: 'Bot5', teamIndex: 4, lane: 'support' }
];

const testPlayers = [
    { id: 12345, summonerName: 'Player1#BR1', teamIndex: 0, lane: 'top' },
    { id: 67890, summonerName: 'Player2#BR1', teamIndex: 1, lane: 'jungle' },
    { id: 11111, summonerName: 'Player3#BR1', teamIndex: 2, lane: 'mid' },
    { id: 22222, summonerName: 'Player4#BR1', teamIndex: 3, lane: 'adc' },
    { id: 33333, summonerName: 'Player5#BR1', teamIndex: 4, lane: 'support' }
];

// Função para simular isBot (baseada no BotService)
function isBot(player) {
    if (!player) return false;

    const name = player.summonerName || player.name || '';
    const id = player.id;

    console.log(`🤖 Verificando jogador: ${name} (ID: ${id})`);

    if (id < 0) {
        console.log(`🤖 ID negativo detectado: ${id}`);
        return true;
    }

    if (typeof id === 'string') {
        const numericId = parseInt(id);
        if (!isNaN(numericId) && numericId < 0) {
            console.log(`🤖 ID string negativo detectado: ${numericId}`);
            return true;
        }

        if (id.toLowerCase().includes('bot') || id.startsWith('-')) {
            console.log(`🤖 ID contém 'bot' ou começa com '-': ${id}`);
            return true;
        }
    }

    const botPatterns = [
        /^bot\d+$/i,
        /^bot\s*\d+$/i,
        /^ai\s*bot$/i,
        /^computer\s*\d*$/i,
        /^bot\s*player$/i,
        /^ai\s*player$/i,
        /^bot$/i,
        /^ai$/i,
        /^popcornseller$/i,
        /^bot\s*[a-z]*$/i,
        /^ai\s*[a-z]*$/i,
        /^bot\s*\d+\s*[a-z]*$/i,
        /^ai\s*\d+\s*[a-z]*$/i,
        /^bot\d+[a-z]*$/i,
        /^ai\d+[a-z]*$/i
    ];

    for (const pattern of botPatterns) {
        if (pattern.test(name)) {
            console.log(`🤖 Padrão de bot detectado: ${pattern.source}`);
            return true;
        }
    }

    if (name.toLowerCase().includes('bot')) {
        console.log(`🤖 Nome contém 'bot': ${name}`);
        return true;
    }

    if (name.toLowerCase().includes('ai')) {
        console.log(`🤖 Nome contém 'ai': ${name}`);
        return true;
    }

    if (/\d/.test(name) && (name.toLowerCase().includes('bot') || name.toLowerCase().includes('ai'))) {
        console.log(`🤖 Nome com número e bot/ai: ${name}`);
        return true;
    }

    console.log(`🤖 Jogador não é bot: ${name}`);
    return false;
}

// Função para simular comparePlayerWithId
function comparePlayerWithId(player, targetId) {
    if (!player || !targetId) {
        console.log(`🤖 Dados inválidos - player: ${!!player}, targetId: ${targetId}`);
        return false;
    }

    const playerId = player.id?.toString();
    const playerName = player.summonerName || player.name || '';

    console.log(`🤖 Comparando:`, {
        playerId: playerId,
        playerName: playerName,
        targetId: targetId,
        teamIndex: player.teamIndex
    });

    if (playerId === targetId) {
        console.log(`🤖 Match por ID: ${playerId} === ${targetId}`);
        return true;
    }

    if (playerName === targetId) {
        console.log(`🤖 Match por nome: ${playerName} === ${targetId}`);
        return true;
    }

    if (playerName.includes('#')) {
        const gameName = playerName.split('#')[0];
        if (gameName === targetId) {
            console.log(`🤖 Match por gameName: ${gameName} === ${targetId}`);
            return true;
        }
    }

    if (player.teamIndex !== undefined && player.teamIndex !== null) {
        const teamIndexStr = player.teamIndex.toString();
        if (teamIndexStr === targetId) {
            console.log(`🤖 Match por teamIndex: ${teamIndexStr} === ${targetId}`);
            return true;
        }
    }

    console.log(`🤖 Nenhum match encontrado`);
    return false;
}

// Teste 1: Verificar detecção de bots
console.log('\n🧪 TESTE 1: DETECÇÃO DE BOTS');
console.log('=============================');

testBots.forEach((bot, index) => {
    console.log(`\n--- Bot ${index + 1} ---`);
    const isBotResult = isBot(bot);
    console.log(`Resultado: ${isBotResult ? '✅ É BOT' : '❌ NÃO É BOT'}`);
});

testPlayers.forEach((player, index) => {
    console.log(`\n--- Player ${index + 1} ---`);
    const isBotResult = isBot(player);
    console.log(`Resultado: ${isBotResult ? '❌ É BOT (ERRO)' : '✅ NÃO É BOT'}`);
});

// Teste 2: Verificar comparação de jogadores
console.log('\n🧪 TESTE 2: COMPARAÇÃO DE JOGADORES');
console.log('===================================');

const testCases = [
    { player: testBots[0], targetId: '-1', description: 'Bot por ID negativo' },
    { player: testBots[0], targetId: 'Bot1', description: 'Bot por nome' },
    { player: testBots[0], targetId: '0', description: 'Bot por teamIndex' },
    { player: testPlayers[0], targetId: '12345', description: 'Player por ID' },
    { player: testPlayers[0], targetId: 'Player1#BR1', description: 'Player por nome completo' },
    { player: testPlayers[0], targetId: 'Player1', description: 'Player por gameName' },
    { player: testPlayers[0], targetId: '0', description: 'Player por teamIndex' }
];

testCases.forEach((testCase, index) => {
    console.log(`\n--- Teste ${index + 1}: ${testCase.description} ---`);
    const result = comparePlayerWithId(testCase.player, testCase.targetId);
    console.log(`Resultado: ${result ? '✅ MATCH' : '❌ NÃO MATCH'}`);
});

// Teste 3: Simular fase de draft
console.log('\n🧪 TESTE 3: SIMULAÇÃO DE FASE DE DRAFT');
console.log('========================================');

const testPhase = {
    team: 'blue',
    action: 'ban',
    playerId: '-1', // ID do bot
    playerIndex: 0,
    locked: false,
    timeRemaining: 30
};

const testSession = {
    blueTeam: testBots,
    redTeam: testPlayers,
    currentAction: 0
};

console.log('\n--- Simulando shouldPerformBotAction ---');
console.log('Phase:', testPhase);
console.log('Blue Team:', testSession.blueTeam.map(p => ({ id: p.id, name: p.summonerName, teamIndex: p.teamIndex })));

// Simular shouldPerformBotAction
let currentPlayer = null;

// Tentar por playerId
if (testPhase.playerId) {
    console.log(`\n🤖 Procurando por playerId: ${testPhase.playerId}`);
    currentPlayer = testSession.blueTeam.find(p => comparePlayerWithId(p, testPhase.playerId));
}

// Tentar por teamIndex
if (!currentPlayer && testPhase.playerIndex !== undefined) {
    console.log(`\n🤖 Tentando encontrar por teamIndex: ${testPhase.playerIndex}`);
    currentPlayer = testSession.blueTeam.find(p => p.teamIndex === testPhase.playerIndex);
}

// Tentar por índice do array
if (!currentPlayer && testPhase.playerIndex !== undefined) {
    console.log(`\n🤖 Tentando encontrar por índice do array: ${testPhase.playerIndex}`);
    currentPlayer = testSession.blueTeam[testPhase.playerIndex];
}

console.log('\n🤖 Current player encontrado:', currentPlayer);

if (currentPlayer) {
    const isBotPlayer = isBot(currentPlayer);
    console.log('🤖 É bot?', isBotPlayer);
    console.log('🤖 Detalhes do jogador:', {
        id: currentPlayer.id,
        name: currentPlayer.summonerName,
        teamIndex: currentPlayer.teamIndex,
        isBot: isBotPlayer
    });
    console.log(`Resultado final: ${isBotPlayer ? '✅ DEVE EXECUTAR AÇÃO' : '❌ NÃO DEVE EXECUTAR'}`);
} else {
    console.log('⚠️ Jogador não encontrado!');
    console.log('Resultado final: ❌ NÃO DEVE EXECUTAR');
}

console.log('\n✅ TESTE CONCLUÍDO');
console.log('=================='); 