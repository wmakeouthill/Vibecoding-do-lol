import axios from 'axios';
import * as https from 'https';
import * as fs from 'fs';
import * as path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import { DatabaseManager } from '../database/DatabaseManager';
import { DataDragonService } from './DataDragonService';

const execAsync = promisify(exec);

interface LCUConnectionInfo {
  port: number;
  password: string;
  protocol: string;
}

interface CurrentSummoner {
  accountId: number;
  displayName: string;
  internalName: string;
  nameChangeFlag: boolean;
  percentCompleteForNextLevel: number;
  privacy: string;
  profileIconId: number;
  puuid: string;
  rerollPoints: any;
  summonerId: number;
  summonerLevel: number;
  unnamed: boolean;
  xpSinceLastLevel: number;
  xpUntilNextLevel: number;
  gameName?: string;  // Adicionado - pode não estar sempre presente
  tagLine?: string;   // Adicionado - pode não estar sempre presente
}

export class LCUService {
  private client: any | null = null;
  private connectionInfo: LCUConnectionInfo | null = null;
  private isConnected = false;
  private dbManager: DatabaseManager | null = null;
  private matchHistoryService: any = null;
  private gameMonitorInterval: NodeJS.Timeout | null = null;
  private lastGameflowPhase: string | null = null;
  private currentGameId: string | null = null;
  private riotAPI: any = null; // Add RiotAPIService reference
  private dataDragonService: DataDragonService; // Add DataDragonService
  private discordService: any = null; // Add DiscordService reference

  constructor(riotAPI?: any) {
    this.riotAPI = riotAPI; // Store the global RiotAPIService instance
    this.dataDragonService = new DataDragonService(); // Initialize DataDragonService
  }

  // Método para definir dependências
  setDatabaseManager(dbManager: DatabaseManager): void {
    this.dbManager = dbManager;
  }

  setMatchHistoryService(service: any): void {
    this.matchHistoryService = service;
  }
  // Método para definir referência ao DiscordService
  setDiscordService(discordService: any): void {
    this.discordService = discordService;
    console.log('🔗 [LCUService] DiscordService conectado para notificações de fim de partida');
  }

