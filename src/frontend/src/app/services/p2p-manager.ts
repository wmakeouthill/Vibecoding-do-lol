import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable, Subject } from 'rxjs';

interface PeerInfo {
  id: string;
  summonerName: string;
  region: string;
  mmr: number;
  lastSeen: Date;
  connection?: RTCPeerConnection;
  dataChannel?: RTCDataChannel;
}

interface P2PMessage {
  type: 'queue_join' | 'queue_leave' | 'match_proposal' | 'match_vote' | 'heartbeat' | 'peer_discovery';
  data: any;
  timestamp: string;
  senderId: string;
}

interface QueuePreferences {
  primaryLane: string;
  secondaryLane: string;
  autoAccept?: boolean;
}

@Injectable({
  providedIn: 'root'
})
export class P2PManager {
  private localPeerId: string;
  private peers: Map<string, PeerInfo> = new Map();
  private connections: Map<string, RTCPeerConnection> = new Map();
  private dataChannels: Map<string, RTCDataChannel> = new Map();
  private isInitialized = false;
  private heartbeatInterval?: any;
  private readonly HEARTBEAT_INTERVAL = 30000; // 30 segundos

  // RxJS Subjects para comunicação
  private peerConnectedSubject = new Subject<string>();
  private peerDisconnectedSubject = new Subject<string>();
  private peerMessageSubject = new Subject<{peerId: string, message: P2PMessage}>();
  private queueUpdateSubject = new Subject<any>();
  private matchProposalSubject = new Subject<any>();
  private p2pReadySubject = new Subject<void>();

  // Observables públicos
  public peerConnected$ = this.peerConnectedSubject.asObservable();
  public peerDisconnected$ = this.peerDisconnectedSubject.asObservable();
  public peerMessage$ = this.peerMessageSubject.asObservable();
  public queueUpdate$ = this.queueUpdateSubject.asObservable();
  public matchProposal$ = this.matchProposalSubject.asObservable();
  public p2pReady$ = this.p2pReadySubject.asObservable();

  // Estado observável
  private connectedPeersSubject = new BehaviorSubject<string[]>([]);
  public connectedPeers$ = this.connectedPeersSubject.asObservable();

  constructor() {
    // Gerar ID único para este peer
    this.localPeerId = this.generatePeerId();
    console.log(`🔗 P2P Manager inicializado com ID: ${this.localPeerId}`);
  }

  async initialize(playerData: { summonerName: string; region: string; mmr: number }): Promise<void> {
    if (this.isInitialized) return;

    try {
      console.log('🚀 Inicializando sistema P2P...');

      // Atualizar ID com dados do jogador
      this.localPeerId = this.generatePeerId(playerData.summonerName, playerData.region);

      // Iniciar descoberta de peers
      await this.startPeerDiscovery();

      // Iniciar heartbeat
      this.startHeartbeat();

      this.isInitialized = true;
      console.log('✅ Sistema P2P inicializado com sucesso');

      this.p2pReadySubject.next();
    } catch (error) {
      console.error('❌ Erro ao inicializar P2P:', error);
      throw error;
    }
  }

  private generatePeerId(summonerName?: string, region?: string): string {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(7);
    const base = summonerName && region ? `${summonerName}_${region}` : 'peer';
    return `${base}_${timestamp}_${random}`;
  }

  private async startPeerDiscovery(): Promise<void> {
    console.log('🔍 Iniciando descoberta de peers...');
    this.simulatePeerDiscovery();
  }
  private simulatePeerDiscovery(): void {
    // Em uma implementação real, isso descobriria peers via:
    // 1. UDP multicast na rede local
    // 2. Servidor de sinalização WebSocket
    // 3. WebRTC signaling server

    // Para demonstração, simular alguns peers mas sem conexões ativas
    console.log('📡 Descoberta de peers simulada - aguardando peers reais...');

    // Não criar peers falsos, apenas aguardar conexões reais
    // O sistema funcionará quando múltiplas instâncias do app estiverem rodando
  }

  private handlePeerDiscovered(peerInfo: PeerInfo): void {
    if (peerInfo.id === this.localPeerId) return;

    console.log(`🤝 Peer descoberto: ${peerInfo.summonerName} (${peerInfo.id})`);

    this.peers.set(peerInfo.id, peerInfo);
    this.connectToPeer(peerInfo.id);
  }

