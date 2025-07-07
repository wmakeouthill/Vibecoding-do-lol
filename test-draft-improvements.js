const { spawn } = require('child_process');
const WebSocket = require('ws');
const path = require('path');

console.log('🧪 [Test] Iniciando teste de melhorias do draft...');

// Configurações
const BACKEND_PORT = 3000;
const FRONTEND_PORT = 4200;
const WS_URL = `ws://localhost:${BACKEND_PORT}`;

let backendProcess = null;
let frontendProcess = null;
let testClient = null;

// Função para iniciar backend
function startBackend() {
    return new Promise((resolve, reject) => {
        console.log('🔧 [Test] Iniciando backend...');
        
        backendProcess = spawn('npm', ['run', 'dev:backend'], {
            cwd: path.join(__dirname),
            stdio: 'pipe',
            shell: true
        });

        backendProcess.stdout.on('data', (data) => {
            const output = data.toString();
            console.log(`[Backend] ${output.trim()}`);
            
            if (output.includes('servidor rodando na porta 3000')) {
                console.log('✅ [Test] Backend iniciado com sucesso');
                resolve();
            }
        });

        backendProcess.stderr.on('data', (data) => {
            console.error(`[Backend Error] ${data.toString()}`);
        });

        backendProcess.on('close', (code) => {
            console.log(`[Backend] Processo encerrado com código: ${code}`);
        });

        // Timeout para evitar travamento
        setTimeout(() => {
            reject(new Error('Timeout ao iniciar backend'));
        }, 30000);
    });
}

// Função para simular fluxo completo
async function simulateCompleteFlow() {
    console.log('\n🎯 [Test] Simulando fluxo completo...');
    
    try {
        // Conectar ao WebSocket
        testClient = new WebSocket(WS_URL);
        
        testClient.on('open', () => {
            console.log('✅ [Test] Cliente WebSocket conectado');
            
            // Simular que é um jogador real
            testClient.send(JSON.stringify({
                type: 'join_queue',
                data: {
                    gameName: 'TestPlayer',
                    tagLine: 'BR1',
                    preferences: {
                        primaryLane: 'mid',
                        secondaryLane: 'top'
                    }
                }
            }));
        });

        testClient.on('message', (data) => {
            try {
                const message = JSON.parse(data.toString());
                console.log(`📨 [Test] Mensagem recebida: ${message.type}`);
                
                switch (message.type) {
                    case 'queue_joined':
                        console.log('✅ [Test] Entrou na fila com sucesso');
                        // Adicionar bots para completar a fila
                        addBotsToQueue();
                        break;
                        
                    case 'match_found':
                        console.log('🎯 [Test] Partida encontrada!');
                        console.log('📊 [Test] Dados da partida:', {
                            teammates: message.data.teammates?.length || 0,
                            enemies: message.data.enemies?.length || 0,
                            matchId: message.data.matchId
                        });
                        
                        // Aceitar a partida
                        setTimeout(() => {
                            testClient.send(JSON.stringify({
                                type: 'accept_match',
                                data: {
                                    matchId: message.data.matchId,
                                    playerName: 'TestPlayer#BR1'
                                }
                            }));
                        }, 1000);
                        break;
                        
                    case 'draft_started':
                        console.log('🎯 [Test] Draft iniciado!');
                        console.log('📊 [Test] Dados do draft:', {
                            teammates: message.data.teammates?.length || 0,
                            enemies: message.data.enemies?.length || 0,
                            team1: message.data.team1?.length || 0,
                            team2: message.data.team2?.length || 0,
                            matchId: message.data.matchId
                        });
                        
                        // Testar cancelamento após 3 segundos
                        setTimeout(() => {
                            console.log('🚫 [Test] Testando cancelamento do draft...');
                            testClient.send(JSON.stringify({
                                type: 'cancel_draft',
                                data: {
                                    matchId: message.data.matchId,
                                    reason: 'Teste de cancelamento'
                                }
                            }));
                        }, 3000);
                        break;
                        
                    case 'draft_cancelled':
                        console.log('✅ [Test] Draft cancelado com sucesso!');
                        console.log('📊 [Test] Dados do cancelamento:', message.data);
                        
                        // Verificar se voltou para a fila
                        setTimeout(() => {
                            testClient.send(JSON.stringify({
                                type: 'get_queue_status',
                                data: {}
                            }));
                        }, 1000);
                        break;
                        
                    case 'queue_update':
                        console.log('📊 [Test] Status da fila:', {
                            playersInQueue: message.data.playersInQueue,
                            playersList: message.data.playersInQueueList?.map(p => p.summonerName) || []
                        });
                        break;
                        
                    case 'error':
                        console.error('❌ [Test] Erro:', message.message);
                        break;
                }
            } catch (error) {
                console.error('❌ [Test] Erro ao processar mensagem:', error);
            }
        });

        testClient.on('error', (error) => {
            console.error('❌ [Test] Erro no WebSocket:', error);
        });

        testClient.on('close', () => {
            console.log('🔌 [Test] Cliente WebSocket desconectado');
        });

    } catch (error) {
        console.error('❌ [Test] Erro no teste:', error);
    }
}

// Função para adicionar bots à fila
function addBotsToQueue() {
    console.log('🤖 [Test] Adicionando bots à fila...');
    
    // Fazer requisição HTTP para adicionar bots
    const http = require('http');
    
    for (let i = 0; i < 9; i++) {
        const postData = JSON.stringify({});
        
        const options = {
            hostname: 'localhost',
            port: BACKEND_PORT,
            path: '/api/add-bot-to-queue',
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': postData.length
            }
        };

        const req = http.request(options, (res) => {
            res.on('data', (chunk) => {
                console.log(`🤖 [Test] Bot ${i + 1} adicionado`);
            });
        });

        req.on('error', (error) => {
            console.error(`❌ [Test] Erro ao adicionar bot ${i + 1}:`, error);
        });

        req.write(postData);
        req.end();
        
        // Aguardar um pouco entre cada bot
        setTimeout(() => {}, 100);
    }
}

// Função para limpar processos
function cleanup() {
    console.log('\n🧹 [Test] Limpando processos...');
    
    if (testClient) {
        testClient.close();
    }
    
    if (backendProcess) {
        backendProcess.kill('SIGTERM');
    }
    
    if (frontendProcess) {
        frontendProcess.kill('SIGTERM');
    }
}

// Função principal
async function main() {
    try {
        // Iniciar backend
        await startBackend();
        
        // Aguardar um momento para estabilizar
        await new Promise(resolve => setTimeout(resolve, 3000));
        
        // Simular fluxo completo
        await simulateCompleteFlow();
        
        // Aguardar teste completar
        await new Promise(resolve => setTimeout(resolve, 30000));
        
    } catch (error) {
        console.error('❌ [Test] Erro no teste:', error);
    } finally {
        cleanup();
        console.log('\n✅ [Test] Teste concluído!');
        process.exit(0);
    }
}

// Capturar sinais de interrupção
process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);

// Iniciar teste
main();
