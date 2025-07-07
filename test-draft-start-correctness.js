const axios = require('axios');
const mysql = require('mysql2/promise');

// Configuração do banco de dados
const dbConfig = {
    host: 'lolmatchmaking.mysql.uhserver.com',
    user: 'wmakeouthill',
    password: 'Angel1202@@',
    database: 'lolmatchmaking',
    charset: 'utf8mb4'
};

// Configuração da API
const API_BASE_URL = 'http://localhost:3000';

// Dados de teste com jogadores únicos
const testPlayers = [
    { summonerName: 'TestPlayer1', primaryLane: 'top', secondaryLane: 'jungle' },
    { summonerName: 'TestPlayer2', primaryLane: 'jungle', secondaryLane: 'top' },
    { summonerName: 'TestPlayer3', primaryLane: 'mid', secondaryLane: 'top' },
    { summonerName: 'TestPlayer4', primaryLane: 'adc', secondaryLane: 'mid' },
    { summonerName: 'TestPlayer5', primaryLane: 'support', secondaryLane: 'adc' },
    { summonerName: 'TestPlayer6', primaryLane: 'top', secondaryLane: 'jungle' },
    { summonerName: 'TestPlayer7', primaryLane: 'jungle', secondaryLane: 'mid' },
    { summonerName: 'TestPlayer8', primaryLane: 'mid', secondaryLane: 'adc' },
    { summonerName: 'TestPlayer9', primaryLane: 'adc', secondaryLane: 'support' },
    { summonerName: 'TestPlayer10', primaryLane: 'support', secondaryLane: 'top' }
];

async function cleanDatabase() {
    const connection = await mysql.createConnection(dbConfig);
    
    try {
        await connection.execute('DELETE FROM custom_matches');
        await connection.execute('DELETE FROM queue_players');
        
        console.log('✅ Banco de dados limpo');
    } catch (error) {
        console.error('❌ Erro ao limpar banco:', error);
    } finally {
        await connection.end();
    }
}

async function addPlayersToQueue() {
    console.log('🔄 Adicionando jogadores à fila...');
    
    for (const player of testPlayers) {
        try {
            await axios.post(`${API_BASE_URL}/api/queue/join`, {
                playerData: {
                    summonerName: player.summonerName,
                    region: 'br1',
                    currentMMR: 1200
                },
                preferences: {
                    primaryLane: player.primaryLane,
                    secondaryLane: player.secondaryLane
                }
            });
            
            console.log(`✅ ${player.summonerName} adicionado à fila`);
        } catch (error) {
            console.error(`❌ Erro ao adicionar ${player.summonerName}:`, error.message);
        }
    }
}

