import { app, BrowserWindow, ipcMain, Menu, session } from 'electron';
import * as path from 'path';
import { spawn, exec } from 'child_process';
import * as fs from 'fs';
import * as http from 'http';
import { networkInterfaces } from 'os';

let mainWindow: BrowserWindow;
let backendProcess: any;

const isDev = process.env.NODE_ENV === 'development' ||
  (!app.isPackaged && !process.env.NODE_ENV);

// Permitir múltiplas instâncias para teste P2P
if (isDev) {
  app.requestSingleInstanceLock = () => true; // Permitir múltiplas instâncias em dev
}

function getProductionPaths() {
  // Detectar se estamos em um executável empacotado ou em desenvolvimento
  const isPackaged = app.isPackaged;
  const appPath = path.dirname(process.execPath);

  let backendPath: string;
  let frontendPath: string;
  let nodeModulesPath: string;

  if (isPackaged) {
    // Aplicação empacotada (instalador gerado)
    // Os arquivos estão em resources/ dentro do app
    backendPath = path.join(process.resourcesPath, 'backend', 'server.js');
    frontendPath = path.join(process.resourcesPath, 'frontend', 'browser', 'index.html');
    nodeModulesPath = path.join(process.resourcesPath, 'backend', 'node_modules');
  } else {
    // Desenvolvimento ou npm run electron
    // Os arquivos estão na pasta dist/ do projeto
    const projectRoot = path.join(appPath, '..', '..', '..');
    backendPath = path.join(projectRoot, 'dist', 'backend', 'server.js');
    frontendPath = path.join(projectRoot, 'dist', 'frontend', 'browser', 'index.html');
    nodeModulesPath = path.join(projectRoot, 'dist', 'backend', 'node_modules');
  }

  console.log('Production paths:');
  console.log('- App path:', appPath);
  console.log('- Backend:', backendPath);
  console.log('- Frontend:', frontendPath);
  console.log('- Node modules:', nodeModulesPath);
  console.log('- Is packaged:', isPackaged);
  console.log('- Backend exists:', fs.existsSync(backendPath));
  console.log('- Frontend exists:', fs.existsSync(frontendPath));
  console.log('- Node modules exists:', fs.existsSync(nodeModulesPath));

  return {
    frontend: frontendPath,
    backend: backendPath,
    nodeModules: nodeModulesPath
  };
}

function getLocalIpAddress(): string {
  const nets = networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]!) {
      // Skip over non-IPv4 and internal (i.e. 127.0.0.1) addresses
      if (net.family === 'IPv4' && !net.internal) {
        return net.address;
      }
    }
  }
  return '127.0.0.1'; // Fallback
}

