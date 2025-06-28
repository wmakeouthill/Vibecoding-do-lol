import { DatabaseManager } from '../database/DatabaseManager';
import { WebSocket } from 'ws';

// Interfaces
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

interface Match {
  id: number;
  team1: QueuedPlayer[];
  team2: QueuedPlayer[];
  createdAt: Date;
  status: 'waiting' | 'in_progress' | 'completed';
  averageMMR1: number;
  averageMMR2: number;
  acceptedPlayers: Set<number>; // IDs dos jogadores que aceitaram
  acceptTimeout?: NodeJS.Timeout; // Timer para timeout da aceitação
}

interface QueueStatus {
  playersInQueue: number;
  averageWaitTime: number;
  estimatedMatchTime: number;
  isActive: boolean;
  playersInQueueList?: QueuedPlayerInfo[];
  recentActivities?: QueueActivity[];
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

export class MatchmakingService {
  private dbManager: DatabaseManager;
  private wss: any; // WebSocketServer
  private queue: QueuedPlayer[] = [];
  private activeMatches: Map<number, Match> = new Map();
  private matchmakingInterval: NodeJS.Timeout | null = null;
  private cleanupInterval: NodeJS.Timeout | null = null; // Novo: intervalo de limpeza
  private isActive = true;
  private recentActivities: QueueActivity[] = [];
  private readonly MAX_ACTIVITIES = 20;
  private readonly QUEUE_TIMEOUT_MINUTES = 120; // Timeout para jogadores inativos (2 horas)
  private readonly CLEANUP_INTERVAL_MS = 30000; // Limpeza a cada 30 segundos

  // Otimizações de performance - REMOVIDO DEBOUNCE DESNECESSÁRIO
  // Broadcast imediato apenas quando necessário (entrada/saída da fila)
  private lastBroadcastTime = 0;
  private readonly MIN_BROADCAST_INTERVAL = 100; // Mínimo 100ms entre broadcasts para evitar spam

  constructor(dbManager: DatabaseManager, wss?: any) {
    this.dbManager = dbManager;
    this.wss = wss;
  }

  async initialize(): Promise<void> {
    // Carregar jogadores da fila persistente
    await this.loadQueueFromDatabase();

    // Adicionar atividades iniciais
    this.addActivity('system_update', 'Sistema de matchmaking inicializado');
    this.addActivity('system_update', 'Aguardando jogadores para a fila');

    // Iniciar processamento de matchmaking a cada 5 segundos
    this.matchmakingInterval = setInterval(() => {
      this.processMatchmaking();
    }, 5000);

    // Iniciar limpeza automática de jogadores inativos a cada 30 segundos
    this.cleanupInterval = setInterval(() => {
      this.cleanupInactivePlayers();
    }, this.CLEANUP_INTERVAL_MS);

    console.log('✅ Sistema de matchmaking ativo com limpeza automática');
  }

  // Novo método: Limpeza automática de jogadores inativos
  private async cleanupInactivePlayers(): Promise<void> {
    try {
      const now = new Date();
      const timeoutMs = this.QUEUE_TIMEOUT_MINUTES * 60 * 1000;
      const playersToRemove: QueuedPlayer[] = [];

      console.log(`🔍 Verificando ${this.queue.length} jogadores na fila para limpeza...`);

      // Verificar jogadores inativos
      for (const player of this.queue) {
        const timeInQueue = now.getTime() - player.joinTime.getTime();
        const timeInQueueMinutes = Math.floor(timeInQueue / (1000 * 60));

        // Verificar se é um bot (ID negativo)
        const isBot = player.id < 0;

        // Verificar se WebSocket está morto ou null
        const isWebSocketDead = !player.websocket ||
          player.websocket.readyState === WebSocket.CLOSED ||
          player.websocket.readyState === WebSocket.CLOSING;

        // Log do estado do jogador
        console.log(`👤 ${player.summonerName}: ${timeInQueueMinutes}min na fila, WebSocket: ${player.websocket ? 'ativo' : 'null/inativo'}, Bot: ${isBot}`);

        // Para bots: só remover se tempo for negativo (dados corrompidos) ou timeout muito longo (mais de 24 horas)
        if (isBot) {
          if (timeInQueue < 0 || timeInQueue > (24 * 60 * 60 * 1000)) {
            let reason = timeInQueue < 0 ? 'Dados de tempo corrompidos' : 'Timeout de 24 horas';
            console.log(`⚠️ Marcando bot ${player.summonerName} para remoção: ${reason}`);
            playersToRemove.push(player);
          }
          continue; // Pular verificações de WebSocket para bots
        }

        // Para jogadores reais: remover se:
        // 1. WebSocket está morto ou null (jogador desconectou) OU
        // 2. Jogador está na fila há mais tempo que o timeout (2 horas) OU
        // 3. Tempo negativo (dados corrompidos)
        if (isWebSocketDead || timeInQueue > timeoutMs || timeInQueue < 0) {
          let reason = '';
          if (timeInQueue < 0) {
            reason = 'Dados de tempo corrompidos';
          } else if (isWebSocketDead) {
            reason = 'WebSocket inativo';
          } else {
            reason = 'Timeout de 2 horas';
          }
          console.log(`⚠️ Marcando ${player.summonerName} para remoção: ${reason}`);
          playersToRemove.push(player);
        }
      }

      // Remover jogadores inativos
      for (const player of playersToRemove) {
        const playerIndex = this.queue.findIndex(p => p.id === player.id);
        if (playerIndex !== -1) {
          this.queue.splice(playerIndex, 1);

          // Persistir saída da fila no banco (apenas para jogadores reais)
          if (player.id > 0) {
            await this.dbManager.removePlayerFromQueue(player.id);
          }

          // Adicionar atividade de saída automática
          this.addActivity(
            'player_left',
            `${player.summonerName} removido automaticamente da fila (inativo)`,
            player.summonerName
          );

          console.log(`🧹 Removido jogador inativo: ${player.summonerName}`);
        }
      }

      // Atualizar posições na fila se houve remoções
      if (playersToRemove.length > 0) {
        this.queue.forEach((p, index) => {
          p.queuePosition = index + 1;
        });

        // Broadcast atualização da fila
        await this.broadcastQueueUpdate();

        console.log(`🧹 Limpeza concluída: ${playersToRemove.length} jogadores removidos`);
      } else {
        console.log(`✅ Nenhum jogador removido na limpeza automática`);
      }
    } catch (error) {
      console.error('❌ Erro na limpeza automática:', error);
    }
  }

  // Método para verificar se um WebSocket está ativo
  private isWebSocketActive(websocket: WebSocket): boolean {
    return websocket &&
      websocket.readyState === WebSocket.OPEN;
  }

  // Método para carregar fila do banco de dados
  private async loadQueueFromDatabase(): Promise<void> {
    try {
      const queuePlayers = await this.dbManager.getActiveQueuePlayers();

      for (const dbPlayer of queuePlayers) {
        // Validar dados de tempo
        const joinTime = new Date(dbPlayer.join_time);
        const now = new Date();
        const timeInQueue = now.getTime() - joinTime.getTime();

        // Se o tempo for negativo ou muito antigo (mais de 3 horas), pular este jogador
        if (timeInQueue < 0 || timeInQueue > (3 * 60 * 60 * 1000)) {
          console.log(`⚠️ [Matchmaking] Jogador com dados de tempo inválidos: ${dbPlayer.summoner_name}`);
          console.log(`   - join_time: ${dbPlayer.join_time}`);
          console.log(`   - timeInQueue: ${Math.floor(timeInQueue / (1000 * 60))}min`);
          console.log(`   - Removendo da fila persistente...`);

          // Remover da fila persistente
          try {
            await this.dbManager.removePlayerFromQueue(dbPlayer.player_id);
            console.log(`✅ [Matchmaking] Jogador removido da fila persistente: ${dbPlayer.summoner_name}`);
          } catch (error) {
            console.error(`❌ [Matchmaking] Erro ao remover jogador da fila persistente:`, error);
          }
          continue;
        }

        const queuedPlayer: QueuedPlayer = {
          id: dbPlayer.player_id,
          summonerName: dbPlayer.summoner_name,
          region: dbPlayer.region,
          currentMMR: dbPlayer.custom_lp || 0,
          joinTime: joinTime,
          websocket: null as any, // WebSocket será atualizado quando o jogador reconectar
          queuePosition: dbPlayer.queue_position || 0,
          preferences: {
            primaryLane: dbPlayer.primary_lane || 'fill',
            secondaryLane: dbPlayer.secondary_lane || 'fill'
          }
        };

        this.queue.push(queuedPlayer);
        console.log(`📊 [Matchmaking] Jogador carregado da fila persistente: ${dbPlayer.summoner_name} (${Math.floor(timeInQueue / (1000 * 60))}min na fila)`);
      }

      // Garantir que as posições estejam corretas após carregar
      await this.updateQueuePositions();

      console.log(`📊 [Matchmaking] Carregados ${this.queue.length} jogadores da fila persistente`);
    } catch (error) {
      console.error('❌ [Matchmaking] Erro ao carregar fila do banco:', error);
    }
  }

