const { contextBridge } = require('electron');
const fs = require('fs');
const path = require('path');
const process = require('process');

const logPath = path.join(process.cwd(), 'frontend.log');

function appendLog(type: string, ...args: unknown[]): void {
  const logLine = `[${new Date().toISOString()}] [${type}] ${args.map(a => (typeof a === 'object' ? JSON.stringify(a) : a)).join(' ')}\n`;
  fs.appendFile(logPath, logLine, (err: unknown) => {
    if (err) {
      // Não logue erro aqui para evitar loop infinito
    }
  });
}

(['log', 'warn', 'error', 'info'] as const).forEach((method) => {
  const orig = (console as any)[method];
  (console as any)[method] = function (...args: unknown[]) {
    appendLog(method, ...args);
    orig.apply(console, args);
  };
});

contextBridge.exposeInMainWorld('electronAPI', {
  fs: fs,
  path: path,
  process: process
});

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
