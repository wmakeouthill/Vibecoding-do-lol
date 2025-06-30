import { ApplicationConfig, provideBrowserGlobalErrorListeners, provideZoneChangeDetection } from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';

import { routes } from './app.routes';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideRouter(routes),
    provideHttpClient()
  ]
};

// Função para detectar se está no Windows
function isWindows(): boolean {
  return navigator.userAgent.indexOf('Windows') !== -1;
}

// Função para detectar se está no Electron
function isElectron(): boolean {
  return !!(window as any).electronAPI || 
         !!(window as any).require || 
         navigator.userAgent.toLowerCase().indexOf('electron') > -1 ||
         !!(window as any).process?.type;
}

// Configuração inteligente do WebSocket baseada na plataforma
function getWebSocketURL(): string {
  // Se WebSocket URL foi definida manualmente, usar ela
  if ((window as any).WEBSOCKET_URL) {
    return (window as any).WEBSOCKET_URL;
  }

  // Em produção (Electron) no Windows, usar 127.0.0.1
  if (isElectron() && isWindows()) {
    console.log('🔗 WebSocket: Detectado Electron no Windows, usando 127.0.0.1');
    return 'ws://127.0.0.1:3000/ws';
  }
  
  // Em outros casos, usar localhost
  console.log('🔗 WebSocket: Usando localhost padrão');
  return 'ws://localhost:3000/ws';
}

// Configuração customizável do endereço do WebSocket do backend
export const WEBSOCKET_URL = getWebSocketURL();
