const WebSocket = require('ws');

// Script de teste para verificar a ordenação dos times
async function testTeamOrdering() {
    console.log('🧪 Iniciando teste de ordenação dos times...');

    const ws = new WebSocket('ws://localhost:3000');

    ws.on('open', () => {
        console.log('✅ Conectado ao WebSocket');

        // Aguardar um pouco para garantir que a conexão está estável
        setTimeout(() => {
            console.log('🔍 Verificando dados de uma partida recente...');

            // Verificar partidas recentes
            fetch('http://localhost:3000/api/matches/recent')
                .then(res => res.json())
                .then(data => {
                    if (data.success && data.matches.length > 0) {
                        const latestMatch = data.matches[0];
                        console.log('📋 Partida mais recente encontrada:', {
                            id: latestMatch.id,
                            status: latestMatch.status,
                            team1_players: latestMatch.team1_players,
                            team2_players: latestMatch.team2_players
                        });

                        // Verificar se a partida tem dados de draft
                        if (latestMatch.pick_ban_data) {
                            console.log('🎯 Partida tem dados de draft, verificando ordenação...');
                            const draftData = JSON.parse(latestMatch.pick_ban_data);

                            console.log('🔵 Time 1 (deveria ser azul):', draftData.team1?.map(p => ({
                                name: p.summonerName,
                                lane: p.assignedLane,
                                teamIndex: p.teamIndex
                            })));

                            console.log('🔴 Time 2 (deveria ser vermelho):', draftData.team2?.map(p => ({
                                name: p.summonerName,
                                lane: p.assignedLane,
                                teamIndex: p.teamIndex
                            })));

                            // Verificar se teamIndex está correto
                            const team1Correct = draftData.team1?.every(p => p.teamIndex >= 0 && p.teamIndex <= 4);
                            const team2Correct = draftData.team2?.every(p => p.teamIndex >= 5 && p.teamIndex <= 9);

                            console.log('✅ Verificação de teamIndex:');
                            console.log(`  Time 1 (0-4): ${team1Correct ? 'CORRETO' : 'INCORRETO'}`);
                            console.log(`  Time 2 (5-9): ${team2Correct ? 'CORRETO' : 'INCORRETO'}`);

                        } else {
                            console.log('⚠️ Partida não tem dados de draft ainda');
                        }
                    } else {
                        console.log('❌ Nenhuma partida encontrada');
                    }
                })
                .catch(error => {
                    console.error('❌ Erro ao buscar partidas:', error);
                });
        }, 1000);
    });

    ws.on('message', (data) => {
        try {
            const message = JSON.parse(data);

            if (message.type === 'match_found') {
                console.log('🎯 Match Found recebido:');
                console.log('  Team1 (deveria ser azul):', message.data.team1?.map(p => p.summonerName));
                console.log('  Team2 (deveria ser vermelho):', message.data.team2?.map(p => p.summonerName));

                // Simular aceitação para todos os jogadores
                setTimeout(() => {
                    console.log('🤖 Simulando aceitação automática...');
                    const allPlayers = [...(message.data.team1 || []), ...(message.data.team2 || [])];

                    allPlayers.forEach((player, index) => {
                        setTimeout(() => {
                            ws.send(JSON.stringify({
                                type: 'accept_match',
                                data: {
                                    matchId: message.data.matchId,
                                    summonerName: player.summonerName
                                }
                            }));
                            console.log(`✅ Aceitação enviada para ${player.summonerName}`);
                        }, index * 500);
                    });
                }, 2000);
            }

            if (message.type === 'draft_started') {
                console.log('🎯 Draft Started recebido:');
                console.log('  Team1 (deveria ser azul):', message.data.team1?.map(p => p.summonerName));
                console.log('  Team2 (deveria ser vermelho):', message.data.team2?.map(p => p.summonerName));

                // Verificar se a ordenação é a mesma do match_found
                console.log('🔍 Comparando ordenação:');
                console.log('  Match Found Team1:', message.data.teammates?.map(p => p.summonerName));
                console.log('  Draft Team1:', message.data.team1?.map(p => p.summonerName));
                console.log('  Match Found Team2:', message.data.enemies?.map(p => p.summonerName));
                console.log('  Draft Team2:', message.data.team2?.map(p => p.summonerName));

                // Verificar teamIndex
                console.log('🔍 Verificando teamIndex:');
                console.log('  Team1 teamIndex:', message.data.team1?.map(p => p.teamIndex));
                console.log('  Team2 teamIndex:', message.data.team2?.map(p => p.teamIndex));

                ws.close();
            }

        } catch (error) {
            console.error('❌ Erro ao processar mensagem:', error);
        }
    });

    ws.on('error', (error) => {
        console.error('❌ Erro de WebSocket:', error);
    });

    ws.on('close', () => {
        console.log('🔌 Conexão fechada');
    });
}

// Executar teste
testTeamOrdering().catch(console.error); 