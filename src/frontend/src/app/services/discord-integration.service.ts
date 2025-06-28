import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable, Subject } from 'rxjs';
import { WEBSOCKET_URL } from '../app.config';

@Injectable({
  providedIn: 'root'
})
export class DiscordIntegrationService {
  private ws?: WebSocket;
  private isBackendConnected = false;
  private discordUsersOnline: any[] = [];
  private linkedNicknames: Map<string, { gameName: string, tagLine: string }> = new Map();
  private currentDiscordUser: any = null;
  private isInDiscordChannel = false;
  private queueParticipants: any[] = [];

  // Observables para componentes
  private usersSubject = new BehaviorSubject<any[]>([]);
  private connectionSubject = new BehaviorSubject<boolean>(false);
  private queueJoinedSubject = new BehaviorSubject<any>(null);
  private queueUpdateSubject = new BehaviorSubject<any>(null); // NOVO: Para atualizações da fila

  // Contador de instâncias para debug
  private static instanceCount = 0;
  private instanceId: number;

  // Throttling simplificado - apenas proteção básica contra spam
  private lastStatusRequest = 0;
  private readonly STATUS_REQUEST_COOLDOWN = 2000; // Aumentado para 2 segundos (era 500ms) - menos polling

  // Otimizações de performance - REMOVIDO THROTTLING DESNECESSÁRIO
  // Atualizações de fila em tempo real
  private lastQueueUpdate = 0;
  private readonly QUEUE_UPDATE_THROTTLE = 50; // Apenas 50ms para evitar spam extremo
  private pendingQueueUpdate: any = null;
  private queueUpdateTimeout: any = null;

  // Sistema de reconexão robusto
  private reconnectAttempts = 0;
  private readonly MAX_RECONNECT_ATTEMPTS = 10;
  private readonly INITIAL_RECONNECT_DELAY = 100; // Começar com 100ms
  private readonly MAX_RECONNECT_DELAY = 5000; // Máximo 5 segundos
  private reconnectTimeout?: number;
  private heartbeatInterval?: number;
  private readonly HEARTBEAT_INTERVAL = 30000; // Heartbeat a cada 30 segundos
  private lastHeartbeat = 0;
  private connectionTimeout?: number;
  private readonly CONNECTION_TIMEOUT = 10000; // Timeout de 10 segundos

  // NOVO: Sistema de atualizações automáticas via WebSocket
  private autoUpdateInterval?: number;
  private readonly AUTO_UPDATE_INTERVAL = 30000; // Atualização automática a cada 30 segundos (backup)
  private lastAutoUpdate = 0;

  private matchFoundSubject = new Subject<any>();

  constructor() {
    DiscordIntegrationService.instanceCount++;
    this.instanceId = DiscordIntegrationService.instanceCount;
    console.log(`🔧 [DiscordService] Instância #${this.instanceId} criada (Total: ${DiscordIntegrationService.instanceCount})`);

    // Aguardar um pouco antes de conectar para evitar conflitos de inicialização
    setTimeout(() => {
      this.connectToWebSocket();
    }, 500);
  }

  private connectToWebSocket() {
    // Verificar se já existe uma conexão ativa
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      console.log(`⚠️ [DiscordService #${this.instanceId}] WebSocket já está conectado, não criando nova conexão`);
      return;
    }

    // Limpar timeouts anteriores
    this.clearReconnectTimeout();
    this.clearConnectionTimeout();

    // Fechar conexão anterior se existir
    if (this.ws) {
      console.log(`🔌 [DiscordService #${this.instanceId}] Fechando conexão anterior...`);
      this.ws.close();
      this.ws = undefined;
    }

    try {
      // Usar endereço customizável
      const wsUrl = WEBSOCKET_URL;
      console.log(`🔗 [DiscordService #${this.instanceId}] Conectando WebSocket em: ${wsUrl}`);
      this.ws = new WebSocket(wsUrl);

      // Configurar timeout de conexão
      this.connectionTimeout = window.setTimeout(() => {
        if (this.ws && this.ws.readyState !== WebSocket.OPEN) {
          console.error(`⏰ [DiscordService #${this.instanceId}] Timeout de conexão - tentando reconectar...`);
          this.ws.close();
          this.scheduleReconnect();
        }
      }, this.CONNECTION_TIMEOUT);

      this.ws.onopen = () => {
        console.log(`✅ [DiscordService #${this.instanceId}] WebSocket conectado com sucesso`);
        this.clearConnectionTimeout();
        this.isBackendConnected = true;
        this.connectionSubject.next(true);
        this.reconnectAttempts = 0; // Resetar tentativas de reconexão

        // Iniciar heartbeat
        this.startHeartbeat();

        // Iniciar sistema de atualização automática
        this.startAutoUpdate();

        // Solicitar status inicial imediatamente
        console.log(`🔍 [DiscordService #${this.instanceId}] Solicitando status inicial do Discord...`);
        this.requestDiscordStatus();
      };

      this.ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);

