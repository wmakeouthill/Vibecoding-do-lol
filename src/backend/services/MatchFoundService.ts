import { WebSocket } from 'ws';
import { DatabaseManager } from '../database/DatabaseManager';

interface AcceptanceStatus {
  matchId: number;
  players: string[];
  acceptedPlayers: Set<string>;
  declinedPlayers: Set<string>;
  createdAt: Date;
  timeout?: NodeJS.Timeout;
}

export class MatchFoundService {
  private dbManager: DatabaseManager;
  private wss: any; // WebSocketServer
  private pendingMatches = new Map<number, AcceptanceStatus>();
  private monitoringInterval: NodeJS.Timeout | null = null;
  private readonly ACCEPTANCE_TIMEOUT_MS = 30000; // 30 segundos para aceitar

  constructor(dbManager: DatabaseManager, wss?: any) {
    this.dbManager = dbManager;
    this.wss = wss;
  }

  async initialize(): Promise<void> {
    console.log('🎯 [MatchFound] Inicializando MatchFoundService...');
    
    // Iniciar monitoramento contínuo de acceptance_status
    this.startAcceptanceMonitoring();
    
    console.log('✅ [MatchFound] MatchFoundService inicializado com sucesso');
  }

  // ✅ Criar nova partida e iniciar processo de aceitação
  async createMatchForAcceptance(matchData: {
    team1Players: string[];
    team2Players: string[];
    averageMMR: { team1: number; team2: number };
    balancedTeams: any;
  }): Promise<number> {
    console.log('🎮 [MatchFound] Criando partida para aceitação...');
    
    try {
      // 1. Calcular MMR médio geral
      const avgMMR = (matchData.averageMMR.team1 + matchData.averageMMR.team2) / 2;
      
      // 2. Criar partida no banco com status 'pending'
      const matchId = await this.dbManager.createCustomMatch({
        title: `Partida ${Date.now()}`,
        description: `Partida balanceada - MMR médio: ${Math.round(avgMMR)}`,
        team1Players: matchData.team1Players,
        team2Players: matchData.team2Players,
        createdBy: 'MatchmakingSystem',
        gameMode: 'CLASSIC'
      });

      // 3. Adicionar coluna de acceptance_status se não existir
      await this.dbManager.addAcceptanceStatusColumn();

      // 4. Resetar status de aceitação de todos os jogadores
      await this.dbManager.clearAllAcceptanceStatus();

      // 5. Configurar tracking de aceitação
      const allPlayers = [...matchData.team1Players, ...matchData.team2Players];
      const acceptanceStatus: AcceptanceStatus = {
        matchId,
        players: allPlayers,
        acceptedPlayers: new Set(),
        declinedPlayers: new Set(),
        createdAt: new Date()
      };

      // 6. Configurar timeout para cancelar partida se não for aceita
      acceptanceStatus.timeout = setTimeout(() => {
        this.handleAcceptanceTimeout(matchId);
      }, this.ACCEPTANCE_TIMEOUT_MS);

      this.pendingMatches.set(matchId, acceptanceStatus);

      // 7. Aceitar automaticamente para bots
      await this.autoAcceptForBots(matchId, allPlayers);

      // 8. Notificar frontend sobre partida encontrada
      this.notifyMatchFound(matchId, matchData);

      // 9. ✅ NOVO: Iniciar atualizações de timer em tempo real
      this.startTimerUpdates(matchId);

      console.log(`✅ [MatchFound] Partida ${matchId} criada e processo de aceitação iniciado`);
      return matchId;

    } catch (error) {
      console.error('❌ [MatchFound] Erro ao criar partida para aceitação:', error);
      throw error;
    }
  }