  async addPlayerToQueue(websocket: WebSocket, requestData: any): Promise<void> {
    try {
      // Validar dados da requisição
      if (!requestData) {
        throw new Error('Dados da requisição não fornecidos');
      }

      // Extrair player e preferences dos dados
      const playerData = requestData.player;
      const preferences = requestData.preferences;

      console.log('🔍 [Matchmaking] Dados recebidos - playerData:', playerData);
      console.log('🔍 [Matchmaking] Dados recebidos - preferences:', preferences);

      // Validar dados do jogador
      if (!playerData) {
        throw new Error('Dados do jogador não fornecidos');
      }

      // Construir o nome completo (gameName#tagLine)
      let fullSummonerName = playerData.summonerName;
      if (playerData.gameName && playerData.tagLine) {
        fullSummonerName = `${playerData.gameName}#${playerData.tagLine}`;
        console.log('🔍 [Matchmaking] Nome completo construído:', fullSummonerName);
      } else if (!playerData.summonerName) {
        throw new Error('Nome do invocador é obrigatório');
      }

      console.log('🔍 [Matchmaking] Nome final para busca/criação:', fullSummonerName);

      // Buscar jogador no banco ou criar novo
      let player = await this.dbManager.getPlayerBySummonerName(fullSummonerName);
      if (!player) {
        // Criar novo jogador se não existir
        const playerId = await this.dbManager.createPlayer({
          summoner_name: fullSummonerName,
          summoner_id: playerData.summonerId,
          puuid: playerData.puuid,
          region: playerData.region || 'br1',
          current_mmr: 1000,
          peak_mmr: 1000,
          games_played: 0,
          wins: 0,
          losses: 0,
          win_streak: 0,
          custom_lp: 0 // Inicializar custom_lp
        });
        player = await this.dbManager.getPlayer(playerId);
        console.log('✅ [Matchmaking] Novo jogador criado:', { id: playerId, name: fullSummonerName });
      }

      if (!player) {
        throw new Error('Falha ao criar/recuperar jogador');
      }

      // Verificar se jogador já está na fila
      const existingPlayerIndex = this.queue.findIndex(p => p.id === player!.id);
      if (existingPlayerIndex !== -1) {
        // Atualizar websocket se jogador reconectar
        this.queue[existingPlayerIndex].websocket = websocket;
        console.log('🔄 [Matchmaking] Jogador já na fila, atualizando WebSocket:', fullSummonerName);
        websocket.send(JSON.stringify({
          type: 'queue_joined',
          data: { position: existingPlayerIndex + 1, estimated_wait: this.calculateEstimatedWaitTime() }
        }));
        return;
      }

      // Adicionar à fila
      const queuedPlayer: QueuedPlayer = {
        id: player.id!,
        summonerName: fullSummonerName, // Usar nome completo
        region: player.region,
        currentMMR: player.custom_lp || 0, // Usar custom_lp em vez de current_mmr
        joinTime: new Date(),
        websocket: websocket,
        queuePosition: this.queue.length + 1,
        preferences: preferences
      };

      console.log('🔍 [Matchmaking] Preferências do jogador:', {
        receivedPreferences: preferences,
        finalPreferences: queuedPlayer.preferences,
        primaryLane: queuedPlayer.preferences?.primaryLane,
        secondaryLane: queuedPlayer.preferences?.secondaryLane
      });

      this.queue.push(queuedPlayer);

      // Persistir entrada na fila no banco
      await this.dbManager.addPlayerToQueue(
        queuedPlayer.id,
        queuedPlayer.summonerName, // Nome completo
        queuedPlayer.region,
        queuedPlayer.currentMMR,
        preferences
      );

      // Atualizar posições na fila após adicionar o jogador
      await this.updateQueuePositions();

      // Adicionar atividade
      const primaryLaneName = this.getLaneDisplayName(preferences?.primaryLane);
      this.addActivity(
        'player_joined',
        `${fullSummonerName} entrou na fila como ${primaryLaneName}`,
        fullSummonerName,
        undefined,
        preferences?.primaryLane
      );

      console.log(`✅ [Matchmaking] ${fullSummonerName} entrou na fila como ${primaryLaneName}`);

      // Notificar jogador sobre entrada na fila
      websocket.send(JSON.stringify({
        type: 'queue_joined',
        data: {
          position: this.queue.length,
          estimatedWait: this.calculateEstimatedWaitTime(),
          queueStatus: await this.getQueueStatus()
        }
      }));

      // Broadcast atualização da fila (forçar imediatamente para entrada)
      await this.forceQueueUpdate();

      console.log(`➕ [Matchmaking] ${fullSummonerName} entrou na fila (Posição: ${this.queue.length}, MMR: ${player.custom_lp})`);

    } catch (error: any) {
      console.error('❌ [Matchmaking] Erro ao adicionar jogador à fila:', error);
      websocket.send(JSON.stringify({
        type: 'error',
        message: 'Falha ao entrar na fila: ' + error.message
      }));
    }
  }

  async removePlayerFromQueue(websocket: WebSocket): Promise<void> {
    console.log('🔍 [Matchmaking] removePlayerFromQueue chamado via WebSocket');
    console.log('🔍 [Matchmaking] Fila atual:', this.queue.map(p => ({
      id: p.id,
      name: p.summonerName,
      wsActive: p.websocket?.readyState === WebSocket.OPEN,
      wsRef: p.websocket === websocket ? 'MATCH' : 'DIFFERENT'
    })));

    // Tentar encontrar o jogador por WebSocket
    let playerIndex = this.queue.findIndex(player => player.websocket === websocket);
    console.log('🔍 [Matchmaking] Player index encontrado por WebSocket:', playerIndex);

    // Se não encontrou por WebSocket, tentar por WebSocket ID ou referência
    if (playerIndex === -1) {
      console.log('🔍 [Matchmaking] Tentando busca alternativa por WebSocket...');
      console.log('🔍 [Matchmaking] WebSocket recebido:', {
        readyState: websocket.readyState,
        url: (websocket as any).url,
        protocol: (websocket as any).protocol
      });

      // Tentar encontrar por qualquer critério que possa identificar o WebSocket
      playerIndex = this.queue.findIndex(player => {
        const playerWs = player.websocket;
        return playerWs && (
          playerWs === websocket ||
          playerWs.readyState === websocket.readyState ||
          (playerWs as any).url === (websocket as any).url
        );
      });
      console.log('🔍 [Matchmaking] Player index encontrado por busca alternativa:', playerIndex);
    }

    console.log('🔍 [Matchmaking] Tamanho da fila antes:', this.queue.length);

    if (playerIndex !== -1) {
      const player = this.queue[playerIndex];
      console.log('✅ [Matchmaking] Removendo jogador:', { id: player.id, name: player.summonerName });

      this.queue.splice(playerIndex, 1);

      // Persistir saída da fila no banco
      this.dbManager.removePlayerFromQueue(player.id).then(() => {
        console.log(`✅ [Matchmaking] Jogador ${player.summonerName} removido da fila persistente`);
      }).catch(error => {
        console.error('❌ [Matchmaking] Erro ao remover jogador da fila persistente:', error);
      });

      // Adicionar atividade de saída
      this.addActivity(
        'player_left',
        `${player.summonerName} saiu da fila`,
        player.summonerName
      );

      // Atualizar posições na fila E NO BANCO
      await this.updateQueuePositions();

      console.log(`➖ [Matchmaking] ${player.summonerName} saiu da fila`);
      console.log('🔍 [Matchmaking] Tamanho da fila depois:', this.queue.length);
      console.log('🔍 [Matchmaking] Nova fila:', this.queue.map(p => ({ id: p.id, name: p.summonerName })));

      // Broadcast atualização da fila (forçar imediatamente para saída)
      await this.forceQueueUpdate();
    } else {
      console.log('⚠️ [Matchmaking] Jogador não encontrado na fila para remoção via WebSocket');
      console.log('🔍 [Matchmaking] WebSocket recebido:', {
        readyState: websocket.readyState,
        url: (websocket as any).url,
        protocol: (websocket as any).protocol
      });
      console.log('🔍 [Matchmaking] WebSockets na fila:', this.queue.map(p => ({
        name: p.summonerName,
        wsState: p.websocket?.readyState,
        wsUrl: (p.websocket as any)?.url
      })));
    }
  }

  // NOVO: Método para atualizar posições na fila e no banco
  private async updateQueuePositions(): Promise<void> {
    try {
      // Atualizar posições na memória
      this.queue.forEach((p, index) => {
        p.queuePosition = index + 1;
      });

      // Atualizar posições no banco de dados
      for (let i = 0; i < this.queue.length; i++) {
        const player = this.queue[i];
        await this.dbManager.updateQueuePosition(player.id, i + 1);
      }

      console.log(`✅ [Matchmaking] Posições da fila atualizadas: ${this.queue.length} jogadores`);
    } catch (error) {
      console.error('❌ [Matchmaking] Erro ao atualizar posições da fila:', error);
    }
  }

  // Método para adicionar jogador à fila sem WebSocket (para uso automático)
  addPlayerToQueueDirect(playerData: any): void {
    try {
      // Verificar se o jogador já está na fila
      const existingPlayer = this.queue.find(p => p.id === playerData.id); if (existingPlayer) {
        // console.log(`⚠️ Jogador ${playerData.summonerName} já está na fila`);
        return;
      }

      const queuedPlayer: QueuedPlayer = {
        id: playerData.id,
        summonerName: playerData.summonerName,
        region: playerData.region,
        currentMMR: playerData.currentMMR,
        joinTime: new Date(),
        websocket: null as any, // Para entrada automática, sem WebSocket
        queuePosition: this.queue.length + 1
      };

      this.queue.push(queuedPlayer);
      // Registrar entrada na fila no banco
      this.dbManager.recordQueueAction('join', queuedPlayer.id);

      console.log(`🎯 Jogador ${playerData.summonerName} adicionado à fila automaticamente (posição ${queuedPlayer.queuePosition})`);

      // Notificar outros jogadores via WebSocket sobre atualização da fila
      this.broadcastQueueUpdate();
    } catch (error) {
      console.error('Erro ao adicionar jogador à fila:', error);
    }
  }

