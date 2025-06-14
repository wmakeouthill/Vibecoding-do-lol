import { contextBridge, ipcRenderer } from 'electron';

// API exposta para o frontend Angular
const electronAPI = {
  // Informações do app
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),
  getUserDataPath: () => ipcRenderer.invoke('get-user-data-path'),

  // Controles da janela
  minimizeWindow: () => ipcRenderer.invoke('minimize-window'),
  maximizeWindow: () => ipcRenderer.invoke('maximize-window'),
  closeWindow: () => ipcRenderer.invoke('close-window'),

  // Eventos da aplicação
  onOpenSettings: (callback: () => void) => ipcRenderer.on('open-settings', callback),
  onJoinQueue: (callback: () => void) => ipcRenderer.on('join-queue', callback),
  onLeaveQueue: (callback: () => void) => ipcRenderer.on('leave-queue', callback),
  onShowAbout: (callback: () => void) => ipcRenderer.on('show-about', callback),

  // Remover listeners
  removeAllListeners: (channel: string) => ipcRenderer.removeAllListeners(channel),
};

// Expor a API para o contexto do frontend
contextBridge.exposeInMainWorld('electronAPI', electronAPI);

// TypeScript declarations para o frontend usar
export interface ElectronAPI {
  getAppVersion: () => Promise<string>;
  getUserDataPath: () => Promise<string>;
  minimizeWindow: () => Promise<void>;
  maximizeWindow: () => Promise<void>;
  closeWindow: () => Promise<void>;
  onOpenSettings: (callback: () => void) => void;
  onJoinQueue: (callback: () => void) => void;
  onLeaveQueue: (callback: () => void) => void;
  onShowAbout: (callback: () => void) => void;
  removeAllListeners: (channel: string) => void;
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}
