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
  private isActive = true;
  private recentActivities: QueueActivity[] = [];
  private readonly MAX_ACTIVITIES = 20;

  constructor(dbManager: DatabaseManager, wss?: any) {
    this.dbManager = dbManager;
    this.wss = wss;
  }
  async initialize(): Promise<void> {
    console.log('🔍 Inicializando sistema de matchmaking...');
    
    // Adicionar atividades iniciais
    this.addActivity('system_update', 'Sistema de matchmaking inicializado');
    this.addActivity('system_update', 'Aguardando jogadores para a fila');
    
    // Iniciar processamento de matchmaking a cada 5 segundos
    this.matchmakingInterval = setInterval(() => {
      this.processMatchmaking();
    }, 5000);

    console.log('✅ Sistema de matchmaking ativo');
  }async addPlayerToQueue(websocket: WebSocket, requestData: any): Promise<void> {
    try {
      // Validar dados da requisição
      if (!requestData) {
        throw new Error('Dados da requisição não fornecidos');
      }      // Extrair player e preferences dos dados
      const playerData = requestData.player;
      const preferences = requestData.preferences;

      console.log('🔍 Dados recebidos - playerData:', playerData);
      console.log('🔍 Dados recebidos - preferences:', preferences);

      // Validar dados do jogador
      if (!playerData) {
        throw new Error('Dados do jogador não fornecidos');
      }

      if (!playerData.summonerName) {
        throw new Error('Nome do invocador é obrigatório');
      }      console.log('🔍 Dados do jogador recebidos:', playerData);

      // Buscar jogador no banco ou criar novo
      let player = await this.dbManager.getPlayerBySummonerName(playerData.summonerName);
        if (!player) {
        // Criar novo jogador se não existir
        const playerId = await this.dbManager.createPlayer({
          summoner_name: playerData.summonerName,
          summoner_id: playerData.summonerId,
          puuid: playerData.puuid,
          region: playerData.region,
          current_mmr: 1000,
          peak_mmr: 1000,
          games_played: 0,
          wins: 0,
          losses: 0,
          win_streak: 0
        });
        player = await this.dbManager.getPlayer(playerId);
      }

      if (!player) {
        throw new Error('Falha ao criar/recuperar jogador');
      }

      // Verificar se jogador já está na fila
      const existingPlayerIndex = this.queue.findIndex(p => p.id === player!.id);
      if (existingPlayerIndex !== -1) {
        // Atualizar websocket se jogador reconectar
        this.queue[existingPlayerIndex].websocket = websocket;
        websocket.send(JSON.stringify({
          type: 'queue_joined',
          data: { position: existingPlayerIndex + 1, estimated_wait: this.calculateEstimatedWaitTime() }
        }));
        return;
      }      // Adicionar à fila
      const queuedPlayer: QueuedPlayer = {
        id: player.id!,
        summonerName: player.summoner_name,
        region: player.region,
        currentMMR: player.current_mmr,
        joinTime: new Date(),
        websocket: websocket,
        queuePosition: this.queue.length + 1,
        preferences: preferences
      };      this.queue.push(queuedPlayer);      // Adicionar atividade
      const primaryLaneName = this.getLaneDisplayName(preferences?.primaryLane);
      const playerTag = ''; // Remover tag_line que não existe no Player
      this.addActivity(
        'player_joined', 
        `${player.summoner_name} entrou na fila como ${primaryLaneName}`,
        player.summoner_name,
        '', // tag_line removido
        preferences?.primaryLane
      );

      console.log(`✅ ${player.summoner_name} entrou na fila como ${primaryLaneName}`);

      // Notificar jogador sobre entrada na fila
      websocket.send(JSON.stringify({
        type: 'queue_joined',
        data: {
          position: this.queue.length,
          estimatedWait: this.calculateEstimatedWaitTime(),
          queueStatus: this.getQueueStatus()
        }
      }));

      // Broadcast atualização da fila
      this.broadcastQueueUpdate();

      console.log(`➕ ${player.summoner_name} entrou na fila (Posição: ${this.queue.length}, MMR: ${player.current_mmr})`);

    } catch (error: any) {
      console.error('Erro ao adicionar jogador à fila:', error);
      websocket.send(JSON.stringify({
        type: 'error',
        message: 'Falha ao entrar na fila: ' + error.message
      }));
    }
  }
  removePlayerFromQueue(websocket: WebSocket): void {
    console.log('🔍 removePlayerFromQueue chamado');
    const playerIndex = this.queue.findIndex(player => player.websocket === websocket);
    console.log('🔍 Player index encontrado:', playerIndex);
    console.log('🔍 Tamanho da fila antes:', this.queue.length);
      if (playerIndex !== -1) {
      const player = this.queue[playerIndex];
      const playerTag = player.summonerName.includes('#') ? '' : ''; // Tag já incluída no summonerName se existir
      
      this.queue.splice(playerIndex, 1);

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

      console.log(`➖ ${player.summonerName} saiu da fila`);
      console.log('🔍 Tamanho da fila depois:', this.queue.length);
      this.broadcastQueueUpdate();
    } else {
      console.log('⚠️ Jogador não encontrado na fila para remoção');
    }
  }

  // Método para adicionar jogador à fila sem WebSocket (para uso automático)
  addPlayerToQueueDirect(playerData: any): void {
    try {
      // Verificar se o jogador já está na fila
      const existingPlayer = this.queue.find(p => p.id === playerData.id);
      if (existingPlayer) {
        console.log(`⚠️ Jogador ${playerData.summonerName} já está na fila`);
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
    }
  }
  // Método para criar partida no banco e notificar jogadores
  private async createMatchAndNotify(match: Match): Promise<void> {
    try {      // Salvar partida no banco de dados
      const matchId = await this.dbManager.createMatch(
        match.team1.map(p => p.id),
        match.team2.map(p => p.id),
        match.averageMMR1,
        match.averageMMR2
      );

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

    console.log(`🚫 Cancelando partida ${matchId}: ${reason}`);

    // Limpar timeout se existir
    if (match.acceptTimeout) {
      clearTimeout(match.acceptTimeout);
      match.acceptTimeout = undefined;
    }

    // Notificar todos os jogadores sobre o cancelamento
    const allPlayers = [...match.team1, ...match.team2];
    allPlayers.forEach(player => {
      if (player.websocket && player.id > 0) { // Pular bots
        try {
          player.websocket.send(JSON.stringify({
            type: 'match_cancelled',
            data: { matchId: matchId, reason: reason }
          }));
        } catch (error) {
          console.error(`Erro ao notificar cancelamento para ${player.summonerName}:`, error);
        }
      }
    });

    // Remover partida das ativas
    this.activeMatches.delete(matchId);

    // Retornar jogadores para a fila (exceto quem recusou)
    const playersToRequeue = allPlayers.filter(p => p.id > 0); // Só jogadores reais
    playersToRequeue.forEach(player => {
      this.queue.push(player);
    });

    // Atualizar status da fila
    this.broadcastQueueUpdate();

    this.addActivity('match_created', `Partida ${matchId} cancelada: ${reason}`);
  }

  // Método para iniciar fase de draft (pick & ban)
  private async startDraftPhase(matchId: number): Promise<void> {
    const match = this.activeMatches.get(matchId);
    if (!match) return;

    // Atualizar status da partida    match.status = 'in_progress';
    await this.dbManager.updateMatchStatus(matchId, 'draft_phase');

    // Criar dados iniciais do draft
    const draftData = {
      matchId: matchId,      phase: 'ban_1', // ban_1 -> ban_2 -> pick_1 -> pick_2 -> ban_3 -> pick_3
      currentTurn: 'blue', // blue ou red
      timeRemaining: 30, // segundos
      blueTeam: match.team1.map(p => ({ 
        summonerName: p.summonerName, 
        id: p.id
      })),
      redTeam: match.team2.map(p => ({ 
        summonerName: p.summonerName, 
        id: p.id
      })),
      bans: {
        blue: [], // IDs dos campeões banidos
        red: []
      },
      picks: {
        blue: [], // IDs dos campeões escolhidos
        red: []
      },
      currentAction: {
        type: 'ban', // ban ou pick
        team: 'blue',
        playerIndex: 0 // qual jogador do time está escolhendo
      }
    };

    // Notificar todos os jogadores sobre o início do draft
    this.notifyDraftPhase(match, draftData);

    console.log(`🎯 Fase de draft iniciada para partida ${matchId}`);
  }

  // Método para notificar fase de draft
  private notifyDraftPhase(match: Match, draftData: any): void {
    const allPlayers = [...match.team1, ...match.team2];
    
    allPlayers.forEach(player => {
      // Pular bots
      if (!player.websocket || player.id < 0) return;

      try {
        player.websocket.send(JSON.stringify({
          type: 'draft_phase',
          data: draftData
        }));
      } catch (error) {
        console.error(`Erro ao notificar draft para ${player.summonerName}:`, error);
      }
    });
  }

  // Método para processar pick/ban
  async processDraftAction(matchId: number, playerId: number, championId: number, action: 'pick' | 'ban'): Promise<void> {
    const match = this.activeMatches.get(matchId);
    if (!match) {
      throw new Error('Partida não encontrada');
    }

    // Aqui implementaríamos a lógica completa do draft
    // Por agora, vamos apenas confirmar a ação
    console.log(`🎮 ${action} processado: Jogador ${playerId}, Campeão ${championId} na partida ${matchId}`);
    
    // Notificar todos sobre a atualização do draft
    // (implementação completa viria aqui)
  }

  // Método para adicionar atividade ao log
  private addActivity(type: QueueActivity['type'], message: string, playerName?: string, playerTag?: string, lane?: string): void {
    const activity: QueueActivity = {
      id: Date.now().toString(),
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
    if (this.queue.length === 0) return 0;
    
    // Calcular baseado na média de tempo na fila dos jogadores atuais
    const averageWaitTime = this.queue.reduce((sum, player) => {
      const waitTime = Date.now() - player.joinTime.getTime();
      return sum + waitTime;
    }, 0) / this.queue.length;

    return Math.round(averageWaitTime / 1000); // Retornar em segundos
  }

  // Método para obter nome da lane
  private getLaneDisplayName(laneId?: string): string {
    if (!laneId) return 'Não Especificada';
    
    const lanes: { [key: string]: string } = {
      'top': 'Topo',
      'jungle': 'Selva', 
      'mid': 'Meio',
      'bot': 'Atirador',
      'support': 'Suporte'
    };
    return lanes[laneId] || laneId;
  }

  // Método para fazer broadcast das atualizações da fila
  private broadcastQueueUpdate(): void {
    if (!this.wss) return;

    const queueStatus = this.getQueueStatus();
    
    this.wss.clients.forEach((client: WebSocket) => {
      if (client.readyState === 1) { // WebSocket.OPEN
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

  // Método para obter status atual da fila
  getQueueStatus(): QueueStatus {
    const playersInQueueList: QueuedPlayerInfo[] = this.queue.map((player, index) => ({
      summonerName: player.summonerName,
      tagLine: undefined, // Pode adicionar se necessário
      primaryLane: player.preferences?.primaryLane || 'fill',
      secondaryLane: player.preferences?.secondaryLane || 'fill',
      mmr: player.currentMMR,
      queuePosition: index + 1,
      joinTime: player.joinTime
    }));

    return {
      playersInQueue: this.queue.length,
      averageWaitTime: this.calculateEstimatedWaitTime(),
      estimatedMatchTime: this.queue.length >= 10 ? 30 : Math.max(60 - this.queue.length * 6, 10),
      isActive: this.isActive,
      playersInQueueList,
      recentActivities: this.recentActivities
    };
  }

  // Método para obter partidas recentes
  async getRecentMatches(): Promise<any[]> {
    try {
      // Buscar partidas do banco de dados
      const matches = await this.dbManager.getRecentMatches();
      return matches || [];
    } catch (error) {
      console.error('Erro ao buscar partidas recentes:', error);
      return [];
    }
  }

  // Método para encontrar a melhor partida
  private async findBestMatch(): Promise<Match | null> {
    if (this.queue.length < 10) return null;

    // Algoritmo simples: pegar os 10 primeiros jogadores da fila
    const players = this.queue.slice(0, 10);
    
    // Dividir em dois times balanceados por MMR
    players.sort((a, b) => b.currentMMR - a.currentMMR);
    
    const team1: QueuedPlayer[] = [];
    const team2: QueuedPlayer[] = [];
    
    // Distribuir jogadores alternadamente para balancear MMR
    for (let i = 0; i < players.length; i++) {
      if (i % 2 === 0) {
        team1.push(players[i]);
      } else {
        team2.push(players[i]);
      }
    }

    const averageMMR1 = team1.reduce((sum, p) => sum + p.currentMMR, 0) / team1.length;
    const averageMMR2 = team2.reduce((sum, p) => sum + p.currentMMR, 0) / team2.length;    return {
      id: Date.now(),
      team1,
      team2,
      createdAt: new Date(),
      status: 'waiting',
      averageMMR1,
      averageMMR2,
      acceptedPlayers: new Set<number>()
    };
  }
}
