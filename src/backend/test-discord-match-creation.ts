import { DiscordService } from './services/DiscordService';
import { DatabaseManager } from './database/DatabaseManager';

async function testDiscordMatchCreation() {
    console.log('🧪 [Test] Iniciando teste de criação de match Discord...');

    try {
        // Inicializar banco de dados
        const dbManager = new DatabaseManager();
        await dbManager.initialize();
        console.log('✅ [Test] Banco de dados inicializado');

        // Criar instância do DiscordService
        const discordService = new DiscordService(dbManager);
        console.log('✅ [Test] DiscordService criado');

        // Verificar se há token configurado
        const savedToken = await dbManager.getSetting('discord_bot_token');
        if (!savedToken) {
            console.error('❌ [Test] Token do Discord não configurado');
            return;
        }

        // Inicializar DiscordService
        const initialized = await discordService.initialize(savedToken);
        if (!initialized) {
            console.error('❌ [Test] Falha ao inicializar DiscordService');
            return;
        }

        console.log('✅ [Test] DiscordService inicializado');
        console.log('🔍 [Test] Status do DiscordService:', {
            isConnected: discordService.isDiscordConnected(),
            isReady: discordService.isReady(),
            botUsername: discordService.getBotUsername()
        });

        // Dados de teste para simular um match
        const testMatchId = 999;
        const testMatchData = {
            team1_players: [
                { summonerName: 'TestPlayer1#BR1', lane: 'top' },
                { summonerName: 'TestPlayer2#BR1', lane: 'jungle' },
                { summonerName: 'TestPlayer3#BR1', lane: 'mid' },
                { summonerName: 'TestPlayer4#BR1', lane: 'adc' },
                { summonerName: 'TestPlayer5#BR1', lane: 'support' }
            ],
            team2_players: [
                { summonerName: 'TestPlayer6#BR1', lane: 'top' },
                { summonerName: 'TestPlayer7#BR1', lane: 'jungle' },
                { summonerName: 'TestPlayer8#BR1', lane: 'mid' },
                { summonerName: 'TestPlayer9#BR1', lane: 'adc' },
                { summonerName: 'TestPlayer10#BR1', lane: 'support' }
            ]
        };

        console.log('🧪 [Test] Testando criação de match Discord...');
        console.log('🧪 [Test] Match ID:', testMatchId);
        console.log('🧪 [Test] Dados do match:', testMatchData);

        // Tentar criar o match Discord
        await discordService.createDiscordMatch(testMatchId, testMatchData);

        // Verificar se foi criado
        const activeMatches = discordService.getAllActiveMatches();
        const matchExists = activeMatches.has(testMatchId.toString());

        console.log('📋 [Test] Resultado:', {
            matchCreated: matchExists,
            activeMatchesCount: activeMatches.size,
            matchDetails: matchExists ? activeMatches.get(testMatchId.toString()) : null
        });

        if (matchExists) {
            console.log('✅ [Test] Match Discord criado com sucesso!');

            // Limpar o match de teste
            console.log('🧹 [Test] Limpando match de teste...');
            await discordService.cleanupMatchByCustomId(testMatchId);
            console.log('✅ [Test] Match de teste limpo');
        } else {
            console.log('❌ [Test] Falha ao criar match Discord');
        }

    } catch (error) {
        console.error('❌ [Test] Erro durante o teste:', error);
    }
}

// Executar o teste
testDiscordMatchCreation().then(() => {
    console.log('🏁 [Test] Teste concluído');
    process.exit(0);
}).catch((error) => {
    console.error('💥 [Test] Erro fatal:', error);
    process.exit(1);
}); 