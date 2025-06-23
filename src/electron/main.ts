import { app, BrowserWindow, ipcMain, Menu } from 'electron';
import * as path from 'path';
import { spawn, exec } from 'child_process';
import * as fs from 'fs';

let mainWindow: BrowserWindow;
let backendProcess: any;
let p2pSignalingProcess: any;

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
    frontendPath = path.join(process.resourcesPath, 'frontend', 'dist', 'lol-matchmaking', 'browser');
    nodeModulesPath = path.join(process.resourcesPath, 'backend', 'node_modules');
  } else {
    // Desenvolvimento ou npm run electron
    // Os arquivos estão na pasta dist/ do projeto
    const projectRoot = path.join(appPath, '..', '..', '..');
    backendPath = path.join(projectRoot, 'dist', 'backend', 'server.js');
    frontendPath = path.join(projectRoot, 'dist', 'frontend', 'dist', 'lol-matchmaking', 'browser', 'index.html');
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
    nodeModules: nodeModulesPath,
    p2pSignaling: path.join(path.dirname(backendPath), 'signaling-server-standalone.js')
  };
}

function createWindow(): void {
  // Criar a janela principal do aplicativo
  mainWindow = new BrowserWindow({
    height: 800,
    width: 1200,
    minHeight: 600,
    minWidth: 800,    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
      // Configurações necessárias para WebRTC P2P
      experimentalFeatures: true,
      allowRunningInsecureContent: true,
      // Permitir acesso total para P2P funcionar corretamente
      webSecurity: false,
      // Permitir recursos externos
      allowDisplayingInsecureContent: true,
      // Desabilitar todas as proteções de segurança para P2P
      sandbox: false,
      // Permitir navegação para qualquer URL
      navigateOnDragDrop: false,
    },
    icon: path.join(__dirname, '../../assets/icon.ico'), // Adicionar ícone depois
    titleBarStyle: 'default',
    show: false, // Não mostrar até estar pronto
  });  // Carregar o frontend Angular
  if (isDev) {
    // Em desenvolvimento, carregar do servidor Angular
    console.log('Carregando frontend do Angular...');
      // Tentar conectar ao Angular com retry
    const tryLoadAngular = (retries = 5) => {
      mainWindow.loadURL('http://localhost:4200').catch((error: any) => {
        console.log(`Tentativa de conexão falhou, tentativas restantes: ${retries}`);
        if (retries > 0) {
          setTimeout(() => tryLoadAngular(retries - 1), 1000);
        } else {
          console.error('Não foi possível conectar ao servidor Angular', error);
        }
      });
    };
    
    tryLoadAngular();
    // Opcional: abrir DevTools em desenvolvimento
    mainWindow.webContents.openDevTools();  } else {
    // Em produção, carregar do backend que servirá os arquivos estáticos
    console.log('Carregando frontend do backend em produção...');
    const tryLoadProduction = (retries = 15) => {
      mainWindow.loadURL('http://localhost:3000').catch((error: any) => {
        console.log(`Tentativa de conexão ao backend falhou, tentativas restantes: ${retries}`);
        if (retries > 0) {
          setTimeout(() => tryLoadProduction(retries - 1), 1000);
        } else {
          console.error('Não foi possível conectar ao backend', error);
          // Como último recurso, tentar carregar arquivo diretamente
          const prodPaths = getProductionPaths();
          if (fs.existsSync(prodPaths.frontend)) {
            console.log('Tentando carregar arquivo diretamente como fallback:', prodPaths.frontend);
            mainWindow.loadFile(prodPaths.frontend);
          }
        }
      });
    };
    
    // Aguardar um pouco mais para dar tempo do backend iniciar
    setTimeout(() => tryLoadProduction(), 1000);
  
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
  });  // Mostrar quando estiver pronto
  mainWindow.once('ready-to-show', () => {
    console.log('Janela Electron pronta para exibição');
    
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
    
    mainWindow.show();
    
    // Auto-refresh após 10 segundos para garantir que tudo carregue corretamente
    setTimeout(() => {
      console.log('🔄 Auto-refresh após 10 segundos...');
      mainWindow.webContents.reload();
    }, 10000);
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

async function startP2PSignalingServer(): Promise<void> {
  console.log('🔄 Verificando se deve iniciar P2P signaling...');
  
  if (!isDev) {
    console.log('🚀 Iniciando servidor de sinalização P2P em produção...');
    
    const prodPaths = getProductionPaths();
    const p2pPath = prodPaths.p2pSignaling;
    
    console.log('📍 Tentando iniciar P2P signaling em:', p2pPath);
    
    // Verificar se o arquivo existe
    if (!fs.existsSync(p2pPath)) {
      console.error('❌ Arquivo P2P signaling não encontrado:', p2pPath);
      console.log('📂 Conteúdo do diretório backend:');
      const backendDir = path.dirname(p2pPath);
      if (fs.existsSync(backendDir)) {
        fs.readdirSync(backendDir).forEach(file => {
          console.log(`  - ${file}`);
        });
      }
      return;
    }
    
    const backendDir = path.dirname(p2pPath);
    const nodeModulesPath = prodPaths.nodeModules;
    
    const env = {
      ...process.env,
      NODE_PATH: nodeModulesPath,
      NODE_ENV: 'production',
      P2P_SIGNALING_PORT: '8080'
    };
    
    console.log('🌐 Iniciando P2P Signaling Server na porta 8080...');
    console.log('📁 Diretório de trabalho:', backendDir);
    console.log('📦 NODE_PATH:', nodeModulesPath);
    
    p2pSignalingProcess = spawn('node', [p2pPath], {
      stdio: 'pipe',
      env: env,
      cwd: backendDir
    });

    p2pSignalingProcess.stdout.on('data', (data: any) => {
      console.log(`📡 P2P Signaling: ${data.toString().trim()}`);
    });

    p2pSignalingProcess.stderr.on('data', (data: any) => {
      console.error(`❌ P2P Signaling Error: ${data.toString().trim()}`);
    });

    p2pSignalingProcess.on('close', (code: any) => {
      console.log(`🔴 P2P Signaling process closed with code ${code}`);
    });

    p2pSignalingProcess.on('error', (error: any) => {
      console.error('💥 Erro ao iniciar P2P signaling:', error);
    });
      // Aguardar um pouco para garantir que iniciou
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Testar se o P2P está funcionando
    try {
      const net = require('net');
      const client = new net.Socket();
      
      await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          client.destroy();
          reject(new Error('Timeout'));
        }, 3000);
        
        client.connect(8080, 'localhost', () => {
          console.log('✅ P2P Signaling Server está respondendo na porta 8080!');
          clearTimeout(timeout);
          client.destroy();
          resolve(true);
        });
        
        client.on('error', (err: any) => {
          console.error('❌ Erro ao testar P2P porta 8080:', err.message);
          clearTimeout(timeout);
          reject(err);
        });
      });
    } catch (error) {
      console.error('❌ P2P Signaling Server não está respondendo na porta 8080');
    }
    
    console.log('✅ P2P Signaling Server iniciado com sucesso!');
  } else {
    console.log('🔧 Modo desenvolvimento: P2P signaling será iniciado separadamente');
  }
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
    
    backendProcess = spawn('node', [prodPaths.backend], {
      stdio: 'pipe',
      env: env,
      cwd: backendDir
    });

    backendProcess.stdout.on('data', (data: any) => {
      console.log(`Backend: ${data}`);
    });

    backendProcess.stderr.on('data', (data: any) => {
      console.error(`Backend Error: ${data}`);
    });

    backendProcess.on('close', (code: any) => {
      console.log(`Backend process closed with code ${code}`);
    });

    backendProcess.on('error', (error: any) => {
      console.error('Erro ao iniciar backend:', error);
    });
  } else {
    console.log('Modo desenvolvimento: backend será iniciado separadamente');
  }
}