  async initialize(): Promise<void> {
    const maxRetries = 3;
    let retryCount = 0;

    while (retryCount < maxRetries) {
      try {
        console.log(`🚀 Tentativa ${retryCount + 1}/${maxRetries} de conectar ao LCU...`);
        await this.findLeagueClient();
        await this.connectToLCU();

        // Carregar dados dos campeões da Data Dragon
        console.log('🔍 Carregando dados dos campeões da Data Dragon...');
        await this.dataDragonService.loadChampions();

        console.log('✅ Conectado ao League Client Update (LCU)');
        return;
      } catch (error) {
        retryCount++;
        console.log(`❌ Tentativa ${retryCount} falhou:`, error);

        if (retryCount < maxRetries) {
          console.log(`⏳ Aguardando 2 segundos antes da próxima tentativa...`);
          await new Promise(resolve => setTimeout(resolve, 2000));
        } else {
          console.log('⚠️ Cliente do League of Legends não encontrado após todas as tentativas');
          throw error;
        }
      }
    }
  }
  private async findLeagueClient(): Promise<void> {
    try {
      console.log('🔍 Procurando cliente do League of Legends...');

      // Método 1: Procurar pelo arquivo lockfile (Windows) - MAIS CONFIÁVEL
      const lockfilePath = this.findLockfile();

      if (lockfilePath && fs.existsSync(lockfilePath)) {
        console.log('📁 Lockfile encontrado em:', lockfilePath);
        const lockfileContent = fs.readFileSync(lockfilePath, 'utf8');
        console.log('📄 Conteúdo do lockfile:', lockfileContent);
        const parts = lockfileContent.split(':');

        if (parts.length >= 5) {
          this.connectionInfo = {
            port: parseInt(parts[2]),
            password: parts[3],
            protocol: parts[4].includes('https') ? 'https' : 'http'
          };
          console.log('✅ Conexão LCU configurada via lockfile:', {
            port: this.connectionInfo.port,
            protocol: this.connectionInfo.protocol
          });
          return;
        }
      } else {
        console.log('❌ Lockfile não encontrado, tentando método alternativo...');
      }

      // Método 2: Procurar processo do League Client via WMIC (Windows)
      console.log('🔍 Procurando processo via WMIC...');
      const { stdout } = await execAsync(
        'wmic PROCESS WHERE name="LeagueClientUx.exe" GET commandline /value'
      );

      console.log('📤 Saída do WMIC:', stdout);

      const lines = stdout.split('\n');
      for (const line of lines) {
        if (line.includes('--app-port=') && line.includes('--remoting-auth-token=')) {
          const portMatch = line.match(/--app-port=(\d+)/);
          const tokenMatch = line.match(/--remoting-auth-token=([a-zA-Z0-9_-]+)/);

          if (portMatch && tokenMatch) {
            this.connectionInfo = {
              port: parseInt(portMatch[1]),
              password: tokenMatch[1],
              protocol: 'https'
            };
            console.log('✅ Conexão LCU configurada via WMIC:', {
              port: this.connectionInfo.port,
              protocol: this.connectionInfo.protocol
            });
            return;
          }
        }
      }

      throw new Error('Cliente do League of Legends não encontrado');
    } catch (error) {
      console.error('❌ Erro ao procurar cliente do LoL:', error);
      throw new Error('Erro ao procurar cliente do League of Legends');
    }
  }
  private findLockfile(): string | null {
    const possiblePaths = [
      // Caminhos mais comuns primeiro
      path.join(process.env.LOCALAPPDATA || '', 'Riot Games/League of Legends/lockfile'),
      path.join(process.env.PROGRAMDATA || '', 'Riot Games/League of Legends/lockfile'),

      // Caminhos alternativos
      'C:/Riot Games/League of Legends/lockfile',
      'C:/Program Files/Riot Games/League of Legends/lockfile',
      'C:/Program Files (x86)/Riot Games/League of Legends/lockfile',

      // Mais caminhos possíveis
      path.join(process.env.USERPROFILE || '', 'AppData/Local/Riot Games/League of Legends/lockfile'),
      path.join(process.env.APPDATA || '', '../Local/Riot Games/League of Legends/lockfile'),
    ];

    console.log('🔍 Procurando lockfile nos seguintes caminhos:');
    for (const lockfilePath of possiblePaths) {
      console.log(`  - ${lockfilePath}`);

      try {
        if (fs.existsSync(lockfilePath)) {
          console.log(`✅ Lockfile encontrado em: ${lockfilePath}`);
          return lockfilePath;
        }
      } catch (error) {
        console.log(`❌ Erro ao verificar: ${lockfilePath}`, error);
      }
    }

    console.log('❌ Lockfile não encontrado em nenhum caminho');
    return null;
  }
  private async connectToLCU(): Promise<void> {
    if (!this.connectionInfo) {
      throw new Error('Informações de conexão não encontradas');
    }

    console.log('🔗 Conectando ao LCU...', {
      protocol: this.connectionInfo.protocol,
      port: this.connectionInfo.port,
      baseURL: `${this.connectionInfo.protocol}://127.0.0.1:${this.connectionInfo.port}`
    });

    this.client = axios.create({
      baseURL: `${this.connectionInfo.protocol}://127.0.0.1:${this.connectionInfo.port}`,
      auth: {
        username: 'riot',
        password: this.connectionInfo.password
      },
      timeout: 15000, // Aumentei o timeout
      headers: {
        'Content-Type': 'application/json'
      },
      // Configurar HTTPS agent para ignorar certificados auto-assinados
      httpsAgent: new https.Agent({
        rejectUnauthorized: false // Ignora certificados auto-assinados do LCU
      })
    });

    try {
      // Testar conexão
      console.log('🧪 Testando conexão com LCU...');
      await this.getCurrentSummoner();
      this.isConnected = true;
      console.log('✅ Conexão LCU estabelecida com sucesso!');
    } catch (error) {
      console.error('❌ Erro ao testar conexão LCU:', error);
      throw error;
    }
  }
  async getCurrentSummoner(): Promise<CurrentSummoner> {
    if (!this.client) {
      throw new Error('Cliente LCU não conectado');
    }

    try {
      console.log('👤 Buscando summoner atual do LCU...');
      const response = await this.client.get('/lol-summoner/v1/current-summoner');

      const summoner = response.data;

      console.log('✅ Summoner encontrado:', {
        displayName: summoner.displayName,
        summonerLevel: summoner.summonerLevel,
        puuid: summoner.puuid ? 'presente' : 'ausente',
        summonerId: summoner.summonerId
      });

      return summoner;
    } catch (error: any) {
      console.error('❌ Erro ao buscar summoner atual:', {
        status: error.response?.status,
        message: error.message,
        url: error.config?.url
      });

      if (error.response?.status === 404) {
        throw new Error('Nenhum invocador logado no cliente');
      }
      throw new Error('Erro ao obter dados do invocador atual');
    }
  }

