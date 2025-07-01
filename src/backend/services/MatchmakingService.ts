import { WebSocket } from 'ws';
import { DatabaseManager } from '../database/DatabaseManager';

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
  private queue: QueuedPlayer[] = []; // ✅ ADICIONADO: Array de jogadores na fila
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
    
    // ✅ ADICIONADO: Carregar jogadores da fila persistente
    await this.loadQueueFromDatabase();
    
    // ✅ ADICIONADO: Adicionar atividades iniciais
    this.addActivity('system_update', 'Sistema de matchmaking inicializado');
    this.addActivity('system_update', 'Aguardando jogadores para a fila');
    
    // ✅ ADICIONADO: Iniciar processamento de matchmaking a cada 5 segundos
    this.startMatchmakingInterval();
    
    console.log('✅ MatchmakingService inicializado com sucesso (MySQL Only)');
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

      // Construir o nome completo no formato gameName#tagLine
      const fullSummonerName = playerData.gameName && playerData.tagLine 
        ? `${playerData.gameName}#${playerData.tagLine}`
        : playerData.summonerName;

      console.log('🔍 [Matchmaking] Nome completo do jogador:', fullSummonerName);

      // ✅ ATUALIZADO: Verificar se já está na fila local
      const existingPlayerIndex = this.queue.findIndex(p => p.id === playerData.id);
      if (existingPlayerIndex !== -1) {
        // Atualizar websocket se jogador reconectar
        this.queue[existingPlayerIndex].websocket = websocket;
        websocket.send(JSON.stringify({
          type: 'queue_joined',
          data: { 
            position: existingPlayerIndex + 1, 
            estimatedWait: this.calculateEstimatedWaitTime(),
            queueStatus: await this.getQueueStatus()
          }
        }));
        return;
      }

      // ✅ ATUALIZADO: Verificar se já está na fila - fonte de verdade é APENAS a tabela queue_players
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

      // ✅ ATUALIZADO: Adicionar à fila local
      const queuedPlayer: QueuedPlayer = {
        id: playerData.id,
        summonerName: fullSummonerName,
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
      // ✅ ATUALIZADO: Usar fila local como fonte primária
      const playersCount = this.queue.length;

      console.log(`📊 [Queue Status] Fila local: ${playersCount} jogadores`);

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
          joinTime: player.joinTime
        };
      });

      console.log(`✅ [Queue Status] Retornando: ${playersCount} jogadores da fila local`);

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
      // ✅ ATUALIZADO: Buscar jogador na fila local primeiro
      let playerIndex = -1;

      if (playerId) {
        playerIndex = this.queue.findIndex(p => p.id === playerId);
      } else if (summonerName) {
        playerIndex = this.queue.findIndex(p => 
          p.summonerName === summonerName ||
          (p.summonerName.includes('#') && summonerName.includes('#') && 
           p.summonerName === summonerName) ||
          (p.summonerName.includes('#') && !summonerName.includes('#') &&
           p.summonerName.startsWith(summonerName + '#'))
        );
      }
      
      if (playerIndex === -1) {
        console.log(`⚠️ [Matchmaking] Jogador não encontrado na fila local:`, { playerId, summonerName });
        return false;
      }

      const player = this.queue[playerIndex];
      
      // ✅ ATUALIZADO: Remover da fila local
      this.queue.splice(playerIndex, 1);

      // REGRA: Deletar linha da tabela (não marcar como inativo)
      await this.dbManager.removePlayerFromQueue(player.id);
      console.log(`✅ [Matchmaking] Linha do jogador ${player.summonerName} deletada da tabela queue_players`);

      // Adicionar atividade
      this.addActivity(
        'player_left',
        `${player.summonerName} saiu da fila`,
        player.summonerName
      );

      // ✅ ATUALIZADO: Atualizar posições na fila local
      this.queue.forEach((p, index) => {
        p.queuePosition = index + 1;
      });

      // Broadcast atualização da fila
      await this.broadcastQueueUpdate();

      console.log(`➖ [Matchmaking] ${player.summonerName} removido da fila (linha deletada)`);
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

      console.log(`✅ [Matchmaking] Broadcast enviado para ${sentCount}/${this.wss.clients.size} clientes (fila local)`);

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

  // ✅ ATUALIZADO: Métodos de sistema
  private startMatchmakingInterval(): void {
    // ✅ REMOVIDO: Processamento automático de matchmaking (agora é responsabilidade do frontend)
    console.log('🎯 Matchmaking interval iniciado (sem processamento automático - frontend responsável)');
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

  // ✅ ATUALIZADO: Método para obter fila atual
  public getQueue(): QueuedPlayer[] {
    return [...this.queue];
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
      // ✅ CORREÇÃO: Usar IDs menores e mais seguros para bots
      const botNumber = Math.floor(Math.random() * 1000000) + 100000; // 6 dígitos
      const botName = `Bot${botNumber}#BOT`;
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
        -botNumber, // ID negativo para bots (agora menor)
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

  // ✅ ADICIONADO: Métodos para gerenciar partidas criadas pelo frontend
  async acceptMatch(playerId: number, matchId: number, summonerName?: string): Promise<void> {
    console.log(`✅ [Match] Jogador ${summonerName || playerId} aceitou partida ${matchId}`);
    
    try {
      // Buscar partida no banco de dados
      const match = await this.dbManager.getCustomMatchById(matchId);
      if (!match) {
        throw new Error('Partida não encontrada no banco de dados');
      }

      // Verificar se o jogador está na partida
      const allPlayers = [
        ...(match.team1_players || []),
        ...(match.team2_players || [])
      ];
      
      const playerInMatch = allPlayers.some(player => 
        player === summonerName || 
        (summonerName && player.includes(summonerName))
      );

      if (!playerInMatch) {
        throw new Error('Jogador não está nesta partida');
      }

      // TODO: Implementar lógica de tracking de aceitação
      // Por enquanto, apenas log
      console.log(`✅ [Match] Aceitação registrada para ${summonerName} na partida ${matchId}`);
      
    } catch (error) {
      console.error(`❌ [Match] Erro ao aceitar partida:`, error);
      throw error;
    }
  }

  async declineMatch(playerId: number, matchId: number, summonerName?: string): Promise<void> {
    console.log(`❌ [Match] Jogador ${summonerName || playerId} recusou partida ${matchId}`);
    
    try {
      // Buscar partida no banco de dados
      const match = await this.dbManager.getCustomMatchById(matchId);
      if (!match) {
        throw new Error('Partida não encontrada no banco de dados');
      }

      // TODO: Implementar lógica de cancelamento
      // Por enquanto, apenas log
      console.log(`❌ [Match] Recusa registrada para ${summonerName} na partida ${matchId}`);
      
    } catch (error) {
      console.error(`❌ [Match] Erro ao recusar partida:`, error);
      throw error;
    }
  }

  // ✅ ADICIONADO: Método para criar partida quando frontend detecta 10 jogadores
  async createMatchFromFrontend(matchData: any): Promise<number> {
    console.log('🎮 [Match] Criando partida a partir do frontend:', matchData);
    
    try {
      // Extrair dados dos times
      const team1Players = matchData.teammates?.map((p: any) => p.summonerName) || [];
      const team2Players = matchData.enemies?.map((p: any) => p.summonerName) || [];
      
      // Calcular MMR médio
      const allPlayers = [...matchData.teammates, ...matchData.enemies];
      const avgMMR = allPlayers.reduce((sum: number, p: any) => sum + (p.mmr || 0), 0) / allPlayers.length;
      
      // Criar partida no banco de dados
      const matchId = await this.dbManager.createCustomMatch({
        title: `Partida Frontend ${new Date().toLocaleString()}`,
        description: `Times balanceados - MMR médio: ${Math.round(avgMMR)}`,
        team1Players: team1Players,
        team2Players: team2Players,
        createdBy: 'Frontend Matchmaking',
        gameMode: 'CLASSIC'
      });

      console.log(`✅ [Match] Partida criada com ID: ${matchId}`);
      
      // Adicionar atividade
      this.addActivity(
        'match_created',
        `Partida criada pelo frontend! ${team1Players.length}v${team2Players.length} - MMR médio: ${Math.round(avgMMR)}`
      );

      return matchId;
      
    } catch (error) {
      console.error('❌ [Match] Erro ao criar partida do frontend:', error);
      throw error;
    }
  }

  // ✅ ADICIONADO: Método para iniciar draft phase
  async startDraftPhase(matchId: number): Promise<void> {
    console.log(`🎯 [Draft] Iniciando fase de draft para partida ${matchId}`);
    
    try {
      // Buscar partida no banco
      const match = await this.dbManager.getCustomMatchById(matchId);
      if (!match) {
        throw new Error('Partida não encontrada');
      }

      // TODO: Implementar lógica de draft
      // Por enquanto, apenas log
      console.log(`🎯 [Draft] Draft iniciado para partida ${matchId}`);
      
      // Adicionar atividade
      this.addActivity('match_created', `Fase de draft iniciada para partida ${matchId}`);
      
    } catch (error) {
      console.error('❌ [Draft] Erro ao iniciar draft:', error);
      throw error;
    }
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