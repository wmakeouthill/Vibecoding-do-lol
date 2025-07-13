import { LCUService } from './services/LCUService';

async function testCustomGameEndpoint() {
    console.log('🎮 TESTE DE CAPTURA DE LOBBY CUSTOMIZADO');
    console.log('========================================');
    console.log('📋 Instruções:');
    console.log('1. Execute este script');
    console.log('2. Crie um lobby customizado manualmente no League of Legends');
    console.log('3. Configure como "Escolha às Cegas" com senha "ordem123"');
    console.log('4. O script irá capturar e testar a criação automática');
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

        console.log('\n🔍 Monitorando lobby... (Pressione Ctrl+C para parar)');
        console.log('⏳ Aguardando criação do lobby customizado...');

        let lastLobbyId: string | null = null;
        let checkCount = 0;

        // 3. Monitorar lobby em loop
        const monitorInterval = setInterval(async () => {
            checkCount++;

            try {
                const lobbyResponse = await lcuService.getLobbyData();
                const lobbyData = lobbyResponse.data;

                // Verificar se é um novo lobby customizado
                if (lobbyData.gameConfig?.isCustom && lobbyData.gameConfig?.queueId === 0) {
                    console.log('\n🎉 LOBBY CUSTOMIZADO DETECTADO!');
                    console.log('================================');

                    // Capturar configuração completa
                    console.log('📋 CONFIGURAÇÃO COMPLETA DO LOBBY:');
                    console.log(JSON.stringify(lobbyData, null, 2));

                    // Extrair informações importantes
                    console.log('\n🔧 INFORMAÇÕES IMPORTANTES:');
                    console.log('Lobby ID:', lobbyData.lobbyId);
                    console.log('Queue ID:', lobbyData.gameConfig?.queueId);
                    console.log('Game Mode:', lobbyData.gameConfig?.gameMode);
                    console.log('Pick Type:', lobbyData.gameConfig?.pickType);
                    console.log('Map ID:', lobbyData.gameConfig?.mapId);
                    console.log('Team Size:', lobbyData.gameConfig?.maxTeamSize);
                    console.log('Spectator Type:', lobbyData.gameConfig?.customSpectatorPolicy);
                    console.log('Lobby Name:', lobbyData.gameConfig?.customLobbyName);
                    console.log('Is Custom:', lobbyData.gameConfig?.isCustom);
                    console.log('Members:', lobbyData.members?.length || 0);

                    // Estrutura para criação automática
                    console.log('\n📝 ESTRUTURA PARA CRIAÇÃO AUTOMÁTICA:');
                    const autoCreateStructure = {
                        queueId: 0, // Custom game
                        gameConfig: {
                            gameMode: lobbyData.gameConfig?.gameMode || 'CLASSIC',
                            mapId: lobbyData.gameConfig?.mapId || 11,
                            pickType: lobbyData.gameConfig?.pickType || 'BLIND_PICK',
                            spectatorType: lobbyData.gameConfig?.customSpectatorPolicy || 'ALL',
                            teamSize: lobbyData.gameConfig?.maxTeamSize || 5,
                            customLobbyName: lobbyData.gameConfig?.customLobbyName || 'PERSON DOS CRIA ORDEM INHOUSE',
                            customSpectatorPolicy: lobbyData.gameConfig?.customSpectatorPolicy || 'ALL',
                            customMutatorName: lobbyData.gameConfig?.customMutatorName || 'GAME_CFG_PICK_BLIND'
                        }
                    };
                    console.log(JSON.stringify(autoCreateStructure, null, 2));

                    // Testar criação automática com a estrutura capturada
                    console.log('\n🧪 TESTANDO CRIAÇÃO AUTOMÁTICA...');

                    try {
                        // Primeiro, deletar o lobby atual
                        await lcuService.makeLCURequest('DELETE', '/lol-lobby/v2/lobby');
                        console.log('✅ Lobby atual deletado');

                        // Aguardar um pouco
                        await new Promise(resolve => setTimeout(resolve, 2000));

                        // Tentar criar com a estrutura capturada
                        const createResponse = await lcuService.makeLCURequest('POST', '/lol-lobby/v2/lobby', autoCreateStructure);
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

                        // Parar o monitoramento
                        clearInterval(monitorInterval);
                        console.log('\n✅ Teste concluído com sucesso!');
                        console.log('📋 A estrutura capturada pode ser usada no CustomGameService');
                        process.exit(0);

                    } catch (error: any) {
                        console.log('❌ Falha na criação automática:', error.response?.data?.message || error.message);
                        console.log('📋 A estrutura capturada pode precisar de ajustes');

                        // Tentar estrutura alternativa
                        console.log('\n🔄 Tentando estrutura alternativa...');
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

                    lastLobbyId = lobbyData.lobbyId;
                } else if (lobbyData.gameConfig?.isCustom) {
                    console.log(`\n📋 Lobby customizado detectado (não é queueId 0):`, {
                        queueId: lobbyData.gameConfig?.queueId,
                        gameMode: lobbyData.gameConfig?.gameMode,
                        pickType: lobbyData.gameConfig?.pickType,
                        isCustom: lobbyData.gameConfig?.isCustom
                    });
                    lastLobbyId = lobbyData.lobbyId;
                }

                // Mostrar progresso a cada 10 verificações
                if (checkCount % 10 === 0) {
                    console.log(`⏳ Verificação ${checkCount}... (aguardando lobby customizado com queueId 0)`);
                }

            } catch (error: any) {
                if (error.response?.data?.errorCode === 'LOBBY_NOT_FOUND') {
                    // Nenhum lobby ativo - normal
                } else {
                    console.log(`❌ Erro na verificação ${checkCount}:`, error.response?.data?.message || error.message);
                }
            }
        }, 1000); // Verificar a cada 1 segundo

        // Aguardar interrupção do usuário
        process.on('SIGINT', () => {
            console.log('\n\n⏹️ Monitoramento interrompido pelo usuário');
            clearInterval(monitorInterval);
            process.exit(0);
        });

    } catch (error: any) {
        console.error('❌ Erro no teste:', error);
    }
}

testCustomGameEndpoint(); 