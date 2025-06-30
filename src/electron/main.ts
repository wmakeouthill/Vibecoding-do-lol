import { app, BrowserWindow, ipcMain, Menu } from 'electron';
import * as path from 'path';
import { spawn, exec } from 'child_process';
import * as fs from 'fs';
import * as http from 'http';

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

async function createWindow(): Promise<void> {
  console.log('🎮 Criando janela principal do Electron...');
  
  try {
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
    mainWindow.webContents.openDevTools();
  } else {
    // Em produção, tentar carregar frontend
    console.log('📦 Modo produção: carregando frontend do backend...');
    let frontendLoaded = false;
    
    try {
      await mainWindow.loadURL('http://127.0.0.1:3000');
      console.log('✅ Frontend carregado com sucesso via 127.0.0.1');
      frontendLoaded = true;
    } catch (error) {
      console.error('❌ Erro ao carregar via 127.0.0.1:', error);
      
      // Tentar localhost como fallback
      try {
        await mainWindow.loadURL('http://localhost:3000');
        console.log('✅ Frontend carregado com sucesso via localhost');
        frontendLoaded = true;
      } catch (localhostError) {
        console.error('❌ Erro ao carregar via localhost:', localhostError);
        
        // Como último recurso, tentar carregar arquivo diretamente
        const prodPaths = getProductionPaths();
        if (fs.existsSync(prodPaths.frontend)) {
          console.log('🔄 Tentando carregar arquivo diretamente como fallback...');
          try {
            await mainWindow.loadFile(prodPaths.frontend);
            console.log('✅ Frontend carregado do arquivo local');
            frontendLoaded = true;
          } catch (fileError) {
            console.error('❌ Erro ao carregar arquivo local:', fileError);
          }
        }
      }
    }
    
    // Se houve problemas no carregamento, abrir DevTools para debug
    if (!frontendLoaded) {
      console.log('🔧 Problemas no carregamento - abrindo DevTools para debug');
      mainWindow.webContents.openDevTools();
      
      // Carregar uma página de erro simples
      const errorHtml = `
        <html>
          <head><title>Debug - LoL Matchmaking</title></head>
          <body style="font-family: Arial; padding: 20px; background: #1a1a1a; color: #fff;">
            <h1>🔧 Modo Debug</h1>
            <p>Houve problemas na inicialização:</p>
            <ul>
              <li>❌ Backend não está respondendo</li>
              <li>❌ Frontend não pôde ser carregado</li>
            </ul>
            <p>Verifique o console (F12) para mais detalhes.</p>
            <p>Tentativas realizadas:</p>
            <ul>
              <li>http://127.0.0.1:3000</li>
              <li>http://localhost:3000</li>
              <li>Arquivo local</li>
            </ul>
          </body>
        </html>
      `;
      await mainWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(errorHtml)}`);
    }
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
    console.log('Iniciando servidor backend em produção...');
    console.log('Process execPath:', process.execPath);
    console.log('__dirname:', __dirname);

    // Em produção, iniciar o servidor backend buildado
    const prodPaths = getProductionPaths();
    console.log('Tentando iniciar backend em:', prodPaths.backend);

    // Verificar se o arquivo existe
    if (!fs.existsSync(prodPaths.backend)) {
      console.error('Arquivo backend não encontrado:', prodPaths.backend);
      return;
    }

    // Verificar se as dependências existem
    if (!fs.existsSync(prodPaths.nodeModules)) {
      console.error('Dependências do backend não encontradas:', prodPaths.nodeModules);
      return;
    }

    // Definir NODE_PATH para que o Node encontre as dependências na pasta correta
    const backendDir = path.dirname(prodPaths.backend);
    const nodeModulesPath = prodPaths.nodeModules;

    const env = {
      ...process.env,
      NODE_PATH: nodeModulesPath,
      NODE_ENV: 'production'
    };

    console.log('NODE_PATH:', nodeModulesPath);
    console.log('Node modules exists:', fs.existsSync(nodeModulesPath));

    console.log('🚀 Tentando iniciar processo Node.js...');
    console.log('📂 Comando:', 'node', [prodPaths.backend]);
    console.log('📁 Diretório de trabalho:', backendDir);
    console.log('🌍 Variáveis de ambiente:', { NODE_PATH: nodeModulesPath, NODE_ENV: 'production' });

    try {
      backendProcess = spawn('node', [prodPaths.backend], {
        stdio: 'pipe',
        env: env,
        cwd: backendDir
      });

      console.log('✅ Processo Node.js criado com PID:', backendProcess.pid);

      backendProcess.stdout.on('data', (data: any) => {
        const message = data.toString().trim();
        console.log(`🔧 Backend: ${message}`);
      });

      backendProcess.stderr.on('data', (data: any) => {
        const message = data.toString().trim();
        console.error(`❌ Backend Error: ${message}`);
      });

      backendProcess.on('close', (code: any) => {
        console.log(`🏁 Backend process closed with code ${code}`);
        if (code !== 0) {
          console.error(`❌ Backend fechou com código de erro: ${code}`);
        }
      });

      backendProcess.on('error', (error: any) => {
        console.error('❌ Erro ao iniciar backend:', error);
        console.error('🔧 Detalhes do erro:', {
          message: error.message,
          code: error.code,
          errno: error.errno,
          syscall: error.syscall,
          path: error.path
        });
      });

      // Aguardar um pouco para ver se o processo inicia
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      if (backendProcess.killed) {
        console.error('❌ Processo backend foi terminado prematuramente');
      } else {
        console.log('✅ Processo backend ainda está rodando após 2 segundos');
      }

    } catch (spawnError: any) {
      console.error('❌ Erro crítico ao criar processo backend:', spawnError);
      return;
    }
  } else {
    console.log('Modo desenvolvimento: backend será iniciado separadamente');
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

        req.setTimeout(2000, () => {
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

// Event Listeners do Electron
app.whenReady().then(async () => {
  console.log('🚀 Electron app ready, iniciando aplicação...');

  if (isDev) {
    console.log('🔧 Modo desenvolvimento detectado');
    // Em dev, apenas criar a janela - backend roda separadamente
    await createWindow();
  } else {
    console.log('📦 Modo produção detectado - Inicialização sequencial');

    // ETAPA 1: Iniciar backend
    console.log('🔧 ETAPA 1: Iniciando Backend...');
    await startBackendServer();

    // ETAPA 2: Tentar aguardar backend (mas não bloquear)
    console.log('🔍 ETAPA 2: Verificando se Backend está pronto...');
    const backendReady = await testBackendConnectivity(15, 1000); // Reduzido para 15 tentativas
    
    if (!backendReady) {
      console.error('❌ Backend não ficou pronto após 15 tentativas!');
      console.error('🔧 Abrindo janela mesmo assim para debug...');
    }

    // ETAPA 3: SEMPRE criar a janela Electron para mostrar logs e debug
    console.log('🎮 ETAPA 3: Criando janela Electron (SEMPRE)...');
    await createWindow();
    
    if (backendReady) {
      console.log('✅ Inicialização completa com sucesso!');
    } else {
      console.log('⚠️ Janela aberta para debug - backend pode ter problemas');
      console.log('💡 Verifique os logs no DevTools para identificar o problema');
    }
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
