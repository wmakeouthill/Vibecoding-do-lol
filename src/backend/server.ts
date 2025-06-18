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
    console.log('[NEW DEBUG] /api/player/current-details endpoint called - v2');
    
    if (!lcuService.isClientConnected()) {
      console.log('[NEW DEBUG] LCU client not connected');
      return res.status(503).json({ error: 'Cliente do LoL não conectado' });
    }

    console.log('[NEW DEBUG] Getting current summoner from LCU...');
    const lcuSummoner = await lcuService.getCurrentSummoner();
    if (!lcuSummoner) {
      console.log('[NEW DEBUG] No summoner data from LCU');
      return res.status(404).json({ error: 'Não foi possível obter dados do jogador no LCU.' });
    }

    console.log('[NEW DEBUG] LCU Summoner data:', {
      gameName: (lcuSummoner as any).gameName,
      tagLine: (lcuSummoner as any).tagLine,
      puuid: lcuSummoner.puuid
    });

    // Check if we have gameName and tagLine
    if (!(lcuSummoner as any).gameName || !(lcuSummoner as any).tagLine) {
      console.log('[NEW DEBUG] LCU data missing gameName or tagLine:', {
        gameName: (lcuSummoner as any).gameName,
        tagLine: (lcuSummoner as any).tagLine
      });
      return res.status(404).json({ error: 'gameName e tagLine não disponíveis no LCU.' });
    }

    const riotId = `${(lcuSummoner as any).gameName}#${(lcuSummoner as any).tagLine}`;
    const region = 'br1';
    
    console.log('[NEW DEBUG] Using Riot ID from LCU:', riotId);

    // Use the exact same logic as refresh-by-riot-id endpoint
    try {
      console.log('[NEW DEBUG] About to call playerService.getPlayerBySummonerNameWithDetails');
      const playerData = await playerService.getPlayerBySummonerNameWithDetails(riotId, region);
      console.log('[NEW DEBUG] playerService returned data successfully');
      
      const comprehensiveData = {
        lcu: lcuSummoner,
        riotAccount: { 
          gameName: (lcuSummoner as any).gameName,
          tagLine: (lcuSummoner as any).tagLine,
          puuid: lcuSummoner.puuid
        },
        riotApi: playerData,
      };

      console.log('[NEW DEBUG] Successfully compiled comprehensive data');
      res.json({ success: true, data: comprehensiveData });
      
    } catch (playerError: any) {
      console.error('[NEW DEBUG] Error fetching player data:', playerError.message);
      res.status(404).json({ error: `Jogador ${riotId} não encontrado: ${playerError.message}` });
    }

  } catch (error: any) {
    console.error(`[NEW DEBUG] Erro ao buscar dados detalhados do jogador atual:`, error.message);
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
    const { playerId, matchData } = req.body;
    
    if (!playerId || !matchData) {
      return res.status(400).json({ error: 'playerId e matchData são obrigatórios' });
    }

    // Save custom match to database
    // For now, we'll use the standard matches table with a custom flag
    const team1Players = matchData.team1Players || [];
    const team2Players = matchData.team2Players || [];
    const avgMMR1 = matchData.averageMMR1 || 1200;
    const avgMMR2 = matchData.averageMMR2 || 1200;

    const matchId = await dbManager.createMatch(team1Players, team2Players, avgMMR1, avgMMR2);
    
    // If the match is already completed, mark it as such
    if (matchData.completed && matchData.winner) {
      await dbManager.completeMatch(matchId, matchData.winner, matchData.mmrChanges || {});
    }

    res.json({
      success: true,
      matchId,
      message: 'Partida customizada salva com sucesso'
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
}) as RequestHandler);

app.get('/api/matches/custom/:playerId', async (req: Request, res: Response) => {
  try {
    const playerId = parseInt(req.params.playerId);
    const offset = parseInt(req.query.offset as string) || 0;
    const limit = parseInt(req.query.limit as string) || 10;

    const matches = await dbManager.getPlayerMatches(playerId, limit, offset);
    
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
    res.status(500).json({ error: error.message });
  }
});

