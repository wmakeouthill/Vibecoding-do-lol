import express, { Request, Response, NextFunction, RequestHandler } from 'express';
import dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';

// Carregar variáveis de ambiente do arquivo .env
const envPath = path.resolve(process.cwd(), '.env');
if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
  console.log('✅ Arquivo .env carregado:', envPath);
} else {
  console.warn('⚠️ Arquivo .env não encontrado em:', envPath);
  dotenv.config(); // Tentar carregar do diretório atual
}

import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { createServer, IncomingMessage } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { Server as SocketIOServer } from 'socket.io';

import { DatabaseManager } from './database/DatabaseManager';
import { MatchmakingService } from './services/MatchmakingService';
import { PlayerService } from './services/PlayerService';
import { RiotAPIService } from './services/RiotAPIService';
import { LCUService } from './services/LCUService';
import { MatchHistoryService } from './services/MatchHistoryService';
import { DiscordService } from './services/DiscordService';

const app = express();
const server = createServer(app);

// Configurações de keep-alive para melhorar estabilidade da conexão
server.keepAliveTimeout = 65000; // 65 segundos
server.headersTimeout = 66000; // 66 segundos (sempre maior que keepAliveTimeout)

const wss = new WebSocketServer({
  server,
  path: '/ws',
  // Configurações para melhorar performance
  perMessageDeflate: false, // Desabilitar compressão para reduzir latência
  maxPayload: 1024 * 1024, // 1MB max payload
  skipUTF8Validation: true // Pular validação UTF-8 para melhor performance
});
const io = new SocketIOServer(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  },
  // Configurações para melhorar performance
  pingTimeout: 30000, // 30 segundos
  pingInterval: 25000, // 25 segundos
  transports: ['websocket', 'polling'], // Priorizar WebSocket
  allowEIO3: true
});

const PORT = process.env.PORT || 3000;
const isDev = process.env.NODE_ENV === 'development';

// Global shared instances
const globalRiotAPI = new RiotAPIService();

// Middleware de segurança - DESABILITADO para permitir P2P WebSocket
// app.use(helmet({...})); // CSP desabilitado para Electron

app.use(cors({
  origin: function (origin, callback) {
    // Em desenvolvimento, permitir localhost:4200
    if (isDev) {
      const allowedOrigins = ['http://localhost:4200', 'http://localhost:3000'];
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'));
      }
    } else {
      // Em produção (Electron), permitir qualquer origem local ou file://
      if (!origin ||
        origin.startsWith('file://') ||
        origin.startsWith('http://localhost') ||
        origin.startsWith('http://127.0.0.1')) {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'));
      }
    }
  },
  credentials: true
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: isDev ? 1000 : 2000, // Mais permissivo em produção também para o frontend local
  message: 'Muitas requisições de este IP, tente novamente em 15 minutos.',
  skip: (req) => {
    // Pular rate limiting para requests locais (frontend e LCU)
    const isLocalhost = req.ip === '127.0.0.1' || req.ip === '::1' || req.ip === '::ffff:127.0.0.1';
    const isLocalRequest = req.get('host')?.includes('localhost') || req.get('host')?.includes('127.0.0.1');

    // Pular para requests do LCU e do frontend local
    if (isLocalhost || isLocalRequest) {
      return true;
    }

    return false;
  }
});

app.use(limiter);
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Middleware para log de todas as requisições
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  next();
});

// Inicializar serviços
const dbManager = new DatabaseManager();
const matchmakingService = new MatchmakingService(dbManager, wss);
const playerService = new PlayerService(globalRiotAPI, dbManager);
const lcuService = new LCUService(globalRiotAPI);
const matchHistoryService = new MatchHistoryService(globalRiotAPI, dbManager);
const discordService = new DiscordService(dbManager);

// WebSocket para comunicação em tempo real
wss.on('connection', (ws: WebSocket, req: IncomingMessage) => {
  console.log('Cliente conectado via WebSocket');

  ws.on('message', async (message: Buffer) => {
    try {
      const data = JSON.parse(message.toString());
      await handleWebSocketMessage(ws, data);
    } catch (error) {
      console.error('Erro ao processar mensagem WebSocket:', error);
      ws.send(JSON.stringify({ error: 'Formato de mensagem inválido' }));
    }
  });

  ws.on('close', () => {
    console.log('Cliente desconectado do WebSocket');
    // Remover jogador da fila se estiver conectado
    matchmakingService.removePlayerFromQueue(ws);
  });
});

async function handleWebSocketMessage(ws: WebSocket, data: any) {
  console.log(`📥 [WebSocket] Mensagem recebida: ${data.type}`);
  console.log(`📥 [WebSocket] Dados completos:`, JSON.stringify(data, null, 2));

  switch (data.type) {
    case 'join_queue':
      await matchmakingService.addPlayerToQueue(ws, data.data);
      break;
    case 'join_discord_queue':
      console.log('🎮 Recebida mensagem join_discord_queue com dados completos:', data.data);

      // Extrair dados do LCU se disponíveis
      const lcuData = data.data.lcuData;

      if (lcuData) {
        console.log('🎯 Dados do LCU detectados:', lcuData);
      } else {
        console.log('⚠️ Dados do LCU não encontrados na mensagem');
      }

      // Usar a mesma lógica da fila centralizada, mas marcar como Discord
      await matchmakingService.addPlayerToDiscordQueue(ws, {
        ...data.data,
        lcuData: lcuData
      });
      break;
    case 'leave_queue':
      console.log('🔍 Recebida mensagem leave_queue');
      matchmakingService.removePlayerFromQueue(ws);
      break;
    case 'get_queue_status':
      const queueStatus = await matchmakingService.getQueueStatus();
      ws.send(JSON.stringify({ type: 'queue_status', data: queueStatus }));
      break;
    case 'get_discord_status':
      console.log('🎮 Solicitando status do Discord...');

      // Buscar informações do usuário atual no canal
      const currentUser = await discordService.getCurrentUserInfo();

      // Enviar status do Discord para o frontend
      const discordStatus = {
        type: 'discord_status',
        isConnected: discordService.isDiscordConnected(),
        botUsername: discordService.getBotUsername(),
        queueSize: discordService.getQueueSize(),
        activeMatches: discordService.getActiveMatches(),
        inChannel: await discordService.hasUsersInMatchmakingChannel(),
        currentUser: currentUser
      };
      ws.send(JSON.stringify(discordStatus));

      // Remover o broadcast automático - será feito apenas quando solicitado explicitamente
      // await discordService.broadcastUsersInChannel();
      break;
    case 'get_discord_users':
      console.log('👥 Solicitando lista de usuários Discord...');
      // Enviar lista de usuários no canal diretamente para este cliente
      const usersInChannel = await discordService.getUsersInMatchmakingChannel();
      ws.send(JSON.stringify({
        type: 'discord_users_online',
        users: usersInChannel
      }));
      break;
    case 'get_discord_users_online':
      console.log('👥 Solicitando lista de usuários Discord online...');
      // Enviar lista de usuários no canal diretamente para este cliente
      const usersInChannel2 = await discordService.getUsersInMatchmakingChannel();
      ws.send(JSON.stringify({
        type: 'discord_users_online',
        users: usersInChannel2
      }));
      break;
    case 'get_discord_links':
      console.log('🔗 Solicitando vinculações Discord...');
      try {
        const links = await dbManager.getAllDiscordLinks();
        ws.send(JSON.stringify({
          type: 'discord_links_update',
          links: links
        }));
      } catch (error) {
        console.error('❌ Erro ao buscar vinculações:', error);
        ws.send(JSON.stringify({
          type: 'discord_links_update',
          links: []
        }));
      }
      break;
    case 'get_discord_channel_status':
      console.log('🔍 Verificando status do canal Discord...');
      try {
        const hasUsers = await discordService.hasUsersInMatchmakingChannel();
        const usersInChannel = await discordService.getUsersInMatchmakingChannel();
        ws.send(JSON.stringify({
          type: 'discord_channel_status',
          hasUsers: hasUsers,
          usersCount: usersInChannel.length,
          inChannel: hasUsers
        }));
      } catch (error) {
        console.error('❌ Erro ao verificar canal Discord:', error);
        ws.send(JSON.stringify({
          type: 'discord_channel_status',
          hasUsers: false,
          usersCount: 0,
          inChannel: false
        }));
      }
      break;
    case 'ping':
      ws.send(JSON.stringify({ type: 'pong' }));
      break;
    case 'accept_match':
      console.log('✅ Recebida mensagem accept_match:', data.data);
      try {
        await matchmakingService.acceptMatch(
          data.data.playerId,
          data.data.matchId,
          data.data.summonerName
        );
        ws.send(JSON.stringify({
          type: 'match_accepted',
          data: { matchId: data.data.matchId }
        }));
      } catch (error: any) {
        console.error('❌ Erro ao aceitar partida:', error);
        ws.send(JSON.stringify({
          type: 'error',
          message: 'Erro ao aceitar partida: ' + error.message
        }));
      }
      break;
    case 'decline_match':
      console.log('❌ Recebida mensagem decline_match:', data.data);
      try {
        await matchmakingService.declineMatch(
          data.data.playerId,
          data.data.matchId,
          data.data.summonerName
        );
        ws.send(JSON.stringify({
          type: 'match_declined',
          data: { matchId: data.data.matchId }
        }));
      } catch (error: any) {
        console.error('❌ Erro ao recusar partida:', error);
        ws.send(JSON.stringify({
          type: 'error',
          message: 'Erro ao recusar partida: ' + error.message
        }));
      }
      break;
    case 'cancel_draft':
      console.log('❌ Recebida mensagem cancel_draft:', data.data);
      try {
        await matchmakingService.cancelDraft(
          data.data.matchId,
          data.data.reason || 'Draft cancelado pelo usuário'
        );
        ws.send(JSON.stringify({
          type: 'draft_cancelled',
          data: { matchId: data.data.matchId }
        }));
      } catch (error: any) {
        console.error('❌ Erro ao cancelar draft:', error);
        ws.send(JSON.stringify({
          type: 'error',
          message: 'Erro ao cancelar draft: ' + error.message
        }));
      }
      break;
    default:
      ws.send(JSON.stringify({ error: 'Tipo de mensagem desconhecido' }));
  }
}

