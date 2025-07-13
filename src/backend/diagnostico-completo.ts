import { LCUService } from './services/LCUService';

async function diagnosticoCompleto() {
    console.log('🔍 DIAGNÓSTICO COMPLETO DO LCU');
    console.log('================================');

    const lcuService = new LCUService();

    try {
        // 1. Inicializar LCU
        console.log('\n1️⃣ Inicializando LCU Service...');
        await lcuService.initialize();

        if (!lcuService.isClientConnected()) {
            console.error('❌ LCU não está conectado!');
            return;
        }

        console.log('✅ LCU conectado com sucesso');

        // 2. Verificar status atual do cliente
        console.log('\n2️⃣ Verificando status atual do cliente...');

        try {
            const summoner = await lcuService.getCurrentSummoner();
            console.log('👤 Summoner atual:', {
                id: summoner.summonerId,
                name: summoner.displayName,
                level: summoner.summonerLevel
            });
        } catch (error) {
            console.error('❌ Erro ao buscar summoner:', error);
        }

        // 3. Verificar status do lobby atual
        console.log('\n3️⃣ Verificando status do lobby atual...');

        try {
            const lobby = await lcuService.getLobbyData();
            console.log('📋 Status do lobby:', lobby.data);
        } catch (error: any) {
            if (error.response?.data?.errorCode === 'LOBBY_NOT_FOUND') {
                console.log('✅ Nenhum lobby ativo (esperado)');
            } else {
                console.error('❌ Erro ao verificar lobby:', error.response?.data || error);
            }
        }

        // 4. Testar endpoints de lobby disponíveis
        console.log('\n4️⃣ Testando endpoints de lobby disponíveis...');

        const endpoints = [
            '/lol-lobby/v2/lobby',
            '/lol-lobby/v1/lobby',
            '/lol-custom-game/v1/custom-games',
            '/lol-custom-game/v1/custom-game',
            '/lol-lobby/v2/lobby/custom'
        ];

        for (const endpoint of endpoints) {
            try {
                console.log(`\n🔍 Testando ${endpoint}...`);
                const response = await lcuService.makeLCURequest('GET', endpoint);
                console.log(`✅ ${endpoint} - Disponível`);
                console.log('📊 Resposta:', JSON.stringify(response.data, null, 2));
            } catch (error: any) {
                const status = error.response?.status;
                const errorCode = error.response?.data?.errorCode;
                console.log(`❌ ${endpoint} - ${status} (${errorCode})`);
            }
        }

        // 5. Verificar configurações de jogo
        console.log('\n5️⃣ Verificando configurações de jogo...');

        try {
            const gameConfig = await lcuService.makeLCURequest('GET', '/lol-game-data/assets/v1/game-modes.json');
            console.log('🎮 Configurações de jogo disponíveis');
        } catch (error: any) {
            console.log('❌ Não foi possível obter configurações de jogo');
        }

        // 6. Testar criação de lobby com estrutura mínima
        console.log('\n6️⃣ Testando criação de lobby com estrutura mínima...');

        const lobbyMinimal = {
            queueId: 0
        };

        try {
            const response = await lcuService.makeLCURequest('POST', '/lol-lobby/v2/lobby', lobbyMinimal);
            console.log('✅ Lobby criado com estrutura mínima!');
            console.log('📊 Resposta:', JSON.stringify(response.data, null, 2));
        } catch (error: any) {
            console.error('❌ Erro com estrutura mínima:', error.response?.data || error);
        }

    } catch (error: any) {
        console.error('❌ Erro no diagnóstico:', error);
    }
}

diagnosticoCompleto(); 