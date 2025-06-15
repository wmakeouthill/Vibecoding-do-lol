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
const matchmakingService = new MatchmakingService(dbManager);
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
      break;
    case 'leave_queue':
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

// PRIMARY ENDPOINT for fetching current player data (LCU + Riot API)
app.get('/api/player/current-details', (async (req: Request, res: Response) => {
  try {
    console.log('[DEBUG] /api/player/current-details endpoint called');
    
    if (!lcuService.isClientConnected()) {
      console.log('[DEBUG] LCU client not connected');
      return res.status(503).json({ error: 'Cliente do LoL não conectado' });
    }

    console.log('[DEBUG] Getting current summoner from LCU...');
    const lcuSummoner = await lcuService.getCurrentSummoner();
    if (!lcuSummoner) {
      console.log('[DEBUG] No summoner data from LCU');
      return res.status(404).json({ error: 'Não foi possível obter dados do jogador no LCU.' });
    }

    console.log('[DEBUG] LCU Summoner data:', {
      gameName: (lcuSummoner as any).gameName,
      tagLine: (lcuSummoner as any).tagLine,
      puuid: lcuSummoner.puuid
    });

    const region = 'br1'; // TODO: Determine region more dynamically if possible
    let riotId = '';
    let accountData = null;

    // PRIMEIRA TENTATIVA: Usar gameName#tagLine do LCU se disponível
    if ((lcuSummoner as any).gameName && (lcuSummoner as any).tagLine) {
      riotId = `${(lcuSummoner as any).gameName}#${(lcuSummoner as any).tagLine}`;
      console.log('[DEBUG] TENTATIVA 1: Using Riot ID from LCU:', riotId);
      
      // Create mock accountData from LCU data
      accountData = {
        gameName: (lcuSummoner as any).gameName,
        tagLine: (lcuSummoner as any).tagLine,
        puuid: lcuSummoner.puuid
      };
    } else if (lcuSummoner.puuid) {
      // SEGUNDA TENTATIVA: Buscar via PUUID se não tem gameName/tagLine no LCU
      console.log('[DEBUG] TENTATIVA 2: Getting account data from Riot API using PUUID:', lcuSummoner.puuid);
      
      try {
        accountData = await globalRiotAPI.getAccountByPuuid(lcuSummoner.puuid, region);
        if (!accountData || !accountData.gameName || !accountData.tagLine) {
          console.log('[DEBUG] Account data missing or incomplete:', accountData);
          return res.status(404).json({ error: 'Não foi possível obter gameName e tagLine da Riot API.' });
        }
        riotId = `${accountData.gameName}#${accountData.tagLine}`;
        console.log('[DEBUG] Got Riot ID from PUUID:', riotId);
      } catch (error: any) {
        console.log('[DEBUG] Failed to get account data from PUUID:', error.message);
        return res.status(404).json({ error: 'Não foi possível obter dados da conta via PUUID.' });
      }
    } else {
      return res.status(404).json({ error: 'Nem gameName/tagLine nem PUUID disponíveis.' });
    }    console.log('[DEBUG] Final Riot ID:', riotId);
    console.log('[DEBUG] Fetching comprehensive player data...');

    // Fetch comprehensive data using PlayerService
    const playerData = await playerService.getPlayerBySummonerNameWithDetails(riotId, region);
    
    // Combine LCU basic info with rich Riot API data
    const comprehensiveData = {
      lcu: lcuSummoner, // Contains LCU specific details like displayName, summonerId, level etc.
      riotAccount: accountData, // Contains gameName, tagLine, puuid from Riot Account API
      riotApi: playerData, // Contains full profile, rank, etc. from other Riot APIs via PlayerService
    };

    console.log('[DEBUG] Successfully compiled comprehensive data');
    res.json({ success: true, data: comprehensiveData });

  } catch (error: any) {
    console.error(`[DEBUG] Erro ao buscar dados detalhados do jogador atual:`, error.message);
    console.error(`[DEBUG] Stack trace:`, error.stack);
    if (error.message.includes('não encontrado') || error.message.includes('Não foi possível obter')) {
      res.status(404).json({ error: error.message });
    } else if (error.message.includes('Chave da Riot API')) {
      res.status(503).json({ error: `Erro na API da Riot: ${error.message}` });
    } else {
      res.status(500).json({ error: 'Erro interno ao processar a solicitação para current-details' });
    }
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



// Remove or comment out old/redundant endpoints:
// app.get('/api/player/current-comprehensive', ...);
// app.get('/api/player/current-browser', ...);
// app.post('/api/player/refresh', ...); // Replaced by refresh-by-riot-id

// ... (keep other LCU, Match History, generic Riot API routes if still needed) ...

// LCU specific routes - these are fine if they serve specific LCU interactions
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