  // Método temporário para adicionar bots na fila (apenas para testes)
  async addBotToQueue(): Promise<void> {
    const availableLanes = ['top', 'jungle', 'mid', 'bot', 'support'];
    const usedLanes = this.queue.map(p => p.preferences?.primaryLane).filter(Boolean);
    const availableUnusedLanes = availableLanes.filter(lane => !usedLanes.includes(lane));

    // Se não há lanes livres, usar lane aleatória mesmo assim
    const selectedLanes = availableUnusedLanes.length > 0 ? availableUnusedLanes : availableLanes;
    const primaryLane = selectedLanes[Math.floor(Math.random() * selectedLanes.length)];

    // Selecionar lane secundária diferente da primária
    let secondaryLane = availableLanes.filter(lane => lane !== primaryLane)[Math.floor(Math.random() * 4)];

    const botNumber = this.queue.filter(p => p.summonerName.startsWith('Bot')).length + 1;
    const botName = `Bot${botNumber}`;

    // Gerar MMR aleatório entre 800 e 2000
    const randomMMR = Math.floor(Math.random() * 1200) + 800;

    const botPlayer: QueuedPlayer = {
      id: -botNumber, // ID negativo para distinguir de jogadores reais
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

    // Adicionar atividade
    const primaryLaneName = this.getLaneName(primaryLane);
    this.addActivity(
      'player_joined',
      `🤖 ${botName} (Bot) entrou na fila como ${primaryLaneName}`,
      botName,
      undefined,
      primaryLane
    );

    console.log(`🤖 Bot ${botName} adicionado à fila - Lane: ${primaryLaneName}, MMR: ${randomMMR}`);

    // Atualizar posições na fila
    this.queue.forEach((p, index) => {
      p.queuePosition = index + 1;
    });

    // Notificar todos os clientes sobre a atualização
    this.broadcastQueueUpdate();
  }

  // Método auxiliar para obter nome das lanes
  private getLaneName(laneId: string): string {
    const lanes: { [key: string]: string } = {
      'top': 'Topo',
      'jungle': 'Selva',
      'mid': 'Meio',
      'bot': 'Atirador',
      'support': 'Suporte'
    };
    return lanes[laneId] || laneId;
  } private async processMatchmaking(): Promise<void> {
    console.log(`🔄 [Matchmaking] Processando matchmaking - ${this.queue.length} jogadores na fila`);

    if (!this.isActive || this.queue.length < 10) {
      console.log(`❌ [Matchmaking] Matchmaking não ativo ou jogadores insuficientes: ativo=${this.isActive}, jogadores=${this.queue.length}`);
      return;
    }

    try {
      console.log(`🔍 [Matchmaking] Buscando melhor partida...`);
      const match = await this.findBestMatch();

      if (match) {
        console.log('🎮 Partida encontrada! Criando lobby...', {
          team1Players: match.team1.length,
          team2Players: match.team2.length,
          avgMMR1: Math.round(match.averageMMR1),
          avgMMR2: Math.round(match.averageMMR2)
        });

        // Salvar partida no banco de dados
        await this.createMatchAndNotify(match);

        // Remover jogadores da fila
        const allMatchPlayers = [...match.team1, ...match.team2];
        this.queue = this.queue.filter(player =>
          !allMatchPlayers.some(matchPlayer => matchPlayer.id === player.id)
        );

        // Notificar todos os jogadores da partida
        this.notifyMatchFound(match);

        // Adicionar atividade
        this.addActivity(
          'match_created',
          `Partida criada! ${match.team1.length}v${match.team2.length} - MMR médio: ${Math.round((match.averageMMR1 + match.averageMMR2) / 2)}`
        );

        // Atualizar status da fila
        this.broadcastQueueUpdate();

        console.log('✅ Partida criada com sucesso!');
      } else {
        console.log(`❌ [Matchmaking] Nenhuma partida encontrada para ${this.queue.length} jogadores`);
      }
    } catch (error) {
      console.error('❌ [Matchmaking] Erro no processamento de matchmaking:', error);
    }
  }

  // Método para criar partida no banco e notificar jogadores
  private async createMatchAndNotify(match: Match): Promise<void> {
    try {
      // Salvar partida no banco de dados como partida personalizada
      const matchId = await this.dbManager.createCustomMatch({
        title: `Partida Automatizada ${new Date().toLocaleString()}`,
        description: `Times balanceados - MMR médio: Time 1: ${Math.round(match.averageMMR1)}, Time 2: ${Math.round(match.averageMMR2)}`,
        team1Players: match.team1.map(p => p.summonerName),
        team2Players: match.team2.map(p => p.summonerName),
        createdBy: 'Sistema de Matchmaking',
        gameMode: 'CLASSIC'
      });

      // Atualizar o ID da partida
      match.id = matchId;

      // Adicionar à lista de partidas ativas
      this.activeMatches.set(matchId, match);

      // Remover jogadores da fila
      const matchPlayerIds = [...match.team1, ...match.team2].map(p => p.id);
      this.queue = this.queue.filter(p => !matchPlayerIds.includes(p.id));

      // Adicionar atividade
      this.addActivity('match_created', `Partida criada! ${match.team1.length}v${match.team2.length} - MMR médio: ${Math.round((match.averageMMR1 + match.averageMMR2) / 2)}`);

      // Configurar timeout para aceitação (30 segundos)
      match.acceptTimeout = setTimeout(() => {
        this.handleMatchTimeout(matchId);
      }, 30000);

      // Notificar todos os jogadores sobre a partida encontrada
      this.notifyMatchFound(match);

      // Auto-aceitar bots após 1 segundo (simular tempo de reação)
      setTimeout(() => {
        this.autoAcceptBots(matchId);
      }, 1000);

      // Atualizar status da fila
      this.broadcastQueueUpdate();

      console.log(`🎮 Partida criada! ID: ${matchId}, Players: ${matchPlayerIds.length}`);
    } catch (error) {
      console.error('Erro ao criar partida:', error);
    }
  }

  // Método para lidar com timeout de aceitação
  private handleMatchTimeout(matchId: number): void {
    const match = this.activeMatches.get(matchId);
    if (!match) return;

    const allPlayers = [...match.team1, ...match.team2];
    const nonAcceptedPlayers = allPlayers.filter(p => !match.acceptedPlayers.has(p.id));

    if (nonAcceptedPlayers.length > 0) {
      console.log(`⏰ Timeout da partida ${matchId}! Jogadores que não aceitaram:`,
        nonAcceptedPlayers.map(p => p.summonerName));

      // Notificar jogadores sobre o timeout
      allPlayers.forEach(player => {
        if (player.websocket && player.id > 0) { // Pular bots
          try {
            player.websocket.send(JSON.stringify({
              type: 'match_timeout',
              data: { matchId: matchId }
            }));
          } catch (error) {
            console.error(`Erro ao notificar timeout para ${player.summonerName}:`, error);
          }
        }
      });

      // Remover partida das ativas
      this.activeMatches.delete(matchId);

      // Retornar jogadores que aceitaram para a fila
      const acceptedPlayers = allPlayers.filter(p => match.acceptedPlayers.has(p.id) && p.id > 0);
      acceptedPlayers.forEach(player => {
        this.queue.push(player);
      });

      // Atualizar status da fila
      this.broadcastQueueUpdate();

      this.addActivity('match_created', `Partida ${matchId} cancelada por timeout`);
    }
  }

  // Método para auto-aceitar bots
  private autoAcceptBots(matchId: number): void {
    const match = this.activeMatches.get(matchId);
    if (!match) return;

    const allPlayers = [...match.team1, ...match.team2];
    const botPlayers = allPlayers.filter(p => p.id < 0); // Bots têm ID negativo

    if (botPlayers.length === 0) {
      console.log(`🤖 Nenhum bot encontrado na partida ${matchId}`);
      return;
    }

    console.log(`🤖 Auto-aceitando ${botPlayers.length} bots na partida ${matchId}`);

    // Auto-aceitar cada bot com delay para simular tempo de reação
    botPlayers.forEach((bot, index) => {
      setTimeout(() => {
        try {
          // Adicionar bot diretamente aos aceitos sem chamar acceptMatch
          match.acceptedPlayers.add(bot.id);
          console.log(`🤖 Bot ${bot.summonerName} aceitou automaticamente`);

          // Verificar se todos os jogadores aceitaram
          const allPlayers = [...match.team1, ...match.team2];
          const allAccepted = allPlayers.every(p => match.acceptedPlayers.has(p.id));

          console.log(`📊 Partida ${matchId}: ${match.acceptedPlayers.size}/${allPlayers.length} aceitaram`);

          if (allAccepted) {
            console.log(`🎉 Todos os jogadores aceitaram a partida ${matchId}! Iniciando draft...`);

            // Limpar timeout se existir
            if (match.acceptTimeout) {
              clearTimeout(match.acceptTimeout);
              match.acceptTimeout = undefined;
            }

            // Iniciar fase de draft
            this.startDraftPhase(matchId);
          }
        } catch (error) {
          console.error(`Erro ao auto-aceitar bot ${bot.summonerName}:`, error);
        }
      }, (index + 1) * 500); // 500ms de delay entre cada bot
    });
  }

  // Método para notificar jogadores sobre partida encontrada
  private notifyMatchFound(match: Match): void {
    const allPlayers = [...match.team1, ...match.team2];

    allPlayers.forEach((player, index) => {
      // Pular bots (eles não têm websocket)
      if (!player.websocket || player.id < 0) return;

      const isTeam1 = match.team1.includes(player);
      const team = isTeam1 ? match.team1 : match.team2;
      const enemyTeam = isTeam1 ? match.team2 : match.team1;

      const matchData = {
        matchId: match.id,
        playerSide: isTeam1 ? 'blue' : 'red',
        teammates: team.map(p => ({
          id: p.id,
          summonerName: p.summonerName,
          mmr: p.currentMMR,
          primaryLane: p.preferences?.primaryLane || 'fill',
          secondaryLane: p.preferences?.secondaryLane || 'fill'
        })),
        enemies: enemyTeam.map(p => ({
          id: p.id,
          summonerName: p.summonerName,
          mmr: p.currentMMR,
          primaryLane: p.preferences?.primaryLane || 'fill',
          secondaryLane: p.preferences?.secondaryLane || 'fill'
        })),
        averageMMR: {
          yourTeam: isTeam1 ? match.averageMMR1 : match.averageMMR2,
          enemyTeam: isTeam1 ? match.averageMMR2 : match.averageMMR1
        },
        estimatedGameDuration: 25, // minutos
        phase: 'accept', // accept -> draft -> in_game
        acceptTimeout: 30 // segundos para aceitar
      };

      try {
        player.websocket.send(JSON.stringify({
          type: 'match_found',
          data: matchData
        }));
      } catch (error) {
        console.error(`Erro ao notificar jogador ${player.summonerName}:`, error);
      }
    });
  }

  // Método para aceitar partida
  async acceptMatch(playerId: number, matchId: number, summonerName?: string): Promise<void> {
    const match = this.activeMatches.get(matchId);
    if (!match) {
      throw new Error('Partida não encontrada');
    }

    console.log(`🔍 [Matchmaking] Tentativa de aceitar partida - Match ID: ${matchId}, Player ID: ${playerId}, Nome: ${summonerName}`);
    console.log(`🔍 [Matchmaking] Jogadores na partida:`, [...match.team1, ...match.team2].map(p => ({ id: p.id, name: p.summonerName })));

    // Procurar jogador - priorizar por nome se disponível
    let player: QueuedPlayer | undefined;

    if (summonerName) {
      // Primeira tentativa: buscar por nome exato
      player = [...match.team1, ...match.team2].find(p => p.summonerName === summonerName);

      // Segunda tentativa: buscar por nome parcial (sem tagline)
      if (!player && summonerName.includes('#')) {
        const gameNameOnly = summonerName.split('#')[0];
        player = [...match.team1, ...match.team2].find(p => p.summonerName.startsWith(gameNameOnly + '#'));
      }

      // Terceira tentativa: buscar por gameName apenas
      if (!player) {
        player = [...match.team1, ...match.team2].find(p => p.summonerName.split('#')[0] === summonerName);
      }
    }

    // Se não encontrou por nome, tentar por ID
    if (!player && playerId) {
      player = [...match.team1, ...match.team2].find(p => p.id === playerId);
    }

    if (!player) {
      console.log(`❌ [Matchmaking] Jogador não encontrado na partida`);
      console.log(`🔍 [Matchmaking] Dados recebidos:`, { playerId, summonerName });
      console.log(`🔍 [Matchmaking] Jogadores disponíveis:`, [...match.team1, ...match.team2].map(p => ({ id: p.id, name: p.summonerName })));
      throw new Error('Jogador não está nesta partida');
    }

    // Verificar se o jogador já aceitou
    if (match.acceptedPlayers.has(player.id)) {
      console.log(`⚠️ [Matchmaking] ${player.summonerName} já aceitou a partida ${matchId}`);
      return; // Não é um erro, apenas já aceitou
    }

    // Adicionar jogador aos que aceitaram
    match.acceptedPlayers.add(player.id);
    console.log(`✅ [Matchmaking] ${player.summonerName} aceitou a partida ${matchId}`);

    // Verificar se todos os jogadores aceitaram
    const allPlayers = [...match.team1, ...match.team2];
    const allAccepted = allPlayers.every(p => match.acceptedPlayers.has(p.id));

    console.log(`📊 [Matchmaking] Partida ${matchId}: ${match.acceptedPlayers.size}/${allPlayers.length} aceitaram`);

    if (allAccepted) {
      console.log(`🎉 [Matchmaking] Todos os jogadores aceitaram a partida ${matchId}! Iniciando draft...`);

      // Limpar timeout se existir
      if (match.acceptTimeout) {
        clearTimeout(match.acceptTimeout);
        match.acceptTimeout = undefined;
      }

      // Iniciar fase de draft
      this.startDraftPhase(matchId);
    }
  }

  // Método para recusar partida
  async declineMatch(playerId: number, matchId: number, summonerName?: string): Promise<void> {
    const match = this.activeMatches.get(matchId);
    if (!match) {
      throw new Error('Partida não encontrada');
    }

    console.log(`🔍 [Matchmaking] Tentativa de recusar partida - Match ID: ${matchId}, Player ID: ${playerId}, Nome: ${summonerName}`);
    console.log(`🔍 [Matchmaking] Jogadores na partida:`, [...match.team1, ...match.team2].map(p => ({ id: p.id, name: p.summonerName })));

    // Procurar jogador - priorizar por nome se disponível
    let player: QueuedPlayer | undefined;

    if (summonerName) {
      // Primeira tentativa: buscar por nome exato
      player = [...match.team1, ...match.team2].find(p => p.summonerName === summonerName);

      // Segunda tentativa: buscar por nome parcial (sem tagline)
      if (!player && summonerName.includes('#')) {
        const gameNameOnly = summonerName.split('#')[0];
        player = [...match.team1, ...match.team2].find(p => p.summonerName.startsWith(gameNameOnly + '#'));
      }

      // Terceira tentativa: buscar por gameName apenas
      if (!player) {
        player = [...match.team1, ...match.team2].find(p => p.summonerName.split('#')[0] === summonerName);
      }
    }

    // Se não encontrou por nome, tentar por ID
    if (!player && playerId) {
      player = [...match.team1, ...match.team2].find(p => p.id === playerId);
    }

    if (!player) {
      console.log(`❌ [Matchmaking] Jogador não encontrado na partida para recusar`);
      console.log(`🔍 [Matchmaking] Dados recebidos:`, { playerId, summonerName });
      console.log(`🔍 [Matchmaking] Jogadores disponíveis:`, [...match.team1, ...match.team2].map(p => ({ id: p.id, name: p.summonerName })));
      throw new Error('Jogador não está nesta partida');
    }

    console.log(`❌ [Matchmaking] ${player.summonerName} recusou a partida ${matchId}`);

    // Cancelar partida imediatamente quando alguém recusa
    await this.cancelMatch(matchId, `${player.summonerName} recusou a partida`);
  }

  // Método para cancelar partida
  private async cancelMatch(matchId: number, reason: string): Promise<void> {
    const match = this.activeMatches.get(matchId);
    if (!match) {
      console.log(`⚠️ [CancelMatch] Partida ${matchId} não encontrada nas partidas ativas`);
      return;
    }

    console.log(`🎉 Partida ${matchId} cancelada por ${reason}`);
    console.log(`🔍 [CancelMatch] Dados da partida:`, {
      matchId: matchId,
      matchIdInMatch: match.id,
      team1Size: match.team1.length,
      team2Size: match.team2.length,
      status: match.status
    });

    // Remover partida das ativas
    this.activeMatches.delete(matchId);

    // Limpar timeout se existir
    if (match.acceptTimeout) {
      clearTimeout(match.acceptTimeout);
      match.acceptTimeout = undefined;
    }

    // APAGAR partida do banco de dados se foi salva
    try {
      if (match.id) {
        console.log(`🗑️ [CancelMatch] Tentando apagar partida ${matchId} do banco (ID: ${match.id})`);
        await this.dbManager.deleteCustomMatch(match.id);
        console.log(`🗑️ [Matchmaking] Partida ${matchId} apagada do banco de dados (ID: ${match.id})`);
      } else {
        console.log(`⚠️ [Matchmaking] Partida ${matchId} não tem ID no banco para apagar`);
      }
    } catch (error) {
      console.error(`❌ [Matchmaking] Erro ao apagar partida ${matchId} do banco:`, error);
    }

    // CORREÇÃO: Apenas quem recusou sai da fila, os outros continuam
    const allPlayers = [...match.team1, ...match.team2];

    // Se a razão indica que alguém recusou, identificar quem recusou
    let declinedPlayer: QueuedPlayer | undefined;
    if (reason.includes('recusou a partida')) {
      const playerName = reason.replace(' recusou a partida', '');
      declinedPlayer = allPlayers.find(p => p.summonerName === playerName);
      console.log(`🔍 [CancelMatch] Jogador que recusou identificado:`, declinedPlayer?.summonerName);
    }

    const removedPlayers: string[] = [];
    const returnedPlayers: string[] = [];

    // Processar jogadores
    allPlayers.forEach(player => {
      if (player === declinedPlayer) {
        // Apenas quem recusou sai da fila
        const playerIndex = this.queue.findIndex(p => p.id === player.id);
        if (playerIndex !== -1) {
          this.queue.splice(playerIndex, 1);
          removedPlayers.push(player.summonerName);
          console.log(`🗑️ [CancelMatch] ${player.summonerName} removido da fila (recusou a partida)`);
        }
      } else {
        // Os outros jogadores continuam na fila
        const playerIndex = this.queue.findIndex(p => p.id === player.id);
        if (playerIndex === -1) {
          // Se não está na fila, adicionar de volta
          player.websocket = null as any; // Resetar websocket
          this.queue.push(player);
          returnedPlayers.push(player.summonerName);
          console.log(`🔄 [CancelMatch] ${player.summonerName} retornou à fila (Bot: ${player.id < 0})`);
        } else {
          console.log(`✅ [CancelMatch] ${player.summonerName} já está na fila (Bot: ${player.id < 0})`);
        }
      }
    });

    // Notificar jogadores sobre o cancelamento
    allPlayers.forEach(player => {
      if (player.websocket && player.id > 0) { // Pular bots
        try {
          player.websocket.send(JSON.stringify({
            type: 'match_cancelled',
            data: {
              matchId: matchId,
              reason: reason,
              declinedPlayer: declinedPlayer?.summonerName
            }
          }));
        } catch (error) {
          console.error(`Erro ao notificar cancelamento para ${player.summonerName}:`, error);
        }
      }
    });

    // Atualizar posições na fila
    this.queue.forEach((p, index) => {
      p.queuePosition = index + 1;
    });

    // Broadcast atualização da fila
    this.broadcastQueueUpdate();

    console.log(`✅ [CancelMatch] ${removedPlayers.length} jogador removido da fila:`, removedPlayers);
    console.log(`✅ [CancelMatch] ${returnedPlayers.length} jogadores retornaram à fila:`, returnedPlayers);
    this.addActivity('match_created', `Partida ${matchId} cancelada por ${reason} - ${removedPlayers.length} jogador removido, ${returnedPlayers.length} retornaram à fila`);
  }

  // Método para adicionar atividade ao histórico
  private addActivity(type: QueueActivity['type'], message: string, playerName?: string, playerTag?: string, lane?: string): void {
    const activity: QueueActivity = {
      id: `activity_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
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
  }

  // Método para calcular tempo estimado de espera
  private calculateEstimatedWaitTime(): number {
    if (this.queue.length < 10) {
      return Math.max(30, this.queue.length * 5); // Mínimo 30 segundos
    }
    return 60; // 1 minuto quando há jogadores suficientes
  }

  // Método para obter nome de exibição da lane
  private getLaneDisplayName(laneId?: string): string {
    const lanes: { [key: string]: string } = {
      'top': 'Topo',
      'jungle': 'Selva',
      'mid': 'Meio',
      'bot': 'Atirador',
      'support': 'Suporte',
      'fill': 'Preenchimento'
    };
    return lanes[laneId || 'fill'] || 'Preenchimento';
  }

  // Método simplificado para broadcast imediato
  public async broadcastQueueUpdate(force: boolean = false): Promise<void> {
    if (!this.wss) {
      console.log('⚠️ [Matchmaking] WebSocket server não disponível para broadcast');
      return;
    }

    const now = Date.now();

    // Proteção básica contra spam (mínimo 50ms entre broadcasts para tempo real)
    if (!force && now - this.lastBroadcastTime < 50) {
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

      // Enviar para todos os clientes conectados
      let sentCount = 0;
      this.wss.clients.forEach((client: WebSocket) => {
        if (client.readyState === WebSocket.OPEN) {
          try {
            client.send(JSON.stringify({
              type: 'queue_update',
              data: queueStatus,
              timestamp: now
            }));
            sentCount++;
          } catch (error) {
            console.error('❌ [Matchmaking] Erro ao enviar atualização da fila:', error);
          }
        }
      });

      console.log(`✅ [Matchmaking] Broadcast enviado para ${sentCount}/${this.wss.clients.size} clientes`);
    } catch (error) {
      console.error('❌ [Matchmaking] Erro no broadcast da fila:', error);
    }
  }

  // Método para obter status da fila
  async getQueueStatus(): Promise<QueueStatus> {
    const playersInQueueList: QueuedPlayerInfo[] = this.queue.map(player => ({
      summonerName: player.summonerName,
      primaryLane: player.preferences?.primaryLane || 'fill',
      secondaryLane: player.preferences?.secondaryLane || 'fill',
      primaryLaneDisplay: this.getLaneDisplayName(player.preferences?.primaryLane),
      secondaryLaneDisplay: this.getLaneDisplayName(player.preferences?.secondaryLane),
      mmr: player.currentMMR,
      queuePosition: player.queuePosition || 0,
      joinTime: player.joinTime
    }));

    return {
      playersInQueue: this.queue.length,
      averageWaitTime: this.calculateEstimatedWaitTime(),
      estimatedMatchTime: this.queue.length >= 10 ? 60 : 120,
      isActive: this.isActive,
      playersInQueueList,
      recentActivities: [...this.recentActivities]
    };
  }

  // Método para obter partidas recentes
  async getRecentMatches(): Promise<any[]> {
    try {
      return await this.dbManager.getCustomMatches(10);
    } catch (error) {
      console.error('Erro ao buscar partidas recentes:', error);
      return [];
    }
  }

  // Método para encontrar melhor partida
  private async findBestMatch(): Promise<Match | null> {
    if (this.queue.length < 10) {
      return null;
    }

    console.log(`🔍 [Matchmaking] Verificando matchmaking - ${this.queue.length} jogadores na fila`);

    // Filtrar jogadores que não acabaram de ter o draft cancelado (cooldown de 30 segundos)
    const now = Date.now();
    const cooldownMs = 30000; // 30 segundos de cooldown
    const eligiblePlayers = this.queue.filter(player => {
      const draftCancelledAt = (player as any).draftCancelledAt;
      if (!draftCancelledAt) return true; // Jogador nunca teve draft cancelado

      const timeSinceCancel = now - draftCancelledAt;
      const isEligible = timeSinceCancel > cooldownMs;

      if (!isEligible) {
        console.log(`⏳ [Matchmaking] ${player.summonerName} ainda em cooldown após cancelamento (${Math.floor(timeSinceCancel / 1000)}s restantes)`);
      }

      return isEligible;
    });

    if (eligiblePlayers.length < 10) {
      console.log(`⏳ [Matchmaking] Apenas ${eligiblePlayers.length} jogadores elegíveis (cooldown ativo para alguns)`);
      return null;
    }

    // Ordenar jogadores por MMR
    const sortedPlayers = eligiblePlayers.sort((a, b) => b.currentMMR - a.currentMMR);

    console.log(`📊 [Matchmaking] Jogadores ordenados por MMR:`, sortedPlayers.map(p => ({ name: p.summonerName, mmr: p.currentMMR })));

    // Formar times balanceados
    const team1: QueuedPlayer[] = [];
    const team2: QueuedPlayer[] = [];

    // Distribuir jogadores alternadamente para balancear MMR
    for (let i = 0; i < sortedPlayers.length; i++) {
      if (i % 2 === 0) {
        team1.push(sortedPlayers[i]);
      } else {
        team2.push(sortedPlayers[i]);
      }
    }

    console.log(`👥 [Matchmaking] Times formados:`, {
      team1: team1.map(p => ({ name: p.summonerName, mmr: p.currentMMR })),
      team2: team2.map(p => ({ name: p.summonerName, mmr: p.currentMMR }))
    });

    // Calcular MMR médio dos times
    const avgMMR1 = team1.reduce((sum, p) => sum + p.currentMMR, 0) / team1.length;
    const avgMMR2 = team2.reduce((sum, p) => sum + p.currentMMR, 0) / team2.length;
    const mmrDifference = Math.abs(avgMMR1 - avgMMR2);

    console.log(`📊 [Matchmaking] MMR médio: Team1=${Math.round(avgMMR1)}, Team2=${Math.round(avgMMR2)}, Diferença=${Math.round(mmrDifference)}`);

    // Verificar se a diferença de MMR é aceitável (máximo 500)
    if (mmrDifference > 500) {
      console.log(`⚠️ [Matchmaking] Diferença de MMR muito alta (${Math.round(mmrDifference)}), aguardando mais jogadores`);
      return null;
    }

    // Atribuir lanes baseado no MMR
    this.assignLanesByMMR(team1);
    this.assignLanesByMMR(team2);

    // Criar partida
    const match: Match = {
      id: 0, // Será definido quando salvar no banco
      team1,
      team2,
      createdAt: new Date(),
      status: 'waiting',
      averageMMR1: avgMMR1,
      averageMMR2: avgMMR2,
      acceptedPlayers: new Set()
    };

    console.log(`✅ [Matchmaking] Partida criada com sucesso!`);
    return match;
  }

  // Método para atribuir lanes baseado no MMR
  private assignLanesByMMR(team: QueuedPlayer[]): void {
    // Ordenar por MMR (maior MMR = lane mais importante)
    const sortedByMMR = [...team].sort((a, b) => b.currentMMR - a.currentMMR);

    const lanes = ['mid', 'jungle', 'top', 'bot', 'support'];

    sortedByMMR.forEach((player, index) => {
      if (index < lanes.length) {
        player.preferences = {
          ...player.preferences,
          assignedLane: lanes[index],
          isAutofill: false
        };
      }
    });
  }

  // Método para iniciar fase de draft
  private async startDraftPhase(matchId: number): Promise<void> {
    const match = this.activeMatches.get(matchId);
    if (!match) {
      console.log(`❌ [Draft] Partida ${matchId} não encontrada para iniciar draft`);
      return;
    }

    console.log(`🎯 [Draft] Iniciando fase de draft para partida ${matchId}`);
    console.log(`🎯 [Draft] Jogadores na partida:`, [...match.team1, ...match.team2].map(p => ({ id: p.id, name: p.summonerName })));

    // Atualizar status da partida
    match.status = 'in_progress';

    // Criar dados do draft com a estrutura correta que o frontend espera
    const draftData = {
      matchId: matchId,
      phase: 'draft',
      turnOrder: this.generateDraftTurnOrder(match),
      timeLimit: 30, // segundos por turno
      currentTurn: 0,
      // Estrutura que o frontend espera
      team1: match.team1.map(p => ({
        id: p.id,
        summonerName: p.summonerName,
        name: p.summonerName, // Frontend espera 'name' também
        mmr: p.currentMMR,
        primaryLane: p.preferences?.primaryLane || 'fill',
        secondaryLane: p.preferences?.secondaryLane || 'fill'
      })),
      team2: match.team2.map(p => ({
        id: p.id,
        summonerName: p.summonerName,
        name: p.summonerName, // Frontend espera 'name' também
        mmr: p.currentMMR,
        primaryLane: p.preferences?.primaryLane || 'fill',
        secondaryLane: p.preferences?.secondaryLane || 'fill'
      })),
      // Dados adicionais para o draft
      averageMMR: {
        team1: match.averageMMR1,
        team2: match.averageMMR2
      },
      estimatedGameDuration: 25, // minutos
      acceptTimeout: 30 // segundos para aceitar
    };

    console.log(`🎯 [Draft] Dados do draft criados:`, draftData);

    // Notificar jogadores sobre o draft
    this.notifyDraftPhase(match, draftData);

    // Adicionar atividade
    this.addActivity('match_created', `Fase de draft iniciada para partida ${matchId}`);

    console.log(`✅ [Draft] Fase de draft iniciada com sucesso para partida ${matchId}`);
  }

  // Método para gerar ordem de turnos no draft
  private generateDraftTurnOrder(match: Match): number[] {
    const allPlayers = [...match.team1, ...match.team2];
    const turnOrder: number[] = [];

    // Ordem: Team1 ban, Team2 ban, Team1 ban, Team2 ban, Team1 ban, Team2 ban
    // Depois: Team1 pick, Team2 pick, Team2 pick, Team1 pick, Team1 pick, Team2 pick, Team2 pick, Team1 pick, Team1 pick, Team2 pick

    // Bans (6 total)
    for (let i = 0; i < 6; i++) {
      const team = i % 2 === 0 ? match.team1 : match.team2;
      const playerIndex = Math.floor(i / 2) % team.length;
      turnOrder.push(team[playerIndex].id);
    }

    // Picks (10 total)
    const pickOrder = [0, 1, 1, 0, 0, 1, 1, 0, 0, 1]; // 0 = team1, 1 = team2
    pickOrder.forEach((teamIndex, i) => {
      const team = teamIndex === 0 ? match.team1 : match.team2;
      const playerIndex = Math.floor(i / 2) % team.length;
      turnOrder.push(team[playerIndex].id);
    });

    return turnOrder;
  }

  // Método para notificar jogadores sobre fase de draft
  private notifyDraftPhase(match: Match, draftData: any): void {
    const allPlayers = [...match.team1, ...match.team2];

    console.log(`📡 [Draft] Notificando ${allPlayers.length} jogadores sobre o draft`);

    allPlayers.forEach(player => {
      if (player.websocket && player.id > 0) {
        try {
          const message = {
            type: 'draft_started',
            data: draftData
          };

          console.log(`📡 [Draft] Enviando mensagem para ${player.summonerName}:`, message);
          player.websocket.send(JSON.stringify(message));
          console.log(`✅ [Draft] Mensagem enviada com sucesso para ${player.summonerName}`);
        } catch (error) {
          console.error(`❌ [Draft] Erro ao notificar draft para ${player.summonerName}:`, error);
        }
      } else {
        console.log(`⚠️ [Draft] Pulando ${player.summonerName} (bot ou sem websocket):`, {
          id: player.id,
          hasWebSocket: !!player.websocket,
          isBot: player.id < 0
        });
      }
    });

    console.log(`📡 [Draft] Notificação de draft concluída`);
  }

  // Método para processar ação do draft
  async processDraftAction(matchId: number, playerId: number, championId: number, action: 'pick' | 'ban'): Promise<void> {
    const match = this.activeMatches.get(matchId);
    if (!match) {
      throw new Error('Partida não encontrada');
    }

    console.log(`🎯 Draft action: ${action} champion ${championId} by player ${playerId} in match ${matchId}`);

    // Aqui você implementaria a lógica do draft
    // Por enquanto, apenas notificar outros jogadores
    const allPlayers = [...match.team1, ...match.team2];

    allPlayers.forEach(player => {
      if (player.websocket && player.id > 0 && player.id !== playerId) {
        try {
          player.websocket.send(JSON.stringify({
            type: 'draft_action',
            data: {
              matchId,
              playerId,
              championId,
              action
            }
          }));
        } catch (error) {
          console.error(`Erro ao notificar ação do draft para ${player.summonerName}:`, error);
        }
      }
    });
  }

  // Método para adicionar jogador à fila via Discord
  async addPlayerToDiscordQueue(websocket: WebSocket, requestData: any): Promise<void> {
    try {
      // Validar dados da requisição
      if (!requestData || !requestData.discordId || !requestData.gameName || !requestData.tagLine) {
        throw new Error('Dados do Discord incompletos');
      }

      // Construir o nome completo (gameName#tagLine)
      const fullSummonerName = `${requestData.gameName}#${requestData.tagLine}`;
      console.log('🔍 [Matchmaking] Nome completo para Discord:', fullSummonerName);
      console.log('🔍 [Matchmaking] Dados recebidos:', {
        discordId: requestData.discordId,
        gameName: requestData.gameName,
        tagLine: requestData.tagLine,
        lcuData: requestData.lcuData
      });

      // Buscar link Discord-LoL
      const discordLink = await this.dbManager.getDiscordLink(requestData.discordId);
      console.log('🔍 [Matchmaking] Link Discord encontrado:', discordLink);

      if (!discordLink) {
        console.log('❌ [Matchmaking] Link Discord não encontrado para ID:', requestData.discordId);
        throw new Error('Conta Discord não vinculada ao LoL');
      }

      console.log('✅ [Matchmaking] Link Discord encontrado:', {
        discordId: discordLink.discord_id,
        gameName: discordLink.game_name,
        tagLine: discordLink.tag_line,
        summonerName: discordLink.summoner_name
      });

      // Verificar se o link ainda é válido
      const isValid = await this.dbManager.verifyDiscordLink(
        requestData.discordId,
        requestData.gameName,
        requestData.tagLine
      );

      console.log('🔍 [Matchmaking] Verificação do link:', {
        discordId: requestData.discordId,
        gameName: requestData.gameName,
        tagLine: requestData.tagLine,
        isValid: isValid
      });

      if (!isValid) {
        // Tentar verificar com dados do link existente
        console.log('🔍 [Matchmaking] Link inválido, verificando dados do link existente:', {
          linkGameName: discordLink.game_name,
          linkTagLine: discordLink.tag_line,
          requestGameName: requestData.gameName,
          requestTagLine: requestData.tagLine
        });

        // Se os dados não batem, mas o link existe, usar os dados do link
        if (discordLink.game_name && discordLink.tag_line) {
          console.log('🔄 [Matchmaking] Usando dados do link existente em vez dos dados da requisição');
          requestData.gameName = discordLink.game_name;
          requestData.tagLine = discordLink.tag_line;

          // Reconstruir o nome completo
          const correctedFullName = `${discordLink.game_name}#${discordLink.tag_line}`;
          console.log('🔄 [Matchmaking] Nome corrigido:', correctedFullName);

          // Verificar novamente se agora é válido
          const isValidAfterCorrection = await this.dbManager.verifyDiscordLink(
            requestData.discordId,
            requestData.gameName,
            requestData.tagLine
          );

          if (!isValidAfterCorrection) {
            throw new Error('Dados do LoL não correspondem ao link Discord mesmo após correção');
          }

          console.log('✅ [Matchmaking] Link válido após correção dos dados');
        } else {
          throw new Error('Dados do LoL não correspondem ao link Discord');
        }
      }

      // VERIFICAÇÃO CRÍTICA: Verificar se o jogador está detectado pelo LCU
      const lcuData = requestData.lcuData;
      if (!lcuData || !lcuData.gameName || !lcuData.tagLine) {
        throw new Error('Jogador não detectado pelo LCU. Certifique-se de estar logado no LoL');
      }

      // Verificar se os dados do LCU correspondem aos dados do Discord
      const lcuFullName = `${lcuData.gameName}#${lcuData.tagLine}`;
      const discordFullName = `${requestData.gameName}#${requestData.tagLine}`;

      console.log('🔍 [Matchmaking] Comparando dados LCU vs Discord:', {
        lcuData: lcuData,
        lcuFullName: lcuFullName,
        discordData: {
          gameName: requestData.gameName,
          tagLine: requestData.tagLine
        },
        discordFullName: discordFullName,
        match: lcuFullName === discordFullName,
        lcuLength: lcuFullName.length,
        discordLength: discordFullName.length,
        lcuCharCodes: Array.from(lcuFullName).map(c => c.charCodeAt(0)),
        discordCharCodes: Array.from(discordFullName).map(c => c.charCodeAt(0))
      });

      // Se os dados não batem exatamente, mas temos um link Discord válido, usar os dados do Discord
      if (lcuFullName !== discordFullName) {
        console.log('⚠️ [Matchmaking] Dados do LCU e Discord não batem, mas link Discord é válido. Usando dados do Discord.');
        // Continuar com os dados do Discord, já que o link foi validado
      }

      console.log('✅ [Matchmaking] Jogador detectado pelo LCU e Discord:', lcuFullName);

      // Buscar jogador no banco usando o nome completo
      let player = await this.dbManager.getPlayerBySummonerName(discordFullName);
      if (!player) {
        // Se não encontrou pelo nome completo, tentar pelo nome do link
        player = await this.dbManager.getPlayerBySummonerName(discordLink.summoner_name);
        if (!player) {
          throw new Error('Jogador não encontrado no banco de dados');
        }
        // Atualizar o nome no banco para o formato completo
        await this.dbManager.updatePlayerSummonerName(player.id!, discordFullName);
        player.summoner_name = discordFullName;
        console.log('✅ [Matchmaking] Nome do jogador atualizado para formato completo:', discordFullName);
      }

      // Verificar se já está na fila
      const existingPlayerIndex = this.queue.findIndex(p => p.id === player.id);
      if (existingPlayerIndex !== -1) {
        // Atualizar websocket se jogador reconectar
        this.queue[existingPlayerIndex].websocket = websocket;
        console.log('🔄 [Matchmaking] Jogador já na fila via Discord, atualizando WebSocket:', discordFullName);
        websocket.send(JSON.stringify({
          type: 'queue_joined',
          data: { position: existingPlayerIndex + 1, estimated_wait: this.calculateEstimatedWaitTime() }
        }));
        return;
      }

      // Adicionar à fila
      const queuedPlayer: QueuedPlayer = {
        id: player.id!,
        summonerName: discordFullName, // Usar nome completo
        region: player.region,
        currentMMR: player.custom_lp || 0,
        joinTime: new Date(),
        websocket: websocket,
        queuePosition: this.queue.length + 1,
        preferences: requestData.preferences || { primaryLane: 'fill', secondaryLane: 'fill' }
      };

      console.log('🔍 [Matchmaking] Preferências do jogador:', {
        receivedPreferences: requestData.preferences,
        finalPreferences: queuedPlayer.preferences,
        primaryLane: queuedPlayer.preferences?.primaryLane,
        secondaryLane: queuedPlayer.preferences?.secondaryLane
      });

      this.queue.push(queuedPlayer);

      // Persistir entrada na fila no banco
      await this.dbManager.addPlayerToQueue(
        queuedPlayer.id,
        queuedPlayer.summonerName, // Nome completo
        queuedPlayer.region,
        queuedPlayer.currentMMR,
        queuedPlayer.preferences
      );

      // Atualizar posições na fila após adicionar o jogador
      await this.updateQueuePositions();

      // Adicionar atividade
      const primaryLaneName = this.getLaneDisplayName(queuedPlayer.preferences?.primaryLane);
      this.addActivity(
        'player_joined',
        `${discordFullName} entrou na fila via Discord como ${primaryLaneName}`,
        discordFullName,
        undefined,
        queuedPlayer.preferences?.primaryLane
      );

      // Notificar jogador
      websocket.send(JSON.stringify({
        type: 'queue_joined',
        data: {
          position: this.queue.length,
          estimatedWait: this.calculateEstimatedWaitTime(),
          queueStatus: await this.getQueueStatus()
        }
      }));

      // Broadcast atualização da fila (forçar imediatamente para entrada)
      await this.forceQueueUpdate();

      console.log(`✅ [Matchmaking] ${discordFullName} entrou na fila via Discord (Posição: ${this.queue.length})`);

    } catch (error: any) {
      console.error('❌ [Matchmaking] Erro ao adicionar jogador à fila via Discord:', error);
      websocket.send(JSON.stringify({
        type: 'error',
        message: 'Falha ao entrar na fila via Discord: ' + error.message
      }));
    }
  }

  // Método para obter fila atual
  public getQueue(): QueuedPlayer[] {
    return [...this.queue];
  }

  // Método para remover jogador da fila por ID ou nome
  public removePlayerFromQueueById(playerId?: number, summonerName?: string): boolean {
    console.log(`🔍 [Matchmaking] Tentando remover jogador da fila:`, { playerId, summonerName });
    console.log(`🔍 [Matchmaking] Fila atual:`, this.queue.map(p => ({ id: p.id, name: p.summonerName })));

    let playerIndex = -1;

    // PRIMEIRA TENTATIVA: Buscar por ID
    if (playerId) {
      playerIndex = this.queue.findIndex(p => p.id === playerId);
      console.log(`🔍 [Matchmaking] Buscando por ID ${playerId}, encontrado no índice: ${playerIndex}`);
    }

    // SEGUNDA TENTATIVA: Se não encontrou por ID, buscar por nome
    if (playerIndex === -1 && summonerName) {
      // Buscar por nome exato primeiro
      playerIndex = this.queue.findIndex(p => p.summonerName === summonerName);
      console.log(`🔍 [Matchmaking] Buscando por nome exato "${summonerName}", encontrado no índice: ${playerIndex}`);

      // Se não encontrou por nome exato, tentar busca parcial (sem tagline)
      if (playerIndex === -1 && summonerName.includes('#')) {
        const gameNameOnly = summonerName.split('#')[0];
        playerIndex = this.queue.findIndex(p => p.summonerName.startsWith(gameNameOnly + '#'));
        console.log(`🔍 [Matchmaking] Buscando por gameName "${gameNameOnly}", encontrado no índice: ${playerIndex}`);
      }

      // Se ainda não encontrou, tentar busca por gameName apenas
      if (playerIndex === -1) {
        playerIndex = this.queue.findIndex(p => p.summonerName.split('#')[0] === summonerName);
        console.log(`🔍 [Matchmaking] Buscando por gameName apenas "${summonerName}", encontrado no índice: ${playerIndex}`);
      }
    }

    // TERCEIRA TENTATIVA: Se ainda não encontrou e temos ID, tentar busca mais flexível
    if (playerIndex === -1 && playerId) {
      console.log(`🔍 [Matchmaking] Tentando busca flexível por ID ${playerId}...`);
      // Tentar encontrar por qualquer critério que possa identificar o jogador
      playerIndex = this.queue.findIndex(p => {
        return p.id === playerId ||
          (summonerName && p.summonerName.includes(summonerName.split('#')[0]));
      });
      console.log(`🔍 [Matchmaking] Busca flexível encontrou no índice: ${playerIndex}`);
    }

    if (playerIndex !== -1) {
      const player = this.queue[playerIndex];
      console.log(`✅ [Matchmaking] Removendo jogador:`, { id: player.id, name: player.summonerName });

      this.queue.splice(playerIndex, 1);

      // Persistir saída da fila no banco
      this.dbManager.removePlayerFromQueue(player.id).then(() => {
        console.log(`✅ [Matchmaking] Jogador ${player.summonerName} removido da fila persistente`);
      }).catch(error => {
        console.error('❌ [Matchmaking] Erro ao remover jogador da fila persistente:', error);
      });

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
      this.broadcastQueueUpdate();

      console.log(`➖ [Matchmaking] ${player.summonerName} removido da fila. Nova fila:`, this.queue.map(p => ({ id: p.id, name: p.summonerName })));
      return true;
    } else {
      console.log(`❌ [Matchmaking] Jogador não encontrado na fila:`, { playerId, summonerName });
      console.log(`🔍 [Matchmaking] Fila atual completa:`, this.queue.map(p => ({
        id: p.id,
        name: p.summonerName,
        gameName: p.summonerName.split('#')[0],
        tagLine: p.summonerName.split('#')[1]
      })));
      return false;
    }
  }

  // Método para desligar o serviço
  public shutdown(): void {
    this.isActive = false;

    if (this.matchmakingInterval) {
      clearInterval(this.matchmakingInterval);
      this.matchmakingInterval = null;
    }

    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }

    // Limpar timeouts das partidas ativas
    this.activeMatches.forEach(match => {
      if (match.acceptTimeout) {
        clearTimeout(match.acceptTimeout);
      }
    });

    console.log('🛑 Serviço de matchmaking desligado');
  }