  // ✅ Processar aceitação de jogador
  async acceptMatch(matchId: number, summonerName: string): Promise<void> {
    console.log(`✅ [MatchFound] Jogador ${summonerName} aceitou partida ${matchId}`);
    
    try {
      // 1. Atualizar no banco de dados
      await this.dbManager.updatePlayerAcceptanceStatus(summonerName, 1);
      
      // 2. Atualizar tracking local
      const matchStatus = this.pendingMatches.get(matchId);
      if (matchStatus) {
        matchStatus.acceptedPlayers.add(summonerName);
        
        // Verificar se todos aceitaram
        if (matchStatus.acceptedPlayers.size === matchStatus.players.length) {
          await this.handleAllPlayersAccepted(matchId);
        } else {
          // Notificar progresso da aceitação
          this.notifyAcceptanceProgress(matchId, matchStatus);
        }
      }

    } catch (error) {
      console.error(`❌ [MatchFound] Erro ao aceitar partida ${matchId}:`, error);
      throw error;
    }
  }

  // ✅ Processar recusa de jogador
  async declineMatch(matchId: number, summonerName: string): Promise<void> {
    console.log(`❌ [MatchFound] Jogador ${summonerName} recusou partida ${matchId}`);
    
    try {
      // 1. Atualizar no banco de dados
      await this.dbManager.updatePlayerAcceptanceStatus(summonerName, 2);
      
      // 2. Processar recusa imediatamente
      await this.handleMatchDeclined(matchId, [summonerName]);

    } catch (error) {
      console.error(`❌ [MatchFound] Erro ao recusar partida ${matchId}:`, error);
      throw error;
    }
  }

  // ✅ Monitoramento contínuo de acceptance_status via MySQL
  private startAcceptanceMonitoring(): void {
    console.log('🔍 [MatchFound] Iniciando monitoramento contínuo...');
    
    this.monitoringInterval = setInterval(async () => {
      await this.monitorAcceptanceStatus();
    }, 1000); // Verificar a cada 1 segundo
  }

  private async monitorAcceptanceStatus(): Promise<void> {
    try {
      // Buscar partidas ativas no banco
      const activeMatches = await this.dbManager.getActiveCustomMatches();
      
      for (const match of activeMatches) {
        await this.processMatchAcceptanceFromDB(match);
      }
    } catch (error) {
      console.error('❌ [MatchFound] Erro no monitoramento:', error);
    }
  }

  private async processMatchAcceptanceFromDB(match: any): Promise<void> {
    const matchId = match.id;
    
    // Parsear jogadores dos times
    let allPlayers: string[] = [];
    try {
      const team1 = typeof match.team1_players === 'string' 
        ? JSON.parse(match.team1_players) 
        : (match.team1_players || []);
      const team2 = typeof match.team2_players === 'string' 
        ? JSON.parse(match.team2_players) 
        : (match.team2_players || []);
      
      allPlayers = [...team1, ...team2];
    } catch (parseError) {
      console.error(`❌ [MatchFound] Erro ao parsear jogadores da partida ${matchId}`);
      return;
    }

    if (allPlayers.length !== 10) {
      return;
    }

    // Buscar status de aceitação dos jogadores
    const queuePlayers = await this.dbManager.getActiveQueuePlayers();
    const matchPlayers = queuePlayers.filter(p => allPlayers.includes(p.summoner_name));

    if (matchPlayers.length !== 10) {
      return;
    }

    // Verificar recusas
    const declinedPlayers = matchPlayers.filter(p => p.acceptance_status === 2);
    if (declinedPlayers.length > 0) {
      await this.handleMatchDeclined(matchId, declinedPlayers.map(p => p.summoner_name));
      return;
    }

    // Verificar se todos aceitaram
    const acceptedPlayers = matchPlayers.filter(p => p.acceptance_status === 1);
    if (acceptedPlayers.length === 10) {
      await this.handleAllPlayersAccepted(matchId);
      return;
    }
  }