async function waitForMatchFound() {
    console.log('⏳ Aguardando criação da partida...');
    
    const connection = await mysql.createConnection(dbConfig);
    
    try {
        let matchFound = false;
        let attempts = 0;
        const maxAttempts = 30;
        
        while (!matchFound && attempts < maxAttempts) {
            const [rows] = await connection.execute(
                'SELECT * FROM custom_matches WHERE status = ? OR status = ?',
                ['pending', 'accepted']
            );
            
            if (rows.length > 0) {
                matchFound = true;
                console.log(`✅ Partida encontrada: ${rows[0].id} (status: ${rows[0].status})`);
                return rows[0];
            }
            
            attempts++;
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
        
        if (!matchFound) {
            throw new Error('Partida não foi criada no tempo esperado');
        }
        
    } finally {
        await connection.end();
    }
}

async function waitForDraftStart() {
    console.log('⏳ Aguardando início do draft...');
    
    const connection = await mysql.createConnection(dbConfig);
    
    try {
        let draftStarted = false;
        let attempts = 0;
        const maxAttempts = 30;
        
        while (!draftStarted && attempts < maxAttempts) {
            const [rows] = await connection.execute(
                'SELECT * FROM custom_matches WHERE status = ?',
                ['draft']
            );
            
            if (rows.length > 0) {
                draftStarted = true;
                console.log(`✅ Draft iniciado: partida ${rows[0].id}`);
                return rows[0];
            }
            
            attempts++;
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
        
        if (!draftStarted) {
            throw new Error('Draft não foi iniciado no tempo esperado');
        }
        
    } finally {
        await connection.end();
    }
}

async function checkDraftData(matchId) {
    console.log(`🔍 Verificando dados do draft para partida ${matchId}...`);
    
    const connection = await mysql.createConnection(dbConfig);
    
    try {
        const [rows] = await connection.execute(
            'SELECT * FROM custom_matches WHERE id = ?',
            [matchId]
        );
        
        if (rows.length === 0) {
            throw new Error(`Partida ${matchId} não encontrada`);
        }
        
        const match = rows[0];
        
        console.log('📊 Dados da partida:');
        console.log(`  - ID: ${match.id}`);
        console.log(`  - Status: ${match.status}`);
        console.log(`  - Created: ${match.created_at}`);
        console.log(`  - Updated: ${match.updated_at}`);
        
        // Verificar se os dados dos times estão preservados
        let team1Players = [];
        let team2Players = [];
        
        try {
            team1Players = typeof match.team1_players === 'string' 
                ? JSON.parse(match.team1_players) 
                : (match.team1_players || []);
            team2Players = typeof match.team2_players === 'string' 
                ? JSON.parse(match.team2_players) 
                : (match.team2_players || []);
        } catch (parseError) {
            console.error('❌ Erro ao parsear dados dos times:', parseError);
            return false;
        }
        
        console.log(`  - Team 1 (${team1Players.length} jogadores):`, team1Players);
        console.log(`  - Team 2 (${team2Players.length} jogadores):`, team2Players);
        
        // Verificar se há dados do draft
        let draftData = null;
        if (match.draft_data) {
            try {
                draftData = typeof match.draft_data === 'string' 
                    ? JSON.parse(match.draft_data) 
                    : match.draft_data;
                
                console.log('📋 Dados do draft:');
                console.log(`  - Match ID: ${draftData.matchId}`);
                console.log(`  - Team 1 Draft (${draftData.team1?.length || 0} jogadores):`);
                if (draftData.team1) {
                    draftData.team1.forEach(p => {
                        console.log(`    - ${p.summonerName} (${p.assignedLane}) MMR: ${p.mmr} ${p.isAutofill ? '(autofill)' : ''}`);
                    });
                }
                console.log(`  - Team 2 Draft (${draftData.team2?.length || 0} jogadores):`);
                if (draftData.team2) {
                    draftData.team2.forEach(p => {
                        console.log(`    - ${p.summonerName} (${p.assignedLane}) MMR: ${p.mmr} ${p.isAutofill ? '(autofill)' : ''}`);
                    });
                }
                console.log(`  - MMR Médio: Team1=${Math.round(draftData.averageMMR?.team1 || 0)}, Team2=${Math.round(draftData.averageMMR?.team2 || 0)}`);
                console.log(`  - Balance Quality: ${Math.round(draftData.balanceQuality || 0)}`);
                console.log(`  - Autofill Count: ${draftData.autofillCount || 0}`);
                
            } catch (parseError) {
                console.error('❌ Erro ao parsear dados do draft:', parseError);
            }
        } else {
            console.log('⚠️ Nenhum dado do draft encontrado');
        }
        
        // Verificar se os times foram preservados corretamente
        let teamsPreserved = true;
        
        if (draftData && draftData.team1 && draftData.team2) {
            const draftTeam1Names = draftData.team1.map(p => p.summonerName).sort();
            const draftTeam2Names = draftData.team2.map(p => p.summonerName).sort();
            const originalTeam1Names = team1Players.sort();
            const originalTeam2Names = team2Players.sort();
            
            if (JSON.stringify(draftTeam1Names) !== JSON.stringify(originalTeam1Names) ||
                JSON.stringify(draftTeam2Names) !== JSON.stringify(originalTeam2Names)) {
                teamsPreserved = false;
                console.log('❌ Times não foram preservados corretamente!');
                console.log('Original Team 1:', originalTeam1Names);
                console.log('Draft Team 1:', draftTeam1Names);
                console.log('Original Team 2:', originalTeam2Names);
                console.log('Draft Team 2:', draftTeam2Names);
            } else {
                console.log('✅ Times foram preservados corretamente do match found para o draft');
            }
        }
        
        return {
            match,
            draftData,
            teamsPreserved
        };
        
    } finally {
        await connection.end();
    }
}

async function checkForDuplicateMatches() {
    console.log('🔍 Verificando duplicatas de partidas...');
    
    const connection = await mysql.createConnection(dbConfig);
    
    try {
        const [rows] = await connection.execute(
            'SELECT * FROM custom_matches ORDER BY id ASC'
        );
        
        console.log(`📊 Total de partidas encontradas: ${rows.length}`);
        
        if (rows.length > 1) {
            console.log('❌ DUPLICATAS DETECTADAS!');
            rows.forEach((match, index) => {
                console.log(`  Partida ${index + 1}:`);
                console.log(`    - ID: ${match.id}`);
                console.log(`    - Status: ${match.status}`);
                console.log(`    - Created: ${match.created_at}`);
                console.log(`    - Updated: ${match.updated_at}`);
            });
            return false;
        } else if (rows.length === 1) {
            console.log('✅ Apenas uma partida encontrada (correto)');
            return true;
        } else {
            console.log('⚠️ Nenhuma partida encontrada');
            return false;
        }
        
    } finally {
        await connection.end();
    }
}

async function checkQueueAfterDraft() {
    console.log('🔍 Verificando estado da fila após draft...');
    
    const connection = await mysql.createConnection(dbConfig);
    
    try {
        const [rows] = await connection.execute(
            'SELECT * FROM queue_players'
        );
        
        console.log(`📊 Jogadores restantes na fila: ${rows.length}`);
        
        if (rows.length > 0) {
            console.log('⚠️ Ainda há jogadores na fila após draft iniciado:');
            rows.forEach(player => {
                console.log(`  - ${player.summoner_name} (${player.primary_lane}/${player.secondary_lane})`);
            });
        } else {
            console.log('✅ Todos os jogadores foram removidos da fila (correto)');
        }
        
        return rows.length === 0;
        
    } finally {
        await connection.end();
    }
}

async function runTest() {
    console.log('🧪 === TESTE DE CORREÇÃO DO DRAFT ===');
    console.log('Verificando se o draft preserva os times do match found e não cria duplicatas');
    
    try {
        // 1. Limpar banco
        await cleanDatabase();
        
        // 2. Adicionar jogadores à fila
        await addPlayersToQueue();
        
        // 3. Aguardar criação da partida
        const match = await waitForMatchFound();
        
        // 4. Aguardar início do draft
        const draftMatch = await waitForDraftStart();
        
        // 5. Verificar dados do draft
        const draftInfo = await checkDraftData(draftMatch.id);
        
        // 6. Verificar duplicatas
        const noDuplicates = await checkForDuplicateMatches();
        
        // 7. Verificar estado da fila
        const queueCleared = await checkQueueAfterDraft();
        
        // 8. Verificar se é a mesma partida
        const sameMatch = match.id === draftMatch.id;
        
        console.log('\n📊 === RESULTADO DO TESTE ===');
        console.log(`✅ Partida única (sem duplicatas): ${noDuplicates ? 'SIM' : 'NÃO'}`);
        console.log(`✅ Mesma partida (match found → draft): ${sameMatch ? 'SIM' : 'NÃO'}`);
        console.log(`✅ Times preservados: ${draftInfo.teamsPreserved ? 'SIM' : 'NÃO'}`);
        console.log(`✅ Fila limpa após draft: ${queueCleared ? 'SIM' : 'NÃO'}`);
        console.log(`✅ Dados do draft presentes: ${draftInfo.draftData ? 'SIM' : 'NÃO'}`);
        
        const allPassed = noDuplicates && sameMatch && draftInfo.teamsPreserved && queueCleared && draftInfo.draftData;
        
        console.log(`\n${allPassed ? '✅ TODOS OS TESTES PASSARAM!' : '❌ ALGUNS TESTES FALHARAM!'}`);
        
        if (!allPassed) {
            console.log('\n🔧 PROBLEMAS IDENTIFICADOS:');
            if (!noDuplicates) console.log('  - Há duplicatas de partidas');
            if (!sameMatch) console.log('  - Uma nova partida foi criada para o draft');
            if (!draftInfo.teamsPreserved) console.log('  - Os times não foram preservados corretamente');
            if (!queueCleared) console.log('  - Jogadores não foram removidos da fila');
            if (!draftInfo.draftData) console.log('  - Dados do draft não foram salvos');
        }
        
    } catch (error) {
        console.error('❌ Erro no teste:', error);
    }
}

// Executar teste
runTest();
