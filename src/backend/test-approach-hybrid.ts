import { CustomGameService } from './services/CustomGameService';
import { DatabaseManager } from './database/DatabaseManager';
import { LCUService } from './services/LCUService';

async function testApproachHybrid() {
    console.log('🧪 TESTE ABORDAGEM HÍBRIDA - CustomGameService');
    console.log('==============================================');

    try {
        // 1. Inicializar dependências
        console.log('\n1️⃣ Inicializando dependências...');

        const dbManager = new DatabaseManager();
        await dbManager.initialize();
        console.log('✅ DatabaseManager inicializado');

        const lcuService = new LCUService();
        await lcuService.initialize();
        console.log('✅ LCUService inicializado');

        // 2. Criar CustomGameService
        console.log('\n2️⃣ Criando CustomGameService...');
        const customGameService = new CustomGameService(dbManager, lcuService);
        console.log('✅ CustomGameService criado');

        // 3. Dados de teste
        console.log('\n3️⃣ Preparando dados de teste...');
        const gameData = {
            matchId: 999999,
            gameName: 'TESTE ABORDAGEM HÍBRIDA',
            status: 'creating' as const,
            createdAt: new Date(),
            players: [
                { riotId: 'popcorn seller#coup', summonerId: 1786097, summonerName: 'popcorn seller', tagLine: 'coup', teamIndex: 0, assignedLane: 'TOP', isLeader: true, position: 'TOP' },
                { riotId: 'player2#tag2', summonerId: 1234567, summonerName: 'player2', tagLine: 'tag2', teamIndex: 0, assignedLane: 'JUNGLE', isLeader: false, position: 'JUNGLE' },
                { riotId: 'player3#tag3', summonerId: 2345678, summonerName: 'player3', tagLine: 'tag3', teamIndex: 0, assignedLane: 'MID', isLeader: false, position: 'MID' },
                { riotId: 'player4#tag4', summonerId: 3456789, summonerName: 'player4', tagLine: 'tag4', teamIndex: 0, assignedLane: 'BOTTOM', isLeader: false, position: 'ADC' },
                { riotId: 'player5#tag5', summonerId: 4567890, summonerName: 'player5', tagLine: 'tag5', teamIndex: 0, assignedLane: 'BOTTOM', isLeader: false, position: 'SUPPORT' },
                { riotId: 'player6#tag6', summonerId: 5678901, summonerName: 'player6', tagLine: 'tag6', teamIndex: 1, assignedLane: 'TOP', isLeader: false, position: 'TOP' },
                { riotId: 'player7#tag7', summonerId: 6789012, summonerName: 'player7', tagLine: 'tag7', teamIndex: 1, assignedLane: 'JUNGLE', isLeader: false, position: 'JUNGLE' },
                { riotId: 'player8#tag8', summonerId: 7890123, summonerName: 'player8', tagLine: 'tag8', teamIndex: 1, assignedLane: 'MID', isLeader: false, position: 'MID' },
                { riotId: 'player9#tag9', summonerId: 8901234, summonerName: 'player9', tagLine: 'tag9', teamIndex: 1, assignedLane: 'BOTTOM', isLeader: false, position: 'ADC' },
                { riotId: 'player10#tag10', summonerId: 9012345, summonerName: 'player10', tagLine: 'tag10', teamIndex: 1, assignedLane: 'BOTTOM', isLeader: false, position: 'SUPPORT' }
            ]
        };

        console.log('📋 Dados de teste preparados');

        // 4. Testar abordagem híbrida
        console.log('\n4️⃣ Testando abordagem híbrida...');
        console.log('📋 Instruções:');
        console.log('   - Se o teste falhar na criação automática, crie um lobby manualmente');
        console.log('   - Configure como "Escolha às Cegas" com senha "ordem123"');
        console.log('   - Execute o teste novamente');

        const matchId = 999999; // ID de teste
        const success = await customGameService.createCustomGame(matchId, gameData);

        if (success) {
            console.log('\n🎉 SUCESSO! Partida customizada criada/configurada!');
        } else {
            console.log('\n❌ Falha na criação. Siga as instruções acima.');
        }

    } catch (error: any) {
        console.error('❌ Erro no teste:', error);
    }
}

testApproachHybrid(); 