  // Método para verificar se o serviço está ativo
  public isServiceActive(): boolean {
    return this.isActive;
  }

  // Método para forçar atualização imediata (usado para ações críticas)
  public async forceQueueUpdate(): Promise<void> {
    console.log('🚀 [Matchmaking] Forçando atualização imediata da fila...');
    await this.broadcastQueueUpdate(true);
  }

  // Método para atualizar partida após picks/bans completados
  async updateMatchAfterDraft(matchId: number, draftData: any): Promise<void> {
    const match = this.activeMatches.get(matchId);
    if (!match) {
      throw new Error('Partida não encontrada');
    }

    console.log(`🎯 [Draft] Atualizando partida ${matchId} após draft completado`);

    try {
      // Atualizar partida no banco com dados do draft
      await this.dbManager.updateCustomMatch(matchId, {
        title: `Partida com Draft - ${new Date().toLocaleString()}`,
        description: `Draft completado - MMR médio: Time 1: ${Math.round(match.averageMMR1)}, Time 2: ${Math.round(match.averageMMR2)}`,
        status: 'draft_completed',
        draft_data: draftData // Salvar dados do draft
      });

      console.log(`✅ [Draft] Partida ${matchId} atualizada com dados do draft`);
    } catch (error) {
      console.error(`❌ [Draft] Erro ao atualizar partida ${matchId} após draft:`, error);
      throw error;
    }
  }

