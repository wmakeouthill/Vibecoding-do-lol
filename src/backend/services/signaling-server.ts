import { Server, Socket } from 'socket.io';
import { createServer } from 'http';

interface PeerInfo {
  id: string;
  socketId: string;
  summonerName: string;
  region: string;
  mmr: number;
  joinedAt: Date;
}

interface SignalingMessage {
  type: 'offer' | 'answer' | 'ice-candidate' | 'peer-discovery' | 'queue-update';
  data: any;
  targetPeer?: string;
  sourcePeer: string;
}

export class SignalingServer {
  private io: Server;
  private peers: Map<string, PeerInfo> = new Map();
  private socketToPeer: Map<string, string> = new Map();
  private httpServer: any;

  constructor(port: number = 8080) {
    this.httpServer = createServer();
    this.io = new Server(this.httpServer, {
      cors: {
        origin: "*",
        methods: ["GET", "POST"]
      }
    });

    this.setupEventHandlers();
    this.startServer(port);
  }

  private setupEventHandlers(): void {
    this.io.on('connection', (socket: Socket) => {
      console.log(`🔗 Nova conexão de sinalização: ${socket.id}`);

      // Registrar peer
      socket.on('register-peer', (peerInfo: Omit<PeerInfo, 'socketId' | 'joinedAt'>) => {
        const fullPeerInfo: PeerInfo = {
          ...peerInfo,
          socketId: socket.id,
          joinedAt: new Date()
        };

        this.peers.set(peerInfo.id, fullPeerInfo);
        this.socketToPeer.set(socket.id, peerInfo.id);

        console.log(`👤 Peer registrado: ${peerInfo.id} (${peerInfo.summonerName})`);

        // Notificar peer sobre outros peers disponíveis
        socket.emit('peers-list', this.getAvailablePeers(peerInfo.id));

        // Notificar outros peers sobre o novo peer
        socket.broadcast.emit('peer-joined', fullPeerInfo);
      });

      // Facilitar troca de mensagens WebRTC
      socket.on('signaling-message', (message: SignalingMessage) => {
        if (message.targetPeer) {
          const targetPeer = this.peers.get(message.targetPeer);
          if (targetPeer) {
            this.io.to(targetPeer.socketId).emit('signaling-message', message);
          }
        } else {
          // Broadcast para todos os outros peers
          socket.broadcast.emit('signaling-message', message);
        }
      });

      // Descoberta de peers
      socket.on('discover-peers', () => {
        const peerId = this.socketToPeer.get(socket.id);
        if (peerId) {
          socket.emit('peers-list', this.getAvailablePeers(peerId));
        }
      });

      // Atualização de heartbeat
      socket.on('heartbeat', (data: any) => {
        const peerId = this.socketToPeer.get(socket.id);
        if (peerId) {
          const peer = this.peers.get(peerId);
          if (peer) {
            // Atualizar última atividade
            peer.joinedAt = new Date();
            this.peers.set(peerId, peer);
          }
        }
      });

      // Desconexão
      socket.on('disconnect', () => {
        const peerId = this.socketToPeer.get(socket.id);
        if (peerId) {
          console.log(`👋 Peer desconectado: ${peerId}`);
          this.peers.delete(peerId);
          this.socketToPeer.delete(socket.id);

          // Notificar outros peers sobre a desconexão
          socket.broadcast.emit('peer-left', peerId);
        }
      });
    });
  }

  private getAvailablePeers(excludePeerId: string): PeerInfo[] {
    return Array.from(this.peers.values())
      .filter(peer => peer.id !== excludePeerId)
      .map(peer => ({
        id: peer.id,
        socketId: peer.socketId,
        summonerName: peer.summonerName,
        region: peer.region,
        mmr: peer.mmr,
        joinedAt: peer.joinedAt
      }));
  }

  private startServer(port: number): void {
    this.httpServer.listen(port, () => {
      console.log(`🌐 Servidor de sinalização P2P iniciado na porta ${port}`);
      console.log(`🔗 Endpoint: http://localhost:${port}`);
    });

    // Limpeza de peers inativos a cada 30 segundos
    setInterval(() => {
      this.cleanupInactivePeers();
    }, 30000);
  }

  private cleanupInactivePeers(): void {
    const now = new Date();
    const inactiveThreshold = 60000; // 1 minuto

    for (const [peerId, peer] of this.peers.entries()) {
      if (now.getTime() - peer.joinedAt.getTime() > inactiveThreshold) {
        console.log(`🧹 Removendo peer inativo: ${peerId}`);
        this.peers.delete(peerId);
        this.socketToPeer.delete(peer.socketId);
      }
    }
  }

  public getStats(): any {
    return {
      connectedPeers: this.peers.size,
      peers: Array.from(this.peers.values()).map(peer => ({
        id: peer.id,
        summonerName: peer.summonerName,
        region: peer.region,
        mmr: peer.mmr,
        connectedFor: Math.floor((new Date().getTime() - peer.joinedAt.getTime()) / 1000)
      }))
    };
  }
}
