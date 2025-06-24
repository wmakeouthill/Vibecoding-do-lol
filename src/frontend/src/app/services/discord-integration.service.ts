import { Injectable } from '@angular/core';

@Injectable({
  providedIn: 'root'
})
export class DiscordIntegrationService {
  private ws?: WebSocket;
  private isBackendConnected = false;

  constructor() {
    this.connectToBot();
  }  private connectToBot() {
    try {
      // Conectar ao WebSocket principal do backend (onde o Discord Bot está integrado)
      this.ws = new WebSocket('ws://localhost:3000');

      this.ws.onopen = () => {
        console.log('🤖 Conectado ao backend (Discord Bot integrado)');
        this.isBackendConnected = true;
      };

      this.ws.onmessage = (event) => {
        const data = JSON.parse(event.data);
        this.handleBotMessage(data);
      };

      this.ws.onclose = () => {
        console.log('🤖 Desconectado do backend (Discord Bot)');
        this.isBackendConnected = false;
        // Reconectar após 3 segundos
        setTimeout(() => this.connectToBot(), 3000);
      };

    } catch (error) {
      console.error('❌ Erro ao conectar com backend:', error);
      this.isBackendConnected = false;
    }
  }
  private handleBotMessage(data: any) {
    switch (data.type) {
      case 'queue_update':
        console.log(`🎯 Fila atualizada: ${data.size}/10 players`);
        this.updateQueueDisplay(data.queue);
        break;

      case 'match_created':
        console.log('🎮 Match criado!', data);
        this.handleMatchCreated(data);
        break;

      case 'user_qualified':
        console.log(`✅ ${data.username} qualificado para fila`);
        break;
    }
  }

  // Funções de Rich Presence removidas - agora o Discord Bot do backend gerencia isso

  joinQueue(role: string, username: string) {
    if (!this.ws) {
      console.error('❌ Backend não conectado');
      return;
    }

    const message = {
      type: 'join_discord_queue',
      username,
      role,
    };

    this.ws.send(JSON.stringify(message));
    console.log(`🎯 Entrou na fila como ${role}`);
  }

  leaveQueue(username: string) {
    if (!this.ws) return;

    const message = {
      type: 'leave_queue',
      username
    };

    this.ws.send(JSON.stringify(message));
    console.log('👋 Saiu da fila');
  }

  private updateQueueDisplay(queue: any[]) {
    if (!Array.isArray(queue)) {
      console.error('Fila recebida é inválida:', queue);
      window.dispatchEvent(new CustomEvent('queueUpdate', {
        detail: { queue: [], size: 0 }
      }));
      return;
    }
    window.dispatchEvent(new CustomEvent('queueUpdate', {
      detail: { queue, size: queue.length }
    }));
  }
  private handleMatchCreated(matchData: any) {
    // Simplesmente emitir evento para componente mostrar match
    // O Discord Bot do backend gerencia Rich Presence automaticamente
    window.dispatchEvent(new CustomEvent('matchFound', {
      detail: matchData
    }));
  }

  getQueueStatus() {
    if (!this.ws) return;

    const message = {
      type: 'get_queue_status'
    };

    this.ws.send(JSON.stringify(message));
  }  isConnected(): boolean {
    return this.isBackendConnected && this.ws?.readyState === WebSocket.OPEN;
  }
}
