const WebSocket = require('ws');

// Script de teste para verificar o cancelamento do Discord
async function testDiscordCleanup() {
    console.log('🧪 Iniciando teste de cancelamento do Discord...');

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

                    if (data.success && data.discordStatus.activeMatchesCount > 0) {
                        console.log('🎯 Encontrados matches ativos, testando limpeza...');

                        // Testar limpeza do primeiro match
                        const firstMatch = data.discordStatus.activeMatches[0];
                        console.log('🧹 Testando limpeza do match:', firstMatch.matchId);

                        return fetch('http://localhost:3000/api/debug/force-cleanup-match', {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json'
                            },
                            body: JSON.stringify({
                                matchId: firstMatch.matchId
                            })
                        });
                    } else {
                        console.log('⚠️ Nenhum match ativo encontrado para testar');
                        ws.close();
                    }
                })
                .then(res => res.json())
                .then(data => {
                    console.log('✅ Resultado da limpeza:', data);

                    // Verificar status novamente
                    return fetch('http://localhost:3000/api/debug/discord-status');
                })
                .then(res => res.json())
                .then(data => {
                    console.log('📋 Status após limpeza:', data);
                    ws.close();
                })
                .catch(error => {
                    console.error('❌ Erro no teste:', error);
                    ws.close();
                });
        }, 1000);
    });

    ws.on('message', (data) => {
        const message = JSON.parse(data);
        console.log('📨 Mensagem recebida:', message.type);
    });

    ws.on('error', (error) => {
        console.error('❌ Erro no WebSocket:', error);
    });

    ws.on('close', () => {
        console.log('🔌 WebSocket fechado');
    });
}

// Executar o teste
testDiscordCleanup().catch(console.error); 