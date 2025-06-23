import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable, Subject } from 'rxjs';
import { io, Socket } from 'socket.io-client';

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

  // Socket.IO para servidor de sinalização
  private signalingSocket?: Socket;
  private readonly SIGNALING_SERVER_URL = 'http://localhost:8080';

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
  }
  async initialize(playerData: { summonerName: string; region: string; mmr: number }): Promise<void> {
    if (this.isInitialized) return;

    try {
      console.log('🚀 Inicializando sistema P2P...');

      // Atualizar ID com dados do jogador
      this.localPeerId = this.generatePeerId(playerData.summonerName, playerData.region);

      // Conectar ao servidor de sinalização
      await this.connectToSignalingServer(playerData);

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

  private async connectToSignalingServer(playerData: { summonerName: string; region: string; mmr: number }): Promise<void> {
    return new Promise((resolve, reject) => {
      console.log('🔗 Conectando ao servidor de sinalização...');

      this.signalingSocket = io(this.SIGNALING_SERVER_URL, {
        transports: ['websocket', 'polling'],
        timeout: 10000
      });

      this.signalingSocket.on('connect', () => {
        console.log('✅ Conectado ao servidor de sinalização');

        // Registrar este peer no servidor
        this.signalingSocket!.emit('register-peer', {
          id: this.localPeerId,
          summonerName: playerData.summonerName,
          region: playerData.region,
          mmr: playerData.mmr
        });

        this.setupSignalingEvents();
        resolve();
      });

      this.signalingSocket.on('connect_error', (error) => {
        console.error('❌ Erro ao conectar ao servidor de sinalização:', error);
        reject(error);
      });

      this.signalingSocket.on('disconnect', () => {
        console.log('⚠️ Desconectado do servidor de sinalização');
      });
    });
  }

  private setupSignalingEvents(): void {
    if (!this.signalingSocket) return;

    // Lista de peers disponíveis
    this.signalingSocket.on('peers-list', (peers: PeerInfo[]) => {
      console.log(`📡 Peers disponíveis:`, peers.length);
      peers.forEach(peer => {
        if (!this.peers.has(peer.id)) {
          this.peers.set(peer.id, peer);
          console.log(`👤 Peer descoberto: ${peer.summonerName} (${peer.id})`);
          this.initiateConnection(peer.id);
        }
      });
    });

    // Novo peer se juntou
    this.signalingSocket.on('peer-joined', (peer: PeerInfo) => {
      console.log(`🆕 Novo peer se juntou: ${peer.summonerName}`);
      if (!this.peers.has(peer.id)) {
        this.peers.set(peer.id, peer);
        this.initiateConnection(peer.id);
      }
    });

    // Peer saiu
    this.signalingSocket.on('peer-left', (peerId: string) => {
      console.log(`👋 Peer saiu: ${peerId}`);
      this.handlePeerDisconnection(peerId);
    });

    // Mensagens de sinalização WebRTC
    this.signalingSocket.on('signaling-message', (message: any) => {
      this.handleSignalingMessage(message);
    });
  }

  private async initiateConnection(peerId: string): Promise<void> {
    if (this.connections.has(peerId)) return;

    console.log(`🔗 Iniciando conexão WebRTC com: ${peerId}`);

    const peerConnection = new RTCPeerConnection({
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
      ]
    });

    // Criar data channel
    const dataChannel = peerConnection.createDataChannel('gameData', {
      ordered: true
    });

    this.setupDataChannelEvents(peerId, dataChannel);
    this.setupPeerConnectionEvents(peerId, peerConnection);

    this.connections.set(peerId, peerConnection);
    this.dataChannels.set(peerId, dataChannel);

    // Criar oferta
    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);

    // Enviar oferta via servidor de sinalização
    this.signalingSocket?.emit('signaling-message', {
      type: 'offer',
      data: offer,
      targetPeer: peerId,
      sourcePeer: this.localPeerId
    });
  }

  private async handleSignalingMessage(message: any): Promise<void> {
    const { type, data, sourcePeer } = message;

    if (!this.connections.has(sourcePeer)) {
      // Criar conexão para o peer que está oferecendo
      const peerConnection = new RTCPeerConnection({
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun1.l.google.com:19302' }
        ]
      });

      this.setupPeerConnectionEvents(sourcePeer, peerConnection);
      this.connections.set(sourcePeer, peerConnection);

      // Configurar data channel quando recebido
      peerConnection.ondatachannel = (event) => {
        const channel = event.channel;
        this.setupDataChannelEvents(sourcePeer, channel);
        this.dataChannels.set(sourcePeer, channel);
      };
    }

    const peerConnection = this.connections.get(sourcePeer)!;

    switch (type) {
      case 'offer':
        await peerConnection.setRemoteDescription(new RTCSessionDescription(data));
        const answer = await peerConnection.createAnswer();
        await peerConnection.setLocalDescription(answer);

        this.signalingSocket?.emit('signaling-message', {
          type: 'answer',
          data: answer,
          targetPeer: sourcePeer,
          sourcePeer: this.localPeerId
        });
        break;

      case 'answer':
        await peerConnection.setRemoteDescription(new RTCSessionDescription(data));
        break;

      case 'ice-candidate':
        await peerConnection.addIceCandidate(new RTCIceCandidate(data));
        break;
    }
  }
  // ========== MÉTODOS LEGADOS (LOCALSTORAGE) - SUBSTITUÍDOS POR SERVIDOR DE SINALIZAÇÃO ==========
  // Estes métodos foram substituídos pela implementação com servidor de sinalização WebSocket

  /*
  private async startPeerDiscovery(): Promise<void> {
    this.simulatePeerDiscovery();
  }

  private simulatePeerDiscovery(): void {
    // Em uma implementação real, isso descobriria peers via:
    // 1. UDP multicast na rede local
    // 2. Servidor de sinalização WebSocket
    // 3. WebRTC signaling server

    // Para demonstração local, usar localStorage para simular descoberta de peers
    this.setupLocalPeerDiscovery();
  }

  private setupLocalPeerDiscovery(): void {
    // Registrar este peer no localStorage
    this.registerLocalPeer();

    // Verificar por outros peers a cada 5 segundos
    setInterval(() => {
      this.checkForLocalPeers();
    }, 5000);

    // Verificar imediatamente
    setTimeout(() => this.checkForLocalPeers(), 1000);
  }
  */

  private registerLocalPeer(): void {
    const localPeers = this.getLocalPeers();
    const peerInfo = {
      id: this.localPeerId,
      timestamp: Date.now(),
      port: Math.floor(Math.random() * 1000) + 3000 // Simular porta diferente
    };

    localPeers[this.localPeerId] = peerInfo;
    localStorage.setItem('p2p_local_peers', JSON.stringify(localPeers));
  }

  private checkForLocalPeers(): void {
    const localPeers = this.getLocalPeers();
    const currentTime = Date.now();

    Object.keys(localPeers).forEach(peerId => {
      const peerInfo = localPeers[peerId];

      // Remover peers antigos (mais de 30 segundos)
      if (currentTime - peerInfo.timestamp > 30000) {
        delete localPeers[peerId];
        return;
      }

      // Se não é o peer local e não está conectado
      if (peerId !== this.localPeerId && !this.connections.has(peerId)) {
        console.log(`🔍 Peer local descoberto: ${peerId}`);
        this.simulateConnectionToPeer(peerId);
      }
    });

    // Atualizar localStorage removendo peers antigos
    localStorage.setItem('p2p_local_peers', JSON.stringify(localPeers));
  }

  private getLocalPeers(): any {
    try {
      return JSON.parse(localStorage.getItem('p2p_local_peers') || '{}');
    } catch {
      return {};
    }
  }

  private simulateConnectionToPeer(peerId: string): void {
    console.log(`🔗 Simulando conexão com peer: ${peerId}`);

    // Simular conexão após delay aleatório
    setTimeout(() => {
      this.peerConnectedSubject.next(peerId);
      this.updateConnectedPeersList();
      console.log(`✅ Conectado ao peer: ${peerId}`);
    }, 1000 + Math.random() * 2000);
  }

  private handlePeerDiscovered(peerInfo: PeerInfo): void {
    if (peerInfo.id === this.localPeerId) return;

    this.peers.set(peerInfo.id, peerInfo);
    this.connectToPeer(peerInfo.id);
  }

  private async connectToPeer(peerId: string): Promise<boolean> {
    if (this.connections.has(peerId)) {
      return true;
    }

    try {

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
    };

    dataChannel.onmessage = (event) => {
      this.handlePeerMessage(peerId, event.data);
    };

    dataChannel.onerror = (error) => {
      console.error(`❌ Erro no data channel com ${peerId}:`, error);
    };

    dataChannel.onclose = () => {
      this.handlePeerDisconnection(peerId);
    };
  }
  private setupPeerConnectionEvents(peerId: string, peerConnection: RTCPeerConnection): void {
    peerConnection.onconnectionstatechange = () => {
      console.log(`🔄 Estado da conexão com ${peerId}: ${peerConnection.connectionState}`);

      if (peerConnection.connectionState === 'connected') {
        console.log(`✅ Conectado com sucesso ao peer: ${peerId}`);
        this.peerConnectedSubject.next(peerId);
        this.updateConnectedPeersList();
      } else if (peerConnection.connectionState === 'disconnected' ||
          peerConnection.connectionState === 'failed' ||
          peerConnection.connectionState === 'closed') {
        this.handlePeerDisconnection(peerId);
      }
    };

    // Enviar ICE candidates via servidor de sinalização
    peerConnection.onicecandidate = (event) => {
      if (event.candidate) {
        this.signalingSocket?.emit('signaling-message', {
          type: 'ice-candidate',
          data: event.candidate,
          targetPeer: peerId,
          sourcePeer: this.localPeerId
        });
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
          // console.log(`🔍 Tipo de mensagem desconhecido: ${message.type}`); // Removido
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
    this.queueUpdateSubject.next({
      action: 'join',
      peerId,
      data: message.data
    });
  }

  private handleQueueLeave(peerId: string, message: P2PMessage): void {
    this.queueUpdateSubject.next({
      action: 'leave',
      peerId,
      data: message.data
    });
  }

  private handleMatchProposal(peerId: string, message: P2PMessage): void {
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
  }

  // Método para entrar na fila distribuída
  joinDistributedQueue(preferences: QueuePreferences): void {
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
    this.broadcastToNetwork({
      type: 'queue_leave',
      data: {
        peerId: this.localPeerId
      }
    });
  }

  // Propor um match para a rede
  proposeMatch(players: any[]): void {
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
  }
}