// Current game monitoring route
app.get('/api/lcu/current-match-details', (async (req: Request, res: Response) => {
  try {
    if (!lcuService.isClientConnected()) {
      return res.status(503).json({ 
        success: false,
        error: 'Cliente do LoL não conectado' 
      });
    }

    const matchDetails = await lcuService.getCurrentMatchDetails();
    
    res.json({
      success: true,
      currentGame: matchDetails,
      isInGame: matchDetails.isInGame,
      phase: matchDetails.phase
    });

  } catch (error: any) {
    console.error('❌ Erro ao buscar detalhes da partida atual:', error);
    res.status(500).json({ 
      success: false,
      error: error.message || 'Erro ao buscar status da partida atual'
    });
  }
}) as RequestHandler);

// LCU Match History endpoint
app.get('/api/lcu/match-history', (async (req: Request, res: Response) => {
  try {
    if (!lcuService.isClientConnected()) {
      return res.status(503).json({ 
        success: false,
        error: 'Cliente do LoL não conectado' 
      });
    }

    const startIndex = parseInt(req.query.startIndex as string) || 0;
    const count = parseInt(req.query.count as string) || 20;

    console.log(`📊 Buscando histórico LCU: startIndex=${startIndex}, count=${count}`);
    
    const matches = await lcuService.getMatchHistory(startIndex, count);
    
    if (!matches || matches.length === 0) {
      return res.json({
        success: true,
        matches: [],
        message: 'Nenhuma partida encontrada no histórico do League Client'
      });
    }

    // Filter only real matches (not custom games, avoid practice tool, etc.)
    const realMatches = matches.filter(match => {
      return match.gameMode === 'CLASSIC' || 
             match.gameMode === 'ARAM' ||
             match.gameMode === 'RANKED_SOLO_5x5' ||
             match.gameMode === 'RANKED_FLEX_SR' ||
             match.gameMode === 'RANKED_FLEX_TT';
    });

    console.log(`✅ Partidas reais encontradas: ${realMatches.length}/${matches.length}`);
    
    res.json({
      success: true,
      matches: realMatches,
      totalMatches: matches.length,
      realMatches: realMatches.length
    });

  } catch (error: any) {
    console.error('❌ Erro ao buscar histórico LCU:', error);
    res.status(500).json({ 
      success: false,
      error: error.message || 'Erro ao buscar histórico do League Client'
    });
  }
}) as RequestHandler);

// ===== MATCH LINKING SYSTEM =====

// Create a new match linking session
app.post('/api/match-linking/create', (async (req: Request, res: Response) => {
  try {
    const sessionData = req.body;
    
    console.log('🔗 Criando sessão de vinculação:', sessionData.id);
    
    // Save to database
    const linkingSession = await dbManager.createMatchLinkingSession(sessionData);
    
    res.json({
      success: true,
      session: linkingSession,
      message: 'Sessão de vinculação criada com sucesso'
    });
    
  } catch (error: any) {
    console.error('❌ Erro ao criar sessão de vinculação:', error);
    res.status(500).json({ 
      success: false,
      error: error.message || 'Erro ao criar sessão de vinculação'
    });
  }
}) as RequestHandler);

// Update match linking session
app.put('/api/match-linking/:sessionId', (async (req: Request, res: Response) => {
  try {
    const { sessionId } = req.params;
    const updateData = req.body;
    
    console.log('🔄 Atualizando sessão de vinculação:', sessionId);
    
    const updatedSession = await dbManager.updateMatchLinkingSession(sessionId, updateData);
    
    res.json({
      success: true,
      session: updatedSession,
      message: 'Sessão atualizada com sucesso'
    });
    
  } catch (error: any) {
    console.error('❌ Erro ao atualizar sessão de vinculação:', error);
    res.status(500).json({ 
      success: false,
      error: error.message || 'Erro ao atualizar sessão de vinculação'
    });
  }
}) as RequestHandler);

