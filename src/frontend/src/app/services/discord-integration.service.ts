import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { WEBSOCKET_URL } from '../app.config';

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

  // Observables para componentes
  private usersSubject = new BehaviorSubject<any[]>([]);
  private connectionSubject = new BehaviorSubject<boolean>(false);

  // Contador de instâncias para debug
  private static instanceCount = 0;
  private instanceId: number;

  constructor() {
    DiscordIntegrationService.instanceCount++;
    this.instanceId = DiscordIntegrationService.instanceCount;
    console.log(`🔧 [DiscordService] Instância #${this.instanceId} criada (Total: ${DiscordIntegrationService.instanceCount})`);
    
    this.connectToWebSocket();
  }

  private connectToWebSocket() {
    // Verificar se já existe uma conexão ativa
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      console.log(`⚠️ [DiscordService #${this.instanceId}] WebSocket já está conectado, não criando nova conexão`);
      return;
    }

    // Fechar conexão anterior se existir
    if (this.ws) {
      console.log(`🔌 [DiscordService #${this.instanceId}] Fechando conexão anterior...`);
      this.ws.close();
      this.ws = undefined;
    }

    try {
      // Usar endereço customizável
      const wsUrl = WEBSOCKET_URL;
      console.log(`[DEBUG] [DiscordService #${this.instanceId}] Conectando WebSocket em: ${wsUrl}`);
      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
        console.log(`🔗 [DiscordService #${this.instanceId}] WebSocket conectado com sucesso`);
        this.isBackendConnected = true;
        this.connectionSubject.next(true);
        
        // Solicitar status inicial imediatamente
        console.log(`🔍 [DiscordService #${this.instanceId}] Solicitando status inicial do Discord...`);
        this.requestDiscordStatus();
      };

      this.ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          console.log(`📥 [DiscordService #${this.instanceId}] Mensagem recebida:`, data.type);
          this.handleBotMessage(data);
        } catch (error) {
          console.error(`❌ [DiscordService #${this.instanceId}] Erro ao processar mensagem:`, error);
        }
      };

      this.ws.onclose = () => {
        console.log(`🔌 [DiscordService #${this.instanceId}] WebSocket desconectado`);
        this.isBackendConnected = false;
        this.connectionSubject.next(false);
        this.isInDiscordChannel = false;
        this.currentDiscordUser = null;
        
        // Reconectar automaticamente após 3 segundos
        setTimeout(() => {
          console.log(`🔄 [DiscordService #${this.instanceId}] Tentando reconectar...`);
          this.connectToWebSocket();
        }, 3000);
      };

      this.ws.onerror = (error) => {
        console.error(`❌ [DiscordService #${this.instanceId}] Erro na conexão WebSocket:`, error);
      };

    } catch (error) {
      console.error(`❌ [DiscordService #${this.instanceId}] Erro ao conectar WebSocket:`, error);
      this.isBackendConnected = false;
      this.connectionSubject.next(false);
    }
  }

  private handleBotMessage(data: any) {
    console.log(`🔍 [DiscordService #${this.instanceId}] Processando mensagem:`, data.type, data);
    
    switch (data.type) {
      case 'discord_users_online':
        console.log(`👥 [DiscordService #${this.instanceId}] Usuários Discord online recebidos:`, data.users?.length || 0, 'usuários');
        this.discordUsersOnline = data.users;
        this.usersSubject.next(data.users);
        break;

      case 'discord_links_update':
        console.log(`🔗 [DiscordService #${this.instanceId}] Vinculações Discord atualizadas:`, data.links?.length || 0, 'links');
        this.updateLinkedNicknames(data.links);
        break;

      case 'discord_status':
        console.log(`🎮 [DiscordService #${this.instanceId}] Status do Discord recebido:`, data);
        console.log(`🎮 [DiscordService #${this.instanceId}] isConnected:`, data.isConnected);
        console.log(`🎮 [DiscordService #${this.instanceId}] inChannel:`, data.inChannel);
        
        this.isInDiscordChannel = data.inChannel;
        this.currentDiscordUser = {
          id: 'current_user',
          username: 'Current User'
        };
        
        // Atualizar status de conexão baseado na resposta do backend
        if (data.isConnected !== undefined) {
          console.log(`🎮 [DiscordService #${this.instanceId}] Atualizando status de conexão para:`, data.isConnected);
          this.isBackendConnected = data.isConnected;
          this.connectionSubject.next(data.isConnected);
        }
        break;

      case 'queue_update':
        console.log(`🎯 [DiscordService #${this.instanceId}] Fila atualizada:`, data.queue?.length || 0, 'jogadores');
        this.queueParticipants = data.queue;
        break;

      case 'match_created':
        console.log(`🎮 [DiscordService #${this.instanceId}] Match criado!`, data);
        break;
    }
  }

  // Solicitar status atual do Discord
  requestDiscordStatus() {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      console.warn(`⚠️ [DiscordService #${this.instanceId}] WebSocket não está conectado, não é possível solicitar status`);
      return;
    }

    console.log(`🔍 [DiscordService #${this.instanceId}] Solicitando status do Discord...`);

    // Enviar todas as solicitações
    const messages = [
      { type: 'get_discord_status' },
      { type: 'get_discord_users_online' },
      { type: 'get_discord_links' },
      { type: 'get_queue_status' }
    ];

    messages.forEach(msg => {
      console.log(`📤 [DiscordService #${this.instanceId}] Enviando:`, msg.type);
      this.ws!.send(JSON.stringify(msg));
    });
  }

  // Entrar na fila Discord
  joinDiscordQueue(role: string, username: string, lcuData?: {gameName: string, tagLine: string}) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      console.error('❌ WebSocket não conectado');
      return false;
    }

    if (!this.isInDiscordChannel) {
      console.error('❌ Não está no canal #lol-matchmaking');
      return false;
    }

    const message = {
      type: 'join_discord_queue',
      data: {
        player: {
          gameName: lcuData?.gameName,
          tagLine: lcuData?.tagLine,
          summonerName: username
        },
        preferences: {
          primaryLane: role,
          secondaryLane: role
        }
      }
    };

    console.log('🎯 Enviando entrada na fila Discord:', message);
    this.ws.send(JSON.stringify(message));
    return true;
  }

  // Sair da fila Discord
  leaveDiscordQueue() {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      console.warn('⚠️ WebSocket não está conectado');
      return;
    }

    const message = { type: 'leave_queue' };
    this.ws.send(JSON.stringify(message));
    console.log('👋 Saindo da fila Discord');
  }

  // Métodos públicos
  isConnected(): boolean {
    const wsOpen = this.ws?.readyState === WebSocket.OPEN;
    const backendConnected = this.isBackendConnected;
    const finalStatus = backendConnected && wsOpen;
    
    console.log(`🔍 [DiscordService #${this.instanceId}] Status de conexão:`, {
      wsOpen,
      backendConnected,
      finalStatus,
      wsReadyState: this.ws?.readyState
    });
    
    return finalStatus;
  }

  isInChannel(): boolean {
    return this.isInDiscordChannel;
  }

  getCurrentDiscordUser(): any {
    return this.currentDiscordUser;
  }

  getDiscordUsersOnline(): any[] {
    return this.discordUsersOnline;
  }

  getQueueParticipants(): any[] {
    return this.queueParticipants;
  }

  // Observables
  onUsersUpdate(): Observable<any[]> {
    return this.usersSubject.asObservable();
  }

  onConnectionChange(): Observable<boolean> {
    return this.connectionSubject.asObservable();
  }

  // Método para forçar reconexão e atualização
  forceReconnect(): void {
    console.log(`🔄 [DiscordService #${this.instanceId}] Forçando reconexão...`);
    
    // Fechar conexão atual se existir
    if (this.ws) {
      this.ws.close();
      this.ws = undefined;
    }
    
    // Resetar status
    this.isBackendConnected = false;
    this.connectionSubject.next(false);
    
    // Reconectar imediatamente
    setTimeout(() => {
      this.connectToWebSocket();
    }, 100);
  }

  // Cleanup
  ngOnDestroy() {
    console.log(`🗑️ [DiscordService #${this.instanceId}] Destruindo instância...`);
    if (this.ws) {
      console.log(`🔌 [DiscordService #${this.instanceId}] Fechando WebSocket...`);
      this.ws.close();
      this.ws = undefined;
    }
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
}
