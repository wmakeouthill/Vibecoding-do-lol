import axios, { AxiosInstance } from 'axios';
import * as https from 'https';
import * as fs from 'fs';
import * as path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import { DatabaseManager } from '../database/DatabaseManager';

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
}

export class LCUService {
  private client: AxiosInstance | null = null;
  private connectionInfo: LCUConnectionInfo | null = null;
  private isConnected = false;
  private dbManager: DatabaseManager | null = null;
  private matchHistoryService: any = null;
  private gameMonitorInterval: NodeJS.Timeout | null = null;
  private lastGameflowPhase: string | null = null;
  private currentGameId: string | null = null;
  private riotAPI: any = null; // Add RiotAPIService reference

  constructor(riotAPI?: any) {
    this.riotAPI = riotAPI; // Store the global RiotAPIService instance
  }

  // Método para definir dependências
  setDatabaseManager(dbManager: DatabaseManager): void {
    this.dbManager = dbManager;
  }

  setMatchHistoryService(service: any): void {
    this.matchHistoryService = service;
  }

  async initialize(): Promise<void> {
    try {
      await this.findLeagueClient();
      await this.connectToLCU();
      console.log('✅ Conectado ao League Client Update (LCU)');
    } catch (error) {
      console.log('⚠️ Cliente do League of Legends não encontrado');
      throw error;
    }
  }

  private async findLeagueClient(): Promise<void> {
    try {
      // Método 1: Procurar pelo arquivo lockfile (Windows)
      const lockfilePath = this.findLockfile();
      
      if (lockfilePath && fs.existsSync(lockfilePath)) {
        const lockfileContent = fs.readFileSync(lockfilePath, 'utf8');
        const parts = lockfileContent.split(':');
        
        if (parts.length >= 5) {
          this.connectionInfo = {
            port: parseInt(parts[2]),
            password: parts[3],
            protocol: parts[4].includes('https') ? 'https' : 'http'
          };
          return;
        }
      }

      // Método 2: Procurar processo do League Client via WMIC (Windows)
      const { stdout } = await execAsync(
        'wmic PROCESS WHERE name="LeagueClientUx.exe" GET commandline /value'
      );

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
            return;
          }
        }
      }

      throw new Error('Cliente do League of Legends não encontrado');
    } catch (error) {
      throw new Error('Erro ao procurar cliente do League of Legends');
    }
  }

  private findLockfile(): string | null {
    const possiblePaths = [
      path.join(process.env.LOCALAPPDATA || '', 'Riot Games/League of Legends/lockfile'),
      path.join(process.env.PROGRAMDATA || '', 'Riot Games/League of Legends/lockfile'),
      'C:/Riot Games/League of Legends/lockfile',
      'C:/Program Files/Riot Games/League of Legends/lockfile',
      'C:/Program Files (x86)/Riot Games/League of Legends/lockfile'
    ];

    for (const lockfilePath of possiblePaths) {
      if (fs.existsSync(lockfilePath)) {
        return lockfilePath;
      }
    }

    return null;
  }

  private async connectToLCU(): Promise<void> {
    if (!this.connectionInfo) {
      throw new Error('Informações de conexão não encontradas');
    }

    this.client = axios.create({
      baseURL: `${this.connectionInfo.protocol}://127.0.0.1:${this.connectionInfo.port}`,
      auth: {
        username: 'riot',
        password: this.connectionInfo.password
      },
      httpsAgent: new https.Agent({
        rejectUnauthorized: false
      }),
      timeout: 10000,
      headers: {
        'Content-Type': 'application/json'
      }
    });

    // Testar conexão
    await this.getCurrentSummoner();
    this.isConnected = true;
  }

  async getCurrentSummoner(): Promise<CurrentSummoner> {
    if (!this.client) {
      throw new Error('Cliente LCU não conectado');
    }

    try {
      const response = await this.client.get('/lol-summoner/v1/current-summoner');
      return response.data;
    } catch (error: any) {
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
  }
  async getCurrentMatchDetails(): Promise<any> {
    if (!this.client) {
      throw new Error('Cliente LCU não conectado');
    }

    try {
      const gameflowPhase = await this.getGameflowPhase();
      
      // Check if in champion select
      if (gameflowPhase === 'ChampSelect') {
        const champSelectSession = await this.client.get('/lol-champ-select/v1/session');
        return {
          phase: 'ChampSelect',
          details: champSelectSession.data,
          isInGame: false
        };
      }
      
      // Check if in game
      if (['InProgress', 'WaitingForStats', 'PreEndOfGame', 'EndOfGame'].includes(gameflowPhase)) {
        // Get current game info from the client
        const gameData = await this.client.get('/lol-gameflow/v1/session');
        return {
          phase: gameflowPhase,
          details: gameData.data,
          isInGame: true
        };
      }
      
      return {
        phase: gameflowPhase,
        details: null,
        isInGame: false
      };
    } catch (error) {
      console.error('Error getting current match details:', error);
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
          await this.dbManager.createPlayer(
            summoner.displayName,
            'br1', // região padrão
            summoner.summonerId.toString(),
            summoner.puuid
          );
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
      }, 3000); // Aguarda 3 segundos
      
    } catch (error) {
      console.error('Erro ao processar fim de partida:', error);
    }
  }

  stopGameMonitoring(): void {
    if (this.gameMonitorInterval) {
      clearInterval(this.gameMonitorInterval);
      this.gameMonitorInterval = null;
      console.log('⏹️ Monitoramento de partidas parado');
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

      return {
        isConnected: this.isConnected,
        summoner,
        gameflowPhase: gameflow
      };
    } catch (error) {
      throw new Error('Erro ao obter status do cliente');
    }
  }

  async createCustomLobby(gameMode: string = 'CLASSIC'): Promise<any> {
    if (!this.client) {
      throw new Error('Cliente LCU não conectado');
    }

    const lobbyConfig = {
      customGameLobby: {
        configuration: {
          gameMode: gameMode,
          gameMutator: '',
          gameServerRegion: '',
          mapId: 11,
          mutators: { id: 1 },
          spectatorPolicy: 'AllAllowed',
          teamSize: 5
        },
        lobbyName: 'Matchmaking Custom Game',
        lobbyPassword: ''
      },
      isCustom: true
    };

    try {
      const response = await this.client.post('/lol-lobby/v2/lobby', lobbyConfig);
      console.log('🎮 Lobby customizado criado com sucesso');
      return response.data;
    } catch (error: any) {
      console.error('Erro ao criar lobby:', error.response?.data || error.message);
      throw new Error('Erro ao criar lobby customizado');
    }
  }

  async invitePlayersToLobby(summonerNames: string[]): Promise<void> {
    if (!this.client) {
      throw new Error('Cliente LCU não conectado');
    }

    for (const summonerName of summonerNames) {
      try {
        await this.client.post('/lol-lobby/v2/lobby/invitations', {
          toSummonerName: summonerName
        });
        console.log(`✉️ Convite enviado para ${summonerName}`);
      } catch (error: any) {
        console.error(`❌ Erro ao convidar ${summonerName}:`, error.response?.data || error.message);
      }
    }
  }

  isClientConnected(): boolean {
    return this.isConnected && this.client !== null;
  }
  // Método para buscar dados completos do jogador atual com Riot API
  async getCurrentSummonerWithRiotData(): Promise<any> {
    try {
      if (!this.isConnected) {
        throw new Error('LCU não conectado');
      }

      // 1. Buscar dados básicos do LCU
      const summonerResponse = await this.client!.get('/lol-summoner/v1/current-summoner');
      const summoner = summonerResponse.data;      console.log('📊 Dados completos do LCU:', JSON.stringify(summoner, null, 2));

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

      const response = await this.client!.get(`/lol-match-history/v1/products/lol/current-summoner/matches?begIndex=${startIndex}&endIndex=${startIndex + count}`);
      
      return response.data.games?.games || [];

    } catch (error) {
      console.error('❌ Erro ao buscar histórico de partidas:', error);
      return [];
    }
  }

  // Método para buscar informações de rank atual
  async getCurrentRank(): Promise<any> {
    try {
      if (!this.isConnected) {
        return null;
      }

      const response = await this.client!.get('/lol-ranked/v1/current-ranked-stats');
      return response.data;    } catch (error) {
      console.log('ℹ️ Dados de rank não disponíveis:', error instanceof Error ? error.message : 'Erro desconhecido');
      return null;
    }
  }
}