async function createWindow(): Promise<void> {
  console.log('🎮 Criando janela principal do Electron...');

  try {
    // Configuração para desabilitar o cache
    const partition = 'no-cache'; // Sessão sem cache
    const ses = session.fromPartition(partition);

    // Opcional: Limpa o cache existente (útil para desenvolvimento)
    ses.clearCache().then(() => {
      console.log('Cache limpo!');
    });

    // Criar a janela principal do aplicativo
    console.log('🔧 Configurando BrowserWindow...');
    mainWindow = new BrowserWindow({
      height: 800,
      width: 1200,
      minHeight: 600,
      minWidth: 800,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        preload: path.join(__dirname, 'preload.js'),
        // Configurações básicas de segurança
        webSecurity: true,
        sandbox: false,
        partition: partition, // Usa a sessão sem cache
      },
      icon: path.join(__dirname, '../../assets/icon.ico'), // Adicionar ícone depois
      titleBarStyle: 'default',
      show: true, // MUDANÇA: Mostrar imediatamente para debug
    });

    console.log('✅ BrowserWindow criado com sucesso');
    console.log('🔧 ID da janela:', mainWindow.id);
    console.log('🔧 Janela visível:', mainWindow.isVisible());
  } catch (windowError) {
    console.error('❌ Erro ao criar BrowserWindow:', windowError);
    throw windowError;
  }

  // Carregar o frontend Angular
  if (isDev) {
    // Em desenvolvimento, tentar carregar do backend primeiro, depois Angular dev server
    console.log('🔧 Modo desenvolvimento: carregando frontend...');
    try {
      await mainWindow.loadURL('http://localhost:3000');
      console.log('✅ Frontend carregado do backend');
    } catch (error) {
      console.log('⚠️ Backend não disponível, tentando Angular dev server...');
      try {
        await mainWindow.loadURL('http://localhost:4200');
        console.log('✅ Frontend carregado do Angular dev server');
      } catch (angularError) {
        console.error('❌ Não foi possível conectar ao backend nem ao Angular dev server', angularError);
      }
    }

    // Abrir DevTools em desenvolvimento

  } else {
    // Em produção, mostrar tela de carregamento imediatamente
    console.log('� Modo produção: carregando tela de loading...');
    await loadLoadingPage();

    // Abrir DevTools para debug inicial
    console.log('� Abrindo DevTools para diagnóstico...');
  }

  // Desabilitar CSP completamente para permitir P2P WebSocket
  mainWindow.webContents.session.webRequest.onHeadersReceived((details, callback) => {
    // Remover todos os headers CSP
    delete details.responseHeaders?.['content-security-policy'];
    delete details.responseHeaders?.['content-security-policy-report-only'];

    callback({
      cancel: false,
      responseHeaders: details.responseHeaders,
    });
  });  // Eventos de debug da janela
  mainWindow.webContents.on('did-start-loading', () => {
    console.log('🔄 Janela: Iniciou carregamento');
  });

  mainWindow.webContents.on('did-finish-load', () => {
    console.log('✅ Janela: Carregamento concluído');
  });

  mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription, validatedURL) => {
    console.error('❌ Janela: Falha no carregamento');
    console.error('🔧 Código do erro:', errorCode);
    console.error('🔧 Descrição:', errorDescription);
    console.error('🔧 URL:', validatedURL);
  });

  mainWindow.on('ready-to-show', () => {
    console.log('🎯 Evento: ready-to-show disparado');
  });

  mainWindow.on('show', () => {
    console.log('👁️ Evento: show disparado');
  });

  mainWindow.on('focus', () => {
    console.log('🎯 Evento: focus disparado');
  });

  // Mostrar quando estiver pronto
  mainWindow.once('ready-to-show', () => {
    console.log('🎮 Janela Electron pronta para exibição');

    // Desabilitar CSP completamente interceptando headers
    mainWindow.webContents.session.webRequest.onHeadersReceived((details, callback) => {
      // Remover todos os headers CSP
      const responseHeaders = { ...details.responseHeaders };
      delete responseHeaders['content-security-policy'];
      delete responseHeaders['Content-Security-Policy'];
      delete responseHeaders['content-security-policy-report-only'];
      delete responseHeaders['Content-Security-Policy-Report-Only'];

      console.log('🛡️ CSP headers removidos para:', details.url);

      callback({
        responseHeaders
      });
    });

    console.log('📺 Tentando mostrar a janela...');
    mainWindow.show();
    console.log('📺 Comando show() executado');

    // Verificar se a janela está realmente visível
    setTimeout(() => {
      console.log('🔍 Verificação pós-show:');
      console.log('   - Janela visível:', mainWindow.isVisible());
      console.log('   - Janela minimizada:', mainWindow.isMinimized());
      console.log('   - Janela maximizada:', mainWindow.isMaximized());
      console.log('   - Janela em foco:', mainWindow.isFocused());
    }, 1000);
  });

  // Configurar menu da aplicação
  createMenu();
}