  async getGameflowPhase(): Promise<string> {
    if (!this.client) {
      throw new Error('Cliente LCU não conectado');
    }

    try {
      const response = await this.client.get('/lol-gameflow/v1/gameflow-phase');
      return response.data;
    } catch (error) {
      return 'Unknown';
    }
  }

  async getGameSession(): Promise<any> {
    if (!this.client) {
      throw new Error('Cliente LCU não conectado');
    }

    try {
      const response = await this.client.get('/lol-gameflow/v1/session');
      return response.data;
    } catch (error) {
      return null;
    }
  } async getCurrentMatchDetails(): Promise<any> {
    if (!this.client) {
      throw new Error('Cliente LCU não conectado');
    }

    try {
      const gameflowPhase = await this.getGameflowPhase();
      console.log(`🔍 [LCU] Gameflow phase atual: ${gameflowPhase}`);

      // Check if in champion select
      if (gameflowPhase === 'ChampSelect') {
        console.log('🎯 [LCU] Em seleção de campeões, buscando dados...');
        const champSelectSession = await this.client.get('/lol-champ-select/v1/session');
        return {
          phase: 'ChampSelect',
          details: champSelectSession.data,
          isInGame: false
        };
      }

      // Check if in game
      if (['InProgress', 'WaitingForStats', 'PreEndOfGame', 'EndOfGame'].includes(gameflowPhase)) {
        console.log(`🎮 [LCU] Em partida (${gameflowPhase}), buscando dados...`);
        // Get current game info from the client
        const gameData = await this.client.get('/lol-gameflow/v1/session');
        return {
          phase: gameflowPhase,
          details: gameData.data,
          isInGame: true
        };
      }

      console.log(`⚠️ [LCU] Fase não ativa para detecção de partida: ${gameflowPhase}`);
      return {
        phase: gameflowPhase,
        details: null,
        isInGame: false
      };
    } catch (error) {
      console.error('💥 [LCU] Error getting current match details:', error);
      return {
        phase: 'Unknown',
        details: null,
        isInGame: false
      };
    }
  }

  // ========== MÉTODOS PARA CAPTURA AUTOMÁTICA (como Porofessor) ==========

  async captureAllPlayerData(): Promise<any> {
    console.log('🔍 Capturando todos os dados do jogador automaticamente...');

    try {
      const summoner = await this.getCurrentSummoner();
      const rankedStats = await this.getRankedStats();
      const champMastery = await this.getChampionMastery();
      const matchHistory = await this.getLocalMatchHistory();

      const playerData = {
        summoner,
        rankedStats,
        champMastery,
        matchHistory,
        capturedAt: new Date().toISOString()
      };

      // Log dos dados capturados (similar ao Porofessor)
      console.log(`📊 Dados capturados para: ${playerData.summoner.displayName}`);
      console.log(`🏆 Level: ${playerData.summoner.summonerLevel}`);
      console.log(`🎮 PUUID: ${playerData.summoner.puuid}`);

      if (playerData.rankedStats) {
        console.log(`⚔️ Ranked: ${JSON.stringify(playerData.rankedStats)}`);
      }

      return playerData;
    } catch (error) {
      console.error('Erro na captura automática:', error);
      throw error;
    }
  }

