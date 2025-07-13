const WebSocket = require('ws');

// Script de teste para verificar correção de duplicidade e Discord
async function testDuplicateFix() {
    console.log('🧪 Iniciando teste de correção de duplicidade e Discord...');

    const ws = new WebSocket('ws://localhost:3000');

    ws.on('open', () => {
        console.log('✅ Conectado ao WebSocket');

        // Aguardar um pouco para garantir que a conexão está estável
        setTimeout(() => {
            console.log('🔍 Verificando status do DiscordService...');

            // Verificar status do Discord
            fetch('http://localhost:3000/api/debug/discord-status')
                .then(res => res.json())
                .then(data => {
                    console.log('📋 Status do DiscordService:', data);

                    if (data.success) {
                        console.log('✅ DiscordService está funcionando');
                        console.log(`  - Conectado: ${data.discordStatus.isConnected}`);
                        console.log(`  - Pronto: ${data.discordStatus.isReady}`);
                        console.log(`  - Bot: ${data.discordStatus.botUsername}`);
                        console.log(`  - Matches ativos: ${data.discordStatus.activeMatchesCount}`);
                    } else {
                        console.log('❌ DiscordService não está funcionando');
                    }
                })
                .catch(error => {
                    console.error('❌ Erro ao verificar DiscordService:', error);
                });
        }, 1000);
    });

    ws.on('message', (data) => {
        try {
            const message = JSON.parse(data);

            if (message.type === 'match_found') {
                console.log('🎯 Match Found recebido:');
                console.log('  MatchId:', message.data.matchId);
                console.log('  Team1 (azul):', message.data.team1?.map(p => p.summonerName));
                console.log('  Team2 (vermelho):', message.data.team2?.map(p => p.summonerName));

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
                console.log('  MatchId:', message.data.matchId);
                console.log('  Team1 (azul):', message.data.team1?.map(p => p.summonerName));
                console.log('  Team2 (vermelho):', message.data.team2?.map(p => p.summonerName));

                // Verificar se não há duplicidade
                console.log('🔍 Verificando duplicidade...');

                // Verificar status do Discord novamente
                setTimeout(() => {
                    fetch('http://localhost:3000/api/debug/discord-status')
                        .then(res => res.json())
                        .then(data => {
                            if (data.success) {
                                console.log('📋 Status do Discord após draft:');
                                console.log(`  - Matches ativos: ${data.discordStatus.activeMatchesCount}`);
                                console.log(`  - Match atual: ${data.discordStatus.activeMatches.find(m => m.matchId == message.data.matchId) ? 'ENCONTRADO' : 'NÃO ENCONTRADO'}`);

                                if (data.discordStatus.activeMatchesCount === 1) {
                                    console.log('✅ SUCESSO: Apenas 1 match ativo (sem duplicidade)');
                                } else {
                                    console.log('❌ PROBLEMA: Múltiplos matches ativos (possível duplicidade)');
                                }
                            }
                        })
                        .catch(error => {
                            console.error('❌ Erro ao verificar DiscordService:', error);
                        });
                }, 2000);

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
testDuplicateFix().catch(console.error); 