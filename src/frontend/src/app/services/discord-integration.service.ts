import { Injectable } from '@angular/core';

@Injectable({
  providedIn: 'root'
})
export class DiscordIntegrationService {
  private ws?: WebSocket;
  private discordRPC?: any;
  private isDiscordConnected = false;
  private currentUser?: { id: string; username: string };

  constructor() {
    this.initializeDiscordRPC();
    this.connectToBot();
  }

  private async initializeDiscordRPC() {
    try {
      // Importar Discord RPC (instalar: npm install discord-rpc)
      const DiscordRPC = (window as any).require('discord-rpc');

      const clientId = '1234567890123456789'; // Seu Application ID do Discord
      this.discordRPC = new DiscordRPC.Client({ transport: 'ipc' });

      this.discordRPC.on('ready', () => {
        console.log('🎮 Discord RPC conectado!');
        this.isDiscordConnected = true;
        this.setRichPresence('Na fila de matchmaking');
        this.getCurrentUser();
      });

      await this.discordRPC.login({ clientId });
    } catch (error) {
      console.error('❌ Erro ao conectar Discord RPC:', error);
    }
  }
  private connectToBot() {
    try {
      // Conectar ao WebSocket principal do backend (onde o Discord Bot está integrado)
      this.ws = new WebSocket('ws://localhost:3000');

      this.ws.onopen = () => {
        console.log('🤖 Conectado ao backend (Discord Bot integrado)');
      };

      this.ws.onmessage = (event) => {
        const data = JSON.parse(event.data);
        this.handleBotMessage(data);
      };

      this.ws.onclose = () => {
        console.log('🤖 Desconectado do backend (Discord Bot)');
        // Reconectar após 3 segundos
        setTimeout(() => this.connectToBot(), 3000);
      };

    } catch (error) {
      console.error('❌ Erro ao conectar com backend:', error);
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

  private async getCurrentUser() {
    if (!this.discordRPC) return;

    try {
      const user = await this.discordRPC.getUser();
      this.currentUser = {
        id: user.id,
        username: user.username
      };
      console.log('👤 Usuário Discord:', this.currentUser);
    } catch (error) {
      console.error('❌ Erro ao obter usuário:', error);
    }
  }

  setRichPresence(details: string, state?: string) {
    if (!this.discordRPC || !this.isDiscordConnected) return;

    this.discordRPC.setActivity({
      details,
      state,
      startTimestamp: Date.now(),
      largeImageKey: 'lol_logo', // Upload no Developer Portal
      largeImageText: 'LoL Matchmaking',
      smallImageKey: 'queue_icon',
      smallImageText: 'Em fila',
      instance: false,
    });
  }

  joinQueue(role: string) {
    if (!this.ws || !this.currentUser) {
      console.error('❌ Discord ou bot não conectado');
      return;
    }

    const message = {
      type: 'join_queue',
      userId: this.currentUser.id,
      username: this.currentUser.username,
      role
    };

    this.ws.send(JSON.stringify(message));
    this.setRichPresence(`Em fila - ${role}`, `Aguardando match...`);
    console.log(`🎯 Entrou na fila como ${role}`);
  }

  leaveQueue() {
    if (!this.ws || !this.currentUser) return;

    const message = {
      type: 'leave_queue',
      userId: this.currentUser.id
    };

    this.ws.send(JSON.stringify(message));
    this.setRichPresence('Navegando no app');
    console.log('👋 Saiu da fila');
  }

  private updateQueueDisplay(queue: any[]) {
    // Emitir evento para componente atualizar UI
    window.dispatchEvent(new CustomEvent('queueUpdate', {
      detail: { queue, size: queue.length }
    }));
  }

  private handleMatchCreated(matchData: any) {
    // Verificar se o usuário está no match
    const isInBlue = matchData.blueTeam.some((p: any) =>
      p.username === this.currentUser?.username
    );
    const isInRed = matchData.redTeam.some((p: any) =>
      p.username === this.currentUser?.username
    );

    if (isInBlue) {
      this.setRichPresence('Em partida - Blue Team', 'Match encontrado!');
    } else if (isInRed) {
      this.setRichPresence('Em partida - Red Team', 'Match encontrado!');
    }

    // Emitir evento para componente mostrar match
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
  }

  isConnected(): boolean {
    return this.isDiscordConnected && this.ws?.readyState === WebSocket.OPEN;
  }

  getCurrentUserInfo() {
    return this.currentUser;
  }
}