// Complete match linking with post-game results
app.post('/api/match-linking/complete', (async (req: Request, res: Response) => {
  try {
    const postGameData = req.body;
    
    console.log('🎯 Vinculando resultados pós-jogo para partida:', postGameData.queueMatchId);
    
    // Link the queue match with the real game results
    const linkingResult = await dbManager.completeMatchLinking(postGameData);
    
    // Update player MMR based on results
    await updatePlayerMMRFromResults(postGameData.playerResults);
    
    res.json({
      success: true,
      linkingResult,
      message: 'Resultados vinculados com sucesso'
    });
    
  } catch (error: any) {
    console.error('❌ Erro ao vincular resultados:', error);
    res.status(500).json({ 
      success: false,
      error: error.message || 'Erro ao vincular resultados pós-jogo'
    });
  }
}) as RequestHandler);

// Get linked matches for a player
app.get('/api/match-linking/player/:playerId', (async (req: Request, res: Response) => {
  try {
    const { playerId } = req.params;
    const limit = parseInt(req.query.limit as string) || 20;
    
    const linkedMatches = await dbManager.getLinkedMatches(parseInt(playerId), limit);
    
    res.json({
      success: true,
      matches: linkedMatches,
      count: linkedMatches.length
    });
    
  } catch (error: any) {
    console.error('❌ Erro ao buscar partidas vinculadas:', error);
    res.status(500).json({ 
      success: false,
      error: error.message || 'Erro ao buscar partidas vinculadas'
    });
  }
}) as RequestHandler);

// Get linking statistics
app.get('/api/match-linking/stats', (async (req: Request, res: Response) => {
  try {
    const stats = await dbManager.getMatchLinkingStats();
    
    res.json({
      success: true,
      stats: {
        totalSessions: stats.total || 0,
        successfulLinks: stats.successful || 0,
        successRate: stats.total > 0 ? ((stats.successful / stats.total) * 100).toFixed(1) : '0.0',
        averageLinkTime: stats.averageTime || 0
      }
    });
    
  } catch (error: any) {
    console.error('❌ Erro ao buscar estatísticas:', error);
    res.status(500).json({ 
      success: false,
      error: error.message || 'Erro ao buscar estatísticas de vinculação'
    });
  }
}) as RequestHandler);

// Helper function to update player MMR based on game results
async function updatePlayerMMRFromResults(playerResults: any[]): Promise<void> {
  for (const result of playerResults) {
    if (result.dodged) continue; // Skip players who dodged
    
    try {
      const mmrChange = result.won ? 
        Math.floor(Math.random() * 20) + 10 : // Win: +10 to +30
        -(Math.floor(Math.random() * 15) + 10); // Loss: -10 to -25
      
      await dbManager.updatePlayerMMR(result.playerId, mmrChange);
      console.log(`📊 MMR atualizado para jogador ${result.playerId}: ${mmrChange > 0 ? '+' : ''}${mmrChange}`);
      
    } catch (error) {
      console.error(`❌ Erro ao atualizar MMR do jogador ${result.playerId}:`, error);
    }
  }
}

// ===== EXISTING CODE CONTINUES =====

// Middleware de erro
app.use((error: any, req: Request, res: Response, next: NextFunction) => {
  console.error('Erro não tratado:', error);
  res.status(500).json({ error: 'Erro interno do servidor' });
});

// 404 Handler
app.use((req: Request, res: Response) => {
  res.status(404).json({ error: 'Rota não encontrada' });
});

// Test endpoint to simulate saving a custom match result
app.post('/api/test/save-custom-match', (async (req: Request, res: Response) => {
  try {
    const testMatchData = {
      team1Players: [1, 2, 3, 4, 5],
      team2Players: [6, 7, 8, 9, 10],
      averageMMR1: 1300,
      averageMMR2: 1250,
      winner: Math.random() > 0.5 ? 1 : 2,
      completed: true,
      mmrChanges: {
        1: 15, 2: 12, 3: 18, 4: 10, 5: 14,
        6: -15, 7: -12, 8: -18, 9: -10, 10: -14
      }
    };

    await lcuService.saveCustomMatchResult(testMatchData);
    
    res.json({
      success: true,
      message: 'Partida customizada de teste salva com sucesso',
      matchData: testMatchData
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
}) as RequestHandler);

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