  // Método para finalizar partida após jogo completado (usando completeCustomMatch que já funciona)
  async completeMatchAfterGame(matchId: number, winnerTeam: number, gameData: any): Promise<void> {
    const match = this.activeMatches.get(matchId);
    if (!match) {
      throw new Error('Partida não encontrada');
    }

    console.log(`🏁 [Game] Finalizando partida ${matchId} após jogo completado - Vencedor: Time ${winnerTeam}`);

    try {
      // Usar o método completeCustomMatch que já funciona corretamente
      await this.dbManager.completeCustomMatch(matchId, winnerTeam, {
        duration: gameData.duration || 0,
        pickBanData: gameData.pickBanData || null,
        participantsData: gameData.participantsData || null,
        detectedByLCU: gameData.detectedByLCU || false,
        riotGameId: gameData.riotGameId || null,
        notes: `Partida finalizada via matchmaking - ${gameData.notes || 'Jogo completado'}`
      });

      // Remover da lista de partidas ativas
      this.activeMatches.delete(matchId);

      console.log(`✅ [Game] Partida ${matchId} finalizada com sucesso usando completeCustomMatch`);
    } catch (error) {
      console.error(`❌ [Game] Erro ao finalizar partida ${matchId}:`, error);
      throw error;
    }
  }