// Função para carregar página de carregamento
async function loadLoadingPage(): Promise<void> {
  const loadingHtml = `
    <!DOCTYPE html>
    <html>
      <head>
        <title>LoL Matchmaking - Iniciando...</title>
        <style>
          body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            background: linear-gradient(135deg, #1a1a1a 0%, #2d2d2d 100%);
            color: #ffffff;
            margin: 0;
            padding: 0;
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            overflow: hidden;
          }
          .container {
            text-align: center;
            max-width: 600px;
            padding: 40px;
          }
          .logo {
            font-size: 3em;
            margin-bottom: 20px;
            color: #4fc3f7;
          }
          h1 {
            color: #4fc3f7;
            font-size: 2em;
            margin-bottom: 10px;
          }
          .subtitle {
            color: #81c784;
            font-size: 1.2em;
            margin-bottom: 30px;
          }
          .loading-spinner {
            width: 60px;
            height: 60px;
            border: 4px solid rgba(79, 195, 247, 0.3);
            border-top: 4px solid #4fc3f7;
            border-radius: 50%;
            animation: spin 1s linear infinite;
            margin: 20px auto;
          }
          @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }
          .progress {
            width: 300px;
            height: 6px;
            background: rgba(255, 255, 255, 0.1);
            border-radius: 3px;
            margin: 20px auto;
            overflow: hidden;
          }
          .progress-bar {
            height: 100%;
            background: linear-gradient(90deg, #4fc3f7, #81c784);
            border-radius: 3px;
            animation: progress 3s ease-in-out infinite;
          }
          @keyframes progress {
            0% { width: 10%; }
            50% { width: 80%; }
            100% { width: 95%; }
          }
          .status {
            color: #ffffff;
            margin-top: 20px;
            font-size: 1.1em;
          }
          .steps {
            margin-top: 30px;
            text-align: left;
            background: rgba(255, 255, 255, 0.05);
            padding: 20px;
            border-radius: 10px;
          }
          .step {
            margin: 10px 0;
            padding: 5px 0;
          }
          .step.current {
            color: #4fc3f7;
            font-weight: bold;
          }
          .step.completed {
            color: #81c784;
          }
          .step.pending {
            color: #666;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="logo">🎮</div>
          <h1>LoL Matchmaking</h1>
          <div class="subtitle">Iniciando aplicação...</div>
          
          <div class="loading-spinner"></div>
          <div class="progress">
            <div class="progress-bar"></div>
          </div>
          
          <div class="status" id="status">Preparando backend... (pode demorar até 2 minutos)</div>
          
          <div class="steps">
            <div class="step current" id="step1">🔧 Iniciando servidor Node.js (30-60s)</div>
            <div class="step pending" id="step2">📡 Estabelecendo conectividade (10-20s)</div>
            <div class="step pending" id="step3">🌐 Carregando interface (5s)</div>
            <div class="step pending" id="step4">🎯 Conectando WebSocket (5s)</div>
          </div>
        </div>

        <script>
          let currentStep = 1;
          let elapsedTime = 0;
          const steps = [
            'Iniciando servidor Node.js... (pode demorar até 90s)', 
            'Testando conectividade...', 
            'Carregando interface...', 
            'Finalizando conexão...'
          ];
          
          function updateStatus() {
            elapsedTime += 2;
            const statusEl = document.getElementById('status');
            
            if (currentStep <= steps.length) {
              statusEl.textContent = steps[currentStep - 1] + ' (' + elapsedTime + 's)';
              
              // Atualizar visual dos steps
              for (let i = 1; i <= 4; i++) {
                const stepEl = document.getElementById('step' + i);
                if (i < currentStep) {
                  stepEl.className = 'step completed';
                } else if (i === currentStep) {
                  stepEl.className = 'step current';
                } else {
                  stepEl.className = 'step pending';
                }
              }
              
              // Avançar step baseado no tempo
              if (elapsedTime > 20 && currentStep === 1) {
                currentStep = 2;
              } else if (elapsedTime > 45 && currentStep === 2) {
                currentStep = 3;
              }
            } else {
              statusEl.textContent = 'Aguardando backend... (' + elapsedTime + 's/90s)';
            }
          }
          
          // Atualizar status a cada 2 segundos
          setInterval(updateStatus, 2000);
          
          // Testar conectividade periodicamente
          function testBackend() {
            fetch('http://127.0.0.1:3000/api/health')
              .then(response => {
                if (response.ok) {
                  document.getElementById('status').textContent = '✅ Backend conectado! Carregando aplicação...';
                  
                  // Marcar todos os steps como completados
                  for (let i = 1; i <= 4; i++) {
                    document.getElementById('step' + i).className = 'step completed';
                  }
                  
                  setTimeout(() => {
                    location.href = 'http://127.0.0.1:3000';
                  }, 1000);
                }
              })
              .catch(() => {
                // Backend ainda não está pronto
              });
          }
          
          // Testar a cada 3 segundos (menos agressivo)
          setInterval(testBackend, 3000);
        </script>
      </body>
    </html>
  `;

  await mainWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(loadingHtml)}`);
}

// Função para aguardar o backend ficar pronto
async function waitForBackend(timeoutMs: number): Promise<boolean> {
  const startTime = Date.now();
  const checkInterval = 2000; // Verificar a cada 2 segundos

  console.log(`⏳ Aguardando backend por até ${timeoutMs / 1000} segundos...`);
  console.log(`🔍 Backend deve estar disponível em: http://127.0.0.1:3000/api/health`);

  while (Date.now() - startTime < timeoutMs) {
    try {
      const isReady = await testBackendConnectivity(1, 0); // 1 tentativa, sem delay
      if (isReady) {
        console.log('✅ Backend está pronto!');
        return true;
      }
    } catch (error) {
      // Continuar tentando
    }

    // Aguardar antes da próxima verificação
    await new Promise(resolve => setTimeout(resolve, checkInterval));

    // Log de progresso a cada 10 segundos
    const elapsed = Date.now() - startTime;
    if (elapsed % 10000 < checkInterval) {
      const progressPercent = Math.round((elapsed / timeoutMs) * 100);
      console.log(`⏳ Aguardando backend... ${Math.round(elapsed / 1000)}s/${Math.round(timeoutMs / 1000)}s (${progressPercent}%)`);
    }
  }

  console.log('❌ Timeout aguardando backend');
  return false;
}

