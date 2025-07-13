import { LCUService } from './services/LCUService';

async function testLCUHybridSimple() {
    console.log('🧪 TESTE LCU HÍBRIDO SIMPLES');
    console.log('=============================');

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

        // 2. Verificar summoner atual
        const summoner = await lcuService.getCurrentSummoner();
        console.log('👤 Summoner:', summoner.displayName, `(ID: ${summoner.summonerId})`);

        // 3. Tentar detectar lobby manual
        console.log('\n2️⃣ Tentando detectar lobby manual...');

        try {
            const lobbyResponse = await lcuService.getLobbyData();
            const lobbyData = lobbyResponse.data;

            console.log('📋 Lobby detectado:', {
                lobbyId: lobbyData.lobbyId,
                queueId: lobbyData.queueId,
                gameConfig: lobbyData.gameConfig,
                participants: lobbyData.participants?.length || 0
            });

            // Verificar se é um lobby customizado
            if (lobbyData.queueId === 0) {
                console.log('✅ Lobby customizado detectado!');

                // Configurar com as configurações corretas
                console.log('\n3️⃣ Configurando lobby com configurações corretas...');

                const updatedConfig = {
                    gameConfig: {
                        gameMode: 'CLASSIC',
                        mapId: 11,
                        pickType: 'BLIND_PICK',
                        spectatorType: 'ALL',
                        teamSize: 5
                    },
                    lobbyName: 'TESTE HÍBRIDO',
                    lobbyPassword: 'ordem123'
                };

                try {
                    await lcuService.makeLCURequest('PUT', '/lol-lobby/v2/lobby', updatedConfig);
                    console.log('✅ Configuração do lobby atualizada com sucesso!');
                    console.log('🎉 Lobby configurado como "Escolha às Cegas" com senha "ordem123"');
                } catch (error: any) {
                    console.log('❌ Erro ao atualizar configuração:', error.response?.data?.message || error.message);
                }

            } else {
                console.log('❌ Lobby não é customizado (queueId:', lobbyData.queueId, ')');
            }

        } catch (error: any) {
            if (error.response?.data?.errorCode === 'LOBBY_NOT_FOUND') {
                console.log('📋 Nenhum lobby ativo encontrado');
                console.log('\n📋 Instruções para teste:');
                console.log('1. Crie um lobby customizado manualmente no League of Legends');
                console.log('2. Configure como "Escolha às Cegas"');
                console.log('3. Defina a senha como "ordem123"');
                console.log('4. Execute este teste novamente');
            } else {
                console.error('❌ Erro ao verificar lobby:', error);
            }
        }

    } catch (error: any) {
        console.error('❌ Erro no teste:', error);
    }
}

testLCUHybridSimple(); 