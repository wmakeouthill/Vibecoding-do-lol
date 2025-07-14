const WebSocket = require('ws');

// Test script to verify Discord cleanup functionality
async function testDiscordCleanup() {
    console.log('🧪 [Test] Iniciando teste de limpeza do Discord...');

    const ws = new WebSocket('ws://localhost:3000');

    ws.on('open', () => {
        console.log('✅ [Test] Conectado ao servidor WebSocket');

        // Simular cancelamento de jogo em andamento
        const testMessage = {
            type: 'cancel_game_in_progress',
            data: {
                matchId: 123, // ID de teste
                reason: 'Teste de limpeza do Discord'
            }
        };

        console.log('📤 [Test] Enviando mensagem de cancelamento:', testMessage);
        ws.send(JSON.stringify(testMessage));
    });

    ws.on('message', (data) => {
        const message = JSON.parse(data.toString());
        console.log('📥 [Test] Resposta recebida:', message);

        if (message.type === 'game_cancelled') {
            console.log('✅ [Test] Cancelamento de jogo confirmado pelo servidor');
            console.log('✅ [Test] Teste concluído com sucesso');
        } else if (message.type === 'error') {
            console.error('❌ [Test] Erro recebido:', message.message);
        }

        // Fechar conexão após receber resposta
        setTimeout(() => {
            ws.close();
            console.log('🔌 [Test] Conexão fechada');
        }, 1000);
    });

    ws.on('error', (error) => {
        console.error('❌ [Test] Erro na conexão WebSocket:', error);
    });

    ws.on('close', () => {
        console.log('🔌 [Test] Conexão WebSocket fechada');
    });
}

// Executar teste
testDiscordCleanup().catch(console.error); 