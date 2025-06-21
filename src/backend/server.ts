import express, { Request, Response, NextFunction, RequestHandler } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { createServer, IncomingMessage } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import * as path from 'path';
import * as fs from 'fs';

import { DatabaseManager } from './database/DatabaseManager';
import { MatchmakingService } from './services/MatchmakingService';
import { PlayerService } from './services/PlayerService';
import { RiotAPIService } from './services/RiotAPIService';
import { LCUService } from './services/LCUService';
import { MatchHistoryService } from './services/MatchHistoryService';

const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server });

const PORT = process.env.PORT || 3000;
const isDev = process.env.NODE_ENV === 'development';

// Global shared instances
const globalRiotAPI = new RiotAPIService();

// Middleware de segurança
app.use(helmet({
  crossOriginEmbedderPolicy: false,
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "https:"],
    },
  },
}));

app.use(cors({
  origin: isDev ? 'http://localhost:4200' : false,
  credentials: true
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 100, // máximo 100 requests por IP
  message: 'Muitas requisições de este IP, tente novamente em 15 minutos.'
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
  switch (data.type) {
    case 'join_queue':
      await matchmakingService.addPlayerToQueue(ws, data.data);
      break;    case 'leave_queue':
      console.log('🔍 Recebida mensagem leave_queue');
      matchmakingService.removePlayerFromQueue(ws);
      break;
    case 'get_queue_status':
      const queueStatus = matchmakingService.getQueueStatus();
      ws.send(JSON.stringify({ type: 'queue_status', data: queueStatus }));
      break;
    case 'ping':
      ws.send(JSON.stringify({ type: 'pong' }));
      break;
    default:
      ws.send(JSON.stringify({ error: 'Tipo de mensagem desconhecido' }));
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

    const playerData = await playerService.getPlayerBySummonerNameWithDetails(riotId, region);
    res.json({ success: true, data: playerData, message: 'Dados do jogador atualizados com sucesso.' });

  } catch (error: any) {
    console.error(`Erro ao atualizar dados do jogador por Riot ID (${req.body.riotId}):`, error.message);
    if (error.message.includes('não encontrado')) {
      res.status(404).json({ error: error.message });
    } else if (error.message.includes('Chave da Riot API')) {
      res.status(503).json({ error: `Erro na API da Riot: ${error.message}` });
    } else {
      res.status(500).json({ error: 'Erro interno ao atualizar dados do jogador.' });
    }
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
    }  } catch (error: any) {
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
app.get('/api/queue/status', (req: Request, res: Response) => {
  const queueStatus = matchmakingService.getQueueStatus();
  res.json(queueStatus);
});

// Rota temporária para adicionar bot na fila (apenas para testes)
app.post('/api/queue/add-bot', async (req: Request, res: Response) => {
  try {
    await matchmakingService.addBotToQueue();
    res.json({ 
      success: true, 
      message: 'Bot adicionado à fila com sucesso' 
    });  } catch (error: any) {
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
      return res.status(503).json({ error: 'Cliente do LoL não conectado' });
    }
    
    // Tentar obter dados da partida atual usando método mais robusto
    const currentMatchDetails = await lcuService.getCurrentMatchDetails();
    
    if (!currentMatchDetails || !currentMatchDetails.details) {
      return res.status(404).json({ error: 'Nenhuma partida ativa encontrada' });
    }

    res.json({
      success: true,
      match: currentMatchDetails
    });

  } catch (error: any) {
    console.error('💥 [LCU Current Match] Erro:', error);
    res.status(503).json({ error: 'Erro ao buscar partida atual do LCU: ' + error.message });
  }
}) as RequestHandler);

// NEW: Update Riot API key in settings
app.post('/api/settings/riot-api-key', (async (req: Request, res: Response) => {
  try {
    const { apiKey } = req.body;

    if (!apiKey || typeof apiKey !== 'string' || apiKey.trim() === '') { // Added trim check
      return res.status(400).json({ error: 'API key inválida ou vazia' });
    }

    // Set API key on global instance
    globalRiotAPI.setApiKey(apiKey);

    try {
      await globalRiotAPI.validateApiKey('br1'); // Or a default/configurable region
      await dbManager.setSetting('riot_api_key', apiKey);
      console.log('[Server] Riot API Key salva no banco de dados e validada.');
      // Re-initialize services that depend on the API key if necessary,
      // or ensure they use the updated globalRiotAPI instance.
      // For now, PlayerService and others use the globalRiotAPI instance, which is updated.
      res.json({ success: true, message: 'API key configurada, validada e salva com sucesso' });
    } catch (validationError: any) {
      console.error('[Server] Erro ao validar a nova API Key:', validationError.message);
      // Do not save an invalid key.
      // Optionally, clear the key in globalRiotAPI if validation fails
      // globalRiotAPI.setApiKey(''); // or null, depending on how RiotAPIService handles it
      res.status(400).json({ error: `API key inválida ou sem permissões: ${validationError.message}. Não foi salva.` });
    }
  } catch (error: any) {
    console.error('[Server] Erro ao configurar API key:', error.message);
    res.status(500).json({ error: 'Erro interno ao configurar a API key.' });
  }
}) as RequestHandler);


// Match history routes
app.get('/api/match-history/:playerId', async (req: Request, res: Response) => {
  try {
    const playerId = parseInt(req.params.playerId);
    const offset = parseInt(req.query.offset as string) || 0;
    const limit = parseInt(req.query.limit as string) || 10;

    const matches = await dbManager.getPlayerMatches(playerId, limit, offset);
    const totalMatches = matches.length; // This is not accurate - should be total count from DB

    res.json({
      success: true,
      matches,
      pagination: {
        offset,
        limit,
        total: totalMatches
      }
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Riot API match history routes
app.get('/api/player/match-history-riot/:puuid', async (req: Request, res: Response) => {
  try {
    const { puuid } = req.params;
    const count = parseInt(req.query.count as string) || 20;
    
    const matchIds = await globalRiotAPI.getMatchHistory(puuid, 'americas', count);
    
    res.json({
      success: true,
      matches: matchIds
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/match/:matchId', async (req: Request, res: Response) => {
  try {
    const { matchId } = req.params;
    
    const matchDetails = await globalRiotAPI.getMatchDetails(matchId, 'americas');
    
    res.json({
      success: true,
      match: matchDetails
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
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

app.get('/api/matches/custom/:playerId', (req: Request, res: Response) => {
  (async () => {
    try {
      const playerIdParam = req.params.playerId;
      const offset = parseInt(req.query.offset as string) || 0;
      const limit = parseInt(req.query.limit as string) || 10;

      console.log('🔍 [GET /api/matches/custom] playerIdParam:', playerIdParam);

      // Usar o playerIdParam diretamente (pode ser ID numérico ou nome)
      let playerIdentifier = playerIdParam;

      // Se é numérico, converter para string para usar com o novo método
      const numericId = parseInt(playerIdParam);
      if (!isNaN(numericId)) {
        playerIdentifier = numericId.toString();
        console.log('✅ [GET /api/matches/custom] ID numérico detectado:', playerIdentifier);
      } else {
        // Se não é numérico, usar como nome/identificador
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

// Endpoint para criar partida personalizada baseada em dados do LCU
app.post('/api/test/create-lcu-based-match', (req: Request, res: Response) => {
  (async () => {
    try {
      const { lcuMatchData, playerIdentifier } = req.body;
    
    if (!lcuMatchData || !playerIdentifier) {
      return res.status(400).json({ 
        error: 'Dados do LCU e identificador do jogador são obrigatórios' 
      });
    }

    console.log('🎮 [CREATE-LCU-MATCH] Criando partida personalizada baseada no LCU:', lcuMatchData.gameId);    // Extrair informações dos participantes - usar AMBOS participants E participantIdentities
    const participants = lcuMatchData.participants || [];
    const participantIdentities = lcuMatchData.participantIdentities || [];
    const team1Players: string[] = [];
    const team2Players: string[] = [];
    const team1Picks: any[] = [];
    const team2Picks: any[] = [];    // Combinar dados de participants (champion info) com participantIdentities (player info)
    const participantsData: any[] = []; // Array para salvar dados completos dos participantes
    
    participants.forEach((participant: any, index: number) => {
      // Buscar dados do jogador correspondente em participantIdentities
      const participantIdentity = participantIdentities.find(
        (identity: any) => identity.participantId === participant.participantId
      );

      let playerName = '';
      
      if (participantIdentity && participantIdentity.player) {
        const player = participantIdentity.player;
        
        // Formar nome real usando dados do participantIdentities
        if (player.gameName && player.tagLine) {
          playerName = `${player.gameName}#${player.tagLine}`;
        } else if (player.summonerName) {
          playerName = player.summonerName;
        } else if (player.gameName) {
          playerName = player.gameName;
        }
      }

      // Se ainda não tem nome, usar fallback genérico
      if (!playerName) {
        playerName = `Player${index + 1}`;
      }

      const playerId = participant.summonerId || participant.participantId || playerName;
      const championId = participant.championId || participant.champion || 0;
      const championName = participant.championName || `Champion${championId}`;
      const lane = participant.lane || participant.teamPosition || 'UNKNOWN';

      // Extrair dados completos do participante (KDA, itens, etc.)
      const participantData = {
        participantId: participant.participantId,
        teamId: participant.teamId,
        championId: championId,
        championName: championName,
        summonerName: playerName,
        lane: lane,
        kills: participant.kills || 0,
        deaths: participant.deaths || 0,
        assists: participant.assists || 0,
        champLevel: participant.champLevel || 1,
        goldEarned: participant.goldEarned || 0,
        totalMinionsKilled: participant.totalMinionsKilled || 0,
        neutralMinionsKilled: participant.neutralMinionsKilled || 0,
        totalDamageDealt: participant.totalDamageDealt || 0,
        totalDamageDealtToChampions: participant.totalDamageDealtToChampions || 0,
        totalDamageTaken: participant.totalDamageTaken || 0,
        wardsPlaced: participant.wardsPlaced || 0,
        wardsKilled: participant.wardsKilled || 0,
        visionScore: participant.visionScore || 0,
        firstBloodKill: participant.firstBloodKill || false,
        doubleKills: participant.doubleKills || 0,
        tripleKills: participant.tripleKills || 0,
        quadraKills: participant.quadraKills || 0,
        pentaKills: participant.pentaKills || 0,
        item0: participant.item0 || 0,
        item1: participant.item1 || 0,
        item2: participant.item2 || 0,
        item3: participant.item3 || 0,
        item4: participant.item4 || 0,
        item5: participant.item5 || 0,
        item6: participant.item6 || 0,
        summoner1Id: participant.summoner1Id || 0,
        summoner2Id: participant.summoner2Id || 0,
        win: participant.win || false
      };
      
      participantsData.push(participantData);

      if (participant.teamId === 100) {
        team1Players.push(playerName); // Usar nome real para melhor identificação
        team1Picks.push({
          champion: championName,
          player: playerName, // Usar nome real
          lane: lane,
          championId: championId
        });
      } else if (participant.teamId === 200) {
        team2Players.push(playerName); // Usar nome real para melhor identificação
        team2Picks.push({
          champion: championName,
          player: playerName, // Usar nome real
          lane: lane,
          championId: championId
        });
      }
    });

    // Garantir que o player identifier está nos times se identificado
    if (playerIdentifier) {
      const playerInTeam1 = team1Players.includes(playerIdentifier);
      const playerInTeam2 = team2Players.includes(playerIdentifier);
      
      // Se o player não está explicitamente nos times, adicionar baseado em heurísticas
      if (!playerInTeam1 && !playerInTeam2) {
        // Por padrão, adicionar ao time 1 se não conseguir determinar
        team1Players.push(playerIdentifier);
        console.log(`✅ Player identifier adicionado ao time 1: ${playerIdentifier}`);
      }
    }

    // Criar dados de pick/ban reais
    const pickBanData = {
      team1Picks: team1Picks,
      team2Picks: team2Picks,
      team1Bans: [], // LCU geralmente não tem dados de ban
      team2Bans: [],
      isReal: true,
      source: 'LCU_MATCH_HISTORY'
    };    // Buscar o jogador para pegar o nome
    let player: any = null;
    if (playerIdentifier.length > 10) {
      player = await dbManager.getPlayerBySummonerName(playerIdentifier);
    } else {
      const numericId = parseInt(playerIdentifier);
      if (!isNaN(numericId)) {
        player = await dbManager.getPlayer(numericId);
      }
    }

    const createdBy = player?.summoner_name || 'Sistema';

    // Criar partida personalizada
    const matchData = {
      title: `Partida LCU ${lcuMatchData.gameId}`,
      description: `Partida baseada em dados reais do LCU - Game ID: ${lcuMatchData.gameId}`,
      team1Players: team1Players,
      team2Players: team2Players,
      createdBy: createdBy,
      gameMode: lcuMatchData.gameMode || 'CLASSIC'
    };    const matchId = await dbManager.createCustomMatch(matchData);
    
    // SEMPRE salvar os dados dos participantes e informações da partida real
    const duration = Math.floor((lcuMatchData.gameDuration || 0) / 60); // Converter para minutos
    
    // Salvar dados completos da partida, independente se terminou ou não
    await dbManager.updateCustomMatchWithRealData(matchId, {
      duration: duration,
      pickBanData: pickBanData,
      participantsData: participantsData,
      detectedByLCU: true,
      riotGameId: lcuMatchData.gameId?.toString(),
      notes: `Partida real do LCU - Game ID: ${lcuMatchData.gameId}`,
      gameMode: lcuMatchData.gameMode || 'CLASSIC'
    });
      // Se a partida já terminou, marcar como completa com vencedor
    if (lcuMatchData.endOfGameResult === 'GameComplete' && lcuMatchData.teams) {
      let winner = null;
      if (lcuMatchData.teams.length >= 2) {
        // LCU retorna "Win"/"Fail" para times, não boolean
        const team1Won = lcuMatchData.teams[0]?.win === "Win" || lcuMatchData.teams[0]?.win === true;
        const team2Won = lcuMatchData.teams[1]?.win === "Win" || lcuMatchData.teams[1]?.win === true;
        winner = team1Won ? 1 : (team2Won ? 2 : null);
        
        console.log('🔍 [CREATE-LCU-MATCH] Detecção de vencedor:', {
          teams: lcuMatchData.teams?.map((t: any) => ({ teamId: t.teamId, win: t.win })),
          team1Won,
          team2Won,
          detectedWinner: winner
        });
      }if (winner) {
        await dbManager.completeCustomMatch(matchId, winner, {
          duration: duration,
          pickBanData: pickBanData,
          participantsData: participantsData,
          detectedByLCU: true,
          riotGameId: lcuMatchData.gameId?.toString(),
          notes: `Partida real finalizada via LCU - ${lcuMatchData.endOfGameResult}`
        });
      }
    }

    console.log('✅ [CREATE-LCU-MATCH] Partida personalizada criada com sucesso:', matchId);

    res.json({
      success: true,
      message: 'Partida personalizada baseada no LCU criada com sucesso',
      matchId: matchId,
      gameId: lcuMatchData.gameId,
      hasRealData: true,
      pickBanData: pickBanData
    });
  } catch (error: any) {
    console.error('💥 [CREATE-LCU-MATCH] Erro:', error);
    res.status(500).json({ error: error.message });
  }
})();
});

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

      console.log(`🎮 [FETCH-SAVE-MATCH] Buscando partida ${gameId} do LCU...`);

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

      // Usar o endpoint existente para processar e salvar os dados
      const participants = matchData.participants || [];
      const participantIdentities = matchData.participantIdentities || [];
      const team1Players: string[] = [];
      const team2Players: string[] = [];
      const team1Picks: any[] = [];
      const team2Picks: any[] = [];

      // Combinar dados de participants com participantIdentities
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
        const lane = participant.lane || participant.teamPosition || participant.individualPosition || 'UNKNOWN';        // Extrair dados completos do participante (dados estão em participant.stats.*)
        const stats = participant.stats || {};
        const timeline = participant.timeline || {};
        
        const participantData = {
          participantId: participant.participantId,
          teamId: participant.teamId,
          championId: championId,
          championName: championName,
          summonerName: playerName,
          riotIdGameName: participantIdentity?.player?.gameName || '',
          riotIdTagline: participantIdentity?.player?.tagLine || '',
          lane: timeline.lane || participant.lane || participant.teamPosition || participant.individualPosition || 'UNKNOWN',
          individualPosition: participant.individualPosition || timeline.lane || lane,
          teamPosition: participant.teamPosition || timeline.lane || lane,
          
          // KDA e estatísticas básicas
          kills: stats.kills || 0,
          deaths: stats.deaths || 0,
          assists: stats.assists || 0,
          champLevel: stats.champLevel || 1,
          
          // Ouro e farm
          goldEarned: stats.goldEarned || 0,
          goldSpent: stats.goldSpent || 0,
          totalMinionsKilled: stats.totalMinionsKilled || 0,
          neutralMinionsKilled: stats.neutralMinionsKilled || 0,
          
          // Dano
          totalDamageDealt: stats.totalDamageDealt || 0,
          totalDamageDealtToChampions: stats.totalDamageDealtToChampions || 0,
          totalDamageTaken: stats.totalDamageTaken || 0,
          magicDamageDealt: stats.magicDamageDealt || 0,
          magicDamageDealtToChampions: stats.magicDamageDealtToChampions || 0,
          physicalDamageDealt: stats.physicalDamageDealt || 0,
          physicalDamageDealtToChampions: stats.physicalDamageDealtToChampions || 0,
          trueDamageDealt: stats.trueDamageDealt || 0,
          trueDamageDealtToChampions: stats.trueDamageDealtToChampions || 0,
          
          // Visão
          wardsPlaced: stats.wardsPlaced || 0,
          wardsKilled: stats.wardsKilled || 0,
          visionScore: stats.visionScore || 0,
          visionWardsBoughtInGame: stats.visionWardsBoughtInGame || 0,
          
          // Conquistas especiais
          firstBloodKill: stats.firstBloodKill || false,
          firstBloodAssist: stats.firstBloodAssist || false,
          firstTowerKill: stats.firstTowerKill || false,
          firstTowerAssist: stats.firstTowerAssist || false,
          
          // Multi-kills
          doubleKills: stats.doubleKills || 0,
          tripleKills: stats.tripleKills || 0,
          quadraKills: stats.quadraKills || 0,
          pentaKills: stats.pentaKills || 0,
          
          // Outras estatísticas
          killingSprees: stats.killingSprees || 0,
          largestKillingSpree: stats.largestKillingSpree || 0,
          largestMultiKill: stats.largestMultiKill || 0,
          longestTimeSpentLiving: stats.longestTimeSpentLiving || 0,
          totalHeal: stats.totalHeal || 0,
          totalTimeCrowdControlDealt: stats.totalTimeCrowdControlDealt || 0,
          timeCCingOthers: stats.timeCCingOthers || 0,
          
          // Objetivos
          turretKills: stats.turretKills || 0,
          inhibitorKills: stats.inhibitorKills || 0,
          damageDealtToObjectives: stats.damageDealtToObjectives || 0,
          damageDealtToTurrets: stats.damageDealtToTurrets || 0,
          damageSelfMitigated: stats.damageSelfMitigated || 0,
          
          // Itens
          item0: stats.item0 || 0,
          item1: stats.item1 || 0,
          item2: stats.item2 || 0,
          item3: stats.item3 || 0,
          item4: stats.item4 || 0,
          item5: stats.item5 || 0,
          item6: stats.item6 || 0,
          
          // Spells
          summoner1Id: participant.spell1Id || 0,
          summoner2Id: participant.spell2Id || 0,
          
          // Runas
          perk0: stats.perk0 || 0,
          perk1: stats.perk1 || 0,
          perk2: stats.perk2 || 0,
          perk3: stats.perk3 || 0,
          perk4: stats.perk4 || 0,
          perk5: stats.perk5 || 0,
          perkPrimaryStyle: stats.perkPrimaryStyle || 0,
          perkSubStyle: stats.perkSubStyle || 0,
          
          // Resultado da partida
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

      // Criar dados de pick/ban
      const pickBanData = {
        team1Picks: team1Picks,
        team2Picks: team2Picks,
        team1Bans: [],
        team2Bans: [],
        isReal: true,
        source: 'LCU_MATCH_DETAILS'
      };

      // Buscar o jogador
      let player: any = null;
      if (playerIdentifier.length > 10) {
        player = await dbManager.getPlayerBySummonerName(playerIdentifier);
      } else {
        const numericId = parseInt(playerIdentifier);
        if (!isNaN(numericId)) {
          player = await dbManager.getPlayer(numericId);
        }
      }

      const createdBy = player?.summoner_name || 'Sistema LCU';

      // Criar partida personalizada
      const customMatchData = {
        title: `Partida LCU ${gameId}`,
        description: `Partida real detectada pelo LCU - Game ID: ${gameId}`,
        team1Players: team1Players,
        team2Players: team2Players,
        createdBy: createdBy,
        gameMode: matchData.gameMode || 'CLASSIC'
      };

      const matchId = await dbManager.createCustomMatch(customMatchData);
        // Calcular duração em minutos
      const duration = Math.floor((matchData.gameDuration || 0) / 60);
      
      // Atualizar com dados completos
      await dbManager.updateCustomMatchWithRealData(matchId, {
        duration: duration,
        pickBanData: pickBanData,
        participantsData: participantsData,
        detectedByLCU: true,
        riotGameId: gameId.toString(),
        notes: `Partida real detectada automaticamente - Game ID: ${gameId}`,
        gameMode: matchData.gameMode || 'CLASSIC'
      });
        // SEMPRE marcar como completa quando confirmada pelo usuário via modal
      // (já que chegou até aqui, significa que o usuário confirmou a partida)
      let winner = null;
      if (matchData.teams && matchData.teams.length >= 2) {
        // LCU retorna "Win"/"Fail" para times, não boolean
        const team1Won = matchData.teams[0]?.win === "Win" || matchData.teams[0]?.win === true;
        const team2Won = matchData.teams[1]?.win === "Win" || matchData.teams[1]?.win === true;
        winner = team1Won ? 1 : (team2Won ? 2 : null);
        
        console.log('🔍 [BACKEND] Detecção de vencedor:', {
          teams: matchData.teams?.map((t: any) => ({ teamId: t.teamId, win: t.win })),
          team1Won,
          team2Won,
          detectedWinner: winner
        });
      }

      // Se não detectou vencedor automaticamente, marcar como completada sem vencedor
      // O usuário pode declarar o vencedor depois
      if (winner) {
        await dbManager.completeCustomMatch(matchId, winner, {
          duration: duration,
          pickBanData: pickBanData,
          participantsData: participantsData,
          detectedByLCU: true,
          riotGameId: gameId.toString(),
          notes: `Partida real finalizada - Vencedor detectado automaticamente`
        });      } else {
        // Marcar como completed mas sem vencedor definido
        await dbManager.updateCustomMatchStatus(matchId, 'completed');
        console.log(`✅ [FETCH-SAVE-MATCH] Partida ${gameId} marcada como completed (sem vencedor detectado)`);
      }

      console.log(`✅ [FETCH-SAVE-MATCH] Partida ${gameId} salva com sucesso: ${matchId}`);

      res.json({
        success: true,
        message: `Partida ${gameId} buscada e salva com sucesso`,
        matchId: matchId,
        gameId: gameId,
        participants: participantsData.length,
        hasCompleteData: true,
        isCompleted: true  // Sempre true já que confirmamos a partida
      });

    } catch (error: any) {
      console.error(`💥 [FETCH-SAVE-MATCH] Erro ao buscar partida ${req.params.gameId}:`, error);
      res.status(500).json({ error: error.message });
    }
  })();
});

// Middleware de erro
app.use((error: any, req: Request, res: Response, next: NextFunction) => {
  console.error('Erro não tratado:', error);
  res.status(500).json({ error: 'Erro interno do servidor' });
});

// 404 Handler
app.use((req: Request, res: Response) => {
  res.status(404).json({ error: 'Rota não encontrada' });
});

// Inicializar servidor
async function startServer() {
  try {
    // Inicializar serviços
    await initializeServices();

    // Iniciar servidor
    server.listen(PORT, () => {
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
      console.log('[Server] Nenhuma Riot API Key encontrada no banco de dados para carregar.');
    }

    // Matchmaking
    await matchmakingService.initialize();
    console.log('✅ Serviço de matchmaking inicializado');

    // LCU
    await lcuService.initialize();
    
    // Conectar dependências aos serviços
    lcuService.setDatabaseManager(dbManager);
    lcuService.setMatchHistoryService(matchHistoryService);
    
    // Iniciar monitoramento de partidas
    await lcuService.startGameMonitoring();
    
    console.log('✅ Conectado ao cliente do League of Legends');
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
