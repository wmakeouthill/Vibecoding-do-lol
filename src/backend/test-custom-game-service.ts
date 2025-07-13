import { CustomGameService } from './services/CustomGameService';
import { DatabaseManager } from './database/DatabaseManager';
import { LCUService } from './services/LCUService';

async function testCustomGameService() {
    console.log('🎮 TESTE FINAL DO CUSTOMGAMESERVICE');
    console.log('===================================');
    console.log('📋 Testando com estrutura capturada da partida atual');
    console.log('');

    try {
        // 1. Inicializar dependências
        console.log('🚀 Inicializando dependências...');

        const dbManager = new DatabaseManager();
        await dbManager.initialize();
        console.log('✅ DatabaseManager inicializado');

        const lcuService = new LCUService();
        await lcuService.initialize();
        console.log('✅ LCUService inicializado');

        if (!lcuService.isClientConnected()) {
            console.error('❌ LCU não está conectado!');
            return;
        }

        // 2. Criar CustomGameService
        console.log('🎯 Criando CustomGameService...');
        const customGameService = new CustomGameService(dbManager, lcuService);
        console.log('✅ CustomGameService criado');

        // 3. Verificar summoner atual
        const summoner = await lcuService.getCurrentSummoner();
        console.log('👤 Summoner:', summoner.displayName, `(ID: ${summoner.summonerId})`);

        // 4. Criar dados de teste para uma partida
        console.log('📝 Criando dados de teste...');

        // Criar uma partida de teste no banco
        const testMatch = {
            title: 'Teste Custom Game',
            description: 'Partida de teste para verificar criação automática',
            team1Players: ['popcornseller#coup', 'TestBotAlpha#TEST', 'TestBotBeta#TEST', 'TestBotGamma#TEST', 'TestBotDelta#TEST'],
            team2Players: ['TestBotEpsilon#TEST', 'TestBotZeta#TEST', 'TestBotEta#TEST', 'TestBotTheta#TEST', 'TestBotIota#TEST'],
            createdBy: 'popcornseller#coup',
            gameMode: 'CLASSIC',
            matchLeader: 'popcornseller#coup'
        };

        // Inserir partida de teste no banco
        const testMatchId = await dbManager.createCustomMatch(testMatch);
        console.log('✅ Partida de teste criada no banco');

        // 5. Testar criação de partida customizada
        console.log('🎮 Testando criação de partida customizada...');

        try {
            await customGameService.startCustomGameCreation(testMatchId);
            console.log('✅ startCustomGameCreation executado com sucesso');

            // 6. Verificar status da partida
            console.log('📊 Verificando status da partida...');
            const gameData = await customGameService.getCustomGameByMatchId(testMatchId);
            if (gameData) {
                console.log('📋 Dados da partida customizada:', {
                    matchId: gameData.matchId,
                    status: gameData.status,
                    lobbyId: gameData.lobbyId,
                    playersCount: gameData.players.length,
                    gameName: gameData.gameName
                });

                console.log('👥 Jogadores da partida:');
                gameData.players.forEach((player, index) => {
                    console.log(`  ${index + 1}. ${player.riotId} (${player.assignedLane}) - ${player.isLeader ? 'LÍDER' : 'Jogador'} - ${player.isBot ? 'BOT' : 'HUMANO'}`);
                });

            } else {
                console.log('⚠️ Partida customizada não encontrada');
            }

        } catch (customGameError) {
            console.error('❌ Erro ao criar partida customizada:', customGameError);

            if (customGameError instanceof Error) {
                console.error('📋 Detalhes do erro:', {
                    message: customGameError.message,
                    stack: customGameError.stack,
                    name: customGameError.name
                });
            }
        }

        // 7. Limpar dados de teste
        console.log('🧹 Limpando dados de teste...');
        try {
            await dbManager.deleteCustomMatch(testMatchId);
            console.log('✅ Dados de teste removidos');
        } catch (cleanupError) {
            console.warn('⚠️ Erro ao limpar dados de teste:', cleanupError);
        }

        console.log('🎉 Teste do CustomGameService concluído!');

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
testCustomGameService().then(() => {
    console.log('🏁 Teste concluído');
    process.exit(0);
}).catch((error) => {
    console.error('💥 Erro fatal no teste:', error);
    process.exit(1);
}); 