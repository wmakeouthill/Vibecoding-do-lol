import { WebSocket } from 'ws';
import { DatabaseManager } from '../database/DatabaseManager';

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
}

export class MatchmakingService {
  private dbManager: DatabaseManager;
  private wss: any; // WebSocketServer
  // ✅ NÃO EXISTE FILA LOCAL - APENAS MYSQL
  private activeMatches: Map<number, any> = new Map();
  private matchmakingInterval: NodeJS.Timeout | null = null;
  private isActive = true;
  private recentActivities: QueueActivity[] = [];
  private readonly MAX_ACTIVITIES = 20;
  private nextMatchId = 1;

  // Throttling para broadcasts
  private lastBroadcastTime = 0;
  private readonly MIN_BROADCAST_INTERVAL = 100; // Mínimo 100ms entre broadcasts para evitar spam

  constructor(dbManager: DatabaseManager, wss?: any) {
    this.dbManager = dbManager;
    this.wss = wss;
  }

  async initialize(): Promise<void> {
    console.log('🚀 Inicializando MatchmakingService (MySQL Only)...');
    
    this.startMatchmakingInterval();
    
    console.log('✅ MatchmakingService inicializado com sucesso (MySQL Only)');
  }

  // Método para obter status da fila DIRETAMENTE do MySQL
  async getQueueStatus(): Promise<QueueStatus> {
    try {
      // SEMPRE buscar dados atuais do MySQL
      const dbPlayers = await this.dbManager.getActiveQueuePlayers();
      const actualPlayerCount = dbPlayers.length;
      
      console.log(`📊 [Queue Status] MySQL: ${actualPlayerCount} jogadores`);

      // Construir lista de jogadores a partir do MySQL
      const playersInQueueList: QueuedPlayerInfo[] = dbPlayers.map(dbPlayer => {
        const fullName = dbPlayer.summoner_name;
        const nameParts = fullName.split('#');
        const summonerName = nameParts[0];
        const tagLine = nameParts.length > 1 ? nameParts[1] : undefined;
        
        return {
          summonerName: summonerName,
          tagLine: tagLine,
          primaryLane: dbPlayer.primary_lane || 'fill',
          secondaryLane: dbPlayer.secondary_lane || 'fill',
          primaryLaneDisplay: this.getLaneDisplayName(dbPlayer.primary_lane),
          secondaryLaneDisplay: this.getLaneDisplayName(dbPlayer.secondary_lane),
          mmr: dbPlayer.custom_lp || 0,
          queuePosition: dbPlayer.queue_position || 0,
          joinTime: new Date(dbPlayer.join_time)
        };
      });

      console.log(`✅ [Queue Status] Retornando: ${actualPlayerCount} jogadores do MySQL`);

      return {
        playersInQueue: actualPlayerCount,
        averageWaitTime: this.calculateEstimatedWaitTime(),
        estimatedMatchTime: actualPlayerCount >= 10 ? 60 : 120,
        isActive: this.isActive,
        playersInQueueList,
        recentActivities: [...this.recentActivities]
      };
    } catch (error) {
      console.error('❌ [Queue Status] Erro ao buscar do MySQL:', error);
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

  async addPlayerToQueue(websocket: WebSocket, playerData: any, preferences?: any): Promise<void> {
    try {
      console.log('➕ [Matchmaking] Adicionando jogador à fila:', playerData);

      // Construir o nome completo no formato gameName#tagLine
      const fullSummonerName = playerData.gameName && playerData.tagLine 
        ? `${playerData.gameName}#${playerData.tagLine}`
        : playerData.summonerName;

      console.log('🔍 [Matchmaking] Nome completo do jogador:', fullSummonerName);

      // Verificar se já está na fila no MySQL
      const existingInDB = await this.dbManager.getActiveQueuePlayers();
      const isAlreadyInQueue = existingInDB.some(dbPlayer => 
        dbPlayer.summoner_name === fullSummonerName ||
        dbPlayer.player_id === playerData.id
      );

      if (isAlreadyInQueue) {
        console.log(`⚠️ [Matchmaking] Jogador ${fullSummonerName} já está na fila (MySQL)`);
        websocket.send(JSON.stringify({
          type: 'error',
          message: 'Você já está na fila'
        }));
        return;
      }

      // Adicionar ao MySQL
      await this.dbManager.addPlayerToQueue(
        playerData.id,
        fullSummonerName,
        playerData.region,
        playerData.customLp || 0,
        preferences
      );

      // Atualizar posições no MySQL
      await this.updateQueuePositions();

      // Adicionar atividade
      this.addActivity(
        'player_joined',
        `${fullSummonerName} entrou na fila`,
        fullSummonerName,
        preferences?.primaryLane
      );

      // Notificar jogador
      const queueStatus = await this.getQueueStatus();
      websocket.send(JSON.stringify({
        type: 'queue_joined',
        data: {
          position: queueStatus.playersInQueue,
          estimatedWait: this.calculateEstimatedWaitTime(),
          queueStatus: queueStatus
        }
      }));

      // Broadcast atualização da fila
      await this.broadcastQueueUpdate();

      console.log(`✅ [Matchmaking] ${fullSummonerName} entrou na fila (MySQL Only)`);

    } catch (error: any) {
      console.error('❌ [Matchmaking] Erro ao adicionar jogador à fila:', error);
      websocket.send(JSON.stringify({
        type: 'error',
        message: 'Erro ao entrar na fila: ' + error.message
      }));
    }
  }

  async removePlayerFromQueue(websocket: WebSocket): Promise<void> {
    console.log('🔍 [Matchmaking] removePlayerFromQueue chamado via WebSocket - MySQL Only');
    
    // Como não temos fila local, não podemos identificar o jogador apenas pelo WebSocket
    // Este método precisa ser chamado com dados específicos do jogador
    console.log('⚠️ [Matchmaking] Não é possível remover jogador apenas pelo WebSocket em modo MySQL Only');
    console.log('💡 [Matchmaking] Use removePlayerFromQueueById() com ID ou summonerName específico');
  }

  // Método para remover jogador da fila por ID ou nome
  public async removePlayerFromQueueById(playerId?: number, summonerName?: string): Promise<boolean> {
    console.log(`🔍 [Matchmaking] Tentando remover jogador da fila:`, { playerId, summonerName });

    try {
      // Buscar jogador no MySQL
      const dbPlayers = await this.dbManager.getActiveQueuePlayers();
      const dbPlayer = dbPlayers.find(p => 
        (playerId && p.player_id === playerId) ||
        (summonerName && (
          p.summoner_name === summonerName ||
          (p.summoner_name.includes('#') && summonerName.includes('#') && 
           p.summoner_name === summonerName) ||
          (p.summoner_name.includes('#') && !summonerName.includes('#') &&
           p.summoner_name.startsWith(summonerName + '#'))
        ))
      );
      
      if (!dbPlayer) {
        console.log(`⚠️ [Matchmaking] Jogador não encontrado no MySQL:`, { playerId, summonerName });
        return false;
      }

      // Remover do MySQL
      await this.dbManager.removePlayerFromQueue(dbPlayer.player_id);
      console.log(`✅ [Matchmaking] Jogador ${dbPlayer.summoner_name} removido do MySQL`);

      // Adicionar atividade
      this.addActivity(
        'player_left',
        `${dbPlayer.summoner_name} saiu da fila`,
        dbPlayer.summoner_name
      );

      // Atualizar posições no MySQL
      await this.updateQueuePositions();

      // Broadcast atualização da fila
      await this.broadcastQueueUpdate();

      console.log(`➖ [Matchmaking] ${dbPlayer.summoner_name} removido da fila (MySQL Only)`);
      return true;

    } catch (error) {
      console.error('❌ [Matchmaking] Erro ao remover jogador da fila:', error);
      return false;
    }
  }

  // Método para atualizar posições na fila (APENAS MySQL)
  private async updateQueuePositions(): Promise<void> {
    try {
      // Buscar todos os jogadores ativos do MySQL
      const dbPlayers = await this.dbManager.getActiveQueuePlayers();
      
      // Ordenar por tempo de entrada (join_time)
      dbPlayers.sort((a, b) => new Date(a.join_time).getTime() - new Date(b.join_time).getTime());

      // Atualizar posições no banco de dados
      for (let i = 0; i < dbPlayers.length; i++) {
        const player = dbPlayers[i];
        const newPosition = i + 1;
        if (player.queue_position !== newPosition) {
          await this.dbManager.updateQueuePosition(player.player_id, newPosition);
        }
      }

      console.log(`✅ [Matchmaking] Posições da fila atualizadas no MySQL: ${dbPlayers.length} jogadores`);
    } catch (error) {
      console.error('❌ [Matchmaking] Erro ao atualizar posições da fila:', error);
    }
  }

  // Broadcast de atualização da fila
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
          joinTime: player.joinTime
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

      console.log(`✅ [Matchmaking] Broadcast enviado para ${sentCount}/${this.wss.clients.size} clientes (MySQL Only)`);

    } catch (error) {
      console.error('❌ [Matchmaking] Erro no broadcast da fila:', error);
    }
  }

  // Métodos auxiliares
  private getLaneDisplayName(laneId?: string): string {
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

  // Métodos de sistema
  private startMatchmakingInterval(): void {
    // Implementar lógica de matchmaking se necessário
    console.log('🎯 Matchmaking interval iniciado (placeholder)');
  }

  public async forceQueueUpdate(): Promise<void> {
    await this.broadcastQueueUpdate(true);
  }

  public shutdown(): void {
    this.isActive = false;

    if (this.matchmakingInterval) {
      clearInterval(this.matchmakingInterval);
      this.matchmakingInterval = null;
    }

    console.log('🛑 MatchmakingService desligado (MySQL Only)');
  }

  public isServiceActive(): boolean {
    return this.isActive;
  }

  // Método temporário para manter compatibilidade com outros métodos
  public getQueue(): any[] {
    console.log('⚠️ getQueue() chamado - retornando array vazio (MySQL Only mode)');
    return [];
  }

  // Outros métodos necessários para compatibilidade
  async addPlayerToDiscordQueue(websocket: WebSocket, requestData: any): Promise<void> {
    // Implementar se necessário
    console.log('📱 addPlayerToDiscordQueue chamado (MySQL Only)');
  }
} 