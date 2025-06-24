// Servidor P2P standalone para deploy na nuvem
import { createServer } from 'http';
import { Server } from 'socket.io';
import express from 'express';
import cors from 'cors';

const app = express();
const server = createServer(app);

// Configurar CORS para aceitar conexões de qualquer origem
app.use(cors({
  origin: "*",
  methods: ["GET", "POST"]
}));

// Configurar Socket.IO com CORS
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
    allowedHeaders: ["*"],
    credentials: false
  },
  transports: ['websocket', 'polling']
});

// Mapa de peers conectados
const connectedPeers = new Map();
const peerQueues = new Map(); // peerId -> queueData

console.log('🚀 Servidor P2P iniciando...');

// Health check para serviços de cloud
app.get('/', (req, res) => {
  res.json({ 
    status: 'online',
    peers: connectedPeers.size,
    queues: peerQueues.size,
    timestamp: new Date().toISOString()
  });
});

app.get('/health', (req, res) => {
  res.json({ status: 'healthy' });
});

// Gerenciamento de conexões Socket.IO
io.on('connection', (socket) => {
  console.log(`🆕 Novo peer conectado: ${socket.id}`);

  // Registrar peer
  socket.on('register_peer', (peerData) => {
    console.log(`👤 Peer registrado:`, peerData);
    
    connectedPeers.set(socket.id, {
      ...peerData,
      socketId: socket.id,
      connectedAt: new Date()
    });

    // Notificar outros peers sobre novo peer
    socket.broadcast.emit('peer_joined', {
      peerId: socket.id,
      peerData: peerData
    });

    // Enviar lista de peers existentes para o novo peer
    const existingPeers = Array.from(connectedPeers.entries())
      .filter(([id]) => id !== socket.id)
      .map(([id, data]) => ({ peerId: id, peerData: data }));

    socket.emit('existing_peers', existingPeers);
  });

  // Sinalização WebRTC
  socket.on('webrtc_offer', (data) => {
    console.log(`📡 Encaminhando offer de ${socket.id} para ${data.targetPeerId}`);
    socket.to(data.targetPeerId).emit('webrtc_offer', {
      offer: data.offer,
      fromPeerId: socket.id
    });
  });

  socket.on('webrtc_answer', (data) => {
    console.log(`📡 Encaminhando answer de ${socket.id} para ${data.targetPeerId}`);
    socket.to(data.targetPeerId).emit('webrtc_answer', {
      answer: data.answer,
      fromPeerId: socket.id
    });
  });

  socket.on('webrtc_ice_candidate', (data) => {
    socket.to(data.targetPeerId).emit('webrtc_ice_candidate', {
      candidate: data.candidate,
      fromPeerId: socket.id
    });
  });

  // Gerenciamento de fila
  socket.on('join_queue', (queueData) => {
    console.log(`🎮 ${socket.id} entrou na fila:`, queueData);
    
    peerQueues.set(socket.id, {
      ...queueData,
      joinedAt: new Date(),
      peerId: socket.id
    });

    // Notificar todos os peers sobre atualização da fila
    const currentQueue = Array.from(peerQueues.values());
    io.emit('queue_updated', {
      queue: currentQueue,
      totalPeers: connectedPeers.size
    });

    // Tentar fazer matchmaking
    tryMatchmaking();
  });

  socket.on('leave_queue', () => {
    console.log(`🚪 ${socket.id} saiu da fila`);
    
    peerQueues.delete(socket.id);
    
    const currentQueue = Array.from(peerQueues.values());
    io.emit('queue_updated', {
      queue: currentQueue,
      totalPeers: connectedPeers.size
    });
  });

  // Heartbeat
  socket.on('heartbeat', () => {
    const peer = connectedPeers.get(socket.id);
    if (peer) {
      peer.lastSeen = new Date();
    }
  });

  // Desconexão
  socket.on('disconnect', () => {
    console.log(`👋 Peer desconectado: ${socket.id}`);
    
    connectedPeers.delete(socket.id);
    peerQueues.delete(socket.id);
    
    // Notificar outros peers
    socket.broadcast.emit('peer_left', { peerId: socket.id });
    
    // Atualizar fila
    const currentQueue = Array.from(peerQueues.values());
    io.emit('queue_updated', {
      queue: currentQueue,
      totalPeers: connectedPeers.size
    });
  });
});

// Sistema de matchmaking simples
function tryMatchmaking() {
  const queueArray = Array.from(peerQueues.values());
  
  if (queueArray.length >= 10) { // 5v5
    console.log('🎯 Tentando matchmaking para 10 jogadores...');
    
    // Matchmaking simples por MMR
    const sortedQueue = queueArray.sort((a, b) => (a.mmr || 1000) - (b.mmr || 1000));
    
    // Selecionar 10 jogadores com MMR similar
    const match = sortedQueue.slice(0, 10);
    
    // Verificar se há diversidade de lanes
    const laneCount = match.reduce((acc, player) => {
      const lane = player.primaryLane || 'fill';
      acc[lane] = (acc[lane] || 0) + 1;
      return acc;
    }, {});
    
    // Se há diversidade mínima, criar partida
    const totalLanes = Object.keys(laneCount).length;
    if (totalLanes >= 3) { // Pelo menos 3 lanes diferentes
      createMatch(match);
    }
  }
}

function createMatch(players) {
  console.log('🎮 Criando partida para:', players.map(p => p.peerId));
  
  // Remover da fila
  players.forEach(player => {
    peerQueues.delete(player.peerId);
  });
  
  // Criar dados da partida
  const matchData = {
    matchId: `match_${Date.now()}`,
    players: players,
    createdAt: new Date(),
    status: 'proposed'
  };
  
  // Enviar proposta de partida para todos os jogadores
  players.forEach(player => {
    io.to(player.peerId).emit('match_found', matchData);
  });
  
  // Atualizar fila
  const currentQueue = Array.from(peerQueues.values());
  io.emit('queue_updated', {
    queue: currentQueue,
    totalPeers: connectedPeers.size
  });
}

// Limpeza automática de peers inativos
setInterval(() => {
  const now = new Date();
  const TIMEOUT = 2 * 60 * 1000; // 2 minutos
  
  for (const [peerId, peer] of connectedPeers.entries()) {
    if (peer.lastSeen && (now.getTime() - peer.lastSeen.getTime()) > TIMEOUT) {
      console.log(`🧹 Removendo peer inativo: ${peerId}`);
      connectedPeers.delete(peerId);
      peerQueues.delete(peerId);
      
      io.emit('peer_left', { peerId });
    }
  }
}, 60000); // Verificar a cada minuto

// Iniciar servidor
const PORT = process.env.PORT || 8080;
server.listen(PORT, () => {
  console.log(`✅ Servidor P2P rodando na porta ${PORT}`);
  console.log(`🌐 Acesse: http://localhost:${PORT}`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('🛑 Servidor sendo encerrado...');
  server.close(() => {
    console.log('✅ Servidor encerrado com sucesso');
    process.exit(0);
  });
});