  // Método para cancelar draft e remover partida do banco
  async cancelDraft(matchId: number, reason: string): Promise<void> {
    const match = this.activeMatches.get(matchId);
    if (!match) {
      console.log(`⚠️ [CancelDraft] Partida ${matchId} não encontrada nas partidas ativas`);
      return;
    }

    console.log(`🎉 [CancelDraft] Draft da partida ${matchId} cancelado por ${reason}`);
    console.log(`🔍 [CancelDraft] Dados da partida:`, {
      matchId: matchId,
      matchIdInMatch: match.id,
      team1Size: match.team1.length,
      team2Size: match.team2.length,
      status: match.status
    });

    // Remover partida das ativas
    this.activeMatches.delete(matchId);

    // APAGAR partida do banco de dados se foi salva
    try {
      if (match.id) {
        console.log(`🗑️ [CancelDraft] Tentando apagar partida ${matchId} do banco (ID: ${match.id})`);
        await this.dbManager.deleteCustomMatch(match.id);
        console.log(`🗑️ [CancelDraft] Partida ${matchId} apagada do banco de dados (ID: ${match.id})`);
      } else {
        console.log(`⚠️ [CancelDraft] Partida ${matchId} não tem ID no banco para apagar`);
      }
    } catch (error) {
      console.error(`❌ [CancelDraft] Erro ao apagar partida ${matchId} do banco:`, error);
    }

    // CORREÇÃO: Apenas o jogador que cancelou sai da fila, os outros continuam
    const allPlayers = [...match.team1, ...match.team2];
    const removedPlayers: string[] = [];
    const returnedPlayers: string[] = [];

    // Identificar quem cancelou (assumindo que é o primeiro jogador real, não bot)
    const cancellingPlayer = allPlayers.find(p => p.id > 0); // Primeiro jogador real

    allPlayers.forEach(player => {
      if (player === cancellingPlayer) {
        // Apenas quem cancelou sai da fila
        const playerIndex = this.queue.findIndex(p => p.id === player.id);
        if (playerIndex !== -1) {
          this.queue.splice(playerIndex, 1);
          removedPlayers.push(player.summonerName);
          console.log(`🗑️ [CancelDraft] ${player.summonerName} removido da fila (cancelou o draft)`);
        }
      } else {
        // Os outros jogadores continuam na fila
        const playerIndex = this.queue.findIndex(p => p.id === player.id);
        if (playerIndex === -1) {
          // Se não está na fila, adicionar de volta
          player.websocket = null as any; // Resetar websocket
          this.queue.push(player);
          returnedPlayers.push(player.summonerName);
          console.log(`🔄 [CancelDraft] ${player.summonerName} retornou à fila (Bot: ${player.id < 0})`);
        } else {
          console.log(`✅ [CancelDraft] ${player.summonerName} já está na fila (Bot: ${player.id < 0})`);
        }
      }

      // Notificar jogador sobre o cancelamento do draft
      if (player.websocket && player.id > 0) { // Pular bots
        try {
          const message = {
            type: 'draft_cancelled',
            data: {
              matchId: matchId,
              reason: reason
            }
          };

          console.log(`📡 [CancelDraft] Enviando mensagem para ${player.summonerName}:`, JSON.stringify(message, null, 2));
          player.websocket.send(JSON.stringify(message));
          console.log(`✅ [CancelDraft] Mensagem enviada com sucesso para ${player.summonerName}`);
        } catch (error) {
          console.error(`❌ [CancelDraft] Erro ao notificar cancelamento do draft para ${player.summonerName}:`, error);
        }
      }
    });

    // Atualizar posições na fila
    this.queue.forEach((p, index) => {
      p.queuePosition = index + 1;
    });

    // Broadcast atualização da fila
    this.broadcastQueueUpdate();

    console.log(`✅ [CancelDraft] ${removedPlayers.length} jogador removido da fila:`, removedPlayers);
    console.log(`✅ [CancelDraft] ${returnedPlayers.length} jogadores retornaram à fila:`, returnedPlayers);
    this.addActivity('match_created', `Draft da partida ${matchId} cancelado por ${reason} - ${removedPlayers.length} jogador removido, ${returnedPlayers.length} retornaram à fila`);
  }

