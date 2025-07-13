import { LCUService } from './services/LCUService';

async function captureLobbyConfig() {
    console.log('🔍 CAPTURADOR DE CONFIGURAÇÃO DE LOBBY');
    console.log('======================================');
    console.log('📋 Instruções:');
    console.log('1. Execute este script');
    console.log('2. Crie um lobby customizado manualmente no League of Legends');
    console.log('3. Configure como "Escolha às Cegas" com senha "ordem123"');
    console.log('4. O script irá capturar a configuração exata');
    console.log('5. Pressione Ctrl+C para parar o monitoramento');
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
                if (lobbyData.lobbyId && lobbyData.lobbyId !== lastLobbyId && lobbyData.queueId === 0) {
                    console.log('\n🎉 LOBBY CUSTOMIZADO DETECTADO!');
                    console.log('================================');

                    // Capturar configuração completa
                    console.log('📋 CONFIGURAÇÃO COMPLETA DO LOBBY:');
                    console.log(JSON.stringify(lobbyData, null, 2));

                    // Extrair informações importantes
                    console.log('\n🔧 INFORMAÇÕES IMPORTANTES:');
                    console.log('Lobby ID:', lobbyData.lobbyId);
                    console.log('Queue ID:', lobbyData.queueId);
                    console.log('Game Mode:', lobbyData.gameConfig?.gameMode);
                    console.log('Pick Type:', lobbyData.gameConfig?.pickType);
                    console.log('Map ID:', lobbyData.gameConfig?.mapId);
                    console.log('Team Size:', lobbyData.gameConfig?.teamSize);
                    console.log('Spectator Type:', lobbyData.gameConfig?.spectatorType);
                    console.log('Lobby Name:', lobbyData.lobbyName);
                    console.log('Lobby Password:', lobbyData.lobbyPassword);
                    console.log('Participants:', lobbyData.participants?.length || 0);

                    // Estrutura para criação automática
                    console.log('\n📝 ESTRUTURA PARA CRIAÇÃO AUTOMÁTICA:');
                    const autoCreateStructure = {
                        queueId: lobbyData.queueId,
                        gameConfig: {
                            gameMode: lobbyData.gameConfig?.gameMode,
                            mapId: lobbyData.gameConfig?.mapId,
                            pickType: lobbyData.gameConfig?.pickType,
                            spectatorType: lobbyData.gameConfig?.spectatorType,
                            teamSize: lobbyData.gameConfig?.teamSize
                        },
                        lobbyName: lobbyData.lobbyName,
                        lobbyPassword: lobbyData.lobbyPassword
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

                        // Parar o monitoramento
                        clearInterval(monitorInterval);
                        console.log('\n✅ Teste concluído com sucesso!');
                        process.exit(0);

                    } catch (error: any) {
                        console.log('❌ Falha na criação automática:', error.response?.data?.message || error.message);
                        console.log('📋 A estrutura capturada pode precisar de ajustes');
                    }

                    lastLobbyId = lobbyData.lobbyId;
                } else if (lobbyData.lobbyId && lobbyData.lobbyId !== lastLobbyId) {
                    console.log(`\n📋 Lobby detectado (não customizado):`, {
                        lobbyId: lobbyData.lobbyId,
                        queueId: lobbyData.queueId,
                        gameMode: lobbyData.gameConfig?.gameMode
                    });
                    lastLobbyId = lobbyData.lobbyId;
                }

                // Mostrar progresso a cada 10 verificações
                if (checkCount % 10 === 0) {
                    console.log(`⏳ Verificação ${checkCount}... (aguardando lobby customizado)`);
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
        console.error('❌ Erro no capturador:', error);
    }
}

captureLobbyConfig(); 