          // Atualizar último heartbeat se for uma resposta
          if (data.type === 'pong') {
            this.lastHeartbeat = Date.now();
            console.log(`💓 [DiscordService #${this.instanceId}] Heartbeat recebido`);
            return;
          }

          console.log(`📥 [DiscordService #${this.instanceId}] Mensagem recebida:`, data.type);
          this.handleBotMessage(data);
        } catch (error) {
          console.error(`❌ [DiscordService #${this.instanceId}] Erro ao processar mensagem:`, error);
        }
      };

      this.ws.onclose = (event) => {
        console.log(`🔌 [DiscordService #${this.instanceId}] WebSocket desconectado (código: ${event.code}, motivo: ${event.reason})`);
        this.clearConnectionTimeout();
        this.stopHeartbeat();
        this.stopAutoUpdate(); // Parar atualização automática
        this.isBackendConnected = false;
        this.connectionSubject.next(false);
        this.isInDiscordChannel = false;
        this.currentDiscordUser = null;

        // Tentar reconectar automaticamente
        this.scheduleReconnect();
      };

      this.ws.onerror = (error) => {
        console.error(`❌ [DiscordService #${this.instanceId}] Erro na conexão WebSocket:`, error);
        this.clearConnectionTimeout();
      };

    } catch (error) {
      console.error(`❌ [DiscordService #${this.instanceId}] Erro ao conectar WebSocket:`, error);
      this.clearConnectionTimeout();
      this.isBackendConnected = false;
      this.connectionSubject.next(false);
      this.scheduleReconnect();
    }
  }

  private scheduleReconnect() {
    if (this.reconnectAttempts >= this.MAX_RECONNECT_ATTEMPTS) {
      console.error(`❌ [DiscordService #${this.instanceId}] Máximo de tentativas de reconexão atingido (${this.MAX_RECONNECT_ATTEMPTS})`);
      return;
    }

    // Verificar se já existe uma conexão ativa antes de agendar reconexão
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      console.log(`✅ [DiscordService #${this.instanceId}] WebSocket já está conectado, cancelando reconexão`);
      this.reconnectAttempts = 0; // Resetar tentativas
      return;
    }

    this.reconnectAttempts++;
    const delay = Math.min(
      this.INITIAL_RECONNECT_DELAY * Math.pow(1.5, this.reconnectAttempts - 1),
      this.MAX_RECONNECT_DELAY
    );

    console.log(`🔄 [DiscordService #${this.instanceId}] Tentativa ${this.reconnectAttempts}/${this.MAX_RECONNECT_ATTEMPTS} de reconexão em ${delay}ms`);

    this.reconnectTimeout = window.setTimeout(() => {
      // Verificar novamente se ainda precisa reconectar
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        console.log(`✅ [DiscordService #${this.instanceId}] WebSocket reconectado automaticamente, cancelando tentativa`);
        this.reconnectAttempts = 0;
        return;
      }
      this.connectToWebSocket();
    }, delay);
  }

  private startHeartbeat() {
    this.stopHeartbeat(); // Parar heartbeat anterior se existir

    this.heartbeatInterval = window.setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        console.log(`💓 [DiscordService #${this.instanceId}] Enviando heartbeat...`);
        this.ws.send(JSON.stringify({ type: 'ping' }));

        // Verificar se o último heartbeat foi muito antigo (mais tolerante)
        const timeSinceLastHeartbeat = Date.now() - this.lastHeartbeat;
        if (this.lastHeartbeat > 0 && timeSinceLastHeartbeat > this.HEARTBEAT_INTERVAL * 3) {
          console.warn(`⚠️ [DiscordService #${this.instanceId}] Heartbeat não respondido há ${timeSinceLastHeartbeat}ms, reconectando...`);
          this.ws.close();
        }
      } else {
        console.log(`⚠️ [DiscordService #${this.instanceId}] WebSocket não está aberto durante heartbeat, estado: ${this.ws?.readyState}`);
      }
    }, this.HEARTBEAT_INTERVAL);
  }

  private stopHeartbeat() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = undefined;
    }
  }

  private clearReconnectTimeout() {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = undefined;
    }
  }

  private clearConnectionTimeout() {
    if (this.connectionTimeout) {
      clearTimeout(this.connectionTimeout);
      this.connectionTimeout = undefined;
    }
  }

  private handleBotMessage(data: any) {
    console.log(`🔍 [DiscordService #${this.instanceId}] Processando mensagem:`, data.type, data);

    switch (data.type) {
      case 'discord_users_online':
        console.log(`👥 [DiscordService #${this.instanceId}] Usuários Discord online recebidos:`, data.users?.length || 0, 'usuários');
        this.discordUsersOnline = data.users || [];
        this.usersSubject.next(this.discordUsersOnline);

        // Atualizar timestamp da última atualização automática
        this.lastAutoUpdate = Date.now();
        break;

      case 'discord_links_update':
        console.log(`🔗 [DiscordService #${this.instanceId}] Vinculações Discord atualizadas:`, data.links?.length || 0, 'links');
        this.updateLinkedNicknames(data.links || []);
        break;

      case 'discord_status':
        console.log(`🎮 [DiscordService #${this.instanceId}] Status do Discord recebido:`, data);
        console.log(`🎮 [DiscordService #${this.instanceId}] isConnected:`, data.isConnected);
        console.log(`🎮 [DiscordService #${this.instanceId}] inChannel:`, data.inChannel);

        this.isInDiscordChannel = data.inChannel || false;

        // Buscar usuário atual real se estiver conectado
        if (data.isConnected && data.inChannel && data.currentUser) {
          this.currentDiscordUser = {
            id: data.currentUser.id,
            username: data.currentUser.username,
            displayName: data.currentUser.displayName || data.currentUser.username
          };
        } else {
          this.currentDiscordUser = null;
        }

        // Atualizar status de conexão baseado na resposta do backend
        if (data.isConnected !== undefined && data.isConnected !== null) {
          console.log(`🎮 [DiscordService #${this.instanceId}] Atualizando status de conexão para:`, data.isConnected);
          this.isBackendConnected = data.isConnected;
          this.connectionSubject.next(data.isConnected);
        }
        break;

      case 'discord_channel_status':
        console.log(`🔍 [DiscordService #${this.instanceId}] Status do canal Discord recebido:`, data);
        this.isInDiscordChannel = data.inChannel || false;
        console.log(`🔍 [DiscordService #${this.instanceId}] Usuários no canal: ${data.usersCount}, inChannel: ${data.inChannel}`);
        break;

      case 'queue_update':
        console.log(`🎯 [DiscordService #${this.instanceId}] Fila atualizada:`, data.data?.playersInQueue || 0, 'jogadores');

        // Aplicar atualização imediatamente (sem throttling desnecessário)
        this.queueParticipants = data.data?.playersInQueueList || [];
        this.lastQueueUpdate = Date.now();

        // Emitir atualização da fila para componentes
        this.queueUpdateSubject.next(data.data);

        console.log(`🎯 [DiscordService #${this.instanceId}] Atualização de fila aplicada imediatamente`);
        break;

      case 'queue_joined':
        console.log(`✅ [DiscordService #${this.instanceId}] Entrou na fila com sucesso!`, data);
        // Emitir evento para o componente queue
        this.queueJoinedSubject.next(data.data);
        break;

      case 'match_created':
        console.log(`🎮 [DiscordService #${this.instanceId}] Match criado!`, data);
        break;

      case 'match_found':
        console.log(`🎮 [DiscordService #${this.instanceId}] Partida encontrada!`, data);
        this.matchFoundSubject.next(data.data);
        break;

      case 'draft_started':
        console.log(`🎯 [DiscordService #${this.instanceId}] Fase de draft iniciada!`, data);
        // Emitir evento para o app principal processar
        this.matchFoundSubject.next({
          ...data.data,
          phase: 'draft_started'
        });
        break;

      case 'match_cancelled':
        console.log(`❌ [DiscordService #${this.instanceId}] Partida cancelada!`, data);
        // Emitir evento de cancelamento
        this.matchFoundSubject.next({
          type: 'match_cancelled',
          ...data.data
        });
        break;

      case 'draft_cancelled':
        console.log(`❌ [DiscordService #${this.instanceId}] Draft cancelado!`, data);
        // Emitir evento de cancelamento de draft
        this.matchFoundSubject.next({
          type: 'draft_cancelled',
          ...data.data
        });
        break;

      case 'pong':
        // Heartbeat response - já tratado no onmessage
        break;

      default:
        console.log(`⚠️ [DiscordService #${this.instanceId}] Tipo de mensagem não reconhecido:`, data.type);
    }
  }

  // Solicitar status atual do Discord (com throttling reduzido)
  requestDiscordStatus() {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      console.warn(`⚠️ [DiscordService #${this.instanceId}] WebSocket não está conectado, não é possível solicitar status`);
      return;
    }

    // Verificar throttling
    const now = Date.now();
    if (now - this.lastStatusRequest < this.STATUS_REQUEST_COOLDOWN) {
      console.log(`⏱️ [DiscordService #${this.instanceId}] Solicitação ignorada (throttling): ${now - this.lastStatusRequest}ms desde última solicitação`);
      return;
    }

    this.lastStatusRequest = now;
    console.log(`🔍 [DiscordService #${this.instanceId}] Solicitando status do Discord...`);

    // Enviar solicitações essenciais apenas
    const messages = [
      { type: 'get_discord_status' },
      { type: 'get_discord_users_online' }
    ];

    messages.forEach(msg => {
      console.log(`📤 [DiscordService #${this.instanceId}] Enviando:`, msg.type);
      this.ws!.send(JSON.stringify(msg));
    });
  }

  // NOVO: Iniciar sistema de atualização automática como backup
  private startAutoUpdate() {
    this.stopAutoUpdate(); // Parar atualização anterior se existir

    this.autoUpdateInterval = window.setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        const now = Date.now();
        const timeSinceLastUpdate = now - this.lastAutoUpdate;

        // Só fazer atualização automática se não recebeu atualização recente
        if (timeSinceLastUpdate > this.AUTO_UPDATE_INTERVAL) {
          console.log(`🔄 [DiscordService #${this.instanceId}] Atualização automática (backup) - última atualização há ${Math.floor(timeSinceLastUpdate / 1000)}s`);
          this.requestDiscordStatus();
        }
      }
    }, this.AUTO_UPDATE_INTERVAL);
  }

  // NOVO: Parar sistema de atualização automática
  private stopAutoUpdate() {
    if (this.autoUpdateInterval) {
      clearInterval(this.autoUpdateInterval);
      this.autoUpdateInterval = undefined;
    }
  }

  // Entrar na fila Discord
  joinDiscordQueue(primaryLane: string, secondaryLane: string, username: string, lcuData?: { gameName: string, tagLine: string }) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      console.error('❌ WebSocket não conectado');
      return false;
    }

    if (!this.isInDiscordChannel) {
      console.error('❌ Não está no canal #lol-matchmaking');
      return false;
    }

    // Verificar se temos dados do LCU
    if (!lcuData || !lcuData.gameName || !lcuData.tagLine) {
      console.error('❌ Dados do LCU não disponíveis. Certifique-se de estar logado no LoL');
      return false;
    }

    // Buscar o Discord ID do usuário atual baseado nos dados do LCU
    const lcuFullName = `${lcuData.gameName}#${lcuData.tagLine}`;
    console.log('🔍 [DiscordService] Procurando usuário Discord para:', lcuFullName);

    // Procurar nos usuários online do Discord que tenham o nick vinculado
    const matchingUser = this.discordUsersOnline.find(user => {
      if (user.linkedNickname) {
        const discordFullName = `${user.linkedNickname.gameName}#${user.linkedNickname.tagLine}`;
        return discordFullName === lcuFullName;
      }
      return false;
    });

    if (!matchingUser) {
      console.error('❌ Usuário Discord não encontrado para:', lcuFullName);
      console.log('🔍 [DiscordService] Usuários disponíveis:', this.discordUsersOnline.map(u => ({
        username: u.username,
        linkedNickname: u.linkedNickname
      })));
      return false;
    }

    console.log('✅ [DiscordService] Usuário Discord encontrado:', matchingUser);

    // Usar os dados do Discord vinculado em vez dos dados do LCU
    const discordGameName = matchingUser.linkedNickname.gameName;
    const discordTagLine = matchingUser.linkedNickname.tagLine;

    console.log('🔍 [DiscordService] Dados para entrada na fila:', {
      discordId: matchingUser.id,
      discordUsername: matchingUser.username,
      lcuData: lcuData,
      discordData: {
        gameName: discordGameName,
        tagLine: discordTagLine
      },
      lanes: {
        primary: primaryLane,
        secondary: secondaryLane
      },
      usingDiscordData: true
    });

    const message = {
      type: 'join_discord_queue',
      data: {
        discordId: matchingUser.id,
        gameName: discordGameName, // Usar dados do Discord
        tagLine: discordTagLine,   // Usar dados do Discord
        lcuData: lcuData, // Manter dados do LCU para verificação
        preferences: {
          primaryLane: primaryLane,
          secondaryLane: secondaryLane
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

  // Método para enviar mensagens WebSocket genéricas
  sendWebSocketMessage(message: any): boolean {
    console.log(`🔍 [DiscordService] Tentando enviar mensagem WebSocket:`, message);
    console.log(`🔍 [DiscordService] WebSocket status:`, {
      exists: !!this.ws,
      readyState: this.ws?.readyState,
      isOpen: this.ws?.readyState === WebSocket.OPEN,
      url: this.ws?.url
    });

    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      console.error('❌ WebSocket não conectado para enviar mensagem:', message);
      return false;
    }

    try {
      const messageString = JSON.stringify(message);
      console.log('📤 Enviando mensagem WebSocket:', messageString);
      this.ws.send(messageString);
      console.log('✅ Mensagem WebSocket enviada com sucesso');
      return true;
    } catch (error) {
      console.error('❌ Erro ao enviar mensagem WebSocket:', error);
      return false;
    }
  }

  // Métodos públicos
  isConnected(): boolean {
    const wsOpen = this.ws?.readyState === WebSocket.OPEN;
    const backendConnected = this.isBackendConnected;
    const finalStatus = wsOpen;

    console.log(`🔍 [DiscordService #${this.instanceId}] Status de conexão:`, {
      wsOpen,
      backendConnected,
      finalStatus,
      wsReadyState: this.ws?.readyState
    });

    return finalStatus;
  }

  isDiscordBackendConnected(): boolean {
    return this.isBackendConnected;
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

  onQueueJoined(): Observable<any> {
    return this.queueJoinedSubject.asObservable();
  }

  // NOVO: Observable para atualizações da fila em tempo real
  onQueueUpdate(): Observable<any> {
    return this.queueUpdateSubject.asObservable();
  }

  // Método para forçar reconexão e atualização
  forceReconnect(): void {
    console.log(`🔄 [DiscordService #${this.instanceId}] Forçando reconexão...`);

    // Resetar tentativas de reconexão
    this.reconnectAttempts = 0;

    // Limpar todos os timeouts
    this.clearReconnectTimeout();
    this.clearConnectionTimeout();
    this.stopHeartbeat();

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
    console.log(`🛑 [DiscordService #${this.instanceId}] Destruindo instância...`);

    // Parar todos os timers e intervalos
    this.stopHeartbeat();
    this.stopAutoUpdate();
    this.clearReconnectTimeout();
    this.clearConnectionTimeout();

    // Fechar WebSocket
    if (this.ws) {
      console.log(`🔌 [DiscordService #${this.instanceId}] Fechando WebSocket...`);
      this.ws.close();
      this.ws = undefined;
    }

    // Limpar observables
    this.usersSubject.complete();
    this.connectionSubject.complete();
    this.queueJoinedSubject.complete();
    this.queueUpdateSubject.complete();
    this.matchFoundSubject.complete();

    // Resetar estado
    this.isBackendConnected = false;
    this.discordUsersOnline = [];
    this.currentDiscordUser = null;
    this.isInDiscordChannel = false;
    this.queueParticipants = [];
    this.reconnectAttempts = 0;

    console.log(`✅ [DiscordService #${this.instanceId}] Instância destruída com sucesso`);
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

  // Método para solicitar especificamente o status do canal
  requestChannelStatus(): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      console.warn(`⚠️ [DiscordService #${this.instanceId}] WebSocket não está conectado, não é possível solicitar status do canal`);
      return;
    }

    console.log(`🔍 [DiscordService #${this.instanceId}] Solicitando status do canal Discord...`);
    this.ws.send(JSON.stringify({ type: 'get_discord_channel_status' }));
  }

  // Observable para match_found
  onMatchFound(): Observable<any> {
    return this.matchFoundSubject.asObservable();
  }
}