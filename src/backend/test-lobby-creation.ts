import { LCUService } from './services/LCUService';

async function testLobbyCreation() {
    console.log('🎮 TESTE DE CRIAÇÃO DE LOBBY CUSTOMIZADO');
    console.log('========================================');
    console.log('📋 Testando criação automática com estrutura capturada');
    console.log('');

    const lcuService = new LCUService();

    try {
        // 1. Inicializar LCU
        console.log('🚀 Inicializando LCU Service...');
        await lcuService.initialize();

        if (!lcuService.isClientConnected()) {
            console.error('❌ LCU não está conectado!');
            return;
        }

        console.log('✅ LCU conectado com sucesso');

        // 2. Verificar summoner atual
        const summoner = await lcuService.getCurrentSummoner();
        console.log('👤 Summoner:', summoner.displayName, `(ID: ${summoner.summonerId})`);

        // 3. Estrutura capturada da partida atual (que funciona)
        console.log('\n📋 ESTRUTURA CAPTURADA DA PARTIDA ATUAL:');
        const capturedStructure = {
            queueId: 0, // Custom game
            gameConfig: {
                gameMode: 'CLASSIC',
                mapId: 11, // Summoner's Rift
                pickType: 'SimulPickStrategy', // Escolha às Cegas (capturado)
                spectatorType: 'AllAllowed',
                teamSize: 5,
                customLobbyName: 'PERSON DOS CRIA ORDEM INHOUSE',
                customSpectatorPolicy: 'AllAllowed',
                customMutatorName: 'GAME_CFG_PICK_BLIND',
                isCustom: true,
                maxLobbySize: 10,
                maxTeamSize: 5,
                maxLobbySpectatorCount: 0,
                premadeSizeAllowed: true,
                shouldForceScarcePositionSelection: false,
                showPositionSelector: false,
                showQuickPlaySlotSelection: false
            }
        };

        console.log(JSON.stringify(capturedStructure, null, 2));

        // 4. Testar criação automática
        console.log('\n🧪 TESTANDO CRIAÇÃO AUTOMÁTICA...');

        try {
            // Primeiro, verificar se há um lobby ativo
            console.log('🔍 Verificando lobby atual...');
            const currentLobby = await lcuService.getLobbyData();
            console.log('📋 Lobby atual:', {
                lobbyId: currentLobby.data.lobbyId,
                queueId: currentLobby.data.gameConfig?.queueId,
                gameMode: currentLobby.data.gameConfig?.gameMode,
                isCustom: currentLobby.data.gameConfig?.isCustom
            });

            // Deletar o lobby atual se existir
            console.log('🗑️ Deletando lobby atual...');
            await lcuService.makeLCURequest('DELETE', '/lol-lobby/v2/lobby');
            console.log('✅ Lobby atual deletado');

            // Aguardar um pouco
            await new Promise(resolve => setTimeout(resolve, 2000));

            // Tentar criar com a estrutura capturada
            console.log('🎯 Criando lobby com estrutura capturada...');
            const createResponse = await lcuService.makeLCURequest('POST', '/lol-lobby/v2/lobby', capturedStructure);
            console.log('🎉 SUCESSO! Lobby criado automaticamente!');
            console.log('📊 Resposta:', JSON.stringify(createResponse.data, null, 2));

            // Verificar se o lobby foi criado corretamente
            await new Promise(resolve => setTimeout(resolve, 1000));
            const verifyResponse = await lcuService.getLobbyData();
            const verifyData = verifyResponse.data;

            console.log('\n✅ VERIFICAÇÃO DO LOBBY CRIADO:');
            console.log('Queue ID:', verifyData.gameConfig?.queueId);
            console.log('Game Mode:', verifyData.gameConfig?.gameMode);
            console.log('Pick Type:', verifyData.gameConfig?.pickType);
            console.log('Is Custom:', verifyData.gameConfig?.isCustom);
            console.log('Lobby Name:', verifyData.gameConfig?.customLobbyName);
            console.log('Map ID:', verifyData.gameConfig?.mapId);
            console.log('Team Size:', verifyData.gameConfig?.maxTeamSize);

            console.log('\n🎉 TESTE CONCLUÍDO COM SUCESSO!');
            console.log('📋 A estrutura capturada funciona perfeitamente para criação automática');
            console.log('📋 Esta estrutura pode ser usada no CustomGameService');

        } catch (error: any) {
            console.log('❌ Falha na criação automática:', error.response?.data?.message || error.message);
            console.log('📋 Tentando estrutura alternativa...');

            // Tentar estrutura alternativa mais simples
            try {
                const alternativeStructure = {
                    queueId: 0,
                    gameConfig: {
                        gameMode: 'CLASSIC',
                        mapId: 11,
                        pickType: 'BLIND_PICK',
                        spectatorType: 'ALL',
                        teamSize: 5
                    },
                    lobbyName: 'PERSON DOS CRIA ORDEM INHOUSE',
                    lobbyPassword: 'ordem123'
                };

                const altResponse = await lcuService.makeLCURequest('POST', '/lol-lobby/v2/lobby', alternativeStructure);
                console.log('🎉 SUCESSO com estrutura alternativa!');
                console.log('📊 Resposta:', JSON.stringify(altResponse.data, null, 2));
            } catch (altError: any) {
                console.log('❌ Estrutura alternativa também falhou:', altError.response?.data?.message || altError.message);
            }
        }

    } catch (error) {
        console.error('❌ Erro no teste:', error);
    }
}

testLobbyCreation(); 