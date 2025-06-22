import { app, BrowserWindow, ipcMain, Menu } from 'electron';
import * as path from 'path';
import { spawn, exec } from 'child_process';
import * as fs from 'fs';

let mainWindow: BrowserWindow;
let backendProcess: any;

const isDev = process.env.NODE_ENV === 'development';

// Permitir múltiplas instâncias para teste P2P
if (isDev) {
  app.requestSingleInstanceLock = () => false; // Permitir múltiplas instâncias em dev
}

async function checkAndInstallBackendDependencies(): Promise<boolean> {
  return new Promise((resolve) => {
    const backendPath = isDev 
      ? path.join(__dirname, '../../backend')
      : path.join(__dirname, '../../../release/win-unpacked/backend');
    
    const nodeModulesPath = path.join(backendPath, 'node_modules');
    const packageJsonPath = path.join(backendPath, 'package.json');
    
    // Verificar se package.json existe
    if (!fs.existsSync(packageJsonPath)) {
      console.log('package.json do backend não encontrado, continuando...');
      resolve(true);
      return;
    }
    
    // Verificar se node_modules existe
    if (fs.existsSync(nodeModulesPath)) {
      console.log('Dependências do backend já instaladas');
      resolve(true);
      return;
    }
    
    console.log('Instalando dependências do backend...');
    const installCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
    const installProcess = spawn(installCommand, ['install', '--omit=dev'], {
      cwd: backendPath,
      stdio: 'pipe'
    });
    
    installProcess.stdout.on('data', (data: any) => {
      console.log(`NPM Install: ${data}`);
    });
    
    installProcess.stderr.on('data', (data: any) => {
      console.error(`NPM Install Error: ${data}`);
    });
    
    installProcess.on('close', (code: number) => {
      if (code === 0) {
        console.log('Dependências do backend instaladas com sucesso');
        resolve(true);
      } else {
        console.error('Erro ao instalar dependências do backend');
        resolve(false);
      }
    });
  });
}

function getProductionPaths() {
  // Detecta se está rodando instalado (em C:\Program Files) ou portátil
  const isInstalled = process.execPath.includes('Program Files');
  if (isInstalled) {
    return {
      frontend: path.join('C:/Program Files/LoL Matchmaking/frontend/dist/lol-matchmaking/browser/index.html'),
      backend: path.join('C:/Program Files/LoL Matchmaking/backend/server.js')
    };
  } else {
    return {
      frontend: path.join(__dirname, '../../../release/win-unpacked/frontend/dist/lol-matchmaking/browser/index.html'),
      backend: path.join(__dirname, '../../../release/win-unpacked/backend/server.js')
    };
  }
}

function createWindow(): void {
  // Criar a janela principal do aplicativo
  mainWindow = new BrowserWindow({
    height: 800,
    width: 1200,
    minHeight: 600,
    minWidth: 800,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
      // Configurações necessárias para WebRTC P2P
      experimentalFeatures: true,
      allowRunningInsecureContent: true,
      // Permitir acesso a APIs de rede para P2P
      webSecurity: isDev ? false : true, // Mais seguro em produção
    },
    icon: path.join(__dirname, '../../assets/icon.ico'), // Adicionar ícone depois
    titleBarStyle: 'default',
    show: false, // Não mostrar até estar pronto
  });

  // Carregar o frontend Angular
  if (isDev) {
    // Em desenvolvimento, carregar do servidor Angular
    console.log('Carregando frontend do Angular...');
      // Tentar conectar ao Angular com retry
    const tryLoadAngular = (retries = 5) => {
      mainWindow.loadURL('http://localhost:4200').catch((error: any) => {
        console.log(`Tentativa de conexão falhou, tentativas restantes: ${retries}`);
        if (retries > 0) {
          setTimeout(() => tryLoadAngular(retries - 1), 2000);
        } else {
          console.error('Não foi possível conectar ao servidor Angular', error);
        }
      });
    };
    
    tryLoadAngular();
    // Opcional: abrir DevTools em desenvolvimento
    mainWindow.webContents.openDevTools();
  } else {
    // Em produção, carregar arquivo local do Angular buildado
    const prodPaths = getProductionPaths();
    mainWindow.loadFile(prodPaths.frontend);
  }

  // Mostrar quando estiver pronto
  mainWindow.once('ready-to-show', () => {
    console.log('Janela Electron pronta para exibição');
    mainWindow.show();
  });

  // Configurar menu da aplicação
  createMenu();
}

function createMenu(): void {
  const template: any[] = [
    {
      label: 'Arquivo',
      submenu: [
        {
          label: 'Configurações',
          accelerator: 'CmdOrCtrl+,',
          click: () => {
            // Abrir tela de configurações
            mainWindow.webContents.send('open-settings');
          }
        },
        { type: 'separator' },
        {
          label: 'Sair',
          accelerator: process.platform === 'darwin' ? 'Cmd+Q' : 'Ctrl+Q',
          click: () => {
            app.quit();
          }
        }
      ]
    },
    {
      label: 'Fila',
      submenu: [
        {
          label: 'Entrar na Fila',
          accelerator: 'CmdOrCtrl+J',
          click: () => {
            mainWindow.webContents.send('join-queue');
          }
        },
        {
          label: 'Sair da Fila',
          accelerator: 'CmdOrCtrl+L',
          click: () => {
            mainWindow.webContents.send('leave-queue');
          }
        }
      ]
    },
    {
      label: 'Ajuda',
      submenu: [
        {
          label: 'Sobre',
          click: () => {
            mainWindow.webContents.send('show-about');
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
    // Verificar e instalar dependências se necessário
    const depsInstalled = await checkAndInstallBackendDependencies();
    if (!depsInstalled) {
      console.error('Não foi possível instalar as dependências do backend');
      return;
    }
    
    // Em produção, iniciar o servidor backend buildado
    const prodPaths = getProductionPaths();
    backendProcess = spawn('node', [prodPaths.backend], {
      stdio: 'pipe'
    });

    backendProcess.stdout.on('data', (data: any) => {
      console.log(`Backend: ${data}`);
    });

    backendProcess.stderr.on('data', (data: any) => {
      console.error(`Backend Error: ${data}`);
    });
  }
}

// Event Listeners do Electron
app.whenReady().then(async () => {
  console.log('Electron app ready, iniciando aplicação...');
  
  if (isDev) {
    console.log('Modo desenvolvimento detectado');
  }
    await startBackendServer();
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
