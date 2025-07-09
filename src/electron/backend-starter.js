// Sistema melhorado de inicialização do backend para Electron
// Detecta automaticamente Node.js e tenta múltiplas estratégias

const { spawn, exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const http = require('http');

class BackendStarter {
    constructor() {
        this.backendProcess = null;
        this.maxRetries = 3;
        this.retryDelay = 2000;
        this.nodeExecutables = [];
        this.findNodeExecutables();
    }

    // Encontrar executáveis do Node.js em locais comuns
    findNodeExecutables() {
        const commonPaths = [
            'node',
            'C:\\Program Files\\nodejs\\node.exe',
            'C:\\Program Files (x86)\\nodejs\\node.exe',
            path.join(process.env.USERPROFILE || '', 'AppData\\Roaming\\npm\\node.exe'),
            path.join(process.env.PROGRAMFILES || '', 'nodejs\\node.exe'),
            path.join(process.env['PROGRAMFILES(X86)'] || '', 'nodejs\\node.exe')
        ];

        // Adicionar paths do PATH
        const pathEnv = process.env.PATH || '';
        const pathParts = pathEnv.split(path.delimiter);
        pathParts.forEach(p => {
            if (p.toLowerCase().includes('node')) {
                commonPaths.push(path.join(p, 'node.exe'));
                commonPaths.push(path.join(p, 'node'));
            }
        });

        this.nodeExecutables = [...new Set(commonPaths)]; // Remove duplicatas
        console.log('🔍 [BackendStarter] Caminhos do Node.js para testar:', this.nodeExecutables.length);
    }

    // Testar se um executável do Node.js funciona
    async testNodeExecutable(nodePath) {
        return new Promise((resolve) => {
            const testProcess = spawn(nodePath, ['--version'], {
                stdio: 'pipe',
                windowsHide: true
            });

            let output = '';
            testProcess.stdout.on('data', (data) => {
                output += data.toString();
            });

            testProcess.on('close', (code) => {
                if (code === 0 && output.includes('v')) {
                    console.log(`✅ [BackendStarter] Node.js funcional encontrado: ${nodePath} (${output.trim()})`);
                    resolve(true);
                } else {
                    resolve(false);
                }
            });

            testProcess.on('error', () => {
                resolve(false);
            });

            // Timeout de 5 segundos
            setTimeout(() => {
                testProcess.kill();
                resolve(false);
            }, 5000);
        });
    }

    // Encontrar um Node.js funcional
    async findWorkingNode() {
        console.log('🔍 [BackendStarter] Procurando por Node.js funcional...');
        
        for (const nodePath of this.nodeExecutables) {
            if (await this.testNodeExecutable(nodePath)) {
                return nodePath;
            }
        }
        
        console.error('❌ [BackendStarter] Nenhum Node.js funcional encontrado!');
        return null;
    }

    // Iniciar o backend com estratégias múltiplas
    async startBackend(backendPath, nodeModulesPath) {
        const { app } = require('electron');
        const os = require('os');
        
        console.log('🔍 [BackendStarter] Diagnóstico detalhado dos caminhos:');
        console.log(`📁 Backend path: ${backendPath}`);
        console.log(`📁 Backend exists: ${fs.existsSync(backendPath)}`);
        console.log(`📁 Node modules path: ${nodeModulesPath}`);
        console.log(`📁 Node modules exists: ${fs.existsSync(nodeModulesPath)}`);
        console.log(`📁 Working directory: ${process.cwd()}`);
        console.log(`📁 __dirname: ${__dirname}`);
        console.log(`📁 process.resourcesPath: ${process.resourcesPath || 'undefined'}`);
        console.log(`📁 process.execPath: ${process.execPath}`);
        console.log(`📁 app.isPackaged: ${app.isPackaged}`);

        // ✅ NOVO: Verificar se estamos dentro de um arquivo .asar
        const isInsideAsar = backendPath.includes('.asar');
        console.log(`📦 [BackendStarter] Caminho do backend inclui .asar: ${isInsideAsar}`);
        console.log(`📦 [BackendStarter] Backend path: ${backendPath}`);
        console.log(`📦 [BackendStarter] Backend existe: ${fs.existsSync(backendPath)}`);
        console.log(`📦 [BackendStarter] Node modules existe: ${fs.existsSync(nodeModulesPath)}`);

        let actualBackendPath = backendPath;
        let actualNodeModulesPath = nodeModulesPath;

        // ✅ SIMPLIFICADO: Só extrair se os arquivos não existem E estão no .asar
        // Em produção com extraResources, os arquivos devem estar em resources/backend
        if (isInsideAsar && !fs.existsSync(backendPath)) {
            console.log('📦 [BackendStarter] Arquivos dentro do .asar e não acessíveis, extraindo...');
            
            const tempDir = path.join(require('os').tmpdir(), 'vibecoding-lol-backend');
            const backendTempPath = path.join(tempDir, 'backend');
            const nodeModulesTempPath = path.join(tempDir, 'node_modules');

            // Criar pasta temporária
            if (!fs.existsSync(tempDir)) {
                fs.mkdirSync(tempDir, { recursive: true });
            }

            try {
                // Extrair backend
                await this.extractFromAsar(backendPath, backendTempPath);
                
                // Extrair node_modules
                await this.extractFromAsar(nodeModulesPath, nodeModulesTempPath);

                actualBackendPath = path.join(backendTempPath, 'server.js');
                actualNodeModulesPath = nodeModulesTempPath;

                console.log(`✅ [BackendStarter] Arquivos extraídos para: ${tempDir}`);
                console.log(`📁 [BackendStarter] Backend extraído: ${actualBackendPath}`);
                console.log(`📁 [BackendStarter] Node modules extraído: ${actualNodeModulesPath}`);

            } catch (error) {
                console.error('❌ [BackendStarter] Erro ao extrair do .asar:', error);
                console.log('⚠️ [BackendStarter] Continuando com caminhos originais...');
                // Não lançar erro, continuar com caminhos originais
            }
        } else {
            console.log('✅ [BackendStarter] Usando arquivos diretamente dos caminhos fornecidos');
            console.log(`📁 [BackendStarter] Backend path: ${actualBackendPath}`);
            console.log(`📁 [BackendStarter] Node modules path: ${actualNodeModulesPath}`);
        }

        // Verificar arquivos críticos (após extração se necessário)
        if (!fs.existsSync(actualBackendPath)) {
            console.error('❌ [BackendStarter] Arquivo backend não encontrado!');
            console.error('💡 [BackendStarter] Verifique se o build foi feito corretamente');
            throw new Error(`Backend file not found: ${actualBackendPath}`);
        }

        if (!fs.existsSync(actualNodeModulesPath)) {
            console.error('❌ [BackendStarter] Node modules não encontrados!');
            console.error('💡 [BackendStarter] Execute: npm run build:complete');
            throw new Error(`Node modules not found: ${actualNodeModulesPath}`);
        }

        const workingNode = await this.findWorkingNode();
        if (!workingNode) {
            throw new Error('Node.js não encontrado. Instale o Node.js de https://nodejs.org/');
        }

        console.log(`🚀 [BackendStarter] Iniciando backend com: ${workingNode}`);

        const backendDir = path.dirname(actualBackendPath);
        const env = {
            ...process.env,
            NODE_PATH: actualNodeModulesPath,
            NODE_ENV: 'production',
            // Configurações para melhor compatibilidade
            UV_THREADPOOL_SIZE: '4',
            NODE_OPTIONS: '--max-old-space-size=2048'
        };

        console.log(`📁 [BackendStarter] Backend directory: ${backendDir}`);
        console.log(`🔧 [BackendStarter] Environment NODE_PATH: ${env.NODE_PATH}`);

        for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
            try {
                console.log(`🔄 [BackendStarter] Tentativa ${attempt}/${this.maxRetries}`);
                
                const success = await this.attemptStart(workingNode, actualBackendPath, backendDir, env);
                if (success) {
                    console.log('✅ [BackendStarter] Backend iniciado com sucesso!');
                    return true;
                }
            } catch (error) {
                console.error(`❌ [BackendStarter] Tentativa ${attempt} falhou:`, error.message);
            }

            if (attempt < this.maxRetries) {
                console.log(`⏳ [BackendStarter] Aguardando ${this.retryDelay}ms antes da próxima tentativa...`);
                await new Promise(resolve => setTimeout(resolve, this.retryDelay));
            }
        }

        throw new Error(`Falha ao iniciar backend após ${this.maxRetries} tentativas`);
    }

    // ✅ NOVO: Extrair arquivos/pastas do .asar para o sistema de arquivos
    async extractFromAsar(asarPath, destinationPath) {
        return new Promise((resolve, reject) => {
            try {
                console.log(`📦 [BackendStarter] Copiando de ${asarPath} para ${destinationPath}`);

                // Verificar se é uma pasta ou arquivo
                const stats = fs.statSync(asarPath);
                
                if (stats.isDirectory()) {
                    // Se é uma pasta, copiar recursivamente
                    this.copyRecursiveSync(asarPath, destinationPath);
                } else {
                    // Se é um arquivo, copiar diretamente
                    const destDir = path.dirname(destinationPath);
                    if (!fs.existsSync(destDir)) {
                        fs.mkdirSync(destDir, { recursive: true });
                    }
                    fs.copyFileSync(asarPath, destinationPath);
                }

                console.log(`✅ [BackendStarter] Cópia concluída: ${destinationPath}`);
                resolve();

            } catch (error) {
                console.error(`❌ [BackendStarter] Erro na cópia:`, error);
                
                // ✅ FALLBACK: Se falhar, tentar continuar com os caminhos originais
                console.log(`⚠️ [BackendStarter] Falha na extração, usando caminhos originais`);
                resolve(); // Não rejeitar, deixar continuar
            }
        });
    }

    // ✅ NOVO: Copiar pasta recursivamente
    copyRecursiveSync(src, dest) {
        const exists = fs.existsSync(src);
        const stats = exists && fs.statSync(src);
        const isDirectory = exists && stats.isDirectory();

        if (isDirectory) {
            if (!fs.existsSync(dest)) {
                fs.mkdirSync(dest, { recursive: true });
            }
            fs.readdirSync(src).forEach((childItemName) => {
                this.copyRecursiveSync(
                    path.join(src, childItemName),
                    path.join(dest, childItemName)
                );
            });
        } else {
            const destDir = path.dirname(dest);
            if (!fs.existsSync(destDir)) {
                fs.mkdirSync(destDir, { recursive: true });
            }
            fs.copyFileSync(src, dest);
        }
    }

    // Tentar iniciar o backend
    async attemptStart(nodePath, backendPath, backendDir, env) {
        return new Promise((resolve, reject) => {
            console.log(`� [BackendStarter] === INICIANDO BACKEND ===`);
            console.log(`�📂 [BackendStarter] Comando: ${nodePath} ${backendPath}`);
            console.log(`📁 [BackendStarter] Diretório: ${backendDir}`);
            console.log(`🔧 [BackendStarter] NODE_PATH: ${env.NODE_PATH}`);
            console.log(`🔧 [BackendStarter] NODE_ENV: ${env.NODE_ENV}`);
            
            // Verificar arquivos antes de iniciar
            console.log(`📄 [BackendStarter] Backend file exists: ${require('fs').existsSync(backendPath)}`);
            console.log(`📁 [BackendStarter] Working dir exists: ${require('fs').existsSync(backendDir)}`);
            console.log(`📦 [BackendStarter] Node modules exists: ${require('fs').existsSync(env.NODE_PATH)}`);

            try {
                this.backendProcess = spawn(nodePath, [backendPath], {
                    stdio: 'pipe',
                    env: env,
                    cwd: backendDir,
                    windowsHide: false // Mostrar janela para debug
                });

                console.log(`🔢 [BackendStarter] Process PID: ${this.backendProcess.pid}`);
                
                // Log quando o processo é criado
                console.log(`✅ [BackendStarter] Processo spawn criado com sucesso`);
                
            } catch (spawnError) {
                console.error(`❌ [BackendStarter] Erro no spawn:`, spawnError);
                reject(spawnError);
                return;
            }

            let startupSuccess = false;
            const timeout = setTimeout(() => {
                if (!startupSuccess) {
                    console.error('❌ [BackendStarter] Timeout na inicialização do backend (90 segundos)');
                    console.error('💡 [BackendStarter] Possíveis causas:');
                    console.error('   - Backend está travado na inicialização');
                    console.error('   - Porta 3000 bloqueada por firewall');
                    console.error('   - Dependências faltando');
                    console.error('   - Banco de dados não inicializou');
                    if (this.backendProcess && !this.backendProcess.killed) {
                        console.error('🔪 [BackendStarter] Finalizando processo por timeout');
                        this.backendProcess.kill();
                    }
                    reject(new Error('Timeout na inicialização do backend (90s)'));
                }
            }, 90000); // ✅ AUMENTADO: 90 segundos de timeout (o backend demora ~30-60s para inicializar)

            // Handler para quando o processo fecha
            this.backendProcess.on('close', (code, signal) => {
                console.log(`🔚 [BackendStarter] Processo fechou - Code: ${code}, Signal: ${signal}`);
                if (!startupSuccess && code !== 0) {
                    clearTimeout(timeout);
                    reject(new Error(`Backend process exited with code ${code}`));
                }
            });

            // Handler para erros no processo
            this.backendProcess.on('error', (error) => {
                console.error(`❌ [BackendStarter] Erro no processo:`, error);
                clearTimeout(timeout);
                reject(error);
            });

            this.backendProcess.stdout.on('data', (data) => {
                const message = data.toString();
                console.log(`🔧 [Backend STDOUT] ${message.trim()}`);
                
                // ✅ MELHORADO: Detectar sucesso na inicialização com múltiplos indicadores
                if (message.includes('Servidor rodando na porta') || 
                    message.includes('listening on') || 
                    message.includes('WebSocket disponível') ||
                    message.includes('API disponível') ||
                    message.includes('Health check:') ||
                    message.includes('ready')) {
                    
                    console.log('🎯 [BackendStarter] Servidor detectado como iniciado, aguardando estabilização...');
                    
                    // ✅ MELHORADO: Aguardar mais tempo para o backend estabilizar completamente
                    setTimeout(async () => {
                        const isConnected = await this.quickConnectivityTest();
                        if (isConnected) {
                            startupSuccess = true;
                            clearTimeout(timeout);
                            console.log('✅ [BackendStarter] Backend confirmado como funcional!');
                            resolve(true);
                        } else {
                            console.log('⚠️ [BackendStarter] Servidor iniciou mas não responde ainda, aguardando mais...');
                            
                            // ✅ NOVO: Segunda tentativa após mais tempo
                            setTimeout(async () => {
                                const isConnectedRetry = await this.quickConnectivityTest();
                                if (isConnectedRetry) {
                                    startupSuccess = true;
                                    clearTimeout(timeout);
                                    console.log('✅ [BackendStarter] Backend confirmado como funcional na segunda tentativa!');
                                    resolve(true);
                                } else {
                                    console.log('⚠️ [BackendStarter] Backend ainda não responde, aguardando terceira tentativa...');
                                    
                                    // ✅ NOVO: Terceira tentativa após ainda mais tempo
                                    setTimeout(async () => {
                                        const isConnectedFinal = await this.quickConnectivityTest();
                                        if (isConnectedFinal) {
                                            startupSuccess = true;
                                            clearTimeout(timeout);
                                            console.log('✅ [BackendStarter] Backend confirmado como funcional na terceira tentativa!');
                                            resolve(true);
                                        } else {
                                            console.log('⚠️ [BackendStarter] Backend ainda não responde após 3 tentativas, continuando a aguardar...');
                                        }
                                    }, 10000); // Terceira tentativa após 10 segundos
                                }
                            }, 8000); // Segunda tentativa após 8 segundos (aumentado de 5s)
                        }
                    }, 8000); // Primeira tentativa após 8 segundos (aumentado de 5s)
                }
            });

            this.backendProcess.stderr.on('data', (data) => {
                const message = data.toString();
                console.error(`❌ [Backend STDERR] ${message.trim()}`);
                
                // ✅ MELHORADO: Detectar erros críticos com mais precisão
                if (message.includes('EADDRINUSE') || message.includes('address already in use')) {
                    clearTimeout(timeout);
                    reject(new Error('Porta 3000 já está em uso - feche outros processos na porta 3000'));
                } else if (message.includes('Cannot find module') || message.includes('MODULE_NOT_FOUND')) {
                    console.error(`🔍 [BackendStarter] Módulo não encontrado - detalhes: ${message}`);
                    clearTimeout(timeout);
                    reject(new Error('Dependências faltando - backend pode não ter sido compilado corretamente'));
                } else if (message.includes('ECONNREFUSED') || message.includes('connection refused')) {
                    console.error('⚠️ [Backend] Problema de conectividade detectado');
                } else if (message.includes('Database') || message.includes('SQLITE')) {
                    console.error('⚠️ [Backend] Problema no banco de dados detectado');
                } else if (message.includes('TypeError') || message.includes('ReferenceError')) {
                    console.error(`🐛 [BackendStarter] Erro de código - detalhes: ${message}`);
                    clearTimeout(timeout);
                    reject(new Error('Erro de código no backend - verifique os logs'));
                } else if (message.includes('Error:') || message.includes('SyntaxError:')) {
                    console.error(`🚨 [BackendStarter] Erro crítico detectado: ${message}`);
                }
            });

            this.backendProcess.on('close', (code) => {
                clearTimeout(timeout);
                if (code !== 0 && !startupSuccess) {
                    reject(new Error(`Backend fechou com código ${code}`));
                }
            });

            this.backendProcess.on('error', (error) => {
                clearTimeout(timeout);
                reject(error);
            });
        });
    }

    // Teste rápido de conectividade para confirmar que o backend está funcionando
    async quickConnectivityTest() {
        return new Promise((resolve) => {
            const req = http.get('http://127.0.0.1:3000/api/health', (res) => {
                let data = '';
                res.on('data', chunk => data += chunk);
                res.on('end', () => {
                    try {
                        const parsed = JSON.parse(data);
                        resolve(parsed && parsed.status === 'ok');
                    } catch {
                        resolve(false);
                    }
                });
            });

            req.on('error', () => resolve(false));
            req.setTimeout(3000, () => {
                req.destroy();
                resolve(false);
            });
        });
    }

    // Testar conectividade com o backend
    async testConnectivity(maxRetries = 60, retryDelay = 2000) {
        console.log('🔍 [BackendStarter] Testando conectividade...');
        
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                // ✅ MELHORADO: Testar tanto HTTP quanto WebSocket
                const httpOk = await this.testHttpEndpoint();
                const wsOk = await this.testWebSocketEndpoint();
                
                if (httpOk && wsOk) {
                    console.log(`✅ [BackendStarter] Backend totalmente funcional (tentativa ${attempt})`);
                    console.log('   - HTTP API: ✅');
                    console.log('   - WebSocket: ✅');
                    return true;
                } else if (httpOk) {
                    console.log(`⚠️ [BackendStarter] HTTP OK mas WebSocket falhou (tentativa ${attempt})`);
                    // ✅ MELHORADO: Aceitar apenas HTTP por enquanto, WebSocket pode demorar mais
                    if (attempt > 10) { // Após 10 tentativas (~20s), aceitar apenas HTTP
                        console.log('✅ [BackendStarter] Aceitando conexão apenas HTTP (WebSocket pode estabilizar depois)');
                        return true;
                    }
                } else {
                    console.log(`❌ [BackendStarter] HTTP falhou (tentativa ${attempt})`);
                }
            } catch (error) {
                console.log(`❌ [BackendStarter] Erro no teste ${attempt}: ${error.message}`);
            }

            if (attempt < maxRetries) {
                console.log(`⏳ [BackendStarter] Tentativa ${attempt}/${maxRetries} - aguardando...`);
                await new Promise(resolve => setTimeout(resolve, retryDelay));
            }
        }

        console.error('❌ [BackendStarter] Backend não respondeu após todas as tentativas');
        return false;
    }

    // Testar endpoint HTTP
    async testHttpEndpoint() {
        return new Promise((resolve) => {
            const req = http.get('http://127.0.0.1:3000/api/health', (res) => {
                let data = '';
                res.on('data', chunk => data += chunk);
                res.on('end', () => {
                    try {
                        const parsed = JSON.parse(data);
                        resolve(parsed && parsed.status === 'ok');
                    } catch {
                        resolve(false);
                    }
                });
            });

            req.on('error', () => resolve(false));
            req.setTimeout(3000, () => {
                req.destroy();
                resolve(false);
            });
        });
    }

    // Testar endpoint WebSocket
    async testWebSocketEndpoint() {
        return new Promise((resolve) => {
            try {
                const WebSocket = require('ws');
                const ws = new WebSocket('ws://127.0.0.1:3000/ws');

                const timeout = setTimeout(() => {
                    ws.close();
                    resolve(false);
                }, 5000);

                ws.on('open', () => {
                    clearTimeout(timeout);
                    ws.close();
                    resolve(true);
                });

                ws.on('error', () => {
                    clearTimeout(timeout);
                    resolve(false);
                });

                ws.on('close', () => {
                    clearTimeout(timeout);
                });

            } catch (error) {
                resolve(false);
            }
        });
    }

    // Finalizar o backend
    stop() {
        if (this.backendProcess) {
            console.log('🛑 [BackendStarter] Finalizando backend...');
            this.backendProcess.kill();
            this.backendProcess = null;
        }
    }

    // Diagnóstico do sistema
    async diagnose() {
        console.log('🔍 [BackendStarter] Executando diagnóstico...');
        
        const workingNode = await this.findWorkingNode();
        console.log('Node.js funcional:', workingNode ? '✅' : '❌');
        
        const port3000Free = await this.isPortFree(3000);
        console.log('Porta 3000 livre:', port3000Free ? '✅' : '❌');
        
        return {
            nodeAvailable: !!workingNode,
            nodePath: workingNode,
            port3000Free
        };
    }

    // Verificar se uma porta está livre
    async isPortFree(port) {
        return new Promise((resolve) => {
            const server = require('net').createServer();
            server.listen(port, () => {
                server.close();
                resolve(true);
            }).on('error', () => {
                resolve(false);
            });
        });
    }
}

module.exports = { BackendStarter };