  async getRankedStats(): Promise<any> {
    if (!this.client) throw new Error('Cliente LCU não conectado');

    try {
      const response = await this.client.get('/lol-ranked/v1/current-ranked-stats');
      return response.data;
    } catch (error) {
      console.error('Erro ao buscar stats ranked:', error);
      return null;
    }
  }

  async getChampionMastery(): Promise<any> {
    if (!this.client) throw new Error('Cliente LCU não conectado');

    try {
      const response = await this.client.get('/lol-collections/v1/inventories/champion-mastery/top');
      return response.data;
    } catch (error) {
      console.error('Erro ao buscar maestria de campeões:', error);
      return null;
    }
  }

  async getLocalMatchHistory(): Promise<any> {
    if (!this.client) throw new Error('Cliente LCU não conectado');

    try {
      const response = await this.client.get('/lol-match-history/v1/products/lol/current-summoner/matches');
      return response.data;
    } catch (error) {
      console.error('Erro ao buscar histórico local:', error);
      return null;
    }
  }

  // ========== MONITORAMENTO AUTOMÁTICO DE PARTIDAS ==========

  async startGameMonitoring(): Promise<void> {
    if (this.gameMonitorInterval) {
      clearInterval(this.gameMonitorInterval);
    }

    console.log('🎮 Iniciando monitoramento de partidas...');

    this.gameMonitorInterval = setInterval(async () => {
      try {
        await this.checkGameStatus();
      } catch (error) {
        // Silencioso para não spammar logs
      }
    }, 5000); // Verifica a cada 5 segundos
  }

  private async checkGameStatus(): Promise<void> {
    if (!this.client) return;

    try {
      const currentPhase = await this.getGameflowPhase();

      // Detectar quando a partida termina
      if (this.lastGameflowPhase === 'InProgress' && currentPhase === 'EndOfGame') {
        console.log('🏁 Partida finalizada! Capturando dados...');
        await this.handleGameEnd();
      }

      // Detectar cancelamento de partida (draft dodge, lobby fechado, etc.)
      if (['ChampSelect', 'InProgress'].includes(this.lastGameflowPhase || '') &&
        ['None', 'Lobby'].includes(currentPhase)) {
        console.log('❌ Partida cancelada/interrompida!');
        await this.handleGameCancel();
      }

      // Detectar início de partida
      if (this.lastGameflowPhase !== 'InProgress' && currentPhase === 'InProgress') {
        console.log('🎮 Partida iniciada!');
        await this.handleGameStart();
      }

      this.lastGameflowPhase = currentPhase;
    } catch (error) {
      // Cliente pode estar desconectado
    }
  }

  private async handleGameStart(): Promise<void> {
    try {
      const gameSession = await this.getGameSession();
      if (gameSession && gameSession.gameId) {
        this.currentGameId = gameSession.gameId.toString();
        console.log(`🎯 Game ID capturado: ${this.currentGameId}`);
      }

      // AUTOMATICAMENTE capturar dados do jogador (como Porofessor)
      try {
        const playerData = await this.captureAllPlayerData();
        console.log('🎮 Dados do jogador capturados automaticamente!');

        // Registrar jogador no banco se não existir
        const summoner = playerData.summoner;
        const existingPlayer = await this.dbManager?.getPlayerBySummonerName(summoner.displayName);

        if (!existingPlayer && this.dbManager) {
          await this.dbManager.createPlayer({
            summoner_name: summoner.displayName,
            summoner_id: summoner.summonerId.toString(),
            puuid: summoner.puuid,
            region: 'br1', // região padrão
            current_mmr: 1000,
            peak_mmr: 1000,
            games_played: 0,
            wins: 0,
            losses: 0,
            win_streak: 0
          });
          console.log(`👤 Jogador ${summoner.displayName} registrado automaticamente`);
        }
      } catch (error) {
        console.error('Erro na captura automática de dados do jogador:', error);
      }
    } catch (error) {
      console.error('Erro ao capturar Game ID:', error);
    }
  }

