import { LCUService } from './services/LCUService';

async function testLCUConnection() {
    console.log('🧪 Testando conexão com LCU...');

    const lcuService = new LCUService();

    try {
        // 1. Testar inicialização
        console.log('1️⃣ Inicializando LCU Service...');
        await lcuService.initialize();
        console.log('✅ LCU Service inicializado com sucesso');

        // 2. Verificar conexão
        console.log('2️⃣ Verificando status da conexão...');
        const isConnected = lcuService.isClientConnected();
        console.log(`📊 Status da conexão: ${isConnected ? 'Conectado' : 'Desconectado'}`);

        if (!isConnected) {
            console.error('❌ LCU não está conectado!');
            return;
        }

        // 3. Buscar jogador atual
        console.log('3️⃣ Buscando jogador atual...');
        const currentSummoner = await lcuService.getCurrentSummoner();
        console.log('👤 Jogador atual:', {
            displayName: currentSummoner.displayName,
            gameName: currentSummoner.gameName,
            tagLine: currentSummoner.tagLine,
            summonerId: currentSummoner.summonerId
        });

        // 4. Testar criação de lobby personalizada escolha às cegas
        console.log('4️⃣ Testando criação de lobby BLIND_PICK...');
        const lobbyData = {
            queueId: 0, // Custom game
            gameConfig: {
                gameMode: 'CLASSIC',
                mapId: 11, // Summoner's Rift
                pickType: 'BLIND_PICK',
                spectatorType: 'ALL',
                teamSize: 5
            },
            lobbyPassword: 'ordem123'
        };

        console.log('📋 Dados do lobby a serem enviados:', JSON.stringify(lobbyData, null, 2));

        const lobbyResponse = await lcuService.createLobby(lobbyData);
        console.log('✅ Lobby criado com sucesso:', lobbyResponse.data);

        // 5. Buscar dados do lobby
        console.log('5️⃣ Buscando dados do lobby criado...');
        const lobbyInfo = await lcuService.getLobbyData();
        console.log('📊 Dados do lobby:', {
            lobbyId: lobbyInfo.data.lobbyId,
            participants: lobbyInfo.data.participants?.length || 0,
            gameConfig: lobbyInfo.data.gameConfig
        });

        console.log('🎉 Todos os testes passaram! LCU está funcionando corretamente.');

    } catch (error) {
        console.error('❌ Erro durante o teste:', error);

        if (error instanceof Error) {
            console.error('📋 Detalhes do erro:', {
                message: error.message,
                stack: error.stack,
                name: error.name
            });
        }
    }
}

// Executar teste
testLCUConnection().then(() => {
    console.log('🏁 Teste concluído');
    process.exit(0);
}).catch((error) => {
    console.error('💥 Erro fatal no teste:', error);
    process.exit(1);
}); 