  // ✅ Lidar com todos os jogadores tendo aceitado
  private async handleAllPlayersAccepted(matchId: number): Promise<void> {
    console.log(`🎉 [MatchFound] Todos os jogadores aceitaram partida ${matchId}!`);
    
    try {
      // 1. Limpar timeout se existir
      const matchStatus = this.pendingMatches.get(matchId);
      if (matchStatus?.timeout) {
        clearTimeout(matchStatus.timeout);
      }
      this.pendingMatches.delete(matchId);

      // 2. Buscar dados da partida
      const match = await this.dbManager.getCustomMatchById(matchId);
      if (!match) {
        console.error(`❌ [MatchFound] Partida ${matchId} não encontrada`);
        return;
      }

      // 3. Atualizar status da partida para 'accepted'
      await this.dbManager.updateCustomMatchStatus(matchId, 'accepted');

      // 4. Notificar que todos aceitaram (será processado pelo DraftService)
      this.notifyAllPlayersAccepted(matchId, match);

      console.log(`✅ [MatchFound] Partida ${matchId} totalmente aceita - encaminhando para Draft`);

    } catch (error) {
      console.error(`❌ [MatchFound] Erro ao processar aceitação completa:`, error);
    }
  }

  // ✅ Lidar com partida recusada
  private async handleMatchDeclined(matchId: number, declinedPlayerNames: string[]): Promise<void> {
    console.log(`🚫 [MatchFound] Partida ${matchId} recusada por:`, declinedPlayerNames);
    
    try {
      // 1. Limpar timeout se existir
      const matchStatus = this.pendingMatches.get(matchId);
      if (matchStatus?.timeout) {
        clearTimeout(matchStatus.timeout);
      }
      this.pendingMatches.delete(matchId);

      // 2. Remover jogadores que recusaram da fila
      for (const playerName of declinedPlayerNames) {
        await this.dbManager.removePlayerFromQueueBySummonerName(playerName);
        console.log(`🗑️ [MatchFound] Jogador ${playerName} removido da fila (recusou)`);
      }

      // 3. Deletar a partida
      await this.dbManager.deleteCustomMatch(matchId);

      // 4. Resetar status de aceitação dos jogadores restantes
      await this.dbManager.clearAllAcceptanceStatus();

      // 5. Notificar frontend sobre cancelamento
      this.notifyMatchCancelled(matchId, declinedPlayerNames);

      console.log(`✅ [MatchFound] Partida ${matchId} cancelada e jogadores removidos`);

    } catch (error) {
      console.error(`❌ [MatchFound] Erro ao processar recusa:`, error);
    }
  }

  // ✅ Timeout de aceitação
  private async handleAcceptanceTimeout(matchId: number): Promise<void> {
    console.log(`⏰ [MatchFound] Timeout de aceitação para partida ${matchId}`);
    
    try {
      // Buscar jogadores que não aceitaram
      const queuePlayers = await this.dbManager.getActiveQueuePlayers();
      const nonAcceptedPlayers = queuePlayers
        .filter(p => p.acceptance_status === 0)
        .map(p => p.summoner_name);

      if (nonAcceptedPlayers.length > 0) {
        await this.handleMatchDeclined(matchId, nonAcceptedPlayers);
      }
    } catch (error) {
      console.error(`❌ [MatchFound] Erro no timeout:`, error);
    }
  }

  // ✅ NOVO: Enviar atualizações de timer em tempo real
  private startTimerUpdates(matchId: number): void {
    const matchStatus = this.pendingMatches.get(matchId);
    if (!matchStatus) return;

    let timeLeft = Math.floor(this.ACCEPTANCE_TIMEOUT_MS / 1000); // 30 segundos
    
    const timerInterval = setInterval(() => {
      timeLeft--;
      
      // Enviar atualização do timer via WebSocket
      this.notifyTimerUpdate(matchId, timeLeft);
      
      // Parar quando chegar a 0 ou partida não existir mais
      if (timeLeft <= 0 || !this.pendingMatches.has(matchId)) {
        clearInterval(timerInterval);
      }
    }, 1000);
  }