// Socket.IO para P2P Signaling (integrado no servidor principal)
const p2pPeers = new Map();
const socketToPeer = new Map();

io.on('connection', (socket) => {
  console.log(`🔗 Nova conexão Socket.IO P2P: ${socket.id}`);

  // Registrar peer para P2P
  socket.on('register-peer', (peerInfo) => {
    const fullPeerInfo = {
      ...peerInfo,
      socketId: socket.id,
      joinedAt: new Date()
    };

    p2pPeers.set(peerInfo.id, fullPeerInfo);
    socketToPeer.set(socket.id, peerInfo.id);

    console.log(`👤 P2P Peer registrado: ${peerInfo.id} (${peerInfo.summonerName})`);

    // Notificar peer sobre outros peers disponíveis
    const availablePeers = Array.from(p2pPeers.values()).filter(p => p.id !== peerInfo.id);
    socket.emit('peers-list', availablePeers);

    // Notificar outros peers sobre o novo peer
    socket.broadcast.emit('peer-joined', fullPeerInfo);
  });

  // Facilitar troca de mensagens WebRTC
  socket.on('signaling-message', (message) => {
    if (message.targetPeer) {
      const targetPeer = p2pPeers.get(message.targetPeer);
      if (targetPeer) {
        io.to(targetPeer.socketId).emit('signaling-message', message);
      }
    } else {
      // Broadcast para todos os outros peers
      socket.broadcast.emit('signaling-message', message);
    }
  });

  // Descoberta de peers
  socket.on('discover-peers', () => {
    const peerId = socketToPeer.get(socket.id);
    if (peerId) {
      const availablePeers = Array.from(p2pPeers.values()).filter(p => p.id !== peerId);
      socket.emit('peers-list', availablePeers);
    }
  });

  // Heartbeat
  socket.on('heartbeat', (data) => {
    const peerId = socketToPeer.get(socket.id);
    if (peerId) {
      const peer = p2pPeers.get(peerId);
      if (peer) {
        peer.joinedAt = new Date();
        p2pPeers.set(peerId, peer);
      }
    }
  });

  // Desconexão
  socket.on('disconnect', () => {
    const peerId = socketToPeer.get(socket.id);
    if (peerId) {
      p2pPeers.delete(peerId);
      socketToPeer.delete(socket.id);
      console.log(`👤 P2P Peer desconectado: ${peerId}`);

      // Notificar outros peers sobre a desconexão
      socket.broadcast.emit('peer-left', { peerId });
    }
  });
});

// Configuração de arquivos estáticos em produção
if (!isDev) {
  console.log('Configurando servir arquivos estáticos em produção...');
  // Determinar o caminho para os arquivos do frontend
  let frontendPath: string;

  // Em produção, os arquivos estão diretamente em resources/
  frontendPath = path.join(__dirname, '..', 'frontend', 'dist', 'lol-matchmaking', 'browser');

  console.log('Caminho do frontend:', frontendPath);
  console.log('Frontend exists:', fs.existsSync(frontendPath));

  // Verificar se o diretório existe
  if (fs.existsSync(frontendPath)) {
    // Servir arquivos estáticos do Angular
    app.use(express.static(frontendPath, {
      maxAge: '1d', // Cache por 1 dia
      etag: true,
      lastModified: true
    }));

    console.log('✅ Arquivos estáticos configurados em:', frontendPath);
  } else {
    console.error('❌ Diretório do frontend não encontrado:', frontendPath);

    // Tentar caminhos alternativos baseados na estrutura do Electron
    const altPaths = [
      path.join(process.cwd(), 'frontend', 'dist', 'lol-matchmaking', 'browser'),
      path.join(__dirname, '..', '..', 'frontend', 'dist', 'lol-matchmaking', 'browser'),
      path.join(__dirname, 'frontend', 'dist', 'lol-matchmaking', 'browser')
    ];

    for (const altPath of altPaths) {
      console.log('Testando caminho alternativo:', altPath);
      if (fs.existsSync(altPath)) {
        app.use(express.static(altPath));
        console.log('✅ Arquivos estáticos configurados em caminho alternativo:', altPath);
        break;
      }
    }
  }
}