  private async handleGameEnd(): Promise<void> {
    try {
      // Aguardar um pouco para garantir que os dados estejam disponíveis
      setTimeout(async () => {
        const summoner = await this.getCurrentSummoner();

        // Capturar histórico usando o serviço
        if (this.matchHistoryService) {
          this.matchHistoryService.captureLatestMatch(summoner.puuid, this.currentGameId);
        }

        console.log('📊 Solicitando captura do histórico da partida finalizada');

        // Notificar DiscordService sobre o fim da partida
        if (this.discordService) {
          try {
            // Por enquanto, apenas notificar o fim sem dados específicos
            // O DiscordService tentará encontrar o match correspondente
            await this.discordService.onGameEnd({
              gameId: this.currentGameId
            });
          } catch (error) {
            console.error('❌ Erro ao notificar DiscordService sobre fim de partida:', error);
          }
        }

      }, 3000); // Aguarda 3 segundos

    } catch (error) {
      console.error('Erro ao processar fim de partida:', error);
    }
  }

  private async handleGameCancel(): Promise<void> {
    try {
      console.log('❌ [LCU] Processando cancelamento de partida');

      // Notificar DiscordService sobre o cancelamento
      if (this.discordService) {
        try {
          await this.discordService.onGameCancel({
            gameId: this.currentGameId,
            reason: 'Partida cancelada/interrompida'
          });
        } catch (error) {
          console.error('❌ Erro ao notificar DiscordService sobre cancelamento:', error);
        }
      }

      // Limpar game ID atual
      this.currentGameId = null;

    } catch (error) {
      console.error('Erro ao processar cancelamento de partida:', error);
    }
  }

  // ========== MÉTODOS AUXILIARES ==========

  async getClientStatus(): Promise<any> {
    if (!this.client) {
      throw new Error('Cliente LCU não conectado');
    }

    try {
      const summoner = await this.getCurrentSummoner();
      const gameflow = await this.getGameflowPhase();

      // ✅ PADRONIZAÇÃO COMPLETA: Sempre construir gameName#tagLine como identificador único
      let processedSummoner: any = { ...summoner };
      let gameName: string;
      let tagLine: string;

      // Estratégia 1: Usar dados diretos do LCU se disponíveis
      if (summoner.gameName && summoner.tagLine) {
        gameName = summoner.gameName;
        tagLine = summoner.tagLine;
        console.log('✅ [LCU] Usando gameName e tagLine diretos do LCU:', `${gameName}#${tagLine}`);
      }
      // Estratégia 2: Extrair de displayName se contém #
      else if (summoner.displayName && summoner.displayName.includes('#')) {
        [gameName, tagLine] = summoner.displayName.split('#');
        console.log('✅ [LCU] Extraindo gameName e tagLine do displayName:', `${gameName}#${tagLine}`);
      }
      // Estratégia 3: Tentar endpoint de alias
      else {
        try {
          const aliasResponse = await this.client.get('/lol-summoner/v1/current-summoner/alias');
          if (aliasResponse.data && aliasResponse.data.gameName) {
            gameName = aliasResponse.data.gameName;
            tagLine = aliasResponse.data.tagLine || 'BR1';
            console.log('✅ [LCU] Obtendo gameName e tagLine via endpoint alias:', `${gameName}#${tagLine}`);
          } else {
            throw new Error('Dados de alias não disponíveis');
          }
        } catch (aliasError) {
          console.warn('⚠️ [LCU] Endpoint alias não disponível, usando fallback');
          gameName = summoner.internalName || `Summoner${summoner.summonerId}`;
          tagLine = 'BR1';
          console.log('⚠️ [LCU] Usando fallback para gameName e tagLine:', `${gameName}#${tagLine}`);
        }
      }

      // ✅ GARANTIR: Sempre ter um identificador único válido
      if (!gameName || !tagLine) {
        throw new Error('Não foi possível obter identificador único do jogador');
      }

      // ✅ PADRONIZAÇÃO: Sempre usar gameName#tagLine como displayName
      processedSummoner.gameName = gameName;
      processedSummoner.tagLine = tagLine;
      processedSummoner.displayName = `${gameName}#${tagLine}`;
      processedSummoner.summonerName = processedSummoner.displayName; // Compatibilidade

      console.log('🎯 [LCU] Identificador único padronizado:', processedSummoner.displayName);

      return {
        isConnected: this.isConnected,
        summoner: processedSummoner,
        gameflowPhase: gameflow
      };
    } catch (error) {
      console.error('❌ [LCU] Erro ao obter status do cliente:', error);
      throw new Error('Erro ao obter status do cliente');
    }
  }

