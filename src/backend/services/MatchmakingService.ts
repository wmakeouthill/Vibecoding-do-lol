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

  /**
   * REGRA 1: Para entrar na fila, o sistema deve verificar se o jogador logado 
   * é o mesmo usuário presente no lobby do Discord. Se positivo, uma única linha
   * representando o jogador deve ser inserida na tabela queue_players.
   */
  async addPlayerToQueue(websocket: WebSocket, playerData: any, preferences?: any): Promise<void> {
    try {
      console.log('➕ [Matchmaking] Adicionando jogador à fila:', playerData);

      // Construir o nome completo no formato gameName#tagLine
      const fullSummonerName = playerData.gameName && playerData.tagLine 
        ? `${playerData.gameName}#${playerData.tagLine}`
        : playerData.summonerName;

      console.log('🔍 [Matchmaking] Nome completo do jogador:', fullSummonerName);

      // REGRA: Verificar se já está na fila - fonte de verdade é APENAS a tabela queue_players
      const existingQueuePlayers = await this.dbManager.getActiveQueuePlayers();
      const isAlreadyInQueue = existingQueuePlayers.some(dbPlayer => 
        dbPlayer.summoner_name === fullSummonerName ||
        dbPlayer.player_id === playerData.id
      );

      if (isAlreadyInQueue) {
        console.log(`⚠️ [Matchmaking] Jogador ${fullSummonerName} já está na fila (único registro permitido)`);
        websocket.send(JSON.stringify({
          type: 'error',
          message: 'Você já está na fila'
        }));
        return;
      }

      // REGRA: Garantir registro único - adicionar ao MySQL (única fonte de verdade)
      await this.dbManager.addPlayerToQueue(
        playerData.id,
        fullSummonerName,
        playerData.region,
        playerData.customLp || 0,
        preferences
      );

      // Atualizar posições na fila
      await this.updateQueuePositions();

      // Adicionar atividade
      this.addActivity(
        'player_joined',
        `${fullSummonerName} entrou na fila`,
        fullSummonerName,
        preferences?.primaryLane
      );

      // Notificar jogador - baseado nos dados reais da tabela
      const queueStatus = await this.getQueueStatus();
      const playerPosition = this.findPlayerPosition(fullSummonerName, queueStatus.playersInQueueList);
      
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

      console.log(`✅ [Matchmaking] ${fullSummonerName} entrou na fila (registro único na tabela queue_players)`);

    } catch (error: any) {
      console.error('❌ [Matchmaking] Erro ao adicionar jogador à fila:', error);
      websocket.send(JSON.stringify({
        type: 'error',
        message: 'Erro ao entrar na fila: ' + error.message
      }));
    }
  }

  /**
   * REGRA 2: Estado da fila = presença de registro na tabela queue_players com is_active = 1
   * A contagem total deve ser uma contagem direta de linhas (COUNT(*))
   */
  async getQueueStatus(): Promise<QueueStatus> {
    try {
      // SEMPRE buscar dados DIRETAMENTE da tabela queue_players (única fonte de verdade)
      const dbPlayers = await this.dbManager.getActiveQueuePlayers();
      const playersCount = dbPlayers.length; // COUNT(*) direto

      console.log(`📊 [Queue Status] MySQL queue_players: ${playersCount} jogadores`);

      // Construir lista de jogadores a partir da tabela
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

      console.log(`✅ [Queue Status] Retornando: ${playersCount} jogadores da tabela queue_players`);

      return {
        playersInQueue: playersCount,
        averageWaitTime: this.calculateEstimatedWaitTime(),
        estimatedMatchTime: playersCount >= 10 ? 60 : 120,
        isActive: this.isActive,
        playersInQueueList,
        recentActivities: [...this.recentActivities]
      };
    } catch (error) {
      console.error('❌ [Queue Status] Erro ao buscar da tabela queue_players:', error);
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
   * REGRA 3a: Saída da fila via botão "Sair da Fila" - deletar linha da tabela
   */
  async removePlayerFromQueue(websocket: WebSocket): Promise<void> {
    console.log('🔍 [Matchmaking] removePlayerFromQueue chamado via WebSocket');
    console.log('⚠️ [Matchmaking] Não é possível identificar jogador apenas pelo WebSocket');
    console.log('💡 [Matchmaking] Use removePlayerFromQueueById() com ID específico');
  }

  /**
   * REGRA 3: Remoção da fila - deletar linha da tabela queue_players
   */
  public async removePlayerFromQueueById(playerId?: number, summonerName?: string): Promise<boolean> {
    console.log(`🔍 [Matchmaking] Tentando remover jogador da fila:`, { playerId, summonerName });

    try {
      // Buscar jogador na tabela queue_players (única fonte de verdade)
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
        console.log(`⚠️ [Matchmaking] Jogador não encontrado na tabela queue_players:`, { playerId, summonerName });
        return false;
      }

      // REGRA: Deletar linha da tabela (não marcar como inativo)
      await this.dbManager.removePlayerFromQueue(dbPlayer.player_id);
      console.log(`✅ [Matchmaking] Linha do jogador ${dbPlayer.summoner_name} deletada da tabela queue_players`);

      // Adicionar atividade
      this.addActivity(
        'player_left',
        `${dbPlayer.summoner_name} saiu da fila`,
        dbPlayer.summoner_name
      );

      // Atualizar posições na fila
      await this.updateQueuePositions();

      // Broadcast atualização da fila
      await this.broadcastQueueUpdate();

      console.log(`➖ [Matchmaking] ${dbPlayer.summoner_name} removido da fila (linha deletada)`);
      return true;

    } catch (error) {
      console.error('❌ [Matchmaking] Erro ao remover jogador da fila:', error);
      return false;
    }
  }

  /**
   * REGRA 3b: Saída da fila por falha em aceitar partida - deletar linha da tabela
   */
  async declineMatch(playerId: number, matchId: number, summonerName?: string): Promise<void> {
    console.log(`❌ [Match] Jogador ${playerId} (${summonerName}) recusou partida ${matchId}`);
    
    // REGRA: Remover jogador da fila quando recusar partida (deletar linha)
    if (summonerName) {
      await this.removePlayerFromQueueById(playerId, summonerName);
    } else {
      await this.removePlayerFromQueueById(playerId);
    }
  }

  // Método para atualizar posições na fila (APENAS baseado na tabela queue_players)
  private async updateQueuePositions(): Promise<void> {
    try {
      // Buscar todos os jogadores ativos da tabela queue_players
      const dbPlayers = await this.dbManager.getActiveQueuePlayers();
      
      // Ordenar por tempo de entrada (join_time)
      dbPlayers.sort((a, b) => new Date(a.join_time).getTime() - new Date(b.join_time).getTime());

      // Atualizar posições na tabela
      for (let i = 0; i < dbPlayers.length; i++) {
        const player = dbPlayers[i];
        const newPosition = i + 1;
        if (player.queue_position !== newPosition) {
          await this.dbManager.updateQueuePosition(player.player_id, newPosition);
        }
      }

      console.log(`✅ [Matchmaking] Posições da fila atualizadas na tabela: ${dbPlayers.length} jogadores`);
    } catch (error) {
      console.error('❌ [Matchmaking] Erro ao atualizar posições da fila:', error);
    }
  }

  // Broadcast de atualização da fila baseado na tabela queue_players
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
      // SEMPRE buscar dados da tabela queue_players
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

      console.log(`✅ [Matchmaking] Broadcast enviado para ${sentCount}/${this.wss.clients.size} clientes (tabela queue_players)`);

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
    console.log('⚠️ getQueue() chamado - retornando array vazio (tabela queue_players é a única fonte)');
    return [];
  }

  // Método para adicionar jogador à fila via Discord (com verificação)
  async addPlayerToDiscordQueue(websocket: WebSocket, requestData: any): Promise<void> {
    try {
      console.log('📱 [Discord] addPlayerToDiscordQueue chamado:', requestData);
      
      // Validar dados da requisição
      if (!requestData || !requestData.discordId || !requestData.gameName || !requestData.tagLine) {
        throw new Error('Dados do Discord incompletos');
      }

      // REGRA: Verificar se o jogador Discord está vinculado ao LoL
      const discordLink = await this.dbManager.getDiscordLink(requestData.discordId);
      if (!discordLink) {
        throw new Error('Conta Discord não vinculada ao LoL');
      }

      // Verificar se o link ainda é válido
      const isValid = await this.dbManager.verifyDiscordLink(
        requestData.discordId, 
        requestData.gameName, 
        requestData.tagLine
      );

      if (!isValid) {
        throw new Error('Dados do LoL não correspondem ao link Discord');
      }

      // Buscar jogador no banco
      const player = await this.dbManager.getPlayerBySummonerName(discordLink.summoner_name);
      if (!player) {
        throw new Error('Jogador não encontrado no banco de dados');
      }

      // Preparar dados do jogador para adicionar à fila
      const playerData = {
        id: player.id,
        gameName: requestData.gameName,
        tagLine: requestData.tagLine,
        summonerName: discordLink.summoner_name,
        region: player.region,
        customLp: player.custom_lp || 0
      };

      // Redirecionar para addPlayerToQueue normal (que verifica a tabela queue_players)
      await this.addPlayerToQueue(websocket, playerData, requestData.preferences);

      console.log(`✅ [Discord] ${discordLink.summoner_name} entrou na fila via Discord`);

    } catch (error: any) {
      console.error('❌ [Discord] Erro ao adicionar jogador à fila via Discord:', error);
      websocket.send(JSON.stringify({
        type: 'error',
        message: 'Falha ao entrar na fila via Discord: ' + error.message
      }));
    }
  }

  async forceMySQLSync(): Promise<void> {
    console.log('🔄 forceMySQLSync chamado - tabela queue_players é sempre sincronizada');
    // Em MySQL Only mode, não há sync necessário - tabela é sempre a única fonte
  }

  async addBotToQueue(): Promise<void> {
    try {
      const botNumber = Math.floor(Math.random() * 1000);
      const botName = `Bot${botNumber}#BOT`;
      const randomMMR = Math.floor(Math.random() * 1200) + 800;
      const lanes = ['top', 'jungle', 'mid', 'bot', 'support'];
      const primaryLane = lanes[Math.floor(Math.random() * lanes.length)];
      const secondaryLane = lanes[Math.floor(Math.random() * lanes.length)];

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
      console.log(`🤖 Bot ${botName} adicionado à tabela queue_players - Lane: ${primaryLane}, MMR: ${randomMMR}`);
    } catch (error) {
      console.error('❌ Erro ao adicionar bot à fila:', error);
    }
  }

  async acceptMatch(playerId: number, matchId: number, summonerName?: string): Promise<void> {
    console.log(`✅ [Match] Jogador ${playerId} (${summonerName}) aceitou partida ${matchId}`);
    // Implementar lógica de aceitação se necessário
  }

  async cancelGameInProgress(matchId: number, reason: string): Promise<void> {
    console.log(`🚫 [Match] Partida ${matchId} cancelada: ${reason}`);
    // Implementar lógica de cancelamento se necessário
  }

  async cancelDraft(matchId: number, reason: string): Promise<void> {
    console.log(`🚫 [Draft] Draft ${matchId} cancelado: ${reason}`);
    // Implementar lógica de cancelamento se necessário
  }

  async processDraftAction(matchId: number, playerId: number, championId: number, action: 'pick' | 'ban'): Promise<void> {
    console.log(`🎯 [Draft] Jogador ${playerId} ${action === 'pick' ? 'escolheu' : 'baniu'} campeão ${championId} na partida ${matchId}`);
    // Implementar lógica de draft se necessário
  }

  async getRecentMatches(): Promise<any[]> {
    try {
      return await this.dbManager.getCustomMatches(10);
    } catch (error) {
      console.error('❌ Erro ao buscar partidas recentes:', error);
      return [];
    }
  }

  async updateMatchAfterDraft(matchId: number, draftData: any): Promise<void> {
    console.log(`🎯 [Draft] Partida ${matchId} atualizada após draft`);
    // Implementar lógica de atualização se necessário
  }

  async completeMatchAfterGame(matchId: number, winnerTeam: number, gameData: any): Promise<void> {
    console.log(`🏆 [Match] Partida ${matchId} completada - Time vencedor: ${winnerTeam}`);
    // Implementar lógica de finalização se necessário
  }
} 