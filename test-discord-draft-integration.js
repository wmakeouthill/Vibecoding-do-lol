const { DatabaseManager } = require('./src/backend/database/DatabaseManager');
const { MatchmakingService } = require('./src/backend/services/MatchmakingService');
const { MatchFoundService } = require('./src/backend/services/MatchFoundService');
const { DraftService } = require('./src/backend/services/DraftService');
const { DiscordService } = require('./src/backend/services/DiscordService');

async function testDiscordDraftIntegration() {
    console.log('🎮 Testando integração Discord + Draft...');
    
    const dbManager = new DatabaseManager();
    await dbManager.connect();
    
    // Mock WebSocket server
    const mockWss = { clients: new Set() };
    
    // Criar instâncias dos serviços
    const discordService = new DiscordService(dbManager);
    const draftService = new DraftService(dbManager, mockWss, discordService);
    const matchFoundService = new MatchFoundService(dbManager, mockWss, discordService);
    
    console.log('✅ Serviços criados com integração Discord');
    
    // Simular dados de teste
    const testPlayers = [
        'TestPlayer1#BR1', 'TestPlayer2#BR1', 'TestPlayer3#BR1', 'TestPlayer4#BR1', 'TestPlayer5#BR1',
        'TestPlayer6#BR1', 'TestPlayer7#BR1', 'TestPlayer8#BR1', 'TestPlayer9#BR1', 'TestPlayer10#BR1'
    ];
    
    try {
        // 1. Adicionar jogadores à fila
        console.log('1. 📝 Adicionando jogadores à fila...');
        for (let i = 0; i < testPlayers.length; i++) {
            const playerName = testPlayers[i];
            await dbManager.addPlayerToQueue(
                i + 1,                                      // player_id
                playerName,                                 // summoner_name
                'br1',                                      // region
                1200 + (i * 50),                           // custom_lp
                {                                          // preferences
                    primaryLane: ['top', 'jungle', 'mid', 'adc', 'support'][i % 5],
                    secondaryLane: ['support', 'adc', 'mid', 'jungle', 'top'][i % 5]
                }
            );
        }
        
        // 2. Criar match
        console.log('2. 🎯 Criando match...');
        const team1 = testPlayers.slice(0, 5);
        const team2 = testPlayers.slice(5, 10);
        
        const matchId = await dbManager.createCustomMatch({
            team1_players: JSON.stringify(team1),
            team2_players: JSON.stringify(team2),
            status: 'waiting_acceptance',
            average_mmr_team1: 1300,
            average_mmr_team2: 1350
        });
        
        console.log(`✅ Match criado com ID: ${matchId}`);
        
        // 3. Simular aceitação automática de todos os jogadores
        console.log('3. ✅ Simulando aceitação de todos os jogadores...');
        for (const playerName of testPlayers) {
            await dbManager.updatePlayerAcceptanceStatus(playerName, 1); // 1 = accepted
        }
        
        // 4. Atualizar status do match para 'accepted'
        console.log('4. 📋 Atualizando status do match para accepted...');
        await dbManager.updateCustomMatchStatus(matchId, 'accepted');
        
        // 5. Iniciar draft (que deve chamar o Discord)
        console.log('5. 🎯 Iniciando draft (deve criar canais Discord)...');
        await draftService.startDraft(matchId);
        
        // 6. Verificar se o match foi criado no Discord
        console.log('6. 🔍 Verificando status do Discord...');
        const isConnected = discordService.isDiscordConnected();
        const activeMatches = discordService.getActiveMatches();
        
        console.log(`📊 Status Discord:`, {
            connected: isConnected,
            activeMatches: activeMatches,
            matchesCount: discordService.getActiveMatches()
        });
        
        if (isConnected) {
            console.log('✅ Discord está conectado, match deve ter sido criado');
            console.log('🎮 Matches ativos no Discord:', Array.from(discordService.getAllActiveMatches().keys()));
        } else {
            console.log('⚠️ Discord não está conectado, channels não foram criados');
        }
        
        // 7. Verificar dados do match no banco
        const updatedMatch = await dbManager.getCustomMatchById(matchId);
        console.log('📋 Status final do match:', {
            id: updatedMatch.id,
            status: updatedMatch.status,
            hasDraftData: !!updatedMatch.draft_data
        });
        
        console.log('✅ Teste de integração Discord + Draft concluído');
        
    } catch (error) {
        console.error('❌ Erro no teste:', error);
    } finally {
        await dbManager.disconnect();
    }
}

// Executar teste
testDiscordDraftIntegration().catch(console.error);