  private async connectToPeer(peerId: string): Promise<boolean> {
    if (this.connections.has(peerId)) {
      console.log(`⚠️ Conexão com ${peerId} já existe`);
      return true;
    }

    try {
      console.log(`🔗 Conectando ao peer ${peerId}...`);

      // Configuração RTCPeerConnection
      const configuration: RTCConfiguration = {
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun1.l.google.com:19302' }
        ]
      };

      const peerConnection = new RTCPeerConnection(configuration);

      // Criar data channel
      const dataChannel = peerConnection.createDataChannel('gameData', {
        ordered: true
      });

      this.setupDataChannelEvents(peerId, dataChannel);
      this.setupPeerConnectionEvents(peerId, peerConnection);

      // Armazenar conexão
      this.connections.set(peerId, peerConnection);
      this.dataChannels.set(peerId, dataChannel);

      // Simular conexão bem-sucedida (em implementação real, seria via signaling)
      setTimeout(() => {
        console.log(`✅ Simulação de conexão P2P com ${peerId} estabelecida`);
        this.peerConnectedSubject.next(peerId);
        this.updateConnectedPeersList();
      }, 1000 + Math.random() * 2000);

      return true;
    } catch (error) {
      console.error(`❌ Falha ao conectar com peer ${peerId}:`, error);
      return false;
    }
  }

  private setupDataChannelEvents(peerId: string, dataChannel: RTCDataChannel): void {
    dataChannel.onopen = () => {
      console.log(`📡 Data channel aberto com ${peerId}`);
    };

    dataChannel.onmessage = (event) => {
      this.handlePeerMessage(peerId, event.data);
    };

    dataChannel.onerror = (error) => {
      console.error(`❌ Erro no data channel com ${peerId}:`, error);
    };

    dataChannel.onclose = () => {
      console.log(`🔌 Data channel fechado com ${peerId}`);
      this.handlePeerDisconnection(peerId);
    };
  }

  private setupPeerConnectionEvents(peerId: string, peerConnection: RTCPeerConnection): void {
    peerConnection.onconnectionstatechange = () => {
      console.log(`🔄 Estado da conexão com ${peerId}: ${peerConnection.connectionState}`);

      if (peerConnection.connectionState === 'disconnected' ||
          peerConnection.connectionState === 'failed' ||
          peerConnection.connectionState === 'closed') {
        this.handlePeerDisconnection(peerId);
      }
    };

    peerConnection.ondatachannel = (event) => {
      const channel = event.channel;
      this.setupDataChannelEvents(peerId, channel);
      this.dataChannels.set(peerId, channel);
    };
  }

  private handlePeerMessage(peerId: string, data: string): void {
    try {
      const message: P2PMessage = JSON.parse(data);
      console.log(`📨 Mensagem recebida de ${peerId}:`, message.type);

      this.peerMessageSubject.next({
        peerId,
        message
      });

      // Processar tipos específicos de mensagem
      switch (message.type) {
        case 'heartbeat':
          this.handleHeartbeat(peerId, message);
          break;
        case 'queue_join':
          this.handleQueueJoin(peerId, message);
          break;
        case 'queue_leave':
          this.handleQueueLeave(peerId, message);
          break;
        case 'match_proposal':
          this.handleMatchProposal(peerId, message);
          break;
        default:
          console.log(`🔍 Tipo de mensagem desconhecido: ${message.type}`);
      }
    } catch (error) {
      console.error('❌ Erro ao processar mensagem P2P:', error);
    }
  }

  private handleHeartbeat(peerId: string, message: P2PMessage): void {
    const peer = this.peers.get(peerId);
    if (peer) {
      peer.lastSeen = new Date();
      this.peers.set(peerId, peer);
    }
  }

  private handleQueueJoin(peerId: string, message: P2PMessage): void {
    console.log(`👥 ${peerId} entrou na fila distribuída`);
    this.queueUpdateSubject.next({
      action: 'join',
      peerId,
      data: message.data
    });
  }

  private handleQueueLeave(peerId: string, message: P2PMessage): void {
    console.log(`👋 ${peerId} saiu da fila distribuída`);
    this.queueUpdateSubject.next({
      action: 'leave',
      peerId,
      data: message.data
    });
  }

  private handleMatchProposal(peerId: string, message: P2PMessage): void {
    console.log(`🎯 Proposta de match recebida de ${peerId}`);
    this.matchProposalSubject.next({
      proposerId: peerId,
      proposal: message.data
    });
  }

  private handlePeerDisconnection(peerId: string): void {
    const connection = this.connections.get(peerId);
    const dataChannel = this.dataChannels.get(peerId);

    if (connection) {
      connection.close();
      this.connections.delete(peerId);
    }

    if (dataChannel) {
      dataChannel.close();
      this.dataChannels.delete(peerId);
    }

    this.peers.delete(peerId);

    console.log(`🔌 Peer ${peerId} desconectado`);
    this.peerDisconnectedSubject.next(peerId);
    this.updateConnectedPeersList();
  }

  private updateConnectedPeersList(): void {
    const connectedPeers = Array.from(this.connections.keys());
    this.connectedPeersSubject.next(connectedPeers);
  }

  sendToPeer(peerId: string, message: Omit<P2PMessage, 'senderId' | 'timestamp'>): boolean {
    const dataChannel = this.dataChannels.get(peerId);
    if (!dataChannel || dataChannel.readyState !== 'open') {
      console.warn(`⚠️ Data channel com ${peerId} não disponível`);
      return false;
    }

    try {
      const fullMessage: P2PMessage = {
        ...message,
        senderId: this.localPeerId,
        timestamp: new Date().toISOString()
      };

      dataChannel.send(JSON.stringify(fullMessage));
      return true;
    } catch (error) {
      console.error(`❌ Erro ao enviar mensagem para ${peerId}:`, error);
      return false;
    }
  }

  broadcastToNetwork(message: Omit<P2PMessage, 'senderId' | 'timestamp'>): void {
    let successCount = 0;
    for (const peerId of this.dataChannels.keys()) {
      if (this.sendToPeer(peerId, message)) {
        successCount++;
      }
    }

    console.log(`📡 Mensagem enviada para ${successCount}/${this.dataChannels.size} peers`);
  }

  // Método para entrar na fila distribuída
  joinDistributedQueue(preferences: QueuePreferences): void {
    console.log('🎮 Entrando na fila distribuída...');

    this.broadcastToNetwork({
      type: 'queue_join',
      data: {
        preferences,
        playerInfo: {
          peerId: this.localPeerId,
          summonerName: this.localPeerId.split('_')[0],
          mmr: 1000 // Buscar MMR real do player service
        }
      }
    });
  }

  // Método para sair da fila distribuída
  leaveDistributedQueue(): void {
    console.log('👋 Saindo da fila distribuída...');

    this.broadcastToNetwork({
      type: 'queue_leave',
      data: {
        peerId: this.localPeerId
      }
    });
  }

  // Propor um match para a rede
  proposeMatch(players: any[]): void {
    console.log('🎯 Propondo match para a rede...');

    this.broadcastToNetwork({
      type: 'match_proposal',
      data: {
        players,
        proposerId: this.localPeerId,
        timestamp: new Date().toISOString()
      }
    });
  }

  private startHeartbeat(): void {
    this.heartbeatInterval = setInterval(() => {
      this.broadcastToNetwork({
        type: 'heartbeat',
        data: {
          status: 'alive',
          connectedPeers: this.connections.size,
          timestamp: new Date().toISOString()
        }
      });
    }, this.HEARTBEAT_INTERVAL);
  }

  // Getters para status
  getConnectedPeers(): string[] {
    return Array.from(this.connections.keys());
  }

  getPeerCount(): number {
    return this.connections.size;
  }
  isConnected(): boolean {
    // Considera conectado apenas se há data channels ativos
    let activeChannels = 0;
    for (const [peerId, channel] of this.dataChannels) {
      if (channel.readyState === 'open') {
        activeChannels++;
      }
    }
    return this.isInitialized && activeChannels > 0;
  }

  getLocalPeerId(): string {
    return this.localPeerId;
  }

  // Cleanup
  destroy(): void {
    console.log('🧹 Destruindo P2P Manager...');

    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }

    // Fechar todas as conexões
    for (const [peerId, connection] of this.connections) {
      try {
        connection.close();
      } catch (error) {
        console.error(`Erro ao fechar conexão com ${peerId}:`, error);
      }
    }

    // Fechar todos os data channels
    for (const [peerId, dataChannel] of this.dataChannels) {
      try {
        dataChannel.close();
      } catch (error) {
        console.error(`Erro ao fechar data channel com ${peerId}:`, error);
      }
    }

    this.connections.clear();
    this.dataChannels.clear();
    this.peers.clear();
    this.isInitialized = false;

    this.connectedPeersSubject.next([]);

    console.log('✅ P2P Manager destruído');
  }
}
