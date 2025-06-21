const axios = require('axios');
const https = require('https');

async function fetchRealLCUData() {
    try {
        console.log('🔍 Buscando dados reais do LCU...\n');
        
        // Configuração para ignorar certificado SSL
        const agent = new https.Agent({
            rejectUnauthorized: false
        });
        
        // Buscar o histórico de partidas do LCU
        const response = await axios.get('https://127.0.0.1:2999/liveclientdata/allgamedata', {
            httpsAgent: agent,
            auth: {
                username: 'riot',
                password: 'gAAAAABhJL8Z'
            },
            timeout: 5000
        });
        
        console.log('❌ Jogo em andamento encontrado - não é possível buscar histórico');
        
    } catch (error) {
        if (error.code === 'ECONNREFUSED' || error.response?.status === 404) {
            console.log('ℹ️ Nenhum jogo em andamento - tentando buscar histórico...\n');
            
            try {
                // Tentar buscar dados do histórico via LCU API
                const historyResponse = await axios.get('https://127.0.0.1:33075/lol-match-history/v1/products/lol/current-summoner/matches', {
                    httpsAgent: agent,
                    headers: {
                        'Authorization': 'Basic cmlvdDo='
                    },
                    timeout: 10000
                });
                
                const matches = historyResponse.data.games.games;
                console.log(`✅ ${matches.length} partidas encontradas no histórico\n`);
                
                // Buscar partidas personalizadas (queueId 0 ou gameMode CUSTOM)
                const customMatches = matches.filter(match => 
                    match.queueId === 0 || 
                    match.gameMode === 'CLASSIC' && match.gameType === 'CUSTOM_GAME'
                );
                
                console.log(`🎯 ${customMatches.length} partidas personalizadas encontradas\n`);
                
                if (customMatches.length > 0) {
                    const latestCustom = customMatches[0];
                    console.log('📊 Última partida personalizada no LCU:');
                    console.log('Game ID:', latestCustom.gameId);
                    console.log('Data:', new Date(latestCustom.gameCreation));
                    console.log('Duração:', latestCustom.gameDuration + 's');
                    console.log('Participantes:', latestCustom.participantIdentities.length);
                    
                    console.log('\n👥 Participantes:');
                    latestCustom.participants.forEach((p, index) => {
                        const identity = latestCustom.participantIdentities.find(id => id.participantId === p.participantId);
                        const summonerName = identity?.player?.summonerName || 'Unknown';
                        console.log(`  ${index + 1}. ${summonerName}: Champion${p.championId} (KDA: ${p.stats.kills}/${p.stats.deaths}/${p.stats.assists})`);
                    });
                    
                    return latestCustom.gameId;
                }
                
            } catch (historyError) {
                console.log('❌ Erro ao buscar histórico do LCU:', historyError.message);
                console.log('ℹ️ LCU pode não estar ativo ou acessível');
            }
        } else {
            console.log('❌ Erro ao conectar com LCU:', error.message);
        }
    }
    
    return null;
}

fetchRealLCUData();
