import { LCUService } from './services/LCUService';

async function testLobbyEndpoint() {
    console.log('🧪 Testando endpoint padrão de lobby /lol-lobby/v2/lobby...');

    const lcuService = new LCUService();

    try {
        // 1. Inicializar LCU
        console.log('1️⃣ Inicializando LCU Service...');
        await lcuService.initialize();

        if (!lcuService.isClientConnected()) {
            console.error('❌ LCU não está conectado!');
            return;
        }

        console.log('✅ LCU conectado com sucesso');

        // 2. Testar endpoint padrão de lobby
        console.log('2️⃣ Testando endpoint /lol-lobby/v2/lobby...');

        const lobbyData = {
            queueId: 0, // Custom game
            gameConfig: {
                gameMode: 'CLASSIC',
                mapId: 11, // Summoner's Rift
                pickType: 'BLIND_PICK',
                spectatorType: 'ALL',
                teamSize: 5
            },
            lobbyName: 'TESTE LOBBY PADRÃO',
            lobbyPassword: 'ordem123'
        };

        console.log('📋 Dados do lobby:', JSON.stringify(lobbyData, null, 2));

        // 3. Tentar criar usando endpoint padrão
        const response = await lcuService.makeLCURequest('POST', '/lol-lobby/v2/lobby', lobbyData);

        console.log('✅ Lobby criado com sucesso!');
        console.log('📊 Resposta:', JSON.stringify(response.data, null, 2));

        // 4. Verificar se o lobby foi criado
        console.log('3️⃣ Verificando se o lobby foi criado...');
        const lobbyStatus = await lcuService.getLobbyData();
        console.log('📋 Status do lobby após criação:', JSON.stringify(lobbyStatus.data, null, 2));

    } catch (error: any) {
        console.error('❌ Erro ao criar lobby:', error);

        if (error.response) {
            console.error('📊 Status:', error.response.status);
            console.error('📋 Dados do erro:', JSON.stringify(error.response.data, null, 2));
        }
    }
}

testLobbyEndpoint(); 