// Rotas da API
app.get('/api/health', (req: Request, res: Response) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Rotas de jogador
app.post('/api/player/register', (async (req: Request, res: Response) => {
  try {
    const { riotId, region } = req.body;

    if (!riotId || !riotId.includes('#')) {
      return res.status(400).json({ error: 'Riot ID inválido. Use formato: gameName#tagLine' });
    }

    // Use the refresh endpoint logic to register/get player data
    const playerData = await playerService.getPlayerBySummonerNameWithDetails(riotId, region || 'br1');
    res.json({ success: true, player: playerData });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
}) as RequestHandler);

// PRIMARY ENDPOINT for fetching current player data (LCU + Riot API)
// IMPORTANT: This must come BEFORE the generic /api/player/:playerId route
app.get('/api/player/current-details', (async (req: Request, res: Response) => {
  try {
    console.log('[CURRENT DETAILS] Endpoint called');

    if (!lcuService.isClientConnected()) {
      console.log('[CURRENT DETAILS] LCU client not connected');
      return res.status(503).json({ error: 'Cliente do LoL não conectado' });
    }

    console.log('[CURRENT DETAILS] Getting current summoner from LCU...');
    const lcuSummoner = await lcuService.getCurrentSummoner();
    if (!lcuSummoner) {
      console.log('[CURRENT DETAILS] No summoner data from LCU');
      return res.status(404).json({ error: 'Não foi possível obter dados do jogador no LCU.' });
    }

    console.log('[CURRENT DETAILS] LCU Summoner data received:', {
      gameName: (lcuSummoner as any).gameName,
      tagLine: (lcuSummoner as any).tagLine,
      puuid: lcuSummoner.puuid
    });

    // Check if we have gameName and tagLine
    if (!(lcuSummoner as any).gameName || !(lcuSummoner as any).tagLine) {
      console.log('[CURRENT DETAILS] LCU data missing gameName or tagLine:', {
        gameName: (lcuSummoner as any).gameName,
        tagLine: (lcuSummoner as any).tagLine
      });
      return res.status(404).json({ error: 'gameName e tagLine não disponíveis no LCU.' });
    }

    const riotId = `${(lcuSummoner as any).gameName}#${(lcuSummoner as any).tagLine}`;
    const region = 'br1';

    console.log('[CURRENT DETAILS] Using Riot ID from LCU:', riotId);    // Prepare base data with LCU information
    const baseData = {
      lcu: lcuSummoner,
      riotAccount: {
        gameName: (lcuSummoner as any).gameName,
        tagLine: (lcuSummoner as any).tagLine,
        puuid: lcuSummoner.puuid
      },
      riotApi: null,
      lcuRankedStats: null,
      partialData: false
    };

    // Try to get LCU ranked stats
    try {
      console.log('[CURRENT DETAILS] Attempting to get LCU ranked stats...');
      const lcuRankedStats = await lcuService.getRankedStats();
      if (lcuRankedStats) {
        console.log('[CURRENT DETAILS] LCU ranked stats available:', !!lcuRankedStats.queues);
        baseData.lcuRankedStats = lcuRankedStats;
      }
    } catch (lcuRankError: any) {
      console.log('[CURRENT DETAILS] LCU ranked stats unavailable:', lcuRankError.message);
    }    // Skip Riot API - we prioritize LCU only
    console.log('[CURRENT DETAILS] Using LCU-only data (Riot API disabled by design)');
    baseData.partialData = true;

    console.log('[CURRENT DETAILS] Returning data, partialData:', baseData.partialData);
    res.json({
      success: true,
      data: baseData,
      message: baseData.partialData ? 'Dados carregados apenas do LCU (Riot API indisponível)' : 'Dados completos carregados'
    });

  } catch (error: any) {
    console.error(`[CURRENT DETAILS] Erro ao buscar dados detalhados do jogador atual:`, error.message);
    res.status(500).json({ error: 'Erro interno ao processar a solicitação para current-details' });
  }
}) as RequestHandler);

app.get('/api/player/:playerId', async (req: Request, res: Response) => {
  try {
    const player = await playerService.getPlayer(req.params.playerId);
    res.json(player);
  } catch (error: any) {
    res.status(404).json({ error: error.message });
  }
});

app.get('/api/player/:playerId/stats', (async (req: Request, res: Response) => {
  try {
    const playerId = parseInt(req.params.playerId);
    // Ensure matchHistoryService.getPlayerStats exists and is appropriate
    // If it's more about general player stats, PlayerService might be better.
    const stats = await matchHistoryService.getPlayerStats(playerId);
    res.json({ success: true, stats });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
}) as RequestHandler);

// Endpoint para buscar leaderboard
app.get('/api/stats/leaderboard', (async (req: Request, res: Response) => {
  try {
    const limit = parseInt(req.query.limit as string) || 100;
    const leaderboard = await playerService.getLeaderboard(limit);
    res.json({ success: true, data: leaderboard });
  } catch (error: any) {
    console.error('❌ Erro ao buscar leaderboard:', error);
    res.status(500).json({ error: error.message });
  }
}) as RequestHandler);

// Novo endpoint para buscar leaderboard baseado nos participantes das partidas customizadas
app.get('/api/stats/participants-leaderboard', (async (req: Request, res: Response) => {
  try {
    const limit = parseInt(req.query.limit as string) || 100;

    console.log('🏆 [GET /api/stats/participants-leaderboard] Iniciando busca do leaderboard');

    // Atualizar dados dos jogadores antes de retornar o leaderboard
    try {
      await dbManager.refreshPlayersFromCustomMatches();
      console.log('✅ [GET /api/stats/participants-leaderboard] Dados dos jogadores atualizados');
    } catch (refreshError: any) {
      console.warn('⚠️ [GET /api/stats/participants-leaderboard] Erro ao atualizar jogadores:', refreshError.message);
      // Continuar mesmo se falhar a atualização
    }

    const leaderboard = await dbManager.getParticipantsLeaderboard(limit);
    console.log('📊 [GET /api/stats/participants-leaderboard] Leaderboard encontrado:', leaderboard.length, 'jogadores');

    res.json({
      success: true,
      data: leaderboard,
      total: leaderboard.length,
      message: leaderboard.length === 0 ? 'Nenhum jogador encontrado. Complete algumas partidas customizadas para ver o leaderboard.' : null
    });
  } catch (error: any) {
    console.error('❌ [GET /api/stats/participants-leaderboard] Erro:', error);

    // Em vez de retornar erro 500, retornar array vazio
    res.json({
      success: true,
      data: [],
      total: 0,
      message: 'Nenhum jogador encontrado. Complete algumas partidas customizadas para ver o leaderboard.',
      error: error.message // Para debug, mas não quebra o frontend
    });
  }
}) as RequestHandler);

// Endpoint para buscar dados do summoner por Riot ID usando LCU
app.get('/api/summoner/:riotId', (async (req: Request, res: Response) => {
  try {
    const { riotId } = req.params;

    if (!riotId || !riotId.includes('#')) {
      return res.status(400).json({
        success: false,
        error: 'Riot ID inválido. Use formato: gameName#tagLine'
      });
    }

    const [gameName, tagLine] = riotId.split('#');

    // Verificar se o LCU está conectado
    if (!lcuService.isClientConnected()) {
      return res.status(503).json({
        success: false,
        error: 'Cliente do LoL não conectado'
      });
    }

    // Buscar dados do summoner usando o LCU
    const currentSummoner = await lcuService.getCurrentSummoner();

    if (!currentSummoner) {
      return res.status(404).json({
        success: false,
        error: 'Não foi possível obter dados do summoner do LCU'
      });
    }

    // Verificar se é o summoner que estamos procurando
    const currentGameName = (currentSummoner as any).gameName;
    const currentTagLine = (currentSummoner as any).tagLine;

    // Se não é o summoner atual conectado, retornar erro
    if (currentGameName !== gameName || currentTagLine !== tagLine) {
      return res.status(404).json({
        success: false,
        error: `Summoner ${riotId} não é o jogador atualmente conectado no cliente`
      });
    }

    res.json({
      success: true,
      data: {
        gameName: currentGameName,
        tagLine: currentTagLine,
        profileIconId: currentSummoner.profileIconId,
        summonerLevel: currentSummoner.summonerLevel,
        puuid: currentSummoner.puuid,
        summonerId: currentSummoner.summonerId,
        displayName: currentSummoner.displayName
      }
    });

  } catch (error) {
    console.error('❌ Erro ao buscar dados do summoner via LCU:', error);
    res.status(500).json({
      success: false,
      error: 'Erro interno do servidor'
    });
  }
}) as RequestHandler);


// Endpoint para buscar profile icon de qualquer jogador através do histórico LCU
app.get('/api/summoner/profile-icon/:riotId', (async (req: Request, res: Response) => {
  try {
    const { riotId } = req.params;

    if (!riotId || !riotId.includes('#')) {
      return res.status(400).json({
        success: false,
        error: 'Riot ID inválido. Use formato: gameName#tagLine'
      });
    }

    const [gameName, tagLine] = riotId.split('#');

    // Verificar se o LCU está conectado
    if (!lcuService.isClientConnected()) {
      return res.status(503).json({
        success: false,
        error: 'Cliente do LoL não conectado'
      });
    }

    // Primeiro, verificar se é o summoner atual
    const currentSummoner = await lcuService.getCurrentSummoner();

    if (currentSummoner) {
      const currentGameName = (currentSummoner as any).gameName;
      const currentTagLine = (currentSummoner as any).tagLine;

      if (currentGameName === gameName && currentTagLine === tagLine) {
        return res.json({
          success: true,
          data: {
            gameName: currentGameName,
            tagLine: currentTagLine,
            profileIconId: currentSummoner.profileIconId,
            source: 'current_summoner'
          }
        });
      }
    }

    // Se não é o summoner atual, buscar no histórico de partidas
    try {
      const matchHistory = await lcuService.getMatchHistory(0, 50); // Buscar últimas 50 partidas

      for (const match of matchHistory) {
        // Verificar se esta partida tem dados de participantes
        if (match.participantIdentities) {
          for (const participant of match.participantIdentities) {
            const player = participant.player;
            if (player && player.gameName === gameName && player.tagLine === tagLine) {
              // Encontrou o jogador no histórico! Buscar dados detalhados da partida
              const detailedMatch = await lcuService.getMatchDetails(match.gameId);

              if (detailedMatch && detailedMatch.participantIdentities) {
                const detailedParticipant = detailedMatch.participantIdentities.find(
                  (p: any) => p.player.gameName === gameName && p.player.tagLine === tagLine
                );

                if (detailedParticipant && detailedParticipant.player.profileIcon !== undefined) {
                  return res.json({
                    success: true,
                    data: {
                      gameName: gameName,
                      tagLine: tagLine,
                      profileIconId: detailedParticipant.player.profileIcon,
                      source: 'match_history'
                    }
                  });
                }
              }
            }
          }
        }
      }

      // Se chegou até aqui, não encontrou o jogador no histórico
      return res.status(404).json({
        success: false,
        error: `Jogador ${riotId} não encontrado no histórico de partidas do LCU`
      });

    } catch (historyError) {
      console.error('❌ Erro ao buscar histórico LCU:', historyError);
      return res.status(500).json({
        success: false,
        error: 'Erro ao acessar histórico de partidas do LCU'
      });
    }

  } catch (error) {
    console.error('❌ Erro ao buscar profile icon via LCU:', error);
    res.status(500).json({
      success: false,
      error: 'Erro interno do servidor'
    });
  }
}) as RequestHandler);


// Endpoint to refresh player data using Riot ID (gameName#tagLine)
// The frontend will call this when "Atualizar Dados" is clicked.
// It expects a 'riotId' and 'region' in the request body.
app.post('/api/player/refresh-by-riot-id', (async (req: Request, res: Response) => {
  try {
    const { riotId, region } = req.body;

    if (!riotId || !region) {
      return res.status(400).json({ error: 'Riot ID e região são obrigatórios para atualização.' });
    }
    if (!riotId.includes('#')) {
      return res.status(400).json({ error: 'Formato de Riot ID inválido. Use gameName#tagLine.' });
    }

    const [gameName, tagLine] = riotId.split('#');

    // Primeiro, tentar obter dados do LCU se estiver conectado
    let combinedData: any = null;
    let dataSource = 'none';

    if (lcuService.isClientConnected()) {
      try {
        const lcuSummoner = await lcuService.getCurrentSummoner();

        if (lcuSummoner &&
          (lcuSummoner as any).gameName === gameName &&
          (lcuSummoner as any).tagLine === tagLine) {

          // É o jogador atual do LCU, usar esses dados como base
          combinedData = {
            lcu: lcuSummoner,
            riotAccount: {
              gameName: (lcuSummoner as any).gameName,
              tagLine: (lcuSummoner as any).tagLine,
              puuid: lcuSummoner.puuid
            },
            riotApi: null,
            lcuRankedStats: null,
            partialData: false
          };

          // Tentar obter stats ranqueadas do LCU
          try {
            const lcuRankedStats = await lcuService.getRankedStats();
            if (lcuRankedStats) {
              combinedData.lcuRankedStats = lcuRankedStats;
            }
          } catch (lcuRankError) {
            console.log('[REFRESH] LCU ranked stats indisponíveis');
          }

          dataSource = 'lcu';
          console.log('[REFRESH] Dados obtidos do LCU para o jogador atual');
        }
      } catch (lcuError) {
        console.log('[REFRESH] Erro ao obter dados do LCU:', lcuError);
      }
    }    // Se não conseguiu dados do LCU ou não é o jogador atual, tentar Riot API
    if (!combinedData) {
      if (globalRiotAPI && globalRiotAPI.isApiKeyConfigured && globalRiotAPI.isApiKeyConfigured()) {
        try {
          const playerData = await playerService.getPlayerBySummonerNameWithDetails(riotId, region);
          combinedData = playerData;
          dataSource = 'riot-api';
          console.log('[REFRESH] Dados obtidos da Riot API');
        } catch (riotError: any) {
          console.log('[REFRESH] Erro na Riot API:', riotError.message);

          // Se falhou na Riot API, retornar erro específico
          if (riotError.message.includes('não encontrado')) {
            return res.status(404).json({ error: riotError.message });
          } else if (riotError.message.includes('Chave da Riot API')) {
            return res.status(503).json({ error: `Erro na API da Riot: ${riotError.message}` });
          } else {
            return res.status(500).json({ error: 'Erro ao acessar dados da Riot API.' });
          }
        }
      } else {
        return res.status(503).json({
          error: 'Não foi possível atualizar dados: LCU não está conectado ao jogador solicitado e Riot API não está configurada.'
        });
      }
    }

    // Se chegou até aqui, tem dados para retornar
    if (combinedData) {
      const message = dataSource === 'lcu'
        ? 'Dados atualizados via LCU (cliente do LoL)'
        : 'Dados atualizados via Riot API';

      res.json({
        success: true,
        data: combinedData,
        message,
        source: dataSource
      });
    } else {
      res.status(500).json({ error: 'Não foi possível obter dados do jogador.' });
    }

  } catch (error: any) {
    console.error(`Erro ao atualizar dados do jogador por Riot ID (${req.body.riotId}):`, error.message);
    res.status(500).json({ error: 'Erro interno ao atualizar dados do jogador.' });
  }
}) as RequestHandler);


// GET PLAYER BY RIOT ID (previously /api/player/by-name/:riotId)
// This can be used for looking up any player, not just the current one.
app.get('/api/player/details/:riotId', (async (req: Request, res: Response) => {
  const riotId = req.params.riotId;
  const region = (req.query.region as string) || 'br1';

  if (!riotId) {
    return res.status(400).json({ error: 'Riot ID (gameName#tagLine) é obrigatório' });
  }
  if (!riotId.includes('#')) {
    return res.status(400).json({ error: 'Formato de Riot ID inválido. Use gameName#tagLine.' });
  }

  try {
    const playerData = await playerService.getPlayerBySummonerNameWithDetails(riotId, region);
    res.json(playerData);
  } catch (error: any) {
    console.error(`Erro ao buscar jogador por Riot ID (${riotId}):`, error.message);
    if (error.message.includes('não encontrado')) {
      res.status(404).json({ error: error.message });
    } else if (error.message.includes('Chave da Riot API')) {
      res.status(503).json({ error: error.message });
    } else if (error.message.includes('inválido') || error.message.includes('corrompido')) {
      res.status(400).json({ error: error.message });
    } else {
      res.status(500).json({ error: 'Erro interno ao processar a solicitação' });
    }
  }
}) as RequestHandler);


// GET PLAYER BY PUUID (still available if needed for specific use cases)
app.get('/api/player/puuid/:puuid', (async (req: Request, res: Response) => {
  const puuid = req.params.puuid;
  const region = (req.query.region as string) || 'br1'; // Default to br1 if no region is provided
  if (!puuid) {
    return res.status(400).json({ error: 'PUUID é obrigatório' });
  }

  try {
    const playerData = await playerService.getPlayerByPuuid(puuid, region);
    if (playerData) {
      res.json(playerData);
    } else {
      res.status(404).json({ error: 'Jogador não encontrado' });
    }
  } catch (error: any) {
    console.error(`Erro ao buscar jogador por PUUID (${puuid}):`, error.message);
    if (error.message.includes('não encontrado')) {
      res.status(404).json({ error: error.message });
    } else if (error.message.includes('Chave da Riot API')) {
      res.status(503).json({ error: error.message }); // Service Unavailable
    } else if (error.message.includes('PUUID inválido') || error.message.includes('corrompido')) {
      res.status(400).json({ error: error.message }); // Bad Request for invalid PUUID
    } else if (error.message.includes('Requisição inválida')) {
      res.status(400).json({ error: error.message }); // Bad Request
    } else {
      res.status(500).json({ error: 'Erro interno ao processar a solicitação' });
    }
  }
}) as RequestHandler);

// Route for manual match capture - temporarily disabled
// Will be re-enabled once TypeScript route handler issue is resolved
/*
app.post('/api/capture-match/:playerId', (req: Request, res: Response) => {
  const playerId = parseInt(req.params.playerId);
  
  dbManager.getPlayer(playerId)
    .then(player => {
      if (!player || !player.puuid) {
        res.status(404).json({ error: 'Jogador não encontrado ou sem PUUID' });
        return;
      }
      
      return matchHistoryService.captureLatestMatch(player.puuid);
    })
    .then(() => {
      res.json({ success: true, message: 'Captura de histórico iniciada' });
    })
    .catch((error: any) => {
      res.status(500).json({ error: error.message });
    });
});
*/

// Rotas de matchmaking
app.get('/api/queue/status', async (req: Request, res: Response) => {
  try {
    const queueStatus = await matchmakingService.getQueueStatus();
    res.json(queueStatus);
  } catch (error: any) {
    console.error('Erro ao obter status da fila:', error);
    res.status(500).json({ error: error.message });
  }
});

// Endpoint para entrar na fila via HTTP
app.post('/api/queue/join', (async (req: Request, res: Response) => {
  try {
    const { player, preferences } = req.body;

    if (!player) {
      return res.status(400).json({
        success: false,
        error: 'Dados do jogador são obrigatórios'
      });
    }

    // Criar um WebSocket mock para o jogador que entra via HTTP
    const mockWebSocket = {
      send: (data: string) => {
        // Log da resposta para debug
        console.log('📤 Resposta para jogador HTTP:', JSON.parse(data));
      },
      readyState: 1 // WebSocket.OPEN
    } as any;

    // Usar o método existente do MatchmakingService
    await matchmakingService.addPlayerToQueue(mockWebSocket, { player, preferences });

    res.json({
      success: true,
      message: 'Jogador adicionado à fila com sucesso',
      queueStatus: await matchmakingService.getQueueStatus()
    });
  } catch (error: any) {
    console.error('Erro ao adicionar jogador à fila:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}) as RequestHandler);

// Endpoint para sair da fila via HTTP
app.post('/api/queue/leave', (async (req: Request, res: Response) => {
  try {
    console.log('🔍 [API] Recebida requisição para sair da fila:', req.body);
    const { playerId, summonerName } = req.body;

    if (!playerId && !summonerName) {
      console.log('❌ [API] Erro: playerId ou summonerName é obrigatório');
      return res.status(400).json({
        success: false,
        error: 'playerId ou summonerName é obrigatório'
      });
    }

    console.log('🔍 [API] Tentando remover jogador:', { playerId, summonerName });
    console.log('🔍 [API] Fila atual:', matchmakingService.getQueue().map(p => ({ id: p.id, name: p.summonerName })));

    // Usar o método público do MatchmakingService
    const removed = matchmakingService.removePlayerFromQueueById(playerId, summonerName);

    console.log('🔍 [API] Resultado da remoção:', removed);

    if (removed) {
      const queueStatus = await matchmakingService.getQueueStatus();
      console.log('✅ [API] Jogador removido com sucesso. Nova fila:', queueStatus.playersInQueue, 'jogadores');

      res.json({
        success: true,
        message: 'Jogador removido da fila com sucesso',
        queueStatus: queueStatus
      });
    } else {
      console.log('❌ [API] Jogador não encontrado na fila');
      res.status(404).json({
        success: false,
        error: 'Jogador não encontrado na fila'
      });
    }
  } catch (error: any) {
    console.error('❌ [API] Erro ao remover jogador da fila:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}) as RequestHandler);

// Endpoints legacy para compatibilidade
app.post('/api/queue/join-legacy', (async (req: Request, res: Response) => {
  try {
    const { playerId, mmr, role } = req.body;

    if (!playerId || !mmr || !role) {
      return res.status(400).json({
        success: false,
        error: 'playerId, mmr e role são obrigatórios'
      });
    }

    // Buscar jogador no banco
    const player = await dbManager.getPlayer(playerId);
    if (!player) {
      return res.status(404).json({
        success: false,
        error: 'Jogador não encontrado'
      });
    }

    // Criar WebSocket mock
    const mockWebSocket = {
      send: (data: string) => {
        console.log('📤 Resposta para jogador legacy:', JSON.parse(data));
      },
      readyState: 1
    } as any;

    // Adicionar à fila com preferências legacy
    await matchmakingService.addPlayerToQueue(mockWebSocket, {
      player: {
        summonerName: player.summoner_name,
        summonerId: player.summoner_id,
        puuid: player.puuid,
        region: player.region
      },
      preferences: {
        primaryLane: role,
        secondaryLane: role
      }
    });

    res.json({
      success: true,
      message: 'Jogador adicionado à fila legacy com sucesso',
      queueStatus: await matchmakingService.getQueueStatus()
    });
  } catch (error: any) {
    console.error('Erro ao adicionar jogador à fila legacy:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}) as RequestHandler);

app.post('/api/queue/leave-legacy', (async (req: Request, res: Response) => {
  try {
    const { playerId } = req.body;

    if (!playerId) {
      return res.status(400).json({
        success: false,
        error: 'playerId é obrigatório'
      });
    }

    // Usar o método público do MatchmakingService
    const removed = matchmakingService.removePlayerFromQueueById(playerId);

    if (removed) {
      res.json({
        success: true,
        message: 'Jogador removido da fila legacy com sucesso',
        queueStatus: await matchmakingService.getQueueStatus()
      });
    } else {
      res.status(404).json({
        success: false,
        error: 'Jogador não encontrado na fila'
      });
    }
  } catch (error: any) {
    console.error('Erro ao remover jogador da fila legacy:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}) as RequestHandler);

// Rota temporária para adicionar bot na fila (apenas para testes)
app.post('/api/queue/add-bot', async (req: Request, res: Response) => {
  try {
    await matchmakingService.addBotToQueue();
    res.json({
      success: true,
      message: 'Bot adicionado à fila com sucesso'
    });
  } catch (error: any) {
    console.error('Erro ao adicionar bot:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Endpoints para sistema de partidas
app.post('/api/match/accept', (async (req: Request, res: Response) => {
  try {
    const { playerId, matchId, summonerName } = req.body;

    if ((!playerId && !summonerName) || !matchId) {
      return res.status(400).json({
        success: false,
        error: 'playerId ou summonerName e matchId são obrigatórios'
      });
    }

    await matchmakingService.acceptMatch(playerId || 0, matchId, summonerName);
    res.json({
      success: true,
      message: 'Partida aceita com sucesso'
    });
  } catch (error: any) {
    console.error('Erro ao aceitar partida:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}) as RequestHandler);

app.post('/api/match/decline', (async (req: Request, res: Response) => {
  try {
    const { playerId, matchId, summonerName } = req.body;

    if ((!playerId && !summonerName) || !matchId) {
      return res.status(400).json({
        success: false,
        error: 'playerId ou summonerName e matchId são obrigatórios'
      });
    }

    await matchmakingService.declineMatch(playerId || 0, matchId, summonerName);
    res.json({
      success: true,
      message: 'Partida recusada com sucesso'
    });
  } catch (error: any) {
    console.error('Erro ao recusar partida:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}) as RequestHandler);

app.post('/api/match/draft-action', (async (req: Request, res: Response) => {
  try {
    const { matchId, playerId, championId, action } = req.body;

    if (!matchId || !playerId || !championId || !action) {
      return res.status(400).json({
        success: false,
        error: 'Todos os parâmetros são obrigatórios'
      });
    }

    await matchmakingService.processDraftAction(matchId, playerId, championId, action);
    res.json({
      success: true,
      message: 'Ação do draft processada com sucesso'
    });
  } catch (error: any) {
    console.error('Erro ao processar ação do draft:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}) as RequestHandler);

app.get('/api/matches/recent', async (req: Request, res: Response) => {
  try {
    const matches = await matchmakingService.getRecentMatches();
    res.json(matches);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Rotas da Riot API
app.get('/api/riot/summoner/:region/:summonerName', async (req: Request, res: Response) => {
  try {
    const { region, summonerName } = req.params;
    const summoner = await globalRiotAPI.getSummoner(summonerName, region);
    res.json(summoner);
  } catch (error: any) {
    res.status(404).json({ error: error.message });
  }
});

// Endpoint específico para busca por Riot ID (gameName#tagLine)
app.get('/api/riot/summoner-by-riot-id/:region/:gameName/:tagLine', async (req: Request, res: Response) => {
  try {
    const { region, gameName, tagLine } = req.params;
    const summoner = await globalRiotAPI.getSummonerByRiotId(gameName, tagLine, region);
    res.json(summoner);
  } catch (error: any) {
    res.status(404).json({ error: error.message });
  }
});

// Endpoint para buscar apenas dados da conta (Account API)
// Nota: Account API não usa região no endpoint, apenas na URL base regional
app.get('/api/riot/account-by-riot-id/:region/:gameName/:tagLine', async (req: Request, res: Response) => {
  try {
    const { region, gameName, tagLine } = req.params;
    const account = await globalRiotAPI.getAccountByRiotId(gameName, tagLine, region);
    res.json(account);
  } catch (error: any) {
    res.status(404).json({ error: error.message });
  }
});

// Rotas do LCU (Local Client API)
app.get('/api/lcu/status', async (req: Request, res: Response) => {
  try {
    const status = await lcuService.getClientStatus();
    res.json(status);
  } catch (error: any) {
    res.status(503).json({ error: 'Cliente do LoL não encontrado' });
  }
});

// Discord Bot Status
app.get('/api/discord/status', async (req: Request, res: Response) => {
  try {
    console.log('🔍 [API] Verificando status do Discord Bot...');

    const isConnected = discordService.isDiscordConnected();
    const botUsername = discordService.getBotUsername();
    const queueSize = discordService.getQueueSize();
    const activeMatches = discordService.getActiveMatches();

    const status = {
      isConnected,
      botUsername,
      queueSize,
      activeMatches,
      inChannel: false // Será atualizado pelo frontend quando necessário
    };

    console.log('📡 [API] Status do Discord retornado:', status);

    res.json(status);
  } catch (error: any) {
    console.error('❌ [API] Erro ao verificar status do Discord:', error);
    res.status(503).json({
      error: 'Discord Bot não está disponível',
      details: error.message
    });
  }
});

app.get('/api/lcu/current-summoner', (async (req: Request, res: Response) => {
  try {
    const summoner = await lcuService.getCurrentSummoner(); // This gets basic LCU data
    res.json(summoner);
  } catch (error: any) {
    res.status(503).json({ error: 'Não foi possível obter dados do invocador atual do LCU' });
  }
}) as RequestHandler);

// Rota para buscar histórico completo do LCU (incluindo partidas customizadas)
app.get('/api/lcu/match-history-all', (async (req: Request, res: Response) => {
  try {
    const startIndex = parseInt(req.query.startIndex as string) || 0;
    const count = parseInt(req.query.count as string) || 10;
    const customOnly = req.query.customOnly === 'true';

    console.log(`🔍 [LCU Match History] Buscando histórico: startIndex=${startIndex}, count=${count}, customOnly=${customOnly}`);

    if (!lcuService.isClientConnected()) {
      return res.status(503).json({ error: 'Cliente do LoL não conectado' });
    }

    const matches = await lcuService.getMatchHistory(startIndex, count);
    // Filtrar apenas partidas customizadas se solicitado
    let filteredMatches = matches;
    if (customOnly) {
      filteredMatches = matches.filter((match: any) => {
        // Verificar se é partida customizada baseado no tipo de fila
        const queueId = match.queueId || 0;
        const gameMode = match.gameMode || '';
        const gameType = match.gameType || '';

        // Apenas partidas customizadas REAIS
        // queueId 0 = Custom games
        // Verificar explicitamente por CUSTOM_GAME no gameType
        const isCustomGame = queueId === 0 ||
          gameType === 'CUSTOM_GAME' ||
          gameMode === 'CUSTOM' ||
          (gameMode === 'CLASSIC' && gameType === 'CUSTOM_GAME');

        console.log(`🔍 Verificando partida - queueId: ${queueId}, gameMode: ${gameMode}, gameType: ${gameType}, isCustom: ${isCustomGame}`);

        return isCustomGame;
      });
    }

    console.log(`📊 [LCU Match History] Retornando ${filteredMatches.length} partidas (de ${matches.length} totais)`);

    res.json({
      success: true,
      matches: filteredMatches,
      totalMatches: matches.length,
      filteredCount: filteredMatches.length,
      pagination: {
        startIndex,
        count,
        customOnly
      }
    });

  } catch (error: any) {
    console.error('💥 [LCU Match History] Erro:', error);
    res.status(503).json({ error: 'Erro ao buscar histórico do LCU: ' + error.message });
  }
}) as RequestHandler);

// Rota para buscar detalhes da partida atual no LCU
app.get('/api/lcu/current-match-details', (async (req: Request, res: Response) => {
  try {
    if (!lcuService.isClientConnected()) {
      return res.json({
        success: false,
        error: 'Cliente do LoL não conectado',
        message: 'Nenhuma partida ativa encontrada'
      });
    }

    // Tentar obter dados da partida atual usando método mais robusto
    const currentMatchDetails = await lcuService.getCurrentMatchDetails();

    if (!currentMatchDetails || !currentMatchDetails.details) {
      return res.json({
        success: false,
        error: 'Nenhuma partida ativa encontrada',
        message: 'Nenhuma partida ativa encontrada'
      });
    }

    res.json({
      success: true,
      match: currentMatchDetails
    });

  } catch (error: any) {
    console.error('💥 [LCU Current Match] Erro:', error);
    res.json({
      success: false,
      error: 'Erro ao buscar partida atual do LCU: ' + error.message,
      message: 'Nenhuma partida ativa encontrada'
    });
  }
}) as RequestHandler);

// Endpoint para buscar partida do LCU pelo Game ID e salvar automaticamente
app.post('/api/lcu/fetch-and-save-match/:gameId', (req: Request, res: Response) => {
  (async () => {
    try {
      const gameId = parseInt(req.params.gameId);
      const { playerIdentifier } = req.body;

      if (!gameId || isNaN(gameId)) {
        return res.status(400).json({ error: 'Game ID inválido' });
      }

      if (!playerIdentifier) {
        return res.status(400).json({ error: 'Player identifier é obrigatório' });
      }

      console.log(`🎮 [FETCH-SAVE-MATCH] Buscando partida ${gameId} do LCU para jogador ${playerIdentifier}...`);

      if (!lcuService.isClientConnected()) {
        return res.status(503).json({ error: 'Cliente do LoL não conectado' });
      }

      // Buscar dados completos da partida
      const matchData = await lcuService.getMatchDetails(gameId);

      if (!matchData) {
        return res.status(404).json({ error: `Partida ${gameId} não encontrada no LCU` });
      }

      if (!matchData.participants || matchData.participants.length === 0) {
        return res.status(400).json({ error: `Partida ${gameId} não possui dados de participantes` });
      }

      console.log(`✅ [FETCH-SAVE-MATCH] Dados obtidos: ${matchData.participants.length} participantes`);

      // Processar dados da partida
      const participants = matchData.participants || [];
      const participantIdentities = matchData.participantIdentities || [];
      const team1Players: string[] = [];
      const team2Players: string[] = [];
      const team1Picks: any[] = [];
      const team2Picks: any[] = [];
      const participantsData: any[] = [];

      participants.forEach((participant: any, index: number) => {
        // Buscar dados do jogador correspondente
        const participantIdentity = participantIdentities.find(
          (identity: any) => identity.participantId === participant.participantId
        );

        let playerName = '';

        if (participantIdentity && participantIdentity.player) {
          const player = participantIdentity.player;

          if (player.gameName && player.tagLine) {
            playerName = `${player.gameName}#${player.tagLine}`;
          } else if (player.summonerName) {
            playerName = player.summonerName;
          } else if (player.gameName) {
            playerName = player.gameName;
          }
        }

        if (!playerName) {
          playerName = `Player${index + 1}`;
        }

        const championId = participant.championId || participant.champion || 0;
        const championName = participant.championName || `Champion${championId}`;
        const lane = participant.lane || participant.teamPosition || participant.individualPosition || 'UNKNOWN';

        // Extrair dados completos do participante
        const stats = participant.stats || {};

        const participantData = {
          participantId: participant.participantId,
          teamId: participant.teamId,
          championId: championId,
          championName: championName,
          summonerName: playerName,
          riotIdGameName: participantIdentity?.player?.gameName || '',
          riotIdTagline: participantIdentity?.player?.tagLine || '',
          lane: lane,
          kills: stats.kills || 0,
          deaths: stats.deaths || 0,
          assists: stats.assists || 0,
          champLevel: stats.champLevel || 1,
          goldEarned: stats.goldEarned || 0,
          totalMinionsKilled: stats.totalMinionsKilled || 0,
          neutralMinionsKilled: stats.neutralMinionsKilled || 0,
          totalDamageDealt: stats.totalDamageDealt || 0,
          totalDamageDealtToChampions: stats.totalDamageDealtToChampions || 0,
          totalDamageTaken: stats.totalDamageTaken || 0,
          wardsPlaced: stats.wardsPlaced || 0,
          wardsKilled: stats.wardsKilled || 0,
          visionScore: stats.visionScore || 0,
          firstBloodKill: stats.firstBloodKill || false,
          doubleKills: stats.doubleKills || 0,
          tripleKills: stats.tripleKills || 0,
          quadraKills: stats.quadraKills || 0,
          pentaKills: stats.pentaKills || 0,
          item0: stats.item0 || 0,
          item1: stats.item1 || 0,
          item2: stats.item2 || 0,
          item3: stats.item3 || 0,
          item4: stats.item4 || 0,
          item5: stats.item5 || 0,
          item6: stats.item6 || 0,
          summoner1Id: participant.spell1Id || 0,
          summoner2Id: participant.spell2Id || 0,
          win: stats.win || false
        };

        participantsData.push(participantData);

        if (participant.teamId === 100) {
          team1Players.push(playerName);
          team1Picks.push({
            champion: championName,
            player: playerName,
            lane: lane,
            championId: championId
          });
        } else if (participant.teamId === 200) {
          team2Players.push(playerName);
          team2Picks.push({
            champion: championName,
            player: playerName,
            lane: lane,
            championId: championId
          });
        }
      });

      // Garantir que o player identifier está nos times
      if (
        playerIdentifier &&
        !team1Players.includes(playerIdentifier) &&
        !team2Players.includes(playerIdentifier) &&
        typeof playerIdentifier === 'string' &&
        playerIdentifier.includes('#')
      ) {
        team1Players.push(playerIdentifier);
      }

      // Criar dados de pick/ban
      const pickBanData = {
        team1Picks: team1Picks,
        team2Picks: team2Picks,
        team1Bans: [],
        team2Bans: [],
        isReal: true,
        source: 'LCU_MATCH_HISTORY'
      };

      // Buscar o jogador para pegar o nome
      let player: any = null;
      try {
        if (playerIdentifier.length > 10) {
          player = await dbManager.getPlayerBySummonerName(playerIdentifier);
        } else {
          const numericId = parseInt(playerIdentifier);
          if (!isNaN(numericId)) {
            player = await dbManager.getPlayer(numericId);
          }
        }
      } catch (error) {
        console.log('⚠️ Player não encontrado no banco, usando identificador fornecido');
      }

      const createdBy = player?.summoner_name || playerIdentifier || 'Sistema';

      // Criar partida personalizada
      const matchData_create = {
        title: `Partida LCU ${gameId}`,
        description: `Partida baseada em dados reais do LCU - Game ID: ${gameId}`,
        team1Players: team1Players,
        team2Players: team2Players,
        createdBy: createdBy,
        gameMode: matchData.gameMode || 'CLASSIC'
      };

      const matchId = await dbManager.createCustomMatch(matchData_create);

      // Salvar dados completos da partida
      const duration = Math.floor((matchData.gameDuration || 0) / 60);

      await dbManager.updateCustomMatchWithRealData(matchId, {
        duration: duration,
        pickBanData: pickBanData,
        participantsData: participantsData,
        detectedByLCU: true,
        riotGameId: gameId.toString(),
        notes: `Partida real do LCU - Game ID: ${gameId}`,
        gameMode: matchData.gameMode || 'CLASSIC'
      });

      // Se a partida já terminou, marcar como completa
      if (matchData.endOfGameResult === 'GameComplete' && matchData.teams) {
        let winner = null;
        if (matchData.teams.length >= 2) {
          const team1Won = matchData.teams[0]?.win === "Win" || matchData.teams[0]?.win === true;
          const team2Won = matchData.teams[1]?.win === "Win" || matchData.teams[1]?.win === true;
          winner = team1Won ? 1 : (team2Won ? 2 : null);
        }

        if (winner) {
          await dbManager.completeCustomMatch(matchId, winner, {
            duration: duration,
            pickBanData: pickBanData,
            participantsData: participantsData,
            detectedByLCU: true,
            riotGameId: gameId.toString(),
            notes: `Partida real finalizada via LCU - ${matchData.endOfGameResult}`
          });
        }
      }

      console.log('✅ [FETCH-SAVE-MATCH] Partida salva com sucesso:', matchId); res.json({
        success: true,
        message: 'Partida do LCU salva com sucesso',
        matchId: matchId,
        gameId: gameId,
        hasRealData: true,
        pickBanData: pickBanData,
        participantsCount: participantsData.length
      });
    } catch (error: any) {
      console.error('💥 [FETCH-SAVE-MATCH] Erro ao buscar e salvar partida:', error);
      res.status(500).json({ error: error.message });
    }
  })();
});

// Custom matches routes
app.post('/api/matches/custom', (async (req: Request, res: Response) => {
  try {
    const {
      title,
      description,
      team1Players,
      team2Players,
      createdBy,
      gameMode,
      winnerTeam,
      duration,
      pickBanData,
      riotGameId,
      detectedByLCU,
      status
    } = req.body;

    console.log('💾 [POST /api/matches/custom] Recebendo dados:', {
      title,
      team1Count: team1Players?.length,
      team2Count: team2Players?.length,
      createdBy,
      winnerTeam,
      duration,
      hasPickBan: !!pickBanData,
      riotGameId,
      detectedByLCU,
      status
    });

    if (!team1Players || !team2Players || !createdBy) {
      return res.status(400).json({
        error: 'team1Players, team2Players e createdBy são obrigatórios'
      });
    }

    // Create custom match using new dedicated table
    const matchId = await dbManager.createCustomMatch({
      title,
      description,
      team1Players,
      team2Players,
      createdBy,
      gameMode
    });

    // Se a partida já está finalizada, atualizá-la com o resultado
    if (status === 'completed' && winnerTeam) {
      console.log('🏆 Completando partida imediatamente com vencedor:', winnerTeam);

      await dbManager.completeCustomMatch(matchId, winnerTeam, {
        duration,
        pickBanData,
        riotGameId,
        detectedByLCU
      });
    }

    console.log('✅ [POST /api/matches/custom] Partida salva com ID:', matchId);

    res.json({
      success: true,
      matchId,
      message: 'Partida personalizada criada com sucesso'
    });
  } catch (error: any) {
    console.error('💥 [POST /api/matches/custom] Erro ao criar partida personalizada:', error);
    res.status(500).json({ error: error.message });
  }
}) as RequestHandler);

// Rota alternativa para compatibilidade com frontend antigo
app.post('/api/custom_matches', (async (req: Request, res: Response) => {
  try {
    const {
      title,
      description,
      team1Players,
      team2Players,
      createdBy,
      gameMode,
      winnerTeam,
      duration,
      pickBanData,
      riotGameId,
      detectedByLCU,
      status
    } = req.body;

    console.log('💾 [POST /api/custom_matches] Recebendo dados (rota de compatibilidade):', {
      title,
      team1Count: team1Players?.length,
      team2Count: team2Players?.length,
      createdBy,
      winnerTeam,
      duration,
      hasPickBan: !!pickBanData,
      riotGameId,
      detectedByLCU,
      status
    });

    if (!team1Players || !team2Players || !createdBy) {
      return res.status(400).json({
        error: 'team1Players, team2Players e createdBy são obrigatórios'
      });
    }

    const matchId = await dbManager.createCustomMatch({
      title,
      description,
      team1Players,
      team2Players,
      createdBy,
      gameMode
    });

    if (status === 'completed' && winnerTeam) {
      console.log('🏆 Completando partida imediatamente com vencedor:', winnerTeam);

      await dbManager.completeCustomMatch(matchId, winnerTeam, {
        duration,
        pickBanData,
        riotGameId,
        detectedByLCU
      });
    }

    console.log('✅ [POST /api/custom_matches] Partida salva com ID:', matchId);

    res.json({
      success: true,
      matchId,
      message: 'Partida personalizada criada com sucesso'
    });
  } catch (error: any) {
    console.error('💥 [POST /api/custom_matches] Erro ao criar partida personalizada:', error);
    res.status(500).json({ error: error.message });
  }
}) as RequestHandler);

app.get('/api/matches/custom/:playerId', (req: Request, res: Response) => {
  (async () => {
    try {
      const playerIdParam = decodeURIComponent(req.params.playerId);

      // Validar e converter offset e limit para números
      let offset = 0;
      let limit = 10;

      if (req.query.offset !== undefined) {
        const offsetValue = parseInt(req.query.offset as string);
        if (!isNaN(offsetValue) && offsetValue >= 0) {
          offset = offsetValue;
        }
      }

      if (req.query.limit !== undefined) {
        const limitValue = parseInt(req.query.limit as string);
        if (!isNaN(limitValue) && limitValue > 0 && limitValue <= 100) {
          limit = limitValue;
        }
      }

      console.log('🔍 [GET /api/matches/custom] Parâmetros processados:', {
        playerIdParam,
        offset,
        limit,
        offsetType: typeof offset,
        limitType: typeof limit
      });

      let playerIdentifier = playerIdParam;
      const numericId = parseInt(playerIdParam);
      if (!isNaN(numericId)) {
        playerIdentifier = numericId.toString();
        console.log('✅ [GET /api/matches/custom] ID numérico detectado:', playerIdentifier);
      } else {
        console.log('🔄 [GET /api/matches/custom] Usando como identificador:', playerIdentifier);
      }

      console.log('🎯 [GET /api/matches/custom] Buscando partidas personalizadas para:', playerIdentifier);
      const matches = await dbManager.getPlayerCustomMatches(playerIdentifier, limit);
      console.log('📊 [GET /api/matches/custom] Partidas personalizadas encontradas:', matches.length);

      res.json({
        success: true,
        matches,
        pagination: {
          offset,
          limit,
          total: matches.length
        }
      });
    } catch (error: any) {
      console.error('💥 [GET /api/matches/custom] Erro:', error);
      res.status(500).json({ error: error.message });
    }
  })();
});

app.get('/api/matches/custom/:playerId/count', (req: Request, res: Response) => {
  (async () => {
    try {
      const playerIdParam = decodeURIComponent(req.params.playerId);

      console.log('🔢 [GET /api/matches/custom/count] playerIdParam (decoded):', playerIdParam);

      let playerIdentifier = playerIdParam;
      const numericId = parseInt(playerIdParam);
      if (!isNaN(numericId)) {
        playerIdentifier = numericId.toString();
        console.log('✅ [GET /api/matches/custom/count] ID numérico detectado:', playerIdentifier);
      } else {
        console.log('🔄 [GET /api/matches/custom/count] Usando como identificador:', playerIdentifier);
      }

      console.log('🎯 [GET /api/matches/custom/count] Contando partidas personalizadas para:', playerIdentifier);
      const count = await dbManager.getPlayerCustomMatchesCount(playerIdentifier);
      console.log('📊 [GET /api/matches/custom/count] Total de partidas personalizadas:', count);

      res.json({
        success: true,
        count,
        playerIdentifier
      });
    } catch (error: any) {
      console.error('💥 [GET /api/matches/custom/count] Erro:', error);
      res.status(500).json({ error: error.message });
    }
  })();
});

// Rota para limpeza de partidas de teste
app.delete('/api/matches/cleanup-test-matches', (req: Request, res: Response) => {
  (async () => {
    try {
      console.log('🧹 [DELETE /api/matches/cleanup-test-matches] Iniciando limpeza COMPLETA da tabela custom_matches');

      // Executar limpeza completa
      const result = await dbManager.cleanupTestMatches();

      console.log('✅ [DELETE /api/matches/cleanup-test-matches] Limpeza completa concluída:', {
        deletedCount: result.deletedCount,
        remainingMatches: result.remainingMatches
      });

      res.json({
        success: true,
        deletedCount: result.deletedCount,
        remainingMatches: result.remainingMatches,
        deletedMatches: result.deletedMatches,
        message: `${result.deletedCount} partidas removidas. Tabela custom_matches completamente limpa! Restaram ${result.remainingMatches} partidas.`
      });

    } catch (error: any) {
      console.error('💥 [DELETE /api/matches/cleanup-test-matches] Erro:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  })();
});

// Rota para limpeza COMPLETA da tabela custom_matches
app.delete('/api/matches/clear-all-custom-matches', (req: Request, res: Response) => {
  (async () => {
    try {
      console.log('🧹 [DELETE /api/matches/clear-all-custom-matches] Iniciando limpeza COMPLETA da tabela custom_matches');

      // Contar total antes da limpeza
      const totalBefore = await dbManager.getCustomMatchesCount();

      // Executar limpeza completa
      const deletedCount = await dbManager.clearAllCustomMatches();

      // Contar total depois da limpeza
      const totalAfter = await dbManager.getCustomMatchesCount();

      console.log('✅ [DELETE /api/matches/clear-all-custom-matches] Limpeza completa concluída:', {
        deletedCount,
        totalBefore,
        totalAfter
      });

      res.json({
        success: true,
        deletedCount,
        totalBefore,
        totalAfter,
        message: `${deletedCount} partidas removidas. Tabela custom_matches completamente limpa!`
      });

    } catch (error: any) {
      console.error('💥 [DELETE /api/matches/clear-all-custom-matches] Erro:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  })();
});

// Endpoint para atualizar nickname de um jogador
app.post('/api/players/update-nickname', (req: Request, res: Response) => {
  (async () => {
    try {
      const { oldName, newName } = req.body;
      if (!oldName || !newName) {
        return res.status(400).json({ error: 'oldName e newName são obrigatórios' });
      }
      await dbManager.updatePlayerNickname(oldName, newName);
      res.json({ success: true, message: 'Nickname atualizado com sucesso' });
    } catch (error: any) {
      console.error('Erro ao atualizar nickname:', error);
      res.status(500).json({ error: error.message });
    }
  })();
});

// Endpoint para rebuild/refresh completo da tabela players
app.post('/api/stats/refresh-rebuild-players', async (req: Request, res: Response) => {
  try {
    console.log('🔄 [POST /api/stats/refresh-rebuild-players] Iniciando rebuild completo da tabela players...');

    // Limpar todos os jogadores
    await dbManager.clearAllPlayers();
    console.log('✅ [POST /api/stats/refresh-rebuild-players] Tabela players limpa');

    // Recalcular todos os agregados a partir das partidas customizadas
    await dbManager.refreshPlayersFromCustomMatches();
    console.log('✅ [POST /api/stats/refresh-rebuild-players] Jogadores recriados das partidas customizadas');

    // Verificar quantos jogadores foram criados
    const count = await dbManager.getPlayersCount();

    console.log(`✅ [POST /api/stats/refresh-rebuild-players] Rebuild concluído. Total de jogadores: ${count}`);

    res.json({
      success: true,
      message: `Tabela players limpa e reconstruída com sucesso. Total de jogadores: ${count}`,
      playerCount: count
    });
  } catch (error: any) {
    console.error('❌ [POST /api/stats/refresh-rebuild-players] Erro ao rebuildar tabela players:', error);
    res.status(500).json({ error: error.message });
  }
});

// Endpoint de debug para verificar dados das tabelas
app.get('/api/debug/tables', async (req: Request, res: Response) => {
  try {
    console.log('🔍 [GET /api/debug/tables] Verificando dados das tabelas...');

    const debugData = await dbManager.getTablesStats();

    console.log('✅ [GET /api/debug/tables] Dados das tabelas:', debugData);

    res.json({
      success: true,
      data: debugData
    });
  } catch (error: any) {
    console.error('❌ [GET /api/debug/tables] Erro ao verificar tabelas:', error);
    res.status(500).json({ error: error.message });
  }
});

// === CONFIGURAÇÕES APIs ===

// Configurar Discord Bot Token
app.post('/api/config/discord-token', (async (req: Request, res: Response) => {
  console.log('🤖 Endpoint Discord token chamado');
  console.log('📋 Headers:', req.headers);
  console.log('📦 Body:', req.body);
  console.log('📦 Body type:', typeof req.body);
  console.log('📦 Body keys:', Object.keys(req.body || {}));

  try {
    const { token } = req.body;

    console.log('🔑 Token recebido:', token ? `${token.substring(0, 10)}...` : 'null/undefined');
    console.log('🔑 Token type:', typeof token);
    console.log('🔑 Token length:', token ? token.length : 0);

    if (!token || typeof token !== 'string' || token.trim() === '') {
      console.log('❌ Token inválido ou vazio');
      return res.status(400).json({
        success: false,
        error: 'Token do Discord é obrigatório'
      });
    }

    console.log('💾 Salvando token no banco...');
    // Salvar no banco de dados PRIMEIRO
    await dbManager.setSetting('discord_bot_token', token.trim());
    console.log('✅ Token salvo no banco');

    console.log('🤖 Tentando inicializar Discord Bot...');
    // Tentar inicializar o Discord Bot com o novo token
    const discordInitialized = await discordService.initialize(token.trim());

    if (discordInitialized) {
      console.log('✅ Discord Bot inicializado com sucesso');
      // Conectar ao WebSocket se inicializou com sucesso
      discordService.setWebSocketServer(wss);

      res.json({
        success: true,
        message: 'Discord Bot configurado e conectado com sucesso!',
        connected: discordService.isDiscordConnected()
      });
    } else {
      console.log('⚠️ Token salvo no banco, mas Discord Bot não conseguiu conectar');
      // Retornar sucesso mesmo se a inicialização falhar, pois o token foi salvo
      res.json({
        success: true,
        message: 'Token salvo no banco. Discord Bot será inicializado automaticamente quando o servidor reiniciar.',
        connected: false,
        warning: 'Token pode ser inválido ou Discord pode estar offline'
      });
    }

  } catch (error: any) {
    console.error('❌ Erro ao configurar Discord Bot:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}) as RequestHandler);

// Configurar Riot API Key  
app.post('/api/config/riot-api-key', (async (req: Request, res: Response) => {
  try {
    const { apiKey } = req.body;

    if (!apiKey || typeof apiKey !== 'string' || apiKey.trim() === '') {
      return res.status(400).json({
        success: false,
        error: 'API Key do Riot é obrigatória'
      });
    }

    // Validar a API key antes de salvar
    try {
      globalRiotAPI.setApiKey(apiKey.trim());
      await globalRiotAPI.validateApiKey('br1'); // Usar região padrão para validação

      // Se chegou aqui, a API key é válida
      await dbManager.setSetting('riot_api_key', apiKey.trim());

      res.json({
        success: true,
        message: 'Riot API Key configurada e validada com sucesso!'
      });

    } catch (validationError: any) {
      res.status(400).json({
        success: false,
        error: `API Key inválida: ${validationError.message}`
      });
    }

  } catch (error: any) {
    console.error('❌ Erro ao configurar Riot API:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}) as RequestHandler);

// Obter status das configurações
app.get('/api/config/status', (async (req: Request, res: Response) => {
  try {
    const riotApiKey = await dbManager.getSetting('riot_api_key');
    const discordToken = await dbManager.getSetting('discord_bot_token');

    res.json({
      success: true,
      config: {
        riotApi: {
          configured: !!(riotApiKey && riotApiKey.trim() !== ''),
          valid: globalRiotAPI.isApiKeyConfigured ? globalRiotAPI.isApiKeyConfigured() : false
        },
        discord: {
          configured: !!(discordToken && discordToken.trim() !== ''),
          connected: discordService.isDiscordConnected(),
          queueSize: discordService.getQueueSize(),
          activeMatches: discordService.getActiveMatches()
        }
      }
    });

  } catch (error: any) {
    console.error('❌ Erro ao obter status das configurações:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}) as RequestHandler);

// Obter configurações do banco de dados (incluindo tokens)
app.get('/api/config/settings', (async (req: Request, res: Response) => {
  try {
    const riotApiKey = await dbManager.getSetting('riot_api_key');
    const discordToken = await dbManager.getSetting('discord_bot_token');

    res.json({
      success: true,
      settings: {
        riotApiKey: riotApiKey || '',
        discordBotToken: discordToken || ''
      }
    });

  } catch (error: any) {
    console.error('❌ Erro ao obter configurações do banco:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}) as RequestHandler);

// === FIM CONFIGURAÇÕES APIs ===

// Endpoint para corrigir status das partidas antigas
app.post('/api/debug/fix-match-status', async (req: Request, res: Response) => {
  try {
    console.log('🔧 [POST /api/debug/fix-match-status] Corrigindo status das partidas antigas...');

    const result = await dbManager.fixMatchStatus();

    res.json({
      success: true,
      message: `${result.affectedMatches} partidas corrigidas e ${result.playerCount} jogadores criados`,
      affectedMatches: result.affectedMatches,
      playerCount: result.playerCount
    });
  } catch (error: any) {
    console.error('❌ [POST /api/debug/fix-match-status] Erro:', error);
    res.status(500).json({ error: error.message });
  }
});

// Endpoint para recalcular LP de partidas customizadas com novo sistema MMR
app.post('/api/admin/recalculate-custom-lp', async (req: Request, res: Response) => {
  try {
    console.log('🔄 [POST /api/admin/recalculate-custom-lp] Recalculando LP de partidas customizadas...');

    const result = await dbManager.recalculateCustomLP();

    res.json({
      success: true,
      message: `LP recalculado para ${result.affectedMatches} partidas e ${result.affectedPlayers} jogadores`,
      affectedMatches: result.affectedMatches,
      affectedPlayers: result.affectedPlayers,
      details: result.details
    });
  } catch (error: any) {
    console.error('❌ [POST /api/admin/recalculate-custom-lp] Erro:', error);
    res.status(500).json({ error: error.message });
  }
});

// Middleware de erro
app.use((error: any, req: Request, res: Response, next: NextFunction) => {
  console.error('Erro não tratado:', error);
  res.status(500).json({ error: 'Erro interno do servidor' });
});

// 404 Handler
app.use((req: Request, res: Response) => {  // Em produção, para rotas não API, tentar servir index.html (SPA routing)
  if (!isDev && !req.path.startsWith('/api/')) {
    // Determinar o caminho para o index.html
    let indexPath: string;

    // Em produção, os arquivos estão diretamente em resources/
    indexPath = path.join(__dirname, '..', 'frontend', 'dist', 'lol-matchmaking', 'browser', 'index.html');

    // Verificar se o arquivo existe
    if (fs.existsSync(indexPath)) {
      return res.sendFile(indexPath);
    } else {
      // Tentar caminhos alternativos
      const altPaths = [
        path.join(process.cwd(), 'frontend', 'dist', 'lol-matchmaking', 'browser', 'index.html'),
        path.join(__dirname, '..', '..', 'frontend', 'dist', 'lol-matchmaking', 'browser', 'index.html'),
        path.join(__dirname, 'frontend', 'dist', 'lol-matchmaking', 'browser', 'index.html')
      ];

      for (const altPath of altPaths) {
        if (fs.existsSync(altPath)) {
          return res.sendFile(altPath);
        }
      }
    }
  }

  // Fallback para 404
  res.status(404).json({ error: 'Rota não encontrada' });
});

// Inicializar servidor
async function startServer() {
  try {
    // Inicializar serviços
    await initializeServices();    // Iniciar servidor
    server.listen(PORT as number, '0.0.0.0', () => {
      console.log(`🚀 Servidor rodando na porta ${PORT}`);
      console.log(`🌐 WebSocket disponível em ws://localhost:${PORT}`);

      if (isDev) {
        console.log(`📱 Frontend Angular: http://localhost:4200`);
        console.log(`🔧 API Base URL: http://localhost:${PORT}/api`);
      }
    });

  } catch (error) {
    console.error('❌ Erro ao inicializar servidor:', error);
    process.exit(1);
  }
}

async function initializeServices() {
  try {
    // Banco de dados
    await dbManager.initialize();
    console.log('✅ Banco de dados inicializado');

    // Carregar API Key do Banco de Dados
    const savedApiKey = await dbManager.getSetting('riot_api_key');
    if (savedApiKey && savedApiKey.trim() !== '') {
      globalRiotAPI.setApiKey(savedApiKey);
      console.log('[Server] Riot API Key carregada do banco de dados.');
      // Opcionalmente, validar a chave carregada aqui também
      try {
        await globalRiotAPI.validateApiKey('br1'); // Use uma região padrão ou a última usada
        console.log('[Server] Riot API Key carregada do banco validada com sucesso.');
      } catch (validationError: any) {
        console.warn('[Server] API Key carregada do banco é inválida ou expirou:', validationError.message);
        // Você pode querer limpar a chave inválida do banco aqui
        // await dbManager.setSetting('riot_api_key', '');
        // E também da instância global para evitar usá-la
        // globalRiotAPI.setApiKey(''); // ou null
      }
    } else {
      // Fallback para .env
      const envApiKey = process.env.RIOT_API_KEY;
      if (envApiKey && envApiKey.trim() !== '') {
        globalRiotAPI.setApiKey(envApiKey);
        console.log('[Server] Riot API Key carregada do .env como fallback.');
        // Salvar no banco para uso futuro
        await dbManager.setSetting('riot_api_key', envApiKey);
        console.log('[Server] Riot API Key do .env salva no banco de dados.');
      } else {
        console.log('[Server] Nenhuma Riot API Key encontrada no banco de dados ou .env.');
      }
    }

    // Matchmaking
    await matchmakingService.initialize();
    console.log('✅ Serviço de matchmaking inicializado');    // LCU
    await lcuService.initialize();

    // Conectar dependências aos serviços
    lcuService.setDatabaseManager(dbManager);
    lcuService.setMatchHistoryService(matchHistoryService);

    // Iniciar monitoramento de partidas
    await lcuService.startGameMonitoring();

    console.log('✅ Conectado ao cliente do League of Legends');

    // Discord Bot
    const savedDiscordToken = await dbManager.getSetting('discord_bot_token');
    if (savedDiscordToken && savedDiscordToken.trim() !== '') {
      console.log('🤖 [Server] Token do Discord Bot encontrado no banco de dados');
      console.log('🤖 [Server] Tentando inicializar Discord Bot...');

      const discordInitialized = await discordService.initialize(savedDiscordToken);
      if (discordInitialized) {
        console.log('✅ [Server] Discord Bot inicializado com sucesso');
        console.log('🔍 [Server] Status após inicialização:', discordService.isDiscordConnected());
      } else {
        console.warn('⚠️ [Server] Falha ao inicializar Discord Bot');
        console.log('🔍 [Server] Status após falha:', discordService.isDiscordConnected());
      }
      // SEMPRE conectar ao WebSocket, independente do status do bot
      discordService.setWebSocketServer(wss);
      console.log('🔗 [Server] DiscordService conectado ao WebSocket');
    } else {
      // Fallback para .env
      const envDiscordToken = process.env.DISCORD_BOT_TOKEN;
      if (envDiscordToken && envDiscordToken.trim() !== '') {
        console.log('🤖 [Server] Token do Discord Bot encontrado no .env (fallback)');
        console.log('🤖 [Server] Tentando inicializar Discord Bot com token do .env...');

        const discordInitialized = await discordService.initialize(envDiscordToken);
        if (discordInitialized) {
          console.log('✅ [Server] Discord Bot inicializado com token do .env como fallback');
          // Salvar no banco para uso futuro
          await dbManager.setSetting('discord_bot_token', envDiscordToken);
          console.log('[Server] Discord Bot Token do .env salvo no banco de dados.');
        } else {
          console.warn('⚠️ [Server] Falha ao inicializar Discord Bot com token do .env');
        }
        // SEMPRE conectar ao WebSocket, independente do status do bot
        discordService.setWebSocketServer(wss);
        console.log('🔗 [Server] DiscordService conectado ao WebSocket');
      } else {
        console.log('⚠️ [Server] Token do Discord Bot não configurado no banco ou .env. Discord será desabilitado.');
        // Mesmo sem token, conectar ao WebSocket para responder com status de desconectado
        discordService.setWebSocketServer(wss);
        console.log('🔗 [Server] DiscordService conectado ao WebSocket (modo desconectado)');
      }
    }

    // Log final do status do Discord Bot
    console.log('🔍 [Server] Status final do Discord Bot após inicialização:', {
      isConnected: discordService.isDiscordConnected(),
      botUsername: discordService.getBotUsername(),
      queueSize: discordService.getQueueSize(),
      activeMatches: discordService.getActiveMatches()
    });
  } catch (error) {
    console.error('Erro ao inicializar serviços:', error);
  }
}

// Tratamento de sinais para shutdown graceful
process.on('SIGINT', async () => {
  console.log('\n🛑 Encerrando servidor...');
  // Fechar conexões WebSocket
  wss.clients.forEach((client: WebSocket) => {
    client.close();
  });

  // Fechar servidor HTTP
  server.close(() => {
    console.log('✅ Servidor encerrado');
    process.exit(0);
  });
});

process.on('SIGTERM', async () => {
  console.log('\n🛑 Encerrando servidor...');
  server.close(() => {
    console.log('✅ Servidor encerrado');
    process.exit(0);
  });
});

// Iniciar aplicação
startServer();

// Rota para atualizar partida após draft completado
app.post('/api/matches/:matchId/draft-completed', (async (req: Request, res: Response) => {
  try {
    const matchId = parseInt(req.params.matchId);
    const { draftData } = req.body;

    console.log(`🎯 [Draft] Atualizando partida ${matchId} após draft completado`);

    await matchmakingService.updateMatchAfterDraft(matchId, draftData);

    res.json({
      success: true,
      message: 'Partida atualizada após draft',
      matchId: matchId
    });
  } catch (error: any) {
    console.error('💥 [Draft] Erro ao atualizar partida após draft:', error);
    res.status(500).json({ error: error.message });
  }
}) as RequestHandler);

// Rota para finalizar partida após jogo completado
app.post('/api/matches/:matchId/game-completed', (async (req: Request, res: Response) => {
  try {
    const matchId = parseInt(req.params.matchId);
    const { winnerTeam, gameData } = req.body;

    console.log(`🏁 [Game] Finalizando partida ${matchId} após jogo - Vencedor: Time ${winnerTeam}`);

    if (!winnerTeam || (winnerTeam !== 1 && winnerTeam !== 2)) {
      return res.status(400).json({ error: 'winnerTeam deve ser 1 ou 2' });
    }

    await matchmakingService.completeMatchAfterGame(matchId, winnerTeam, gameData || {});

    res.json({
      success: true,
      message: 'Partida finalizada com sucesso',
      matchId: matchId,
      winnerTeam: winnerTeam
    });
  } catch (error: any) {
    console.error('💥 [Game] Erro ao finalizar partida:', error);
    res.status(500).json({ error: error.message });
  }
}) as RequestHandler);