// Função para carregar página de diagnóstico
async function loadDiagnosticPage(): Promise<void> {
  const diagnosticHtml = `
    <!DOCTYPE html>
    <html>
      <head>
        <title>LoL Matchmaking - Diagnóstico</title>
        <style>
          body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            background: linear-gradient(135deg, #1a1a1a 0%, #2d2d2d 100%);
            color: #ffffff;
            margin: 0;
            padding: 20px;
            min-height: 100vh;
          }
          .container {
            max-width: 800px;
            margin: 0 auto;
            background: rgba(255, 255, 255, 0.1);
            border-radius: 10px;
            padding: 30px;
            backdrop-filter: blur(10px);
          }
          h1 { color: #4fc3f7; text-align: center; }
          h2 { color: #81c784; border-bottom: 2px solid #81c784; padding-bottom: 10px; }
          .status { padding: 15px; margin: 10px 0; border-radius: 5px; }
          .error { background: rgba(244, 67, 54, 0.2); border-left: 4px solid #f44336; }
          .warning { background: rgba(255, 193, 7, 0.2); border-left: 4px solid #ffc107; }
          .info { background: rgba(33, 150, 243, 0.2); border-left: 4px solid #2196f3; }
          .success { background: rgba(76, 175, 80, 0.2); border-left: 4px solid #4caf50; }
          ul { padding-left: 20px; }
          li { margin: 5px 0; }
          .button {
            background: #4fc3f7;
            color: white;
            padding: 10px 20px;
            border: none;
            border-radius: 5px;
            cursor: pointer;
            margin: 5px;
            display: inline-block;
            text-decoration: none;
          }
          .button:hover { background: #29b6f6; }
          .logs { background: #000; padding: 15px; border-radius: 5px; font-family: monospace; overflow-x: auto; }
        </style>
      </head>
      <body>
        <div class="container">
          <h1>🔧 LoL Matchmaking - Diagnóstico do Sistema</h1>
          
          <div class="error">
            <h2>❌ Problema Detectado</h2>
            <p><strong>O backend não conseguiu iniciar corretamente.</strong></p>
            <p>Isso geralmente acontece quando o Node.js não está instalado ou há problemas de conectividade.</p>
          </div>

          <div class="info">
            <h2>🔍 Causas Mais Comuns</h2>
            <ul>
              <li><strong>Node.js não instalado</strong> - A causa mais comum (90% dos casos)</li>
              <li><strong>Porta 3000 ocupada</strong> - Outro processo usando a porta</li>
              <li><strong>Firewall/Antivírus</strong> - Bloqueando a execução do Node.js</li>
              <li><strong>Permissões</strong> - Aplicação precisa ser executada como administrador</li>
            </ul>
          </div>

          <div class="success">
            <h2>✅ Soluções Recomendadas</h2>
            <ol>
              <li><strong>Instalar Node.js:</strong>
                <br>• Baixe a versão LTS de <a href="https://nodejs.org/" target="_blank" style="color: #4fc3f7;">https://nodejs.org/</a>
                <br>• Execute o instalador
                <br>• Reinicie esta aplicação
              </li>
              <li><strong>Executar como Administrador:</strong>
                <br>• Feche esta aplicação
                <br>• Clique com botão direito no executável
                <br>• Selecione "Executar como administrador"
              </li>
              <li><strong>Verificar Firewall:</strong>
                <br>• Adicione exceção para Node.js no Windows Firewall
                <br>• Temporariamente desabilite o antivírus para teste
              </li>
            </ol>
          </div>

          <div class="warning">
            <h2>⚠️ Status Atual</h2>
            <ul>
              <li>✅ Interface Electron funcionando</li>
              <li>❌ Backend Node.js não disponível</li>
              <li>❌ WebSocket não conectado</li>
              <li>❌ Funcionalidades limitadas</li>
            </ul>
          </div>

          <div class="info">
            <h2>🛠️ Ações Disponíveis</h2>
            <button class="button" onclick="location.reload()">🔄 Tentar Novamente</button>
            <button class="button" onclick="testConnectivity()">🔍 Testar Conectividade</button>
            <button class="button" onclick="showLogs()">📋 Ver Logs</button>
            <button class="button" onclick="window.open('https://nodejs.org/', '_blank')">⬇️ Baixar Node.js</button>
          </div>

          <div id="logs" class="logs" style="display: none;">
            <h3>📋 Logs do Sistema:</h3>
            <div id="logContent">Carregando logs...</div>
          </div>

          <div class="info" style="margin-top: 30px;">
            <h2>📞 Precisa de Ajuda?</h2>
            <p>Se o problema persistir após seguir as soluções acima:</p>
            <ul>
              <li>Verifique se o Node.js foi instalado: <code>node --version</code></li>
              <li>Execute o corretor automático: <code>fix-connection-issues.bat</code></li>
              <li>Verifique o arquivo <code>error-report.txt</code> se existir</li>
            </ul>
          </div>
        </div>

        <script>
          function testConnectivity() {
            const logDiv = document.getElementById('logContent');
            logDiv.innerHTML = 'Testando conectividade...\\n';
            
            // Testar URLs
            const urls = ['http://127.0.0.1:3000/api/health'];
            
            urls.forEach(url => {
              fetch(url)
                .then(response => {
                  logDiv.innerHTML += \`✅ \${url}: Conectado (status \${response.status})\\n\`;
                })
                .catch(error => {
                  logDiv.innerHTML += \`❌ \${url}: Falha - \${error.message}\\n\`;
                });
            });
            
            showLogs();
          }

          function showLogs() {
            const logsDiv = document.getElementById('logs');
            logsDiv.style.display = logsDiv.style.display === 'none' ? 'block' : 'none';
          }

          // Testar conectividade automaticamente após 2 segundos
          setTimeout(() => {
            console.log('🔍 Testando conectividade automaticamente...');
            testConnectivity();
          }, 2000);
        </script>
      </body>
    </html>
  `;

  await mainWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(diagnosticHtml)}`);
}

function createMenu(): void {
  const template: any[] = [
    {
      label: 'Aplicação',
      submenu: [
        {
          label: 'Atualizar Página',
          accelerator: 'F5',
          click: () => {
            console.log('🔄 Atualizando página...');
            mainWindow.webContents.reload();
          }
        },
        {
          label: 'Forçar Atualização',
          accelerator: 'Ctrl+F5',
          click: () => {
            console.log('🔄 Forçando atualização completa...');
            mainWindow.webContents.reloadIgnoringCache();
          }
        },
        { type: 'separator' },
        {
          label: 'Sair',
          accelerator: 'Ctrl+Q',
          click: () => {
            app.quit();
          }
        }
      ]
    },
    {
      label: 'Desenvolvedor',
      submenu: [
        {
          label: 'Abrir/Fechar DevTools',
          accelerator: 'F12',
          click: () => {
            if (mainWindow.webContents.isDevToolsOpened()) {
              mainWindow.webContents.closeDevTools();
            } else {
              mainWindow.webContents.openDevTools();
            }
          }
        }
      ]
    }
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

async function startBackendServer(): Promise<void> {
  if (!isDev) {
    console.log('🚀 Iniciando servidor backend em produção...');

    try {
      // Obter caminhos de produção
      const prodPaths = getProductionPaths();
      console.log('📂 Caminhos de produção:', prodPaths);

      // Verificar se Node.js está disponível
      const nodeAvailable = await new Promise<boolean>((resolve) => {
        exec('node --version', (error) => {
          resolve(!error);
        });
      });

      if (!nodeAvailable) {
        console.error('❌ Node.js não disponível!');
        console.error('💡 Solução: Instale Node.js de https://nodejs.org/');
        throw new Error('Node.js não encontrado');
      }

      // Verificar se arquivos existem
      if (!fs.existsSync(prodPaths.backend)) {
        console.error('❌ Arquivo backend não encontrado:', prodPaths.backend);
        throw new Error('Backend não encontrado: ' + prodPaths.backend);
      }

      if (!fs.existsSync(prodPaths.nodeModules)) {
        console.error('❌ Dependências do backend não encontradas:', prodPaths.nodeModules);
        console.error('💡 Execute: npm run build:complete');
        throw new Error('Dependências não encontradas: ' + prodPaths.nodeModules);
      }

      // Finalizar processos Node.js antigos na porta 3000 (mais rápido)
      console.log('🔧 Limpando processos antigos...');
      try {
        await new Promise<void>((resolve) => {
          // Comando mais eficiente para Windows
          exec('netstat -ano | findstr :3000 && taskkill /F /PID $(netstat -ano | findstr :3000 | for /f "tokens=5" %a in (\'more\') do @echo %a) 2>nul || echo "Porta 3000 livre"', () => {
            resolve();
          });
        });
        // Reduzir delay
        await new Promise(resolve => setTimeout(resolve, 500));
      } catch (error) {
        console.log('⚠️ Não foi possível finalizar processos antigos');
      }

      // Iniciar backend
      console.log('🔄 Iniciando processo do backend...');
      console.log('📍 Backend path:', prodPaths.backend);
      console.log('📍 Working dir:', path.dirname(prodPaths.backend));

      backendProcess = spawn('node', [prodPaths.backend], {
        cwd: path.dirname(prodPaths.backend),
        env: {
          ...process.env,
          NODE_ENV: 'production',
          PORT: '3000',
          NODE_PATH: prodPaths.nodeModules
        },
        stdio: ['ignore', 'pipe', 'pipe']
      });

      // Logs do backend
      backendProcess.stdout?.on('data', (data: Buffer) => {
        console.log(`[BACKEND] ${data.toString()}`);
      });

      backendProcess.stderr?.on('data', (data: Buffer) => {
        console.error(`[BACKEND ERROR] ${data.toString()}`);
      });

      backendProcess.on('error', (error: Error) => {
        console.error('❌ Erro ao iniciar backend:', error);
      });

      backendProcess.on('exit', (code: number | null) => {
        console.log(`🔄 Backend finalizado com código: ${code}`);
      });

      console.log('✅ Processo do backend iniciado com PID:', backendProcess.pid);

      // Aguardar apenas 1 segundo para o backend começar a inicializar
      await new Promise(resolve => setTimeout(resolve, 1000));

    } catch (error: any) {
      console.error('❌ Erro crítico ao iniciar backend:', error.message);
      throw error;
    }
  } else {
    console.log('🔧 Modo desenvolvimento: backend será iniciado separadamente');
  }
}

// Função para testar se o backend está respondendo
async function testBackendConnectivity(maxRetries = 30, retryDelay = 1000): Promise<boolean> {
  console.log(`🔍 Testando conectividade do backend (máximo ${maxRetries} tentativas)...`);

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const result = await new Promise<boolean>((resolve) => {
        const req = http.get('http://127.0.0.1:3000/api/health', (res) => {
          console.log(`✅ Tentativa ${attempt}: Backend respondeu com status ${res.statusCode}`);
          resolve(res.statusCode === 200);
        });

        req.on('error', (error) => {
          console.log(`❌ Tentativa ${attempt}: ${error.message}`);
          resolve(false);
        });

        req.setTimeout(1500, () => {
          req.destroy();
          console.log(`⏰ Tentativa ${attempt}: Timeout`);
          resolve(false);
        });
      });

      if (result) {
        console.log(`🎉 Backend está pronto após ${attempt} tentativa(s)!`);
        return true;
      }

      if (attempt < maxRetries) {
        console.log(`⏳ Aguardando ${retryDelay}ms antes da próxima tentativa...`);
        await new Promise(resolve => setTimeout(resolve, retryDelay));
      }

    } catch (error) {
      console.log(`❌ Erro na tentativa ${attempt}:`, error);
    }
  }

  console.log('❌ Backend não ficou pronto após todas as tentativas');
  return false;
}

async function getAvailableBackendUrl(): Promise<string> {
  const possibleUrls = [
    `http://${getLocalIpAddress()}:3000`,  // 1. IP local dinâmico
    'http://127.0.0.1:3000',               // 2. Localhost padrão
    'http://localhost:3000'                // 3. Fallback final
  ];

  console.log('🔍 Testing backend URLs:', possibleUrls);

  for (const url of possibleUrls) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3000); // 3 segundos de timeout

      const healthCheck = await fetch(`${url}/api/health`, {
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (healthCheck.ok) {
        const data: any = await healthCheck.json();
        if (data && typeof data === 'object' && 'status' in data && data.status === 'ok') {
          console.log(`✅ Backend health check passed at ${url}`);
          return url;
        }
      }
    } catch (error) {
      if (error instanceof Error) {
        console.log(`⚠️ Backend not reachable at ${url}:`, error.message);
      } else {
        console.log(`⚠️ Backend not reachable at ${url}:`, String(error));
      }
    }
  }

  throw new Error(`No backend URLs responded. Tried: ${possibleUrls.join(', ')}`);
}

async function loadFrontendSafely() {
  try {
    const backendUrl = await getAvailableBackendUrl();

    // Configuração global do backend (opcional, se ainda for útil)
    await mainWindow.webContents.executeJavaScript(`
      window.backendConfig = {
        url: '${backendUrl}',
        lastUpdated: ${Date.now()}
      };
      console.log('Backend config loaded');
    `);

    // Carrega o frontend e confia no Angular
    console.log(`🌐 Loading frontend from ${backendUrl}`);
    await mainWindow.loadURL(backendUrl);

    // Não verifica mais "window.angular" (remoção total)
    console.log('✅ Frontend loaded (Angular bootstrap handled internally)');
  } catch (error) {
    console.error('❌ Frontend loading failed:', error);
    // Log simplificado (sem manipulação de DOM)
    await mainWindow.webContents.executeJavaScript(`
      console.error('Frontend error:', \`${error instanceof Error ? error.message : String(error)}\`);
    `);
  }
}

// Event Listeners do Electron
app.whenReady().then(async () => {
  console.log('🚀 Electron app ready, iniciando aplicação...');

  if (isDev) {
    console.log('🔧 Modo desenvolvimento detectado');
    // Em dev, apenas criar a janela - backend roda separadamente
    await createWindow();
  } else {
    console.log('📦 Modo produção detectado');

    // ESTRATÉGIA OTIMIZADA: Iniciar backend em paralelo com criação da janela
    console.log('🚀 INÍCIO: Iniciando backend e janela em paralelo...');

    // Iniciar backend imediatamente em background (sem aguardar)
    const backendPromise = startBackendServer().catch(error => {
      console.error('❌ Erro na inicialização do backend:', error);
      return false;
    });

    // Criar janela com tela de carregamento (paralelo ao backend)
    console.log('🎮 Criando janela Electron...');
    await createWindow();
    console.log('✅ Janela criada, backend iniciando em paralelo...');

    // Testar conectividade de forma inteligente enquanto backend inicializa
    console.log('🔍 Testando conectividade enquanto backend inicializa...');
    let backendReady = false;
    let attempts = 0;
    const maxAttempts = 60; // 60 tentativas = 2 minutos

    while (!backendReady && attempts < maxAttempts) {
      // Tentar conectar
      backendReady = await testBackendConnectivity(1, 0); // 1 tentativa rápida

      if (backendReady) {
        console.log('🎉 Backend conectado!');
        break;
      }

      attempts++;

      // Log de progresso a cada 10 tentativas (20 segundos)
      if (attempts % 10 === 0) {
        console.log(`⏳ Tentativa ${attempts}/${maxAttempts} - Backend ainda inicializando...`);
      }

      // Aguardar 2 segundos antes da próxima tentativa
      await new Promise(resolve => setTimeout(resolve, 2000));
    }

    if (backendReady) {
      console.log('✅ Backend pronto! Carregando frontend...');
      await loadFrontendSafely();
    } else {
      console.error('❌ Backend não ficou disponível no tempo limite');
      await loadDiagnosticPage();
    }

    // Aguardar o backend promise terminar (para logs)
    await backendPromise;

    console.log('✅ Inicialização concluída');
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (backendProcess) {
    backendProcess.kill();
  }

  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  if (backendProcess) {
    backendProcess.kill();
  }
});

// IPC Handlers para comunicação com o frontend
ipcMain.handle('get-app-version', () => {
  return app.getVersion();
});

ipcMain.handle('get-user-data-path', () => {
  return app.getPath('userData');
});

ipcMain.handle('minimize-window', () => {
  mainWindow.minimize();
});

ipcMain.handle('maximize-window', () => {
  if (mainWindow.isMaximized()) {
    mainWindow.unmaximize();
  } else {
    mainWindow.maximize();
  }
});

ipcMain.handle('close-window', () => {
  mainWindow.close();
});
