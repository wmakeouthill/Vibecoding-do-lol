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
        const isWebSocketDead = player.websocket && 
          (player.websocket.readyState === WebSocket.CLOSED || 
           player.websocket.readyState === WebSocket.CLOSING);

        // Log do estado do jogador
        console.log(`👤 ${player.summonerName}: ${timeInQueueMinutes}min na fila, WebSocket: ${player.websocket ? 'ativo' : 'null'}`);

        // Remover se:
        // 1. WebSocket está morto (jogador desconectou) OU
        // 2. Jogador está na fila há mais tempo que o timeout (3 horas)
        if (isWebSocketDead || timeInQueue > timeoutMs) {
          const reason = isWebSocketDead ? 'WebSocket inativo' : 'Timeout de 3 horas';
          console.log(`⚠️ Marcando ${player.summonerName} para remoção: ${reason}`);
          playersToRemove.push(player);
        }
      }

      // Remover jogadores inativos
      for (const player of playersToRemove) {
        const playerIndex = this.queue.findIndex(p => p.id === player.id);
        if (playerIndex !== -1) {
          this.queue.splice(playerIndex, 1);
          
          // Persistir saída da fila no banco
          await this.dbManager.removePlayerFromQueue(player.id);
          
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

      // Broadcast atualização da fila
      await this.broadcastQueueUpdate();

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
    console.log('🔍 [Matchmaking] Fila atual:', this.queue.map(p => ({ id: p.id, name: p.summonerName, wsActive: p.websocket?.readyState === WebSocket.OPEN })));
    
    const playerIndex = this.queue.findIndex(player => player.websocket === websocket);
    console.log('🔍 [Matchmaking] Player index encontrado:', playerIndex);
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

      // Atualizar posições na fila
      this.queue.forEach((p, index) => {
        p.queuePosition = index + 1;
      });

      console.log(`➖ [Matchmaking] ${player.summonerName} saiu da fila`);
      console.log('🔍 [Matchmaking] Tamanho da fila depois:', this.queue.length);
      console.log('🔍 [Matchmaking] Nova fila:', this.queue.map(p => ({ id: p.id, name: p.summonerName })));
      
      await this.broadcastQueueUpdate();
    } else {
      console.log('⚠️ [Matchmaking] Jogador não encontrado na fila para remoção via WebSocket');
      console.log('🔍 [Matchmaking] WebSocket recebido:', websocket);
      console.log('🔍 [Matchmaking] WebSockets na fila:', this.queue.map(p => ({ name: p.summonerName, ws: p.websocket, wsState: p.websocket?.readyState })));
    }
  }

  // Método para adicionar jogador à fila sem WebSocket (para uso automático)
  addPlayerToQueueDirect(playerData: any): void {
    try {
      // Verificar se o jogador já está na fila
      const existingPlayer = this.queue.find(p => p.id === playerData.id);      if (existingPlayer) {
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
  }  private async processMatchmaking(): Promise<void> {
    if (!this.isActive || this.queue.length < 10) return; // Precisa de 10 jogadores

    try {
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
      }
    } catch (error) {
      console.error('Erro no processamento de matchmaking:', error);
    }  }

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
    
    // Auto-aceitar cada bot
    botPlayers.forEach(bot => {
      try {
        this.acceptMatch(bot.id, matchId, bot.summonerName);
        console.log(`🤖 Bot ${bot.summonerName} aceitou automaticamente`);
      } catch (error) {
        console.error(`Erro ao auto-aceitar bot ${bot.summonerName}:`, error);
      }
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
  }  // Método para aceitar partida
  async acceptMatch(playerId: number, matchId: number, summonerName?: string): Promise<void> {
    const match = this.activeMatches.get(matchId);
    if (!match) {
      throw new Error('Partida não encontrada');
    }

    // Procurar jogador por ID ou por nome
    let player = [...match.team1, ...match.team2].find(p => p.id === playerId);
    
    // Se não encontrou por ID, tentar por nome (útil para casos onde o ID pode estar inconsistente)
    if (!player && summonerName) {
      player = [...match.team1, ...match.team2].find(p => p.summonerName === summonerName);
    }
    
    if (!player) {
      console.log(`🔍 Tentativa de aceitar partida - Player ID: ${playerId}, Nome: ${summonerName}`);
      console.log(`🔍 Jogadores na partida:`, [...match.team1, ...match.team2].map(p => ({ id: p.id, name: p.summonerName })));
      throw new Error('Jogador não está nesta partida');
    }

    // Adicionar jogador aos que aceitaram
    match.acceptedPlayers.add(player.id);
    console.log(`✅ ${player.summonerName} aceitou a partida ${matchId}`);
    
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
  }

  // Método para recusar partida
  async declineMatch(playerId: number, matchId: number, summonerName?: string): Promise<void> {
    const match = this.activeMatches.get(matchId);
    if (!match) {
      throw new Error('Partida não encontrada');
    }

    // Procurar jogador por ID ou por nome
    let player = [...match.team1, ...match.team2].find(p => p.id === playerId);
    
    if (!player && summonerName) {
      player = [...match.team1, ...match.team2].find(p => p.summonerName === summonerName);
    }
    
    if (!player) {
      throw new Error('Jogador não está nesta partida');
    }

    console.log(`❌ ${player.summonerName} recusou a partida ${matchId}`);
    
    // Cancelar partida imediatamente quando alguém recusa
    this.cancelMatch(matchId, `${player.summonerName} recusou a partida`);
  }

  // Método para cancelar partida
  private cancelMatch(matchId: number, reason: string): void {
    const match = this.activeMatches.get(matchId);
    if (!match) return;

    console.log(`🎉 Partida ${matchId} cancelada por ${reason}`);
    
    // Remover partida das ativas
    this.activeMatches.delete(matchId);

    // Retornar jogadores que aceitaram para a fila
    const acceptedPlayers = [...match.team1, ...match.team2].filter(p => match.acceptedPlayers.has(p.id) && p.id > 0);
    acceptedPlayers.forEach(player => {
      this.queue.push(player);
    });

    // Atualizar status da fila
    this.broadcastQueueUpdate();

    this.addActivity('match_created', `Partida ${matchId} cancelada por ${reason}`);
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

  // Método para broadcast de atualização da fila
  public async broadcastQueueUpdate(): Promise<void> {
    if (!this.wss) return;

    const queueStatus = await this.getQueueStatus();
    
    this.wss.clients.forEach((client: WebSocket) => {
      if (client.readyState === WebSocket.OPEN) {
        try {
          client.send(JSON.stringify({
            type: 'queue_update',
            data: queueStatus
          }));
        } catch (error) {
          console.error('Erro ao enviar atualização da fila:', error);
        }
      }
    });
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
    if (this.queue.length < 10) return null;

    // Ordenar jogadores por MMR
    const sortedPlayers = [...this.queue].sort((a, b) => a.currentMMR - b.currentMMR);
    
    // Dividir em dois times balanceados
    const team1: QueuedPlayer[] = [];
    const team2: QueuedPlayer[] = [];
    
    // Distribuir jogadores alternadamente para balancear MMR
    for (let i = 0; i < sortedPlayers.length && i < 10; i++) {
      if (i % 2 === 0) {
        team1.push(sortedPlayers[i]);
      } else {
        team2.push(sortedPlayers[i]);
      }
    }

    if (team1.length < 5 || team2.length < 5) return null;

    // Calcular MMR médio dos times
    const avgMMR1 = team1.reduce((sum, p) => sum + p.currentMMR, 0) / team1.length;
    const avgMMR2 = team2.reduce((sum, p) => sum + p.currentMMR, 0) / team2.length;

    // Verificar se a diferença de MMR é aceitável (máximo 200)
    if (Math.abs(avgMMR1 - avgMMR2) > 200) return null;

    // Atribuir lanes baseado no MMR
    this.assignLanesByMMR(team1);
    this.assignLanesByMMR(team2);

    const match: Match = {
      id: Date.now(),
      team1,
      team2,
      createdAt: new Date(),
      status: 'waiting',
      averageMMR1: avgMMR1,
      averageMMR2: avgMMR2,
      acceptedPlayers: new Set()
    };

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
    if (!match) return;

    console.log(`🎯 Iniciando fase de draft para partida ${matchId}`);

    // Atualizar status da partida
    match.status = 'in_progress';

    // Criar dados do draft
    const draftData = {
      matchId: matchId,
      phase: 'draft',
      turnOrder: this.generateDraftTurnOrder(match),
      timeLimit: 30, // segundos por turno
      currentTurn: 0
    };

    // Notificar jogadores sobre o draft
    this.notifyDraftPhase(match, draftData);

    // Adicionar atividade
    this.addActivity('match_created', `Fase de draft iniciada para partida ${matchId}`);
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
    
    allPlayers.forEach(player => {
      if (player.websocket && player.id > 0) {
        try {
          player.websocket.send(JSON.stringify({
            type: 'draft_started',
            data: draftData
          }));
        } catch (error) {
          console.error(`Erro ao notificar draft para ${player.summonerName}:`, error);
        }
      }
    });
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

      // Broadcast atualização da fila
      await this.broadcastQueueUpdate();

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

    if (playerId) {
      playerIndex = this.queue.findIndex(p => p.id === playerId);
      console.log(`🔍 [Matchmaking] Buscando por ID ${playerId}, encontrado no índice: ${playerIndex}`);
    } else if (summonerName) {
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
}