// Event Listeners do Electron
app.whenReady().then(async () => {
  console.log('🚀 Electron app ready, iniciando aplicação...');
  
  if (isDev) {
    console.log('🔧 Modo desenvolvimento detectado');
  } else {
    console.log('📦 Modo produção detectado');
  }
    // Iniciar P2P Signaling primeiro (porta 8080)
  console.log('1️⃣ Iniciando P2P Signaling Server...');
  await startP2PSignalingServer();
  
  // Aguardar mais tempo para P2P inicializar completamente
  console.log('⏳ Aguardando P2P inicializar completamente (8 segundos)...');
  await new Promise(resolve => setTimeout(resolve, 8000));
  
  // Depois iniciar backend principal (porta 3000)
  console.log('2️⃣ Iniciando Backend Principal...');
  await startBackendServer();
  
  // Aguardar backend inicializar
  console.log('⏳ Aguardando Backend inicializar (5 segundos)...');
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  // Por último, criar a janela
  console.log('3️⃣ Criando janela Electron...');
  createWindow();

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
  
  if (p2pSignalingProcess) {
    p2pSignalingProcess.kill();
  }
  
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  if (backendProcess) {
    backendProcess.kill();
  }
  
  if (p2pSignalingProcess) {
    p2pSignalingProcess.kill();
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