  // ✅ Aceitar automaticamente para bots
  private async autoAcceptForBots(matchId: number, players: string[]): Promise<void> {
    try {
      for (const playerName of players) {
        if (this.isBot(playerName)) {
          await this.dbManager.updatePlayerAcceptanceStatus(playerName, 1);
          console.log(`🤖 [MatchFound] Bot ${playerName} aceitou automaticamente`);
        }
      }
    } catch (error) {
      console.error('❌ [MatchFound] Erro na aceitação automática de bots:', error);
    }
  }

  private isBot(playerName: string): boolean {
    return playerName.toLowerCase().includes('bot') || 
           playerName.toLowerCase().includes('ai') ||
           playerName.toLowerCase().includes('computer') ||
           playerName.toLowerCase().includes('cpu');
  }

  // ✅ Notificações WebSocket
  private notifyMatchFound(matchId: number, matchData: any): void {
    if (!this.wss) return;

    const message = {
      type: 'match_found',
      data: {
        matchId,
        team1: matchData.team1Players,
        team2: matchData.team2Players,
        averageMMR: matchData.averageMMR,
        balancedTeams: matchData.balancedTeams,
        message: 'Partida encontrada! Aguardando aceitação dos jogadores...',
        acceptanceTimeout: this.ACCEPTANCE_TIMEOUT_MS
      },
      timestamp: Date.now()
    };

    this.broadcastMessage(message);
    console.log(`📢 [MatchFound] Notificação de partida encontrada enviada (${matchId})`);
  }

  private notifyAcceptanceProgress(matchId: number, matchStatus: AcceptanceStatus): void {
    if (!this.wss) return;

    const message = {
      type: 'match_acceptance_progress',
      data: {
        matchId,
        acceptedCount: matchStatus.acceptedPlayers.size,
        totalPlayers: matchStatus.players.length,
        acceptedPlayers: Array.from(matchStatus.acceptedPlayers),
        pendingPlayers: matchStatus.players.filter(p => 
          !matchStatus.acceptedPlayers.has(p) && !matchStatus.declinedPlayers.has(p)
        )
      },
      timestamp: Date.now()
    };

    this.broadcastMessage(message);
  }

  private notifyAllPlayersAccepted(matchId: number, match: any): void {
    if (!this.wss) return;

    const message = {
      type: 'match_fully_accepted',
      data: {
        matchId,
        match,
        message: 'Todos os jogadores aceitaram! Iniciando draft...'
      },
      timestamp: Date.now()
    };

    this.broadcastMessage(message);
    console.log(`📢 [MatchFound] Notificação de aceitação completa enviada (${matchId})`);
  }

  private notifyMatchCancelled(matchId: number, declinedPlayers: string[]): void {
    if (!this.wss) return;

    const message = {
      type: 'match_cancelled',
      data: {
        matchId,
        declinedPlayers,
        message: 'Partida cancelada devido a recusas. Jogadores que recusaram foram removidos da fila.'
      },
      timestamp: Date.now()
    };

    this.broadcastMessage(message);
    console.log(`📢 [MatchFound] Notificação de cancelamento enviada (${matchId})`);
  }

  // ✅ NOVO: Notificar atualização do timer
  private notifyTimerUpdate(matchId: number, timeLeft: number): void {
    if (!this.wss) return;

    const message = {
      type: 'match_timer_update',
      data: {
        matchId,
        timeLeft,
        isUrgent: timeLeft <= 10
      },
      timestamp: Date.now()
    };

    this.broadcastMessage(message);
  }

  private broadcastMessage(message: any): void {
    if (!this.wss?.clients) return;

    this.wss.clients.forEach((client: WebSocket) => {
      if (client.readyState === WebSocket.OPEN) {
        try {
          client.send(JSON.stringify(message));
        } catch (error) {
          console.error('❌ [MatchFound] Erro ao enviar mensagem:', error);
        }
      }
    });
  }

  // ✅ Shutdown
  shutdown(): void {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
    }

    // Limpar timeouts
    this.pendingMatches.forEach(match => {
      if (match.timeout) {
        clearTimeout(match.timeout);
      }
    });
    this.pendingMatches.clear();

    console.log('🛑 [MatchFound] MatchFoundService desligado');
  }
} 