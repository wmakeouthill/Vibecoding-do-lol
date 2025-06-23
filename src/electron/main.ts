import { app, BrowserWindow, ipcMain, Menu } from 'electron';
import * as path from 'path';
import { spawn, exec } from 'child_process';
import * as fs from 'fs';

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
    nodeModules: nodeModulesPath
  };
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
  });  // Carregar o frontend Angular
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
    setTimeout(() => tryLoadProduction(), 3000);
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
