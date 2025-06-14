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
app.post('/api/player/register', async (req: Request, res: Response) => {
  try {
    const { summonerName, region } = req.body;
    const player = await playerService.registerPlayer(summonerName, region);
    res.json({ success: true, player });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

app.get('/api/player/:playerId', async (req: Request, res: Response) => {
  try {
    const player = await playerService.getPlayer(req.params.playerId);
    res.json(player);
  } catch (error: any) {
    res.status(404).json({ error: error.message });
  }
});

app.get('/api/player/:playerId/stats', async (req: Request, res: Response) => {
  try {
    const playerId = parseInt(req.params.playerId);
    const stats = await matchHistoryService.getPlayerStats(playerId);
    res.json({ success: true, stats });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// NEW ROUTE FOR GETTING PLAYER DATA BY PUUID
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
    const summoner = await globalRiotAPI.getSummonerByName(summonerName, region);
    res.json(summoner);
  } catch (error: any) {
    res.status(404).json({ error: error.message });
  }
});

app.get('/api/riot/ranked/:region/:summonerId', async (req: Request, res: Response) => {
  try {
    const { region, summonerId } = req.params;
    const rankedData = await globalRiotAPI.getRankedData(summonerId, region);
    res.json(rankedData);
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

app.get('/api/lcu/current-summoner', async (req: Request, res: Response) => {
  try {
    const summoner = await lcuService.getCurrentSummoner();
    res.json(summoner);
  } catch (error: any) {
    res.status(503).json({ error: 'Não foi possível obter dados do invocador atual' });
  }
});

// NEW: Get comprehensive player data with Riot API integration
app.get('/api/player/current-comprehensive', async (req: Request, res: Response) => {
  try {
    if (!lcuService.isClientConnected()) {
      res.status(503).json({ error: 'Cliente do LoL não conectado' });
      return;
    }

    const comprehensiveData = await lcuService.getCurrentSummonerWithRiotData();
    res.json({ success: true, data: comprehensiveData });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// NEW: Refresh player data endpoint
app.post('/api/player/refresh', async (req: Request, res: Response) => {
  try {
    if (!lcuService.isClientConnected()) {
      res.status(503).json({ error: 'Cliente do LoL não conectado' });
      return;
    }

    const refreshedData = await lcuService.getCurrentSummonerWithRiotData();
    res.json({ success: true, data: refreshedData, message: 'Dados atualizados com sucesso' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// NEW: Get real match history from Riot API
app.get('/api/player/match-history-riot/:puuid', async (req: Request, res: Response) => {
  try {
    const { puuid } = req.params;
    const count = parseInt(req.query.count as string) || 20;
    
    const matchHistory = await globalRiotAPI.getMatchHistory(puuid, 'americas', count);
    
    res.json({ success: true, matches: matchHistory });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// NEW: Get detailed match data from Riot API
app.get('/api/match/:matchId', async (req: Request, res: Response) => {
  try {
    const { matchId } = req.params;
    
    const matchData = await globalRiotAPI.getMatchDetails(matchId, 'americas');
    
    res.json({ success: true, match: matchData });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// NEW: Update Riot API key in settings
app.post('/api/settings/riot-api-key', async (req: Request, res: Response) => {
  try {
    const { apiKey } = req.body;
    
    if (!apiKey || typeof apiKey !== 'string') {
      res.status(400).json({ error: 'API key inválida' });
      return;
    }
    
    // Set API key on global instance
    globalRiotAPI.setApiKey(apiKey);
    
    // Test the API key by making a simple request
    try {
      await globalRiotAPI.validateApiKey('br1');
      res.json({ success: true, message: 'API key configurada com sucesso' });
    } catch (error) {
      res.status(400).json({ error: 'API key inválida ou sem permissões' });
    }
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// NEW: Browser-compatible endpoint for player data (bypasses CORS)
app.get('/api/player/current-browser', async (req: Request, res: Response) => {
  console.log('🌐 [BROWSER] Endpoint /api/player/current-browser chamado');
  try {
    console.log('🔍 Buscando dados do jogador via browser endpoint...');
    console.log('🔗 LCU Service conectado:', lcuService.isClientConnected());
    
    // Get LCU data through backend (works in browser)
    const lcuData = await lcuService.getCurrentSummonerWithRiotData();
    
    console.log('📊 LCU Data recebido:', !!lcuData);
    console.log('📊 LCU Data preview:', JSON.stringify({
      displayName: lcuData?.displayName,
      gameName: lcuData?.gameName,
      tagLine: lcuData?.tagLine,
      summonerId: lcuData?.summonerId
    }));
    
    if (!lcuData) {
      console.log('❌ Nenhum dado LCU encontrado');
      res.status(404).json({ 
        error: 'Jogador não encontrado',
        message: 'League of Legends não está aberto ou jogador não está logado',
        suggestion: 'Abra o League of Legends e faça login'
      });
      return;
    }

    console.log('✅ Dados LCU encontrados, processando...');

    // Try to get additional Riot API data if available
    let enrichedData = lcuData;
    if (globalRiotAPI.isApiKeyConfigured() && (lcuData.gameName || lcuData.displayName)) {
      try {
        const playerName = lcuData.gameName || lcuData.displayName;
        console.log('🎮 Tentando buscar dados da Riot API para:', playerName);
        const riotData = await globalRiotAPI.getSummonerByName(playerName, 'br1');
        enrichedData = {
          ...lcuData,
          riotApiData: riotData
        };
        console.log('✅ Dados da Riot API obtidos');
      } catch (error) {
        console.log('❌ Não foi possível buscar dados da Riot API:', error);
        // Continue with LCU data only
      }
    } else {
      console.log('⚠️ Riot API não configurada ou nome não disponível');
    }

    console.log('🎯 Retornando dados do jogador');
    res.json({
      success: true,
      data: {
        lcuData: enrichedData,
        riotData: enrichedData.riotApiData || null
      },
      source: 'lcu',
      hasRiotData: !!enrichedData.riotApiData
    });

  } catch (error: any) {
    console.error('❌ Erro ao buscar dados do jogador:', error);
    res.status(500).json({ 
      error: 'Erro interno do servidor',
      details: error.message 
    });
  }
});

// TEST: Simple test endpoint
app.get('/api/test-browser', (req: Request, res: Response) => {
  console.log('🧪 Test endpoint chamado');
  res.json({ message: 'Test endpoint funcionando!' });
});

// NEW: Debug endpoint to test LCU method directly
app.get('/api/debug/lcu-summoner', async (req: Request, res: Response) => {
  try {
    console.log('🔧 Debug: Testando método getCurrentSummonerWithRiotData...');
    const result = await lcuService.getCurrentSummonerWithRiotData();
    res.json({
      success: true,
      data: result
    });
  } catch (error: any) {
    console.error('❌ Debug: Erro no método:', error);
    res.status(500).json({
      error: error.message,
      details: error.stack
    });
  }
});

// NEW: Comprehensive status endpoint (LCU + Riot API)
app.get('/api/status/comprehensive', async (req: Request, res: Response) => {
  try {
    const lcuStatus = await lcuService.getClientStatus();
    const riotApiStatus = globalRiotAPI.isApiKeyConfigured();
    
    res.json({
      success: true,
      lcu: {
        connected: lcuStatus.isConnected,
        gameflow: lcuStatus.gameflowPhase || 'None',
        summoner: lcuStatus.summoner || null
      },
      riotApi: {
        configured: riotApiStatus,
        working: riotApiStatus // Could add validation here
      },
      timestamp: new Date().toISOString()
    });
  } catch (error: any) {
    res.status(500).json({ 
      error: 'Erro ao verificar status',
      message: error.message 
    });
  }
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
