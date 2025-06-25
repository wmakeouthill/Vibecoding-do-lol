import { Injectable } from '@angular/core';

@Injectable({
  providedIn: 'root'
})
export class DiscordIntegrationService {
  private ws?: WebSocket;
  private isBackendConnected = false;
  private discordUsersOnline: any[] = [];
  private linkedNicknames: Map<string, {gameName: string, tagLine: string}> = new Map();
  private currentDiscordUser: any = null;
  private isInDiscordChannel = false;
  private queueParticipants: any[] = [];

  constructor() {
    this.connectToBot();
    this.setupDiscordPresence();
  }

  private connectToBot() {
    try {
      // Conectar ao WebSocket do backend integrado
      this.ws = new WebSocket('ws://localhost:3000/ws');

      this.ws.onopen = () => {
        console.log('🤖 Conectado ao Discord Bot');
        this.isBackendConnected = true;
        this.requestDiscordStatus();
      };

      this.ws.onmessage = (event) => {
        const data = JSON.parse(event.data);
        this.handleBotMessage(data);
      };

      this.ws.onclose = () => {
        console.log('🤖 Desconectado do Discord Bot');
        this.isBackendConnected = false;
        this.isInDiscordChannel = false;
        this.currentDiscordUser = null;
        setTimeout(() => this.connectToBot(), 3000);
      };

    } catch (error) {
      console.error('❌ Erro ao conectar com Discord Bot:', error);
      this.isBackendConnected = false;
    }
  }

  private setupDiscordPresence() {
    // Simular Rich Presence - em produção seria via Discord RPC
    // Por enquanto, vamos usar o sistema de detecção do bot
    console.log('🎮 Configurando presença Discord...');
  }

  private handleBotMessage(data: any) {
    switch (data.type) {
      case 'discord_users_online':
        console.log('👥 Usuários Discord online recebidos:', data.users);
        this.discordUsersOnline = data.users;
        this.updateDiscordUsersList(data.users);
        this.checkAutoLink();
        break;

      case 'user_joined_channel':
        console.log(`👤 ${data.username} entrou no canal`);
        this.updateUserStatus(data.userId, true);
        break;

      case 'user_left_channel':
        console.log(`👋 ${data.username} saiu do canal`);
        this.updateUserStatus(data.userId, false);
        break;

      case 'queue_update':
        console.log('🎯 Fila atualizada:', data.queue);
        this.queueParticipants = data.queue;
        this.updateQueueDisplay(data.queue);
        break;

      case 'match_created':
        console.log('🎮 Match criado!', data);
        this.handleMatchCreated(data);
        break;

      case 'user_qualified':
        console.log(`✅ ${data.username} qualificado para fila`);
        break;

      case 'auto_link_success':
        console.log(`🔗 Auto-vinculação: ${data.username} -> ${data.gameName}#${data.tagLine}`);
        this.linkedNicknames.set(data.discordId, {
          gameName: data.gameName,
          tagLine: data.tagLine
        });
        break;

      case 'discord_status':
        console.log('🎮 Status do Discord recebido:', data);
        this.isInDiscordChannel = data.inChannel; // Usar a informação do backend
        this.currentDiscordUser = {
          id: 'current_user', // Placeholder
          username: 'Current User' // Placeholder
        };
        console.log(`🎮 Status Discord: ${this.currentDiscordUser?.username} - Canal: ${this.isInDiscordChannel}`);
        break;
    }
  }

  // Solicitar status atual do Discord
  requestDiscordStatus() {
    if (!this.ws) return;

    const message = {
      type: 'get_discord_status'
    };

    this.ws.send(JSON.stringify(message));
    
    // Também solicitar lista de usuários no canal
    const usersMessage = {
      type: 'get_discord_users_online'
    };
    
    this.ws.send(JSON.stringify(usersMessage));
  }

  // Verificar vinculação automática
  private checkAutoLink() {
    // Esta função será chamada quando receber dados do LCU
    // Compara dados do LCU com usuários Discord online
  }

  // Vincular automaticamente baseado em dados do LCU
  async autoLinkWithLCU(lcuData: {gameName: string, tagLine: string}) {
    if (!this.ws) return false;

    const message = {
      type: 'auto_link_lcu',
      gameName: lcuData.gameName,
      tagLine: lcuData.tagLine
    };

    this.ws.send(JSON.stringify(message));
    return true;
  }

  // Entrar na fila Discord
  joinDiscordQueue(role: string, username: string) {
    if (!this.ws) {
      console.error('❌ Discord Bot não conectado');
      return false;
    }

    if (!this.isInDiscordChannel) {
      console.error('❌ Não está no canal #lol-matchmaking');
      return false;
    }

    const message = {
      type: 'join_discord_queue',
      username,
      role,
      discordId: this.currentDiscordUser?.id
    };

    this.ws.send(JSON.stringify(message));
    console.log(`🎯 Entrou na fila Discord como ${role}`);
    return true;
  }

  // Sair da fila Discord
  leaveDiscordQueue() {
    if (!this.ws) return;

    const message = {
      type: 'leave_discord_queue',
      discordId: this.currentDiscordUser?.id
    };

    this.ws.send(JSON.stringify(message));
    console.log('👋 Saiu da fila Discord');
  }

  // Obter usuários Discord online
  getDiscordUsersOnline(): any[] {
    return this.discordUsersOnline;
  }

  // Verificar se está no canal Discord
  isInChannel(): boolean {
    return this.isInDiscordChannel;
  }

  // Verificar se está conectado ao Discord
  isConnected(): boolean {
    return this.isBackendConnected && this.ws?.readyState === WebSocket.OPEN;
  }

  // Obter usuário Discord atual
  getCurrentDiscordUser(): any {
    return this.currentDiscordUser;
  }

  // Obter participantes da fila
  getQueueParticipants(): any[] {
    return this.queueParticipants;
  }

  // Verificar se tem nickname vinculado
  hasLinkedNickname(discordId: string): boolean {
    return this.linkedNicknames.has(discordId);
  }

  getLinkedNickname(discordId: string): {gameName: string, tagLine: string} | null {
    return this.linkedNicknames.get(discordId) || null;
  }

  // Atualizar lista de usuários Discord com vinculações
  private updateDiscordUsersList(users: any[]) {
    this.discordUsersOnline = users.map(user => ({
      ...user,
      linkedNickname: this.linkedNicknames.get(user.discordId) || null
    }));
  }

  // Atualizar vinculações quando receber dados do backend
  private updateLinkedNicknames(links: any[]) {
    this.linkedNicknames.clear();
    links.forEach(link => {
      this.linkedNicknames.set(link.discord_id, {
        gameName: link.game_name,
        tagLine: link.tag_line
      });
    });
  }

  private updateUserStatus(userId: string, isOnline: boolean) {
    const userIndex = this.discordUsersOnline.findIndex(u => u.id === userId);
    if (userIndex !== -1) {
      this.discordUsersOnline[userIndex].isOnline = isOnline;
      this.updateDiscordUsersList(this.discordUsersOnline);
    }
  }

  private updateQueueDisplay(queue: any[]) {
    window.dispatchEvent(new CustomEvent('queueUpdate', {
      detail: { queue, size: queue.length }
    }));
  }

  private handleMatchCreated(matchData: any) {
    window.dispatchEvent(new CustomEvent('matchFound', {
      detail: matchData
    }));
  }

  // Cleanup
  ngOnDestroy() {
    if (this.ws) {
      this.ws.close();
    }
  }
}