  isClientConnected(): boolean {
    return this.isConnected && this.client !== null;
  }

  // ✅ NOVO: Métodos públicos para acessar o cliente LCU de forma segura
  async makeLCURequest(method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE', endpoint: string, data?: any): Promise<any> {
    if (!this.isConnected || !this.client) {
      throw new Error('LCU não conectado');
    }

    try {
      switch (method) {
        case 'GET':
          return await this.client.get(endpoint);
        case 'POST':
          return await this.client.post(endpoint, data);
        case 'PUT':
          return await this.client.put(endpoint, data);
        case 'PATCH':
          return await this.client.patch(endpoint, data);
        case 'DELETE':
          return await this.client.delete(endpoint);
        default:
          throw new Error(`Método HTTP não suportado: ${method}`);
      }
    } catch (error) {
      console.error(`❌ [LCU] Erro na requisição ${method} ${endpoint}:`, error);
      throw error;
    }
  }

  // ✅ NOVO: Método específico para buscar dados do lobby
  async getLobbyData(): Promise<any> {
    return this.makeLCURequest('GET', '/lol-lobby/v2/lobby');
  }

  // ✅ NOVO: Método específico para criar lobby
  async createLobby(lobbyData: any): Promise<any> {
    return this.makeLCURequest('POST', '/lol-lobby/v2/lobby', lobbyData);
  }

  // ✅ NOVO: Método específico para atualizar lobby
  async updateLobby(lobbyData: any): Promise<any> {
    return this.makeLCURequest('PUT', '/lol-lobby/v2/lobby', lobbyData);
  }

  // ✅ NOVO: Método específico para buscar dados da seleção de campeões
  async getChampSelectData(): Promise<any> {
    return this.makeLCURequest('GET', '/lol-champ-select/v1/session');
  }

  // ✅ NOVO: Método específico para executar ação de pick/ban
  async executeChampSelectAction(actionId: string, actionData: any): Promise<any> {
    return this.makeLCURequest('PATCH', `/lol-champ-select/v1/session/actions/${actionId}`, actionData);
  }
  // Método para buscar dados completos do jogador atual com Riot API
  async getCurrentSummonerWithRiotData(): Promise<any> {
    try {
      if (!this.isConnected) {
        throw new Error('LCU não conectado');
      }

      // 1. Buscar dados básicos do LCU
      const summonerResponse = await this.client!.get('/lol-summoner/v1/current-summoner');
      const summoner = summonerResponse.data; console.log('📊 Dados completos do LCU:', JSON.stringify(summoner, null, 2));

      // Tentar diferentes campos para o nome do jogador
      let playerName = summoner.displayName || summoner.internalName || summoner.gameName || 'Unknown';
      let tagLine = summoner.tagLine || '';

      // Se temos gameName e tagLine, usar o formato Riot ID
      if (summoner.gameName) {
        playerName = summoner.gameName;
        if (summoner.tagLine) {
          // Para a Riot API, usar apenas o gameName, mas para exibição podemos mostrar ambos
          console.log('🎮 Nome do jogador encontrado:', `${summoner.gameName}#${summoner.tagLine}`);
        }
      }

      // Se ainda estiver vazio, tentar endpoint alternativo
      if (!playerName || playerName === 'Unknown') {
        try {
          const aliasResponse = await this.client!.get('/lol-summoner/v1/current-summoner/summoner-profile');
          if (aliasResponse.data && aliasResponse.data.displayName) {
            playerName = aliasResponse.data.displayName;
            console.log('🔄 Nome obtido via summoner-profile:', playerName);
          }
        } catch (error) {
          console.log('⚠️ Endpoint summoner-profile não disponível');
        }
      }

      // Se ainda estiver vazio, tentar endpoint de alias
      if (!playerName || playerName === 'Unknown') {
        try {
          const aliasResponse = await this.client!.get('/lol-summoner/v1/current-summoner/alias');
          if (aliasResponse.data && (aliasResponse.data.gameName || aliasResponse.data.displayName)) {
            playerName = aliasResponse.data.gameName || aliasResponse.data.displayName;
            console.log('🔄 Nome obtido via alias:', playerName);
          }
        } catch (error) {
          console.log('⚠️ Endpoint alias não disponível');
        }
      }

      console.log('📊 Nome final do jogador:', playerName);

      // 2. Buscar região do player
      const regionResponse = await this.client!.get('/riotclient/region-locale');
      const region = regionResponse.data.region || 'br1';

      // 3. Buscar dados de ranked (se disponível)
      let rankedData = null;
      try {
        const rankedResponse = await this.client!.get(`/lol-ranked/v1/current-ranked-stats`);
        rankedData = rankedResponse.data;
      } catch (error) {
        console.log('ℹ️ Dados de ranked não disponíveis localmente');
      }      // 4. Buscar dados adicionais via Riot API (se configurada)
      let riotApiData = null;

      // Use the stored riotAPI instance
      if (this.riotAPI && this.riotAPI.isApiKeyConfigured()) {
        try {          // Buscar por nome do summoner se tivermos um nome válido
          if (playerName && playerName !== 'Unknown') {
            riotApiData = await this.riotAPI.getSummoner(playerName, region);
            console.log('🔥 Dados da Riot API obtidos via nome:', playerName);
          } else {
            console.log('⚠️ Nome do jogador não disponível para busca na Riot API');
          }
        } catch (error) {
          console.log('⚠️ Erro ao buscar dados da Riot API:', error instanceof Error ? error.message : 'Erro desconhecido');
        }
      } else {
        console.log('⚠️ Riot API não configurada ou sem chave válida');
      }// 5. Combinar todos os dados
      const completeData = {
        // Dados básicos do LCU
        displayName: playerName,
        gameName: summoner.gameName || playerName,
        tagLine: tagLine,
        summonerId: summoner.summonerId,
        accountId: summoner.accountId,
        puuid: summoner.puuid,
        profileIconId: summoner.profileIconId,
        summonerLevel: summoner.summonerLevel,
        region: region.toLowerCase(),

        // Dados de ranked do LCU (se disponível)
        rankedStats: rankedData,

        // Dados da Riot API (se disponível)
        riotApiData: riotApiData,

        // Timestamp da última atualização
        lastUpdated: new Date().toISOString()
      };

      return completeData;

    } catch (error) {
      console.error('❌ Erro ao buscar dados completos do summoner:', error);
      throw error;
    }
  }
  // Método para buscar histórico de partidas do LCU
  async getMatchHistory(startIndex: number = 0, count: number = 20): Promise<any[]> {
    try {
      if (!this.isConnected) {
        throw new Error('LCU não conectado');
      }

      console.log(`🔍 Buscando histórico LCU: índice ${startIndex}, quantidade ${count}`);
      const response = await this.client!.get(`/lol-match-history/v1/products/lol/current-summoner/matches?begIndex=${startIndex}&endIndex=${startIndex + count}`);

      const basicMatches = response.data.games?.games || [];
      console.log(`📋 Partidas básicas encontradas: ${basicMatches.length}`);

      if (basicMatches.length === 0) {
        return [];
      }

      // Para cada partida, buscar dados detalhados incluindo todos os participantes
      const detailedMatches = [];

      for (const match of basicMatches) {
        try {
          if (match.gameId) {
            console.log(`🔄 Buscando detalhes da partida ${match.gameId}...`);
            const detailedMatch = await this.getMatchDetails(match.gameId);
            if (detailedMatch) {
              // Combinar dados básicos com dados detalhados
              detailedMatches.push({
                ...match,
                ...detailedMatch,
                // Garantir que temos os dados essenciais
                gameId: match.gameId,
                gameCreation: match.gameCreation || detailedMatch.gameCreation,
                gameDuration: match.gameDuration || detailedMatch.gameDuration,
                participants: detailedMatch.participants || [],
                participantIdentities: detailedMatch.participantIdentities || []
              });
            } else {
              // Se não conseguiu dados detalhados, usar só os básicos
              console.log(`⚠️ Usando dados básicos para partida ${match.gameId}`);
              detailedMatches.push(match);
            }
          }
        } catch (error) {
          console.log(`❌ Erro ao buscar detalhes da partida ${match.gameId}:`, error instanceof Error ? error.message : 'Erro desconhecido');
          // Em caso de erro, usar dados básicos
          detailedMatches.push(match);
        }
      }

      console.log(`✅ Partidas detalhadas processadas: ${detailedMatches.length}`);
      return detailedMatches;

    } catch (error) {
      console.error('❌ Erro ao buscar histórico de partidas:', error);
      return [];
    }
  }

  // Novo método para buscar detalhes completos de uma partida específica
  async getMatchDetails(gameId: number): Promise<any | null> {
    try {
      if (!this.isConnected) {
        throw new Error('LCU não conectado');
      }

      // Tentar diferentes endpoints para obter dados completos da partida
      const endpoints = [
        `/lol-match-history/v1/games/${gameId}`,
        `/lol-match-history/v1/products/lol/current-summoner/matches/${gameId}`,
        `/lol-match-history/v3/matchlists/by-account/current/matches/${gameId}`,
        `/lol-match-history/v1/game-timelines/${gameId}`,
        `/lol-match-history/v1/match-details/${gameId}`,
        `/lol-spectator/v1/spectator/delayed-spectator-mode/spectate-game-info/${gameId}`
      ];

      for (const endpoint of endpoints) {
        try {
          console.log(`🔗 Tentando endpoint: ${endpoint}`);
          const response = await this.client!.get(endpoint);

          if (response.data && response.data.participants) {
            console.log(`✅ Dados completos obtidos via ${endpoint}: ${response.data.participants.length} participantes`);

            // Processar participantes com dados da Data Dragon
            const processedData = {
              ...response.data,
              participants: this.dataDragonService.processParticipants(response.data.participants)
            };

            return processedData;
          }
        } catch (error) {
          console.log(`❌ Endpoint ${endpoint} falhou:`, error instanceof Error ? error.message : 'Erro desconhecido');
          continue;
        }
      }

      console.log(`⚠️ Nenhum endpoint retornou dados completos para partida ${gameId}`);
      return null;

    } catch (error) {
      console.error(`❌ Erro ao buscar detalhes da partida ${gameId}:`, error);
      return null;
    }
  }

  // Método para buscar informações de rank atual
  async getCurrentRank(): Promise<any> {
    try {
      if (!this.isConnected) {
        return null;
      }

      const response = await this.client!.get('/lol-ranked/v1/current-ranked-stats');
      return response.data;
    } catch (error) {
      console.log('ℹ️ Dados de rank não disponíveis:', error instanceof Error ? error.message : 'Erro desconhecido');
      return null;
    }
  }

  // Método para salvar resultado de partida customizada
}