  // Método para cancelar partida em andamento (após o draft)
  async cancelGameInProgress(matchId: number, reason: string): Promise<void> {
    console.log(`🔍 [CancelGameInProgress] Iniciando cancelamento para matchId: ${matchId}`);
    console.log(`🔍 [CancelGameInProgress] Tipo do matchId: ${typeof matchId}`);
    console.log(`🔍 [CancelGameInProgress] Reason: ${reason}`);
    
    const match = this.activeMatches.get(matchId);
    if (!match) {
      console.log(`⚠️ [CancelGameInProgress] Partida ${matchId} não encontrada nas partidas ativas`);
      console.log(`🔍 [CancelGameInProgress] Partidas ativas disponíveis:`, Array.from(this.activeMatches.keys()));
      return;
    }

    console.log(`🎉 [CancelGameInProgress] Partida em andamento ${matchId} cancelada por ${reason}`);
    console.log(`🔍 [CancelGameInProgress] Dados da partida:`, {
      matchId: matchId,
      matchIdInMatch: match.id,
      team1Size: match.team1.length,
      team2Size: match.team2.length,
      status: match.status
    });

    // Remover partida das ativas
    this.activeMatches.delete(matchId);

    // APAGAR partida do banco de dados se foi salva
    try {
      if (match.id) {
        console.log(`🗑️ [CancelGameInProgress] Tentando apagar partida ${matchId} do banco (ID: ${match.id})`);
        await this.dbManager.deleteCustomMatch(match.id);
        console.log(`🗑️ [CancelGameInProgress] Partida ${matchId} apagada do banco de dados (ID: ${match.id})`);
      } else {
        console.log(`⚠️ [CancelGameInProgress] Partida ${matchId} não tem ID no banco para apagar`);
      }
    } catch (error) {
      console.error(`❌ [CancelGameInProgress] Erro ao apagar partida ${matchId} do banco:`, error);
    }

    // CORREÇÃO: Remover jogadores da fila ao invés de retorná-los
    const allPlayers = [...match.team1, ...match.team2];
    const removedPlayers: string[] = [];

    allPlayers.forEach(player => {
      // Remover jogador da fila
      const playerIndex = this.queue.findIndex(p => p.id === player.id);
      if (playerIndex !== -1) {
        this.queue.splice(playerIndex, 1);
        removedPlayers.push(player.summonerName);
        console.log(`🗑️ [CancelGameInProgress] ${player.summonerName} removido da fila após cancelamento da partida (Bot: ${player.id < 0})`);
      } else {
        console.log(`⚠️ [CancelGameInProgress] ${player.summonerName} não encontrado na fila para remoção`);
      }

      // Notificar jogador sobre o cancelamento da partida
      if (player.websocket && player.id > 0) { // Pular bots
        try {
          const message = {
            type: 'game_cancelled',
            data: {
              matchId: matchId,
              reason: reason
            }
          };

          console.log(`📡 [CancelGameInProgress] Enviando mensagem para ${player.summonerName}:`, JSON.stringify(message, null, 2));
          player.websocket.send(JSON.stringify(message));
          console.log(`✅ [CancelGameInProgress] Mensagem enviada com sucesso para ${player.summonerName}`);
        } catch (error) {
          console.error(`❌ [CancelGameInProgress] Erro ao notificar cancelamento da partida para ${player.summonerName}:`, error);
        }
      }
    });

    // Atualizar posições na fila
    this.queue.forEach((p, index) => {
      p.queuePosition = index + 1;
    });

    // Broadcast atualização da fila
    this.broadcastQueueUpdate();

    console.log(`✅ [CancelGameInProgress] ${removedPlayers.length} jogadores removidos da fila:`, removedPlayers);
    this.addActivity('match_created', `Partida em andamento ${matchId} cancelada por ${reason} - ${removedPlayers.length} jogadores removidos da fila`);
  }
}