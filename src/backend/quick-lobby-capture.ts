import { LCUService } from './services/LCUService';

async function quickLobbyCapture() {
    console.log('🔍 CAPTURA RÁPIDA DE LOBBY');
    console.log('==========================');

    const lcuService = new LCUService();

    try {
        // 1. Inicializar LCU
        console.log('🚀 Inicializando LCU Service...');
        await lcuService.initialize();

        if (!lcuService.isClientConnected()) {
            console.error('❌ LCU não está conectado!');
            console.log('📋 Verifique se o League of Legends está aberto');
            return;
        }

        console.log('✅ LCU conectado com sucesso');

        // 2. Verificar summoner atual
        const summoner = await lcuService.getCurrentSummoner();
        console.log('👤 Summoner:', summoner.displayName, `(ID: ${summoner.summonerId})`);

        // 3. Capturar lobby atual
        console.log('\n🔍 Capturando lobby atual...');

        try {
            const lobbyResponse = await lcuService.getLobbyData();
            const lobbyData = lobbyResponse.data;

            console.log('\n📋 ESTRUTURA COMPLETA DO LOBBY:');
            console.log(JSON.stringify(lobbyData, null, 2));

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

            // Verificar se é customizado
            if (lobbyData.queueId === 0) {
                console.log('\n✅ É um lobby customizado!');
                console.log('📋 Esta estrutura pode ser usada para criação automática');
            } else {
                console.log('\n⚠️ Não é um lobby customizado (queueId:', lobbyData.queueId, ')');
                console.log('📋 Crie um lobby customizado manualmente para capturar a estrutura correta');
            }

        } catch (error: any) {
            if (error.response?.data?.errorCode === 'LOBBY_NOT_FOUND') {
                console.log('\n📋 Nenhum lobby ativo encontrado');
                console.log('📋 Crie um lobby customizado manualmente para capturar a estrutura');
            } else {
                console.error('❌ Erro ao capturar lobby:', error.response?.data?.message || error.message);
            }
        }

    } catch (error: any) {
        console.error('❌ Erro no capturador:', error);
    }
}

quickLobbyCapture(); 