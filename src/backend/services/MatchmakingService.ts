import { WebSocket } from 'ws';
import { DatabaseManager } from '../database/DatabaseManager';
import { MatchFoundService } from './MatchFoundService';
import { DraftService } from './DraftService';
import { GameInProgressService } from './GameInProgressService';
import { LCUService } from './LCUService';

// Interfaces para jogadores na fila
interface QueuedPlayer {
  id: number;
  summonerName: string;
  region: string;
  currentMMR: number;
  joinTime: Date;
  websocket: WebSocket;
  queuePosition?: number;
  preferences?: {
    primaryLane?: string;
    secondaryLane?: string;
    autoAccept?: boolean;
    assignedLane?: string;
    isAutofill?: boolean;
  };
}



interface QueuedPlayerInfo {
  summonerName: string;
  tagLine?: string;
  primaryLane: string;
  secondaryLane: string;
  primaryLaneDisplay: string;
  secondaryLaneDisplay: string;
  mmr: number;
  queuePosition: number;
  joinTime: Date;
  isCurrentPlayer?: boolean; // ✅ NOVO: Indica se este é o jogador atual
}

interface QueueActivity {
  id: string;
  timestamp: Date;
  type: 'player_joined' | 'player_left' | 'match_created' | 'system_update' | 'queue_cleared';
  message: string;
  playerName?: string;
  playerTag?: string;
  lane?: string;
}

interface QueueStatus {
  playersInQueue: number;
  averageWaitTime: number;
  estimatedMatchTime: number;
  isActive: boolean;
  playersInQueueList?: QueuedPlayerInfo[];
  recentActivities?: QueueActivity[];
  isCurrentPlayerInQueue?: boolean; // Indica se o usuário atual está na fila (calculado no backend)
}

export class MatchmakingService {
  private dbManager: DatabaseManager;
  private wss: any; // WebSocketServer
  private queue: QueuedPlayer[] = []; // ✅ ADICIONADO: Array de jogadores na fila
  private matchmakingInterval: NodeJS.Timeout | null = null;
  private isActive = true;
  private recentActivities: QueueActivity[] = [];
  private readonly MAX_ACTIVITIES = 20;
  private nextMatchId = 1;

  // Throttling para broadcasts
  private lastBroadcastTime = 0;
  private readonly MIN_BROADCAST_INTERVAL = 100; // Mínimo 100ms entre broadcasts para evitar spam

  // ✅ NOVO: Serviços separados
  private matchFoundService: MatchFoundService;
  private draftService: DraftService;
  private gameInProgressService: GameInProgressService;

  // ✅ NOVO: Sistema de sincronização automática do cache com MySQL
  private cacheSyncInterval: NodeJS.Timeout | null = null;
  private readonly CACHE_SYNC_INTERVAL_MS = 5000; // Sincronizar a cada 5 segundos

  private lcuService: LCUService; // Adicionado para acesso ao LCU

  constructor(dbManager: DatabaseManager, wss?: any, discordService?: any, lcuService?: LCUService) {
    this.dbManager = dbManager;
    this.wss = wss;
    this.lcuService = lcuService!;

    console.log('🔍 [Matchmaking] WebSocket Server recebido:', !!wss);
    console.log('🔍 [Matchmaking] WebSocket clients:', wss?.clients?.size || 0);
    console.log('🔍 [Matchmaking] DiscordService recebido:', !!discordService);
    console.log('🔍 [Matchmaking] DiscordService isReady:', discordService?.isReady());
    console.log('🔍 [Matchmaking] DiscordService isConnected:', discordService?.isDiscordConnected());

    // ✅ NOVO: Inicializar serviços separados com DiscordService
    this.matchFoundService = new MatchFoundService(dbManager, wss, discordService);
    this.draftService = new DraftService(dbManager, wss, discordService);
    this.gameInProgressService = new GameInProgressService(dbManager, wss, discordService);

    // ✅ NOVO: Verificar se o DiscordService foi passado corretamente
    console.log('🔍 [Matchmaking] Verificação pós-criação dos serviços:');
    console.log('🔍 [Matchmaking] MatchFoundService tem DiscordService:', !!this.matchFoundService['discordService']);
    console.log('🔍 [Matchmaking] DraftService tem DiscordService:', !!this.draftService['discordService']);
    console.log('🔍 [Matchmaking] GameInProgressService tem DiscordService:', !!this.gameInProgressService['discordService']);

    // ✅ NOVO: Configurar sincronização automática do cache com MySQL
    this.startCacheSyncInterval();
  }

  async initialize(): Promise<void> {
    console.log('🚀 Inicializando MatchmakingService (Refatorado)...');

    // ✅ ADICIONADO: Carregar jogadores da fila persistente
    await this.loadQueueFromDatabase();

    // ✅ ADICIONADO: Adicionar atividades iniciais
    this.addActivity('system_update', 'Sistema de matchmaking inicializado');
    this.addActivity('system_update', 'Aguardando jogadores para a fila');

    // ✅ NOVO: Inicializar serviços separados
    await this.matchFoundService.initialize();
    await this.draftService.initialize();
    await this.gameInProgressService.initialize();

    // ✅ ADICIONADO: Iniciar processamento de matchmaking a cada 5 segundos
    this.startMatchmakingInterval();

    console.log('✅ MatchmakingService inicializado com sucesso (Refatorado)');
  }

  // ✅ ADICIONADO: Método para carregar fila do banco de dados
  private async loadQueueFromDatabase(): Promise<void> {
    try {
      const queuePlayers = await this.dbManager.getActiveQueuePlayers();

      for (const dbPlayer of queuePlayers) {
        const queuedPlayer: QueuedPlayer = {
          id: dbPlayer.player_id,
          summonerName: dbPlayer.summoner_name,
          region: dbPlayer.region,
          currentMMR: dbPlayer.custom_lp || 0,
          joinTime: new Date(dbPlayer.join_time),
          websocket: null as any, // WebSocket será atualizado quando o jogador reconectar
          queuePosition: dbPlayer.queue_position,
          preferences: {
            primaryLane: dbPlayer.primary_lane || 'fill',
            secondaryLane: dbPlayer.secondary_lane || 'fill'
          }
        };

        this.queue.push(queuedPlayer);
      }

      console.log(`📊 Carregados ${this.queue.length} jogadores da fila persistente`);
    } catch (error) {
      console.error('❌ Erro ao carregar fila do banco:', error);
    }
  }

  /**
   * REGRA 1: Para entrar na fila, o sistema deve verificar se o jogador logado 
   * é o mesmo usuário presente no lobby do Discord. Se positivo, uma única linha
   * representando o jogador deve ser inserida na tabela queue_players.
   */
  async addPlayerToQueue(websocket: WebSocket, playerData: any, preferences?: any): Promise<void> {
    try {
      console.log('➕ [Matchmaking] Adicionando jogador à fila:', playerData);

      // ✅ PADRONIZAÇÃO: Sempre usar gameName#tagLine como identificador único
      const playerIdentifier = this.buildPlayerIdentifier(playerData);
      console.log('🎯 [Matchmaking] Identificador único do jogador:', playerIdentifier);

      // ✅ VALIDAÇÃO: Verificar se o identificador é válido
      if (!playerIdentifier) {
        console.error('❌ [Matchmaking] Identificador do jogador inválido:', playerData);
        websocket.send(JSON.stringify({
          type: 'error',
          message: 'Dados do jogador inválidos. Verifique se o League of Legends está conectado.'
        }));
        return;
      }

      // ✅ VALIDAÇÃO DE UNICIDADE: Verificar se já está na fila
      const isAlreadyInQueue = await this.validatePlayerUniqueness(playerIdentifier, playerData.id);
      if (isAlreadyInQueue) {
        console.log(`⚠️ [Matchmaking] Jogador ${playerIdentifier} já está na fila (único registro permitido)`);
        websocket.send(JSON.stringify({
          type: 'error',
          message: 'Você já está na fila'
        }));
        return;
      }

      // ✅ ATUALIZADO: Adicionar à fila local
      const queuedPlayer: QueuedPlayer = {
        id: playerData.id,
        summonerName: playerIdentifier, // ✅ USAR IDENTIFICADOR PADRONIZADO
        region: playerData.region,
        currentMMR: playerData.customLp || 0,
        joinTime: new Date(),
        websocket: websocket,
        queuePosition: this.queue.length + 1,
        preferences: preferences
      };

      this.queue.push(queuedPlayer);

      // REGRA: Garantir registro único - adicionar ao MySQL (única fonte de verdade)
      await this.dbManager.addPlayerToQueue(
        playerData.id,
        playerIdentifier, // ✅ USAR IDENTIFICADOR PADRONIZADO
        playerData.region,
        playerData.customLp || 0,
        preferences
      );

      // Atualizar posições na fila
      await this.updateQueuePositions();

      // Adicionar atividade
      this.addActivity(
        'player_joined',
        `${playerIdentifier} entrou na fila`,
        playerIdentifier,
        preferences?.primaryLane
      );

      // Notificar jogador - baseado nos dados reais da tabela
      const queueStatus = await this.getQueueStatus();
      const playerPosition = this.findPlayerPosition(playerIdentifier, queueStatus.playersInQueueList);

      websocket.send(JSON.stringify({
        type: 'queue_joined',
        data: {
          position: playerPosition,
          estimatedWait: this.calculateEstimatedWaitTime(),
          queueStatus: queueStatus
        }
      }));

      // Broadcast atualização da fila
      await this.broadcastQueueUpdate();

      console.log(`✅ [Matchmaking] ${playerIdentifier} entrou na fila (registro único na tabela queue_players)`);

    } catch (error) {
      console.error('❌ [Matchmaking] Erro ao adicionar jogador à fila:', error);
      websocket.send(JSON.stringify({
        type: 'error',
        message: 'Erro interno ao entrar na fila'
      }));
    }
  }

  // ✅ NOVO: Construir identificador único padronizado
  private buildPlayerIdentifier(playerData: any): string | null {
    // ✅ PRIORIDADE 1: gameName#tagLine (padrão)
    if (playerData.gameName && playerData.tagLine) {
      return `${playerData.gameName}#${playerData.tagLine}`;
    }

    // ✅ PRIORIDADE 2: displayName (se já está no formato correto)
    if (playerData.displayName && playerData.displayName.includes('#')) {
      return playerData.displayName;
    }

    // ✅ PRIORIDADE 3: summonerName (fallback)
    if (playerData.summonerName) {
      return playerData.summonerName;
    }

    console.warn('⚠️ [Matchmaking] Não foi possível construir identificador único:', playerData);
    return null;
  }

  // ✅ NOVO: Validar unicidade do jogador na fila
  private async validatePlayerUniqueness(playerIdentifier: string, playerId?: number): Promise<boolean> {
    try {
      // ✅ VERIFICAR: Fila local
      const existingPlayerIndex = this.queue.findIndex(p => p.id === playerId);
      if (existingPlayerIndex !== -1) {
        console.log(`⚠️ [Matchmaking] Jogador já está na fila local (ID: ${playerId})`);
        return true;
      }

      // ✅ VERIFICAR: Banco de dados (fonte única de verdade)
      const existingQueuePlayers = await this.dbManager.getActiveQueuePlayers();
      const isAlreadyInQueue = existingQueuePlayers.some(dbPlayer =>
        dbPlayer.summoner_name === playerIdentifier ||
        (playerId && dbPlayer.player_id === playerId)
      );

      if (isAlreadyInQueue) {
        console.log(`⚠️ [Matchmaking] Jogador já está na fila no banco de dados: ${playerIdentifier}`);
        return true;
      }

      return false;
    } catch (error) {
      console.error('❌ [Matchmaking] Erro ao validar unicidade do jogador:', error);
      // Em caso de erro, permitir entrada para não bloquear o usuário
      return false;
    }
  }

  /**
   * REGRA 2: Buscar status da fila baseado na fila local
   */
  async getQueueStatus(): Promise<QueueStatus> {
    try {      // ✅ ATUALIZADO: Usar fila local como fonte primária
      const playersCount = this.queue.length;

      // ✅ REDUZIR LOGS: Só logar quando há jogadores
      if (playersCount > 0) {
        console.log(`📊 [Queue Status] Fila local: ${playersCount} jogadores`);
      }

      // Construir lista de jogadores a partir da fila local
      const playersInQueueList: QueuedPlayerInfo[] = this.queue.map(player => {
        const fullName = player.summonerName;
        const nameParts = fullName.split('#');
        const summonerName = nameParts[0];
        const tagLine = nameParts.length > 1 ? nameParts[1] : undefined;

        return {
          summonerName: summonerName,
          tagLine: tagLine,
          primaryLane: player.preferences?.primaryLane || 'fill',
          secondaryLane: player.preferences?.secondaryLane || 'fill',
          primaryLaneDisplay: this.getLaneDisplayName(player.preferences?.primaryLane),
          secondaryLaneDisplay: this.getLaneDisplayName(player.preferences?.secondaryLane),
          mmr: player.currentMMR,
          queuePosition: player.queuePosition || 0,
          joinTime: player.joinTime, // ✅ CORRIGIDO: Será serializado automaticamente como string ISO no JSON
          isCurrentPlayer: false // ✅ NOVO: Indica se este é o jogador atual
        };
      });

      // ✅ REDUZIR LOGS: Só logar quando há jogadores
      if (playersCount > 0) {
        console.log(`✅ [Queue Status] Retornando: ${playersCount} jogadores da fila local`);
      }

      return {
        playersInQueue: playersCount,
        averageWaitTime: this.calculateEstimatedWaitTime(),
        estimatedMatchTime: playersCount >= 10 ? 60 : 120,
        isActive: this.isActive,
        playersInQueueList,
        recentActivities: [...this.recentActivities]
      };
    } catch (error) {
      console.error('❌ [Queue Status] Erro ao buscar da fila local:', error);
      return {
        playersInQueue: 0,
        averageWaitTime: 0,
        estimatedMatchTime: 120,
        isActive: this.isActive,
        playersInQueueList: [],
        recentActivities: [...this.recentActivities]
      };
    }
  }

  /**
   * ✅ NOVO: Buscar status da fila com marcação do jogador atual
   */
  async getQueueStatusWithCurrentPlayer(currentPlayerDisplayName?: string): Promise<QueueStatus> {
    try {
      const queueStatus = await this.getQueueStatus();

      if (!currentPlayerDisplayName || !queueStatus.playersInQueueList) {
        return queueStatus;
      }

      // Marcar o jogador atual na lista
      const playersInQueueList = queueStatus.playersInQueueList.map(player => {
        const playerFullName = player.tagLine ? `${player.summonerName}#${player.tagLine}` : player.summonerName;
        const isCurrentPlayer = playerFullName === currentPlayerDisplayName ||
          player.summonerName === currentPlayerDisplayName ||
          playerFullName.toLowerCase() === currentPlayerDisplayName.toLowerCase() ||
          player.summonerName.toLowerCase() === currentPlayerDisplayName.toLowerCase();

        return {
          ...player,
          isCurrentPlayer
        };
      });

      return {
        ...queueStatus,
        playersInQueueList
      };
    } catch (error) {
      console.error('❌ [Queue Status] Erro ao buscar status com jogador atual:', error);
      return await this.getQueueStatus();
    }
  }

  /**
   * REGRA 3: Remoção da fila por WebSocket - encontrar jogador pelo websocket e remover
   */
  public async removePlayerFromQueue(websocket: WebSocket): Promise<boolean> {
    console.log('🔍 [Matchmaking] Tentando remover jogador da fila via WebSocket');

    try {
      // Encontrar jogador na fila pelo websocket
      const playerIndex = this.queue.findIndex(p => p.websocket === websocket);

      if (playerIndex === -1) {
        console.log('⚠️ [Matchmaking] Jogador não encontrado na fila pelo WebSocket');
        return false;
      }

      const player = this.queue[playerIndex];
      console.log(`🔍 [Matchmaking] Jogador encontrado: ${player.summonerName}`);

      // Remover da fila local
      this.queue.splice(playerIndex, 1);

      // Remover do banco de dados
      await this.dbManager.removePlayerFromQueue(player.id);
      console.log(`✅ [Matchmaking] Jogador ${player.summonerName} removido da fila`);

      // Adicionar atividade
      this.addActivity(
        'player_left',
        `${player.summonerName} saiu da fila`,
        player.summonerName
      );

      // Atualizar posições na fila
      this.queue.forEach((p, index) => {
        p.queuePosition = index + 1;
      });

      // Broadcast atualização da fila
      await this.broadcastQueueUpdate();

      console.log(`➖ [Matchmaking] ${player.summonerName} removido da fila via WebSocket`);
      return true;

    } catch (error) {
      console.error('❌ [Matchmaking] Erro ao remover jogador da fila via WebSocket:', error);
      return false;
    }
  }

  /**
   * REGRA 3b: Remoção da fila por ID ou nome - deletar linha da tabela queue_players
   */
  public async removePlayerFromQueueById(playerId?: number, summonerName?: string): Promise<boolean> {
    console.log(`🔍 [Matchmaking] Tentando remover jogador da fila:`, { playerId, summonerName });
    console.log(`🔍 [Matchmaking] Estado atual da fila local:`, this.queue.map(p => ({ id: p.id, name: p.summonerName, type: typeof p.id })));

    try {
      let removed = false;

      // ✅ PRIORIZAR REMOÇÃO POR SUMMONER_NAME (mais confiável)
      if (summonerName) {
        console.log(`🔍 [Matchmaking] Removendo por summoner_name: ${summonerName}`);

        // ✅ CORREÇÃO: Tentar múltiplos formatos para encontrar o jogador
        const possibleNames = [
          summonerName, // Nome exato como recebido
          summonerName.includes('#') ? summonerName : `${summonerName}#BR1`, // Adicionar #BR1 se não tiver
          summonerName.includes('#') ? summonerName.split('#')[0] : summonerName // Só o gameName se tiver #
        ];

        console.log(`🔍 [Matchmaking] Tentando remover com os seguintes nomes:`, possibleNames);

        // ✅ BUSCAR NA FILA LOCAL PRIMEIRO
        const playerIndex = this.queue.findIndex(p => {
          return possibleNames.some(name =>
            p.summonerName === name ||
            p.summonerName.toLowerCase() === name.toLowerCase() ||
            (p.summonerName.includes('#') && name.includes('#') && p.summonerName === name) ||
            (p.summonerName.includes('#') && !name.includes('#') && p.summonerName.startsWith(name + '#')) ||
            (!p.summonerName.includes('#') && name.includes('#') && name.startsWith(p.summonerName + '#'))
          );
        });

        if (playerIndex !== -1) {
          const player = this.queue[playerIndex];
          console.log(`✅ [Matchmaking] Jogador encontrado na fila local:`, player);

          // Remover da fila local
          this.queue.splice(playerIndex, 1);
          console.log(`✅ [Matchmaking] Jogador removido da fila local. Nova fila:`, this.queue.map(p => ({ id: p.id, name: p.summonerName })));

          // Remover do banco de dados usando summonerName
          console.log(`🔍 [Matchmaking] Removendo jogador ${player.summonerName} da tabela queue_players...`);
          const dbRemoved = await this.dbManager.removePlayerFromQueueBySummonerName(player.summonerName);

          if (dbRemoved) {
            console.log(`✅ [Matchmaking] Jogador ${player.summonerName} removido do banco de dados`);

            // Adicionar atividade
            this.addActivity(
              'player_left',
              `${player.summonerName} saiu da fila`,
              player.summonerName
            );

            removed = true;
          } else {
            console.warn(`⚠️ [Matchmaking] Jogador removido da fila local mas falhou no banco de dados: ${player.summonerName}`);
            removed = true; // Considerar removido pois foi removido da fila local
          }
        } else {
          console.log(`⚠️ [Matchmaking] Jogador não encontrado na fila local por summonerName: ${summonerName}`);

          // Tentar remover direto do banco como fallback
          for (const name of possibleNames) {
            const dbRemoved = await this.dbManager.removePlayerFromQueueBySummonerName(name);
            if (dbRemoved) {
              console.log(`✅ [Matchmaking] Jogador removido do banco com nome: ${name}`);
              removed = true;
              break;
            }
          }
        }
      } else if (playerId) {
        // ✅ FALLBACK: Buscar por ID (com conversão de tipos)
        const playerIndex = this.queue.findIndex(p => Number(p.id) === Number(playerId));
        console.log(`🔍 [Matchmaking] Buscando jogador por ID ${playerId} na fila local:`, playerIndex !== -1 ? 'ENCONTRADO' : 'NÃO ENCONTRADO');

        if (playerIndex !== -1) {
          const player = this.queue[playerIndex];
          console.log(`🔍 [Matchmaking] Jogador encontrado na fila local:`, player);

          // ✅ ATUALIZADO: Remover da fila local
          this.queue.splice(playerIndex, 1);
          console.log(`✅ [Matchmaking] Jogador removido da fila local. Nova fila:`, this.queue.map(p => ({ id: p.id, name: p.summonerName })));

          // REGRA: Deletar linha da tabela usando summonerName (mais confiável)
          console.log(`🔍 [Matchmaking] Removendo jogador ${player.summonerName} da tabela queue_players...`);
          const dbRemoved = await this.dbManager.removePlayerFromQueueBySummonerName(player.summonerName);

          if (dbRemoved) {
            console.log(`✅ [Matchmaking] Linha do jogador ${player.summonerName} deletada da tabela queue_players`);

            // Adicionar atividade
            this.addActivity(
              'player_left',
              `${player.summonerName} saiu da fila`,
              player.summonerName
            );

            removed = true;
          } else {
            console.warn(`⚠️ [Matchmaking] Jogador removido da fila local mas falhou no banco de dados: ${player.summonerName}`);
            removed = true; // Considerar removido pois foi removido da fila local
          }
        } else {
          console.log(`⚠️ [Matchmaking] Jogador com ID ${playerId} não encontrado na fila local`);
        }
      }

      if (!removed) {
        console.log(`⚠️ [Matchmaking] Jogador não encontrado na fila:`, { playerId, summonerName });

        // ✅ DEBUG: Mostrar jogadores atualmente na fila para ajudar no debug
        console.log(`🔍 [Matchmaking] Jogadores atualmente na fila:`,
          this.queue.map(p => ({ id: p.id, name: p.summonerName }))
        );

        return false;
      }

      // ✅ ATUALIZADO: Atualizar posições na fila local
      this.queue.forEach((p, index) => {
        p.queuePosition = index + 1;
      });

      // Broadcast atualização da fila
      await this.broadcastQueueUpdate();

      console.log(`➖ [Matchmaking] Jogador removido da fila com sucesso`);
      return true;

    } catch (error) {
      console.error('❌ [Matchmaking] Erro ao remover jogador da fila:', error);
      return false;
    }
  }

  /**
   * REGRA 3b: Saída da fila por falha em aceitar partida - deletar linha da tabela
   */


  // ✅ ATUALIZADO: Método para atualizar posições na fila (baseado na fila local)
  private async updateQueuePositions(): Promise<void> {
    try {
      // ✅ ATUALIZADO: Usar fila local
      const queuePlayers = [...this.queue];

      // Ordenar por tempo de entrada (joinTime)
      queuePlayers.sort((a, b) => a.joinTime.getTime() - b.joinTime.getTime());

      // ✅ ATUALIZADO: Atualizar posições na fila local
      for (let i = 0; i < queuePlayers.length; i++) {
        const player = queuePlayers[i];
        const newPosition = i + 1;
        if (player.queuePosition !== newPosition) {
          player.queuePosition = newPosition;
          // Atualizar também na tabela
          await this.dbManager.updateQueuePosition(player.id, newPosition);
        }
      }

      console.log(`✅ [Matchmaking] Posições da fila atualizadas: ${queuePlayers.length} jogadores`);
    } catch (error) {
      console.error('❌ [Matchmaking] Erro ao atualizar posições da fila:', error);
    }
  }

  // ✅ ATUALIZADO: Broadcast de atualização da fila baseado na fila local
  public async broadcastQueueUpdate(force: boolean = false): Promise<void> {
    if (!this.wss || !this.wss.clients) {
      return;
    }

    const now = Date.now();

    // Proteção básica contra spam
    if (!force && now - this.lastBroadcastTime < this.MIN_BROADCAST_INTERVAL) {
      console.log(`⏱️ [Matchmaking] Broadcast ignorado (throttling): ${now - this.lastBroadcastTime}ms desde último`);
      return;
    }

    this.lastBroadcastTime = now;

    try {
      // ✅ ATUALIZADO: Usar fila local
      const queueStatus = await this.getQueueStatus();

      console.log(`📡 [Matchmaking] Enviando broadcast para ${this.wss.clients.size} clientes:`, {
        playersInQueue: queueStatus.playersInQueue,
        playersList: queueStatus.playersInQueueList?.map(p => p.summonerName),
        timestamp: now,
        force: force
      });

      // Preparar dados da fila para broadcast
      const broadcastData = {
        type: 'queue_update',
        data: queueStatus,
        timestamp: now,
        queuePlayers: queueStatus.playersInQueueList?.map(player => ({
          summonerName: player.summonerName,
          tagLine: player.tagLine,
          primaryLane: player.primaryLane,
          secondaryLane: player.secondaryLane,
          mmr: player.mmr,
          queuePosition: player.queuePosition,
          joinTime: player.joinTime.toISOString(), // ✅ CORRIGIDO: Serializar como string ISO
          isCurrentPlayer: player.isCurrentPlayer || false // ✅ NOVO: Incluir campo isCurrentPlayer
        })) || []
      };

      // Enviar para todos os clientes conectados
      let sentCount = 0;
      this.wss.clients.forEach((client: WebSocket) => {
        if (client.readyState === WebSocket.OPEN) {
          try {
            client.send(JSON.stringify(broadcastData));
            sentCount++;
          } catch (error) {
            console.error('❌ [Matchmaking] Erro ao enviar atualização da fila:', error);
          }
        }
      });

      console.log(`✅ [Matchmaking] Broadcast enviado para ${sentCount}/${this.wss.clients.size} clientes (fila local)`);

    } catch (error) {
      console.error('❌ [Matchmaking] Erro no broadcast da fila:', error);
    }
  }

  // Métodos auxiliares
  public getLaneDisplayName(laneId?: string): string {
    const lanes: { [key: string]: string } = {
      'top': 'Topo',
      'jungle': 'Selva',
      'mid': 'Meio',
      'bot': 'Atirador',
      'adc': 'Atirador',
      'support': 'Suporte',
      'fill': 'Qualquer'
    };
    return lanes[laneId || 'fill'] || 'Qualquer';
  }

  private calculateEstimatedWaitTime(): number {
    // Tempo estimado simples baseado na quantidade de jogadores necessários
    return Math.max(30, 300); // Entre 30 segundos e 5 minutos
  }

  private findPlayerPosition(summonerName: string, playersList?: QueuedPlayerInfo[]): number {
    if (!playersList) return 0;
    const player = playersList.find(p => p.summonerName === summonerName);
    return player?.queuePosition || 0;
  }

  private addActivity(type: QueueActivity['type'], message: string, playerName?: string, playerTag?: string, lane?: string): void {
    const activity: QueueActivity = {
      id: Date.now().toString() + Math.random().toString(36).substr(2, 5),
      timestamp: new Date(),
      type,
      message,
      playerName,
      playerTag,
      lane
    };

    this.recentActivities.unshift(activity);

    // Manter apenas as últimas atividades
    if (this.recentActivities.length > this.MAX_ACTIVITIES) {
      this.recentActivities = this.recentActivities.slice(0, this.MAX_ACTIVITIES);
    }

    console.log(`📋 [Activity] ${message}`);
  }

  // ✅ ATUALIZADO: Métodos de sistema
  private startMatchmakingInterval(): void {
    // ✅ CORRIGIDO: Processamento automático apenas quando há jogadores suficientes
    this.matchmakingInterval = setInterval(async () => {
      if (this.isActive) {
        // ✅ OTIMIZAÇÃO: Só processar se há pelo menos 10 jogadores
        if (this.queue.length >= 10) {
          await this.processMatchmaking();
        }
      }
    }, 5000);
    console.log('🎯 Matchmaking interval iniciado - só processa com 10+ jogadores');
  }

  // ✅ NOVO: Sincronizar cache local com MySQL
  private async syncCacheWithDatabase(): Promise<void> {
    try {
      const dbQueuePlayers = await this.dbManager.getActiveQueuePlayers();
      const originalCacheSize = this.queue.length;

      // Preservar websockets dos jogadores que ainda estão na fila
      const websocketMap = new Map<number, WebSocket>();
      this.queue.forEach(player => {
        if (player.websocket && player.websocket.readyState === WebSocket.OPEN) {
          websocketMap.set(player.id, player.websocket);
        }
      });

      // Recarregar cache baseado no MySQL (fonte da verdade)
      this.queue = [];

      for (const dbPlayer of dbQueuePlayers) {
        const queuedPlayer: QueuedPlayer = {
          id: dbPlayer.player_id,
          summonerName: dbPlayer.summoner_name,
          region: dbPlayer.region,
          currentMMR: dbPlayer.custom_lp || 0,
          joinTime: new Date(dbPlayer.join_time),
          websocket: websocketMap.get(dbPlayer.player_id) || null as any,
          queuePosition: dbPlayer.queue_position,
          preferences: {
            primaryLane: dbPlayer.primary_lane || 'fill',
            secondaryLane: dbPlayer.secondary_lane || 'fill'
          }
        };

        this.queue.push(queuedPlayer);
      }

      // Só fazer broadcast se houve mudança significativa
      if (originalCacheSize !== this.queue.length) {
        console.log(`🔄 [Matchmaking] Cache sincronizado: ${originalCacheSize} → ${this.queue.length} jogadores`);
        await this.broadcastQueueUpdate(true); // Force broadcast
      }

    } catch (error) {
      console.error('❌ [Matchmaking] Erro ao sincronizar cache com MySQL:', error);
    }
  }

  // ✅ NOVO: Iniciar sincronização automática do cache com MySQL
  private startCacheSyncInterval(): void {
    if (this.cacheSyncInterval) {
      clearInterval(this.cacheSyncInterval);
    }

    console.log('🔄 [Matchmaking] Iniciando sincronização automática de cache a cada 5s...');

    this.cacheSyncInterval = setInterval(async () => {
      try {
        await this.syncCacheWithDatabase();
      } catch (error) {
        console.error('❌ [Matchmaking] Erro na sincronização automática de cache:', error);
      }
    }, this.CACHE_SYNC_INTERVAL_MS);
  }

  private stopCacheSyncInterval(): void {
    if (this.cacheSyncInterval) {
      clearInterval(this.cacheSyncInterval);
      this.cacheSyncInterval = null;
      console.log('🛑 [Matchmaking] Sincronização automática de cache parada');
    }
  }



  // ✅ CORRIGIDO: Processar matchmaking apenas quando necessário
  private async processMatchmaking(): Promise<void> {
    try {
      // ✅ VERIFICAÇÃO: Primeiro verificar se já existe uma partida pending/accepted
      const existingPendingMatches = await this.dbManager.getCustomMatchesByStatus('pending');
      const existingAcceptedMatches = await this.dbManager.getCustomMatchesByStatus('accepted');

      if (existingPendingMatches && existingPendingMatches.length > 0) {
        console.log(`⏳ [Matchmaking] Já existe partida pending (${existingPendingMatches[0].id}), aguardando...`);
        return;
      }

      if (existingAcceptedMatches && existingAcceptedMatches.length > 0) {
        console.log(`⏳ [Matchmaking] Já existe partida accepted (${existingAcceptedMatches[0].id}), aguardando...`);
        return;
      }

      // ✅ NOVO: Sincronizar cache com MySQL antes de verificar quantidade
      await this.syncCacheWithDatabase();

      const queueStatus = await this.getQueueStatus();

      // ✅ DUPLA VERIFICAÇÃO: Cache local E MySQL
      const dbQueuePlayers = await this.dbManager.getActiveQueuePlayers();

      console.log(`🔍 [Matchmaking] Cache local: ${this.queue.length} jogadores`);
      console.log(`🔍 [Matchmaking] MySQL: ${dbQueuePlayers.length} jogadores`);

      // Se há 10 ou mais jogadores no MYSQL (fonte da verdade), processar matchmaking
      if (dbQueuePlayers.length >= 10) {
        console.log(`🎯 [Matchmaking] ${dbQueuePlayers.length} jogadores confirmados no MySQL! Criando partida...`);
        // ✅ CORRIGIDO: Chamar método interno que cria partida
        await this.createMatchFromQueue();
      } else if (this.queue.length >= 10) {
        console.log(`⚠️ [Matchmaking] Cache tem ${this.queue.length} mas MySQL tem apenas ${dbQueuePlayers.length} - sincronizando...`);
      }
    } catch (error) {
      console.error('❌ [Matchmaking] Erro no processamento automático:', error);
    }
  }

  // ✅ CORRIGIDO: Criar partida única quando há 10 jogadores
  private async createMatchFromQueue(): Promise<void> {
    try {
      console.log('🎯 [AutoMatch] Criando partida automaticamente...');

      // ✅ VERIFICAÇÃO: Primeiro verificar se já existe uma partida pending/accepted
      const existingPendingMatches = await this.dbManager.getCustomMatchesByStatus('pending');
      const existingAcceptedMatches = await this.dbManager.getCustomMatchesByStatus('accepted');

      if (existingPendingMatches && existingPendingMatches.length > 0) {
        console.log(`⏳ [AutoMatch] Já existe partida pending (${existingPendingMatches[0].id}), cancelando criação`);
        return;
      }

      if (existingAcceptedMatches && existingAcceptedMatches.length > 0) {
        console.log(`⏳ [AutoMatch] Já existe partida accepted (${existingAcceptedMatches[0].id}), cancelando criação`);
        return;
      }

      // ✅ VERIFICAÇÃO DUPLA: MySQL como fonte da verdade
      const dbQueuePlayers = await this.dbManager.getActiveQueuePlayers();
      if (dbQueuePlayers.length < 10) {
        console.log(`⏳ [AutoMatch] MySQL tem apenas ${dbQueuePlayers.length} jogadores, necessário 10`);
        return;
      }

      // Pegar os 10 primeiros jogadores do MySQL (mais antigos)
      const playersForMatch = dbQueuePlayers.slice(0, 10);

      console.log('🎯 [AutoMatch] Jogadores selecionados do MySQL:', playersForMatch.map((p: any) => ({
        name: p.summoner_name,
        mmr: p.custom_lp || 1200,
        primaryLane: p.primary_lane || 'fill'
      })));

      // Preparar dados dos jogadores para balanceamento
      const playerData = playersForMatch.map((p: any) => ({
        summonerName: p.summoner_name,
        mmr: p.custom_lp || 1200,
        primaryLane: p.primary_lane || 'fill',
        secondaryLane: p.secondary_lane || 'fill'
      }));

      // ✅ CORREÇÃO: Usar método de balanceamento completo com lanes
      console.log('🎯 [AutoMatch] Aplicando balanceamento completo com lanes...');
      const balancedResult = this.balanceTeamsByMMRAndLanes(playerData);

      if (!balancedResult) {
        console.error('❌ [AutoMatch] Falha no balanceamento de times e lanes');
        return;
      }

      const { team1, team2 } = balancedResult;

      // Calcular MMR médio dos times balanceados
      const team1MMR = team1.reduce((sum: number, p: any) => sum + p.mmr, 0) / team1.length;
      const team2MMR = team2.reduce((sum: number, p: any) => sum + p.mmr, 0) / team2.length;

      console.log(`🎯 [AutoMatch] Times balanceados com lanes:`, {
        team1: team1.map(p => ({ name: p.summonerName, lane: p.assignedLane, mmr: p.mmr })),
        team2: team2.map(p => ({ name: p.summonerName, lane: p.assignedLane, mmr: p.mmr })),
        avgMMR: { team1: Math.round(team1MMR), team2: Math.round(team2MMR) }
      });

      // ✅ CORRIGIDO: Criar partida única no banco com status 'pending'
      const matchId = await this.dbManager.createCustomMatch({
        title: `Partida Automática ${Date.now()}`,
        description: `Partida criada automaticamente - MMR: Team1(${Math.round(team1MMR)}) vs Team2(${Math.round(team2MMR)})`,
        team1Players: team1.map(p => p.summonerName),
        team2Players: team2.map(p => p.summonerName),
        createdBy: 'Sistema',
        gameMode: 'Ranked 5v5',
        draft_data: JSON.stringify({
          team1: team1,
          team2: team2,
          averageMMR: { team1: team1MMR, team2: team2MMR },
          phase: 'bans',
          currentAction: 0,
          phases: [],
          actions: []
        }),
        pick_ban_data: JSON.stringify({
          team1: team1,
          team2: team2,
          team1Picks: [],
          team2Picks: [],
          team1Bans: [],
          team2Bans: [],
          actions: []
        })
      });

      if (matchId) {
        console.log(`✅ [AutoMatch] Partida ${matchId} criada automaticamente!`);

        // ✅ CORREÇÃO: Salvar dados preliminares de lane e composição no banco
        const preliminaryData = {
          team1Players: team1.map(p => p.summonerName),
          team2Players: team2.map(p => p.summonerName),
          averageMMR: { team1: team1MMR, team2: team2MMR },
          lanes: {
            team1: team1.map((p: any) => ({
              player: p.summonerName,
              lane: p.assignedLane,
              teamIndex: p.teamIndex,
              mmr: p.mmr,
              isAutofill: p.isAutofill
            })),
            team2: team2.map((p: any) => ({
              player: p.summonerName,
              lane: p.assignedLane,
              teamIndex: p.teamIndex,
              mmr: p.mmr,
              isAutofill: p.isAutofill
            }))
          }
        };

        // ✅ CORREÇÃO: Atualizar partida com dados preliminares
        await this.dbManager.updateCustomMatch(matchId, {
          draft_data: JSON.stringify(preliminaryData),
          pick_ban_data: JSON.stringify({
            team1Picks: [],
            team2Picks: [],
            team1Bans: [],
            team2Bans: [],
            isReal: true,
            source: 'AUTO_MATCHMAKING'
          })
        });

        // Adicionar atividade
        this.addActivity(
          'match_created',
          `Partida ${matchId} criada automaticamente! 10adores encontrados - MMR médio: Team1(${Math.round(team1MMR)}) vs Team2(${Math.round(team2MMR)})`
        );

        // ✅ CORREÇÃO: Usar MatchFoundService para notificação padronizada
        console.log('🎯 [AutoMatch] === DADOS PARA MATCHFOUNDSERVICE ===');
        console.log('🎯 [AutoMatch] team1Players:', team1.map(p => p.summonerName));
        console.log('🎯 [AutoMatch] team2Players:', team2.map(p => p.summonerName));
        console.log('🎯 [AutoMatch] averageMMR:', { team1: team1MMR, team2: team2MMR });
        console.log('🎯 [AutoMatch] balancedTeams:', {
          team1: team1.map(p => ({ name: p.summonerName, lane: p.assignedLane, mmr: p.mmr })),
          team2: team2.map(p => ({ name: p.summonerName, lane: p.assignedLane, mmr: p.mmr }))
        });
        console.log('🎯 [AutoMatch] matchId:', matchId);

        await this.matchFoundService.createMatchForAcceptance({
          team1Players: team1.map(p => p.summonerName),
          team2Players: team2.map(p => p.summonerName),
          averageMMR: { team1: team1MMR, team2: team2MMR },
          balancedTeams: { team1, team2 },
          matchId: matchId
        });

        // ✅ CORREÇÃO: Aceitar automaticamente a partida para bots APÓS notificar
        await this.autoAcceptMatchForBots(matchId, team1, team2);

        // ✅ NOVO: NÃO chamar notifyMatchFound aqui - apenas o MatchFoundService deve notificar
        console.log(`✅ [AutoMatch] Notificação delegada para MatchFoundService - partida ${matchId}`);

        // ✅ IMPORTANTE: NÃO REMOVER JOGADORES DA FILA AINDA
        // Eles serão removidos apenas quando aceitarem a partida
        console.log(`🎉 [AutoMatch] Partida ${matchId} criada, aguardando aceitação dos jogadores`);

      } else {
        console.error('❌ [AutoMatch] Falha ao criar partida');
      }

    } catch (error) {
      console.error('❌ [AutoMatch] Erro no matchmaking automático:', error);
    }
  }

  public shutdown(): void {
    this.isActive = false;

    if (this.matchmakingInterval) {
      clearInterval(this.matchmakingInterval);
      this.matchmakingInterval = null;
    }

    // ✅ NOVO: Desligar serviços separados
    this.matchFoundService.shutdown();
    this.draftService.shutdown();
    this.gameInProgressService.shutdown();

    console.log('🛑 MatchmakingService desligado (Refatorado)');
  }

  // ✅ ATUALIZADO: Método para obter fila atual
  public getQueue(): QueuedPlayer[] {
    return [...this.queue];
  }

  /**
   * Verificar se um jogador está na fila consultando a tabela queue_players
   * @param displayName - Display name no formato "gameName#tagLine"
   * @returns Promise<boolean> - true se o jogador está na fila
   */
  public async isPlayerInQueue(displayName: string): Promise<boolean> {
    try {
      console.log(`🔍 [Matchmaking] Verificando se ${displayName} está na fila...`);

      // Buscar na tabela queue_players (fonte de verdade)
      const activeQueuePlayers = await this.dbManager.getActiveQueuePlayers();

      const isInQueue = activeQueuePlayers.some(dbPlayer =>
        dbPlayer.summoner_name === displayName
      );

      console.log(`${isInQueue ? '✅' : '❌'} [Matchmaking] ${displayName} ${isInQueue ? 'está' : 'não está'} na fila`);

      return isInQueue;
    } catch (error) {
      console.error(`❌ [Matchmaking] Erro ao verificar se ${displayName} está na fila:`, error);
      return false;
    }
  }

  // Método para adicionar jogador à fila via Discord (com verificação)
  async addPlayerToDiscordQueue(websocket: WebSocket, requestData: any): Promise<void> {
    try {
      console.log('📱 [Discord] addPlayerToDiscordQueue chamado:', requestData);

      // ✅ NOVA VALIDAÇÃO: Usar gameName#tagLine diretamente
      if (!requestData || !requestData.gameName || !requestData.tagLine) {
        throw new Error('gameName e tagLine são obrigatórios');
      }

      // ✅ ATUALIZADO: Buscar jogador diretamente por gameName#tagLine
      const fullSummonerName = `${requestData.gameName}#${requestData.tagLine}`;
      console.log('🔍 [Discord] Buscando jogador por summonerName:', fullSummonerName);

      // Buscar jogador no banco por summonerName
      let player = await this.dbManager.getPlayerBySummonerName(fullSummonerName);

      if (!player) {
        console.log('❌ [Discord] Jogador não encontrado no banco, criando automaticamente...');

        // NOVO: Buscar puuid do LCU antes de criar o jogador
        let puuid: string | undefined = undefined;
        let summonerId: string | undefined = undefined;
        if (this.lcuService && this.lcuService.isClientConnected()) {
          try {
            const lcuSummoner = await this.lcuService.getCurrentSummoner();
            if (
              lcuSummoner &&
              lcuSummoner.gameName === requestData.gameName &&
              lcuSummoner.tagLine === requestData.tagLine
            ) {
              puuid = lcuSummoner.puuid;
              summonerId = lcuSummoner.summonerId?.toString();
            }
          } catch (err) {
            console.error('❌ [Discord] Erro ao buscar puuid do LCU:', err);
          }
        }

        if (!puuid) {
          websocket.send(JSON.stringify({
            type: 'error',
            message: 'Não foi possível obter o PUUID do jogador via LCU. Certifique-se de estar logado no LoL com o mesmo Riot ID.'
          }));
          return;
        }

        const newPlayerData = {
          summoner_name: fullSummonerName,
          summoner_id: summonerId || requestData.discordId || '0',
          puuid: puuid,
          region: 'br1',
          current_mmr: 1200,
          peak_mmr: 1200,
          games_played: 0,
          wins: 0,
          losses: 0,
          win_streak: 0,
          custom_mmr: 1200,
          custom_peak_mmr: 1200,
          custom_games_played: 0,
          custom_wins: 0,
          custom_losses: 0,
          custom_win_streak: 0,
          custom_lp: 1200
        };

        const playerId = await this.dbManager.createPlayer(newPlayerData);
        player = await this.dbManager.getPlayer(playerId);

        if (!player) {
          throw new Error('Falha ao criar jogador no banco de dados');
        }

        console.log('✅ [Discord] Jogador criado automaticamente:', player.summoner_name);
      }

      // Preparar dados do jogador para adicionar à fila
      const playerData = {
        id: player.id,
        gameName: requestData.gameName,
        tagLine: requestData.tagLine,
        summonerName: fullSummonerName,
        region: player.region,
        customLp: player.custom_lp || 1200
      };

      // ✅ USAR addPlayerToQueue NORMAL (que já tem toda a lógica de validação)
      await this.addPlayerToQueue(websocket, playerData, requestData.preferences);

      console.log(`✅ [Discord] ${fullSummonerName} entrou na fila via Discord com sucesso`);

    } catch (error: any) {
      console.error('❌ [Discord] Erro ao adicionar jogador à fila via Discord:', error);
      websocket.send(JSON.stringify({
        type: 'error',
        message: 'Falha ao entrar na fila: ' + error.message
      }));
    }
  }

  async forceMySQLSync(): Promise<void> {
    console.log('🔄 forceMySQLSync chamado - tabela queue_players é sempre sincronizada');
    // Em MySQL Only mode, não há sync necessário - tabela é sempre a única fonte
  }

  async addBotToQueue(): Promise<void> {
    try {
      // ✅ NOVO: Usar contador sequencial para bots
      const botNumber = this.getNextBotNumber();
      const botName = `Bot${botNumber}`;
      const randomMMR = Math.floor(Math.random() * 1200) + 800;
      const lanes = ['top', 'jungle', 'mid', 'bot', 'support'];
      const primaryLane = lanes[Math.floor(Math.random() * lanes.length)];
      const secondaryLane = lanes[Math.floor(Math.random() * lanes.length)];

      // ✅ ATUALIZADO: Adicionar à fila local
      const botPlayer: QueuedPlayer = {
        id: -botNumber, // ID negativo para bots
        summonerName: botName,
        region: 'br1',
        currentMMR: randomMMR,
        joinTime: new Date(),
        websocket: null as any, // Bots não têm WebSocket
        queuePosition: this.queue.length + 1,
        preferences: {
          primaryLane: primaryLane,
          secondaryLane: secondaryLane,
          autoAccept: true
        }
      };

      this.queue.push(botPlayer);

      // ✅ SIMPLIFICADO: Adicionar diretamente à fila (sem FOREIGN KEY)
      await this.dbManager.addPlayerToQueue(
        -botNumber, // ID negativo para bots
        botName,
        'br1',
        randomMMR,
        { primaryLane, secondaryLane }
      );

      await this.updateQueuePositions();

      this.addActivity(
        'player_joined',
        `🤖 ${botName} (Bot) entrou na fila como ${primaryLane}`,
        botName,
        undefined,
        primaryLane
      );

      await this.broadcastQueueUpdate();
      console.log(`🤖 Bot ${botName} adicionado à fila local e tabela queue_players - Lane: ${primaryLane}, MMR: ${randomMMR}, ID: ${-botNumber}`);
    } catch (error) {
      console.error('❌ Erro ao adicionar bot à fila:', error);
      throw error; // Re-throw para que o endpoint possa retornar erro
    }
  }

  // ✅ NOVO: Contador sequencial para bots
  private botCounter = 0;

  private getNextBotNumber(): number {
    this.botCounter++;
    return this.botCounter;
  }

  // ✅ NOVO: Resetar contador de bots (útil para testes ou reinicialização)
  public resetBotCounter(): void {
    this.botCounter = 0;
    console.log('🔄 [Matchmaking] Contador de bots resetado para 0');
  }

  // ✅ NOVO: Obter contador atual de bots
  public getBotCounter(): number {
    return this.botCounter;
  }

  async cancelDraft(matchId: number, reason: string): Promise<void> {
    console.log(`🚫 [Matchmaking] Redirecionando cancelamento de draft para DraftService`);
    try {
      await this.draftService.cancelDraft(matchId, reason);
      console.log(`✅ [Matchmaking] Draft ${matchId} cancelado com sucesso`);
    } catch (error) {
      console.error(`❌ [Matchmaking] Erro ao cancelar draft ${matchId}:`, error);
      throw error;
    }
  }

  // ✅ NOVO: Finalizar draft usando DraftService
  // ✅ NOVO: Finalizar jogo usando GameInProgressService
  async finishGame(matchId: number, gameResult: any): Promise<void> {
    try {
      console.log(`🏁 [Matchmaking] Redirecionando finalização para GameInProgressService`);
      await this.gameInProgressService.finishGame(matchId, gameResult);
    } catch (error) {
      console.error('❌ [Matchmaking] Erro ao finalizar jogo:', error);
      throw error;
    }
  }

  // ✅ NOVO: Cancelar jogo usando GameInProgressService
  async cancelGameInProgress(matchId: number, reason: string): Promise<void> {
    try {
      console.log(`🚫 [Matchmaking] Redirecionando cancelamento para GameInProgressService`);
      console.log(`🔍 [Matchmaking] DEBUG - matchId: ${matchId}, reason: ${reason}`);
      console.log(`🔍 [Matchmaking] DEBUG - gameInProgressService existe: ${!!this.gameInProgressService}`);

      await this.gameInProgressService.cancelGame(matchId, reason);
      console.log(`✅ [Matchmaking] GameInProgressService.cancelGame executado com sucesso`);
    } catch (error) {
      console.error('❌ [Matchmaking] Erro ao cancelar jogo:', error);
      throw error;
    }
  }

  // ✅ NOVO: Métodos de consulta dos serviços
  // ✅ NOVO: Aceitar partida usando MatchFoundService
  async acceptMatch(matchId: number, summonerName: string): Promise<void> {
    return await this.matchFoundService.acceptMatch(matchId, summonerName);
  }

  // ✅ ATUALIZADO: Recusar partida usando MatchFoundService
  async declineMatch(matchId: number, summonerName: string): Promise<void> {
    return await this.matchFoundService.declineMatch(matchId, summonerName);
  }

  // ✅ NOVO: Inicializar MatchFoundService
  async initializeMatchFoundService(): Promise<void> {
    return await this.matchFoundService.initialize();
  }

  // ✅ NOVO: Método para criar partida quando frontend detecta 10 jogadores
  async createMatchFromFrontend(matchData: any): Promise<number> {
    console.log('🎮 [Match] Criando partida a partir do frontend:', matchData);

    try {
      // Extrair dados dos times
      const team1Players = matchData.teammates?.map((p: any) => p.summonerName) || [];
      const team2Players = matchData.enemies?.map((p: any) => p.summonerName) || [];

      console.log('🎮 [Match] Dados extraídos:', {
        team1Players,
        team2Players,
        team1Count: team1Players.length,
        team2Count: team2Players.length
      });

      // Calcular MMR médio
      const allPlayers = [...matchData.teammates, ...matchData.enemies];
      const avgMMR = allPlayers.reduce((sum: number, p: any) => sum + (p.mmr || 0), 0) / allPlayers.length;

      console.log('🎮 [Match] MMR médio calculado:', avgMMR);

      // ✅ CORREÇÃO: Criar dados preliminares para o draft
      const preliminaryData = {
        team1Players: team1Players,
        team2Players: team2Players,
        averageMMR: avgMMR,
        lanes: {
          team1: matchData.teammates?.map((p: any) => ({
            player: p.summonerName,
            lane: p.assignedLane,
            teamIndex: p.teamIndex,
            mmr: p.mmr,
            isAutofill: p.isAutofill
          })) || [],
          team2: matchData.enemies?.map((p: any) => ({
            player: p.summonerName,
            lane: p.assignedLane,
            teamIndex: p.teamIndex,
            mmr: p.mmr,
            isAutofill: p.isAutofill
          })) || []
        }
      };

      // Criar partida no banco de dados com dados preliminares
      const matchId = await this.dbManager.createCustomMatch({
        title: `Partida Frontend ${new Date().toLocaleString()}`,
        description: `Times balanceados - MMR médio: ${Math.round(avgMMR)}`,
        team1Players: team1Players,
        team2Players: team2Players,
        createdBy: 'Frontend Matchmaking',
        gameMode: 'CLASSIC'
      });

      // ✅ CORREÇÃO: Atualizar partida com dados preliminares
      await this.dbManager.updateCustomMatch(matchId, {
        draft_data: JSON.stringify(preliminaryData),
        pick_ban_data: JSON.stringify({
          team1Picks: [],
          team2Picks: [],
          team1Bans: [],
          team2Bans: [],
          isReal: false,
          source: 'FRONTEND_MATCHMAKING'
        })
      });

      console.log(`✅ [Match] Partida criada com ID: ${matchId}`);

      // ✅ VERIFICAÇÃO: Confirmar que a partida foi criada
      const createdMatch = await this.dbManager.getCustomMatchById(matchId);
      if (createdMatch) {
        console.log('✅ [Match] Partida confirmada no banco:', {
          id: createdMatch.id,
          title: createdMatch.title,
          team1Players: createdMatch.team1_players,
          team2Players: createdMatch.team2_players
        });
      } else {
        console.error('❌ [Match] Partida não encontrada no banco após criação!');
      }

      // Adicionar atividade
      this.addActivity(
        'match_created',
        `Partida criada pelo frontend! ${team1Players.length}v${team2Players.length} - MMR médio: ${Math.round(avgMMR)}`
      );

      // ✅ NOVO: Aceitar automaticamente a partida para bots
      await this.autoAcceptMatchForBots(matchId, team1Players, team2Players);

      return matchId;

    } catch (error) {
      console.error('❌ [Match] Erro ao criar partida do frontend:', error);
      throw error;
    }
  }

  // ✅ CORRIGIDO: Aceitar automaticamente a partida para bots
  private async autoAcceptMatchForBots(matchId: number, team1: any[], team2: any[]): Promise<void> {
    console.log(`🤖 [AutoAccept] Verificando bots para aceitação automática da partida ${matchId}`);

    try {
      // ✅ CORREÇÃO: Extrair nomes dos jogadores dos times balanceados
      const allPlayers = [...team1.map(p => p.summonerName), ...team2.map(p => p.summonerName)];
      let acceptedBots = 0;

      console.log(`🤖 [AutoAccept] Jogadores na partida:`, allPlayers);

      for (const playerName of allPlayers) {
        // ✅ CORREÇÃO: Verificar se é um bot baseado no nome (incluir padrão #BOT)
        const isBot = playerName.toLowerCase().includes('bot') ||
          playerName.toLowerCase().includes('ai') ||
          playerName.toLowerCase().includes('computer') ||
          playerName.toLowerCase().includes('cpu') ||
          playerName.includes('#BOT'); // ✅ NOVO: Padrão específico dos bots

        console.log(`🤖 [AutoAccept] Verificando ${playerName}: ${isBot ? 'É BOT' : 'É HUMANO'}`);

        if (isBot) {
          try {
            console.log(`🤖 [AutoAccept] Aceitando automaticamente partida ${matchId} para bot: ${playerName}`);

            // ✅ CORREÇÃO: Aguardar um pouco antes de aceitar para dar tempo do sistema processar
            await new Promise(resolve => setTimeout(resolve, 200));

            // Aceitar a partida para o bot
            await this.matchFoundService.acceptMatch(matchId, playerName);
            acceptedBots++;

            console.log(`✅ [AutoAccept] Bot ${playerName} aceitou a partida automaticamente`);

            // Aguardar um pouco entre aceitações para não sobrecarregar
            await new Promise(resolve => setTimeout(resolve, 100));

          } catch (error) {
            console.error(`❌ [AutoAccept] Erro ao aceitar partida para bot ${playerName}:`, error);
          }
        }
      }

      console.log(`✅ [AutoAccept] ${acceptedBots} bots aceitaram automaticamente a partida ${matchId}`);

      // Se todos os jogadores são bots, iniciar o draft automaticamente após um delay
      if (acceptedBots === allPlayers.length && allPlayers.length > 0) {
        console.log(`🤖 [AutoAccept] Todos os jogadores são bots, iniciando draft automaticamente em 3 segundos...`);
        setTimeout(async () => {
          try {
            await this.draftService.startDraft(matchId);
            console.log(`🎯 [AutoAccept] Draft iniciado automaticamente para partida ${matchId}`);
          } catch (error) {
            console.error(`❌ [AutoAccept] Erro ao iniciar draft automaticamente:`, error);
          }
        }, 3000);
      } else if (acceptedBots > 0) {
        console.log(`🤖 [AutoAccept] ${acceptedBots}/${allPlayers.length} jogadores são bots. Aguardando jogadores humanos aceitarem.`);
      }

    } catch (error) {
      console.error(`❌ [AutoAccept] Erro ao processar aceitação automática para bots:`, error);
    }
  }

  // ✅ NOVO: Balancear times por MMR e lanes
  private balanceTeamsByMMRAndLanes(players: any[]): { team1: any[], team2: any[] } | null {
    console.log('🎯 [Matchmaking] Balanceando times por MMR e lanes...');

    // Ordenar jogadores por MMR (maior primeiro)
    const sortedPlayers = [...players].sort((a: any, b: any) => b.mmr - a.mmr);

    // Atribuir lanes únicas baseado em MMR e preferências
    const playersWithLanes = this.assignLanesByMMRAndPreferences(sortedPlayers, []);

    if (playersWithLanes.length !== 10) {
      console.error('❌ [Matchmaking] ERRO: Não temos 10 jogadores com lanes! Temos:', playersWithLanes.length);
      return null;
    }

    // Verificar se temos exatamente 5 lanes únicas por time
    const team1Players = playersWithLanes.filter(p => p.teamIndex < 5);
    const team2Players = playersWithLanes.filter(p => p.teamIndex >= 5);

    const team1Lanes = new Set(team1Players.map((p: any) => p.assignedLane));
    const team2Lanes = new Set(team2Players.map((p: any) => p.assignedLane));

    if (team1Lanes.size !== 5 || team2Lanes.size !== 5) {
      console.error('❌ [Matchmaking] ERRO: Times não têm 5 lanes únicas!', {
        team1Lanes: Array.from(team1Lanes),
        team2Lanes: Array.from(team2Lanes)
      });
      return null;
    }

    // ✅ CORREÇÃO: Os jogadores já estão divididos corretamente pelo teamIndex
    // Só precisamos separá-los pelos teamIndex (0-4 = team1, 5-9 = team2)
    const team1: any[] = team1Players.sort((a, b) => a.teamIndex - b.teamIndex);
    const team2: any[] = team2Players.sort((a, b) => a.teamIndex - b.teamIndex);

    console.log('✅ [Matchmaking] Times balanceados por teamIndex:', {
      team1: team1.map((p: any) => ({
        teamIndex: p.teamIndex,
        name: p.summonerName,
        lane: p.assignedLane,
        mmr: p.mmr,
        isAutofill: p.isAutofill
      })),
      team2: team2.map((p: any) => ({
        teamIndex: p.teamIndex,
        name: p.summonerName,
        lane: p.assignedLane,
        mmr: p.mmr,
        isAutofill: p.isAutofill
      }))
    });

    // Verificar se cada time tem exatamente 5 jogadores
    if (team1.length !== 5 || team2.length !== 5) {
      console.error('❌ [Matchmaking] ERRO: Times não têm 5 jogadores cada!', {
        team1Count: team1.length,
        team2Count: team2.length
      });
      return null;
    }

    return { team1, team2 };
  }

  // ✅ NOVO: Criar partida completa no banco
  private async createCompleteMatch(team1: any[], team2: any[], avgMMR1: number, avgMMR2: number): Promise<number | null> {
    try {
      // Preparar dados dos times
      const team1Players = team1.map(p => p.summonerName);
      const team2Players = team2.map(p => p.summonerName);

      // ✅ CORREÇÃO: Preparar dados do pick/ban com teamIndex corretos
      const pickBanData = {
        team1: team1.map((p, index) => ({
          summonerName: p.summonerName,
          assignedLane: p.assignedLane,
          teamIndex: index, // ✅ CORREÇÃO: Team1 sempre 0-4
          isAutofill: p.isAutofill || false,
          mmr: p.mmr,
          primaryLane: p.primaryLane,
          secondaryLane: p.secondaryLane
        })),
        team2: team2.map((p, index) => ({
          summonerName: p.summonerName,
          assignedLane: p.assignedLane,
          teamIndex: index + 5, // ✅ CORREÇÃO: Team2 sempre 5-9
          isAutofill: p.isAutofill || false,
          mmr: p.mmr,
          primaryLane: p.primaryLane,
          secondaryLane: p.secondaryLane
        })),
        currentAction: 0,
        phase: 'bans',
        phases: []
      };

      console.log('🎯 [CreateMatch] Dados do pick/ban preparados:', {
        team1: pickBanData.team1.map(p => ({ name: p.summonerName, lane: p.assignedLane, index: p.teamIndex })),
        team2: pickBanData.team2.map(p => ({ name: p.summonerName, lane: p.assignedLane, index: p.teamIndex }))
      });

      // Criar partida no banco com dados completos
      const matchId = await this.dbManager.createCustomMatch({
        title: `Partida ${Date.now()}`,
        description: `Partida balanceada - MMR médio: ${Math.round((avgMMR1 + avgMMR2) / 2)}`,
        team1Players,
        team2Players,
        createdBy: 'system',
        gameMode: '5v5'
      });

      // Atualizar a partida com dados adicionais
      if (matchId) {
        // ✅ COMENTADO TEMPORARIAMENTE: Pode ter problemas de tipo com updateCustomMatch
        // await this.dbManager.updateCustomMatch(matchId, {
        //   pick_ban_data: JSON.stringify(pickBanData),
        //   average_mmr_team1: avgMMR1,
        //   average_mmr_team2: avgMMR2
        // });
        console.log(`🎯 [Matchmaking] Partida ${matchId} criada (dados adicionais não atualizados)`);
      }

      console.log(`✅ [Matchmaking] Partida ${matchId} criada no banco com dados completos`);
      return matchId;

    } catch (error) {
      console.error('❌ [Matchmaking] Erro ao criar partida completa:', error);
      return null;
    }
  }

  // ✅ NOVO: Remover jogadores da fila
  private async removePlayersFromQueue(players: any[]): Promise<void> {
    console.log(`🗑️ [Matchmaking] Removendo ${players.length} jogadores da fila...`);

    for (const player of players) {
      try {
        await this.removePlayerFromQueueById(undefined, player.summonerName);
        console.log(`✅ [Matchmaking] Jogador ${player.summonerName} removido da fila`);
      } catch (error) {
        console.error(`❌ [Matchmaking] Erro ao remover jogador ${player.summonerName}:`, error);
      }
    }
  }

  // ✅ CORRIGIDO: Atribuir lanes únicas baseado em MMR e preferências
  private assignLanesByMMRAndPreferences(players: any[], lanePriority: string[]): any[] {
    console.log('🎯 [Matchmaking] assignLanesByMMRAndPreferences iniciado com', players.length, 'jogadores');

    // ✅ CORREÇÃO: Definir ordem EXATA das lanes conforme especificado
    const laneOrder = ['top', 'jungle', 'mid', 'bot', 'support'];

    // ✅ CORREÇÃO: Mapeamento correto de lanes para teamIndex
    // Time Azul: 0=top, 1=jungle, 2=mid, 3=bot, 4=support
    // Time Vermelho: 5=top, 6=jungle, 7=mid, 8=bot, 9=support
    const laneToTeamIndex: { [key: string]: { team1: number, team2: number } } = {
      'top': { team1: 0, team2: 5 },
      'jungle': { team1: 1, team2: 6 },
      'mid': { team1: 2, team2: 7 },
      'bot': { team1: 3, team2: 8 },
      'support': { team1: 4, team2: 9 }
    };

    // ✅ CORREÇÃO: Ordenar jogadores por MMR (maior primeiro) para dar PRIORIDADE REAL
    const sortedPlayers = [...players].sort((a: any, b: any) => {
      // Ordenar por MMR decrescente (maior MMR = maior prioridade)
      return b.mmr - a.mmr;
    });

    console.log('🎯 [Matchmaking] Jogadores ordenados por MMR (prioridade):', sortedPlayers.map((p: any, index: number) => ({
      prioridade: index + 1,
      name: p.summonerName,
      mmr: p.mmr,
      primaryLane: p.primaryLane,
      secondaryLane: p.secondaryLane
    })));

    // ✅ CORREÇÃO: Sistema de atribuição - cada lane tem exatamente 2 jogadores (1 por time)
    const laneAssignments: { [key: string]: { team1: boolean, team2: boolean } } = {
      'top': { team1: false, team2: false },
      'jungle': { team1: false, team2: false },
      'mid': { team1: false, team2: false },
      'bot': { team1: false, team2: false },
      'support': { team1: false, team2: false }
    };

    const playersWithLanes: any[] = [];

    // ✅ CORREÇÃO: PRIMEIRA PASSADA - Jogadores com maior MMR têm prioridade absoluta
    console.log('🎯 [Matchmaking] === PRIMEIRA PASSADA: Lanes primárias por prioridade de MMR ===');
    for (let i = 0; i < sortedPlayers.length; i++) {
      const player = sortedPlayers[i];
      const primaryLane = player.primaryLane || 'fill';
      const secondaryLane = player.secondaryLane || 'fill';

      let assignedLane = null;
      let isAutofill = false;
      let teamIndex = null;

      console.log(`🎯 [Matchmaking] Processando jogador ${i + 1}/${sortedPlayers.length}: ${player.summonerName} (MMR: ${player.mmr})`);
      console.log(`🎯 [Matchmaking] Preferências: Primária=${primaryLane}, Secundária=${secondaryLane}`);
      console.log(`🎯 [Matchmaking] Estado atual das lanes:`, laneAssignments);

      // ✅ PRIORIDADE 1: Tentar lane primária primeiro (jogadores com maior MMR têm prioridade)
      if (primaryLane !== 'fill' && laneAssignments[primaryLane]) {
        // Verificar se team1 está disponível primeiro, depois team2
        if (!laneAssignments[primaryLane].team1) {
          assignedLane = primaryLane;
          isAutofill = false;
          teamIndex = laneToTeamIndex[primaryLane].team1;
          laneAssignments[primaryLane].team1 = true;
          console.log(`✅ [Matchmaking] CONSEGUIU lane primária no TEAM1: ${primaryLane} (teamIndex: ${teamIndex})`);
        } else if (!laneAssignments[primaryLane].team2) {
          assignedLane = primaryLane;
          isAutofill = false;
          teamIndex = laneToTeamIndex[primaryLane].team2;
          laneAssignments[primaryLane].team2 = true;
          console.log(`✅ [Matchmaking] CONSEGUIU lane primária no TEAM2: ${primaryLane} (teamIndex: ${teamIndex})`);
        }
      }

      // ✅ PRIORIDADE 2: Tentar lane secundária se primária não disponível
      if (!assignedLane && secondaryLane !== 'fill' && laneAssignments[secondaryLane]) {
        if (!laneAssignments[secondaryLane].team1) {
          assignedLane = secondaryLane;
          isAutofill = false;
          teamIndex = laneToTeamIndex[secondaryLane].team1;
          laneAssignments[secondaryLane].team1 = true;
          console.log(`🟡 [Matchmaking] CONSEGUIU lane secundária no TEAM1: ${secondaryLane} (teamIndex: ${teamIndex})`);
        } else if (!laneAssignments[secondaryLane].team2) {
          assignedLane = secondaryLane;
          isAutofill = false;
          teamIndex = laneToTeamIndex[secondaryLane].team2;
          laneAssignments[secondaryLane].team2 = true;
          console.log(`🟡 [Matchmaking] CONSEGUIU lane secundária no TEAM2: ${secondaryLane} (teamIndex: ${teamIndex})`);
        }
      }

      // ✅ PRIORIDADE 3: Autofill - encontrar primeira lane disponível
      if (!assignedLane) {
        for (const lane of laneOrder) {
          if (!laneAssignments[lane].team1) {
            assignedLane = lane;
            isAutofill = true;
            teamIndex = laneToTeamIndex[lane].team1;
            laneAssignments[lane].team1 = true;
            console.log(`🔴 [Matchmaking] AUTOFILL no TEAM1: ${lane} (teamIndex: ${teamIndex})`);
            break;
          } else if (!laneAssignments[lane].team2) {
            assignedLane = lane;
            isAutofill = true;
            teamIndex = laneToTeamIndex[lane].team2;
            laneAssignments[lane].team2 = true;
            console.log(`🔴 [Matchmaking] AUTOFILL no TEAM2: ${lane} (teamIndex: ${teamIndex})`);
            break;
          }
        }

        if (!assignedLane) {
          console.error(`❌ [Matchmaking] ERRO: Não foi possível atribuir lane para ${player.summonerName}!`);
          return []; // Falha crítica
        }
      }

      // Atribuir lane ao jogador
      const playerWithLane = {
        ...player,
        assignedLane: assignedLane,
        isAutofill: isAutofill,
        teamIndex: teamIndex
      };

      playersWithLanes.push(playerWithLane);

      console.log(`🎯 [Matchmaking] ${player.summonerName} (MMR: ${player.mmr}, Prioridade: ${i + 1}) → ${assignedLane} (${isAutofill ? '🔴 AUTOFILL' : '✅ PREFERÊNCIA'}, teamIndex: ${teamIndex})`);
      console.log(`🎯 [Matchmaking] Estado após atribuição:`, laneAssignments);
      console.log('---');
    }

    // ✅ VERIFICAÇÃO: Garantir que todas as lanes foram atribuídas
    console.log(`🎯 [Matchmaking] Estado final das lanes:`, laneAssignments);

    const allLanesAssigned = Object.values(laneAssignments).every(lane => lane.team1 && lane.team2);
    if (!allLanesAssigned) {
      console.error('❌ [Matchmaking] ERRO: Nem todas as lanes foram atribuídas!', laneAssignments);
      return [];
    }

    // ✅ CORREÇÃO: Ordenar jogadores por teamIndex para garantir ordem correta (0-9)
    const orderedPlayers = playersWithLanes.sort((a: any, b: any) => {
      return a.teamIndex - b.teamIndex;
    });

    console.log('✅ [Matchmaking] Jogadores finais ordenados por teamIndex:', orderedPlayers.map((p: any) => ({
      teamIndex: p.teamIndex,
      name: p.summonerName,
      lane: p.assignedLane,
      isAutofill: p.isAutofill,
      mmr: p.mmr,
      team: p.teamIndex < 5 ? 'AZUL' : 'VERMELHO'
    })));

    // ✅ VERIFICAÇÃO: Garantir que temos exatamente 10 jogadores
    if (orderedPlayers.length !== 10) {
      console.error('❌ [Matchmaking] ERRO: Não temos 10 jogadores! Temos:', orderedPlayers.length);
      return [];
    }

    // ✅ VERIFICAÇÃO: Garantir que temos teamIndexes únicos de 0-9
    const teamIndexes = orderedPlayers.map((p: any) => p.teamIndex).sort((a: any, b: any) => a - b);
    const expectedIndexes = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
    const hasCorrectIndexes = JSON.stringify(teamIndexes) === JSON.stringify(expectedIndexes);

    if (!hasCorrectIndexes) {
      console.error('❌ [Matchmaking] ERRO: TeamIndexes incorretos!', teamIndexes, 'Esperado:', expectedIndexes);
      return [];
    }

    // ✅ VERIFICAÇÃO FINAL: Garantir distribuição correta das lanes
    const team1Lanes = orderedPlayers.filter(p => p.teamIndex < 5).map(p => p.assignedLane).sort();
    const team2Lanes = orderedPlayers.filter(p => p.teamIndex >= 5).map(p => p.assignedLane).sort();
    const expectedLanes = ['bot', 'jungle', 'mid', 'support', 'top'];

    const team1Valid = JSON.stringify(team1Lanes) === JSON.stringify(expectedLanes);
    const team2Valid = JSON.stringify(team2Lanes) === JSON.stringify(expectedLanes);

    if (!team1Valid || !team2Valid) {
      console.error('❌ [Matchmaking] ERRO: Distribuição incorreta de lanes!');
      console.error('Team1 lanes:', team1Lanes, 'Esperado:', expectedLanes);
      console.error('Team2 lanes:', team2Lanes, 'Esperado:', expectedLanes);
      return [];
    }

    console.log('✅ [Matchmaking] Atribuição de lanes concluída com sucesso!');
    console.log('✅ [Matchmaking] Ordem final dos teamIndexes:', orderedPlayers.map(p => `${p.teamIndex}: ${p.assignedLane} (${p.summonerName})`));

    return orderedPlayers;
  }

  // ✅ REMOVIDO: Método notifyMatchFound - agora apenas o MatchFoundService notifica
  // Isso evita duplicação de lógica e garante que todos os jogadores recebam os mesmos dados

  // ✅ NOVO: Função para escolher um líder humano da partida
  private selectHumanLeader(team1: any[], team2: any[]): string {
    console.log('🎯 [selectHumanLeader] === SELECIONANDO LÍDER HUMANO ===');

    // Combinar ambos os times para buscar um líder
    const allPlayers = [...team1, ...team2];

    console.log('🎯 [selectHumanLeader] Todos os jogadores:', allPlayers.map(p => ({
      name: p.summonerName,
      isBot: this.isPlayerBot(p.summonerName)
    })));

    // ✅ PRIORIDADE 1: Buscar humanos no team1 primeiro
    for (const player of team1) {
      if (!this.isPlayerBot(player.summonerName)) {
        console.log(`✅ [selectHumanLeader] Líder escolhido (Team1): ${player.summonerName}`);
        return player.summonerName;
      }
    }

    // ✅ PRIORIDADE 2: Se não há humanos no team1, buscar no team2
    for (const player of team2) {
      if (!this.isPlayerBot(player.summonerName)) {
        console.log(`✅ [selectHumanLeader] Líder escolhido (Team2): ${player.summonerName}`);
        return player.summonerName;
      }
    }

    // ✅ FALLBACK: Se todos são bots, escolher o primeiro jogador do team1
    console.warn(`⚠️ [selectHumanLeader] TODOS OS JOGADORES SÃO BOTS - usando fallback: ${team1[0]?.summonerName}`);
    return team1[0]?.summonerName || 'Sistema';
  }

  // ✅ SIMPLIFICADO: Função para verificar se um jogador é bot
  private isPlayerBot(playerName: string): boolean {
    if (!playerName) return false;

    // ✅ SIMPLIFICADO: Apenas padrão Bot1, Bot2, Bot3, etc.
    const botPattern = /^Bot\d+$/i;
    const isBot = botPattern.test(playerName);

    console.log(`🤖 [Matchmaking] Verificando bot: "${playerName}" = ${isBot}`);
    return isBot;
  }

  // ✅ NOVO: Métodos de debug para verificar status do MatchFoundService
  getMatchFoundDebugStatus(): any {
    return {
      hasDiscordService: !!this.matchFoundService['discordService'],
      discordServiceReady: this.matchFoundService['discordService']?.isReady(),
      discordServiceConnected: this.matchFoundService['discordService']?.isDiscordConnected(),
      discordServiceBotUsername: this.matchFoundService['discordService']?.getBotUsername(),
      discordServiceActiveMatches: this.matchFoundService['discordService']?.getAllActiveMatches().size,
      pendingMatchesCount: this.matchFoundService['pendingMatches'].size,
      processingMatchesCount: this.matchFoundService['processingMatches'].size,
      matchCreationLocksCount: this.matchFoundService['matchCreationLocks'].size
    };
  }

  // ✅ NOVO: Método para testar criação de match Discord via MatchFoundService
  async testDiscordMatchCreation(matchId: number, matchData: any): Promise<boolean> {
    try {
      if (this.matchFoundService['discordService']?.isReady()) {
        await this.matchFoundService['discordService'].createDiscordMatch(matchId, matchData);
        return true;
      }
      return false;
    } catch (error) {
      console.error('❌ [MatchmakingService] Erro no teste de criação de match Discord:', error);
      return false;
    }
  }

  // ✅ NOVO: Método para configurar DiscordService em todos os serviços
  setDiscordService(discordService: any): void {
    console.log('🔗 [Matchmaking] Configurando DiscordService em todos os serviços...');
    this.matchFoundService.setDiscordService(discordService);
    this.draftService.setDiscordService(discordService);
    this.gameInProgressService.setDiscordService(discordService);
    console.log('✅ [Matchmaking] DiscordService configurado em todos os serviços');
  }
}