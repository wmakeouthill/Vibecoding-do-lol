import { WebSocket } from 'ws';
import { DatabaseManager } from '../database/DatabaseManager';
import { DiscordService } from './DiscordService';

interface GameData {
  matchId: number;
  status: 'in_progress' | 'completed' | 'cancelled';
  startedAt: Date;
  estimatedDuration: number;
  team1: GamePlayer[];
  team2: GamePlayer[];
  draftResults: any;
  gameEvents: GameEvent[];
}

interface GamePlayer {
  summonerName: string;
  assignedLane: string;
  championId?: number;
  championName?: string;
  teamIndex: number;
  isConnected: boolean;
}

interface GameEvent {
  id: string;
  timestamp: Date;
  type: 'game_start' | 'player_disconnect' | 'player_reconnect' | 'game_end' | 'surrender';
  data: any;
  message: string;
}

interface GameResult {
  matchId: number;
  winnerTeam: number;
  duration: number;
  endReason: 'victory' | 'surrender' | 'disconnect' | 'cancelled';
  finalStats?: any;
}

export class GameInProgressService {
  private dbManager: DatabaseManager;
  private wss: any; // WebSocketServer
  private activeGames = new Map<number, GameData>();
  private monitoringInterval: NodeJS.Timeout | null = null;
  private discordService?: DiscordService;

  constructor(dbManager: DatabaseManager, wss?: any, discordService?: DiscordService) {
    console.log('🔧 [GameInProgress] Construtor chamado');
    console.log('🔧 [GameInProgress] DiscordService recebido:', !!discordService);
    
    this.dbManager = dbManager;
    this.wss = wss;
    this.discordService = discordService;
  }

  async initialize(): Promise<void> {
    console.log('🎮 [GameInProgress] Inicializando GameInProgressService...');
    
    // Monitorar partidas que foram finalizadas no draft e precisam iniciar
    this.startGameMonitoring();
    
    // Carregar jogos em andamento existentes
    await this.loadActiveGames();
    
    console.log('✅ [GameInProgress] GameInProgressService inicializado com sucesso');
  }

  // ✅ Iniciar jogo após draft completo
  async startGame(matchId: number, draftResults: any): Promise<void> {
    console.log(`🎮 [GameInProgress] Iniciando jogo para partida ${matchId}...`);
    
    try {
      // 1. Buscar partida no banco
      const match = await this.dbManager.getCustomMatchById(matchId);
      if (!match) {
        throw new Error(`Partida ${matchId} não encontrada`);
      }

      // 2. Parsear dados do draft
      let draftData: any = {};
      try {
        draftData = typeof match.draft_data === 'string' 
          ? JSON.parse(match.draft_data) 
          : (match.draft_data || {});
      } catch (parseError) {
        console.warn('⚠️ [GameInProgress] Erro ao parsear draft_data, usando dados básicos');
      }

      // 3. Preparar dados do jogo
      const gameData: GameData = {
        matchId,
        status: 'in_progress',
        startedAt: new Date(),
        estimatedDuration: 1800, // 30 minutos estimados
        team1: this.prepareTeamData(draftData.team1 || [], draftResults),
        team2: this.prepareTeamData(draftData.team2 || [], draftResults),
        draftResults,
        gameEvents: [
          {
            id: `${matchId}_start_${Date.now()}`,
            timestamp: new Date(),
            type: 'game_start',
            data: { matchId, draftResults },
            message: 'Jogo iniciado com sucesso'
          }
        ]
      };

      // 4. Atualizar partida no banco
      await this.dbManager.updateCustomMatchStatus(matchId, 'in_progress', {
        completedAt: null // Limpar completed_at se existir
      });

      // 5. Adicionar ao tracking local
      this.activeGames.set(matchId, gameData);

      // 6. Notificar frontend que jogo iniciou
      this.notifyGameStarted(matchId, gameData);

      console.log(`✅ [GameInProgress] Jogo ${matchId} iniciado com sucesso`);

    } catch (error) {
      console.error(`❌ [GameInProgress] Erro ao iniciar jogo ${matchId}:`, error);
      throw error;
    }
  }

  // ✅ Preparar dados dos times para o jogo
  private prepareTeamData(teamData: any[], draftResults: any): GamePlayer[] {
    if (!teamData || teamData.length === 0) {
      console.warn('⚠️ [GameInProgress] Dados do time vazios, criando estrutura básica');
      return [];
    }

    return teamData.map(player => ({
      summonerName: player.summonerName,
      assignedLane: player.assignedLane,
      championId: this.getPlayerChampion(player.summonerName, draftResults),
      championName: this.getPlayerChampionName(player.summonerName, draftResults),
      teamIndex: player.teamIndex,
      isConnected: true // Assumir que todos estão conectados inicialmente
    }));
  }

  private getPlayerChampion(summonerName: string, draftResults: any): number | undefined {
    // Implementar lógica para extrair campeão do jogador dos resultados do draft
    // Por enquanto, retornar undefined
    return undefined;
  }

  private getPlayerChampionName(summonerName: string, draftResults: any): string | undefined {
    // Implementar lógica para extrair nome do campeão
    return undefined;
  }

  // ✅ Registrar evento do jogo
  async recordGameEvent(matchId: number, eventType: GameEvent['type'], eventData: any, message: string): Promise<void> {
    console.log(`📝 [GameInProgress] Registrando evento para partida ${matchId}: ${eventType}`);
    
    try {
      const gameData = this.activeGames.get(matchId);
      if (!gameData) {
        console.warn(`⚠️ [GameInProgress] Jogo ${matchId} não encontrado no tracking local`);
        return;
      }

      const event: GameEvent = {
        id: `${matchId}_${eventType}_${Date.now()}`,
        timestamp: new Date(),
        type: eventType,
        data: eventData,
        message
      };

      gameData.gameEvents.push(event);

      // Notificar frontend sobre o evento
      this.notifyGameEvent(matchId, event);

      console.log(`✅ [GameInProgress] Evento registrado: ${message}`);

    } catch (error) {
      console.error(`❌ [GameInProgress] Erro ao registrar evento:`, error);
    }
  }

  // ✅ Finalizar jogo
  async finishGame(matchId: number, gameResult: GameResult): Promise<void> {
    console.log(`🏁 [GameInProgress] Finalizando jogo ${matchId}...`);
    
    try {
      const gameData = this.activeGames.get(matchId);
      if (!gameData) {
        throw new Error(`Jogo ${matchId} não encontrado`);
      }

      // 1. Atualizar status do jogo local
      gameData.status = 'completed';

      // 2. Registrar evento de fim de jogo
      await this.recordGameEvent(matchId, 'game_end', gameResult, 
        `Jogo finalizado - Time ${gameResult.winnerTeam} venceu (${gameResult.endReason})`);

      // 3. Atualizar partida no banco
      await this.dbManager.updateCustomMatchStatus(matchId, 'completed', {
        completedAt: new Date().toISOString(),
        winnerTeam: gameResult.winnerTeam,
        duration: gameResult.duration
      });

      // 4. Atualizar dados completos da partida
      await this.dbManager.updateCustomMatch(matchId, {
        winner_team: gameResult.winnerTeam,
        duration: gameResult.duration,
        game_events: JSON.stringify(gameData.gameEvents),
        final_stats: gameResult.finalStats ? JSON.stringify(gameResult.finalStats) : null
      });

      // 5. Processar alterações de LP/MMR
      await this.processPostGameRewards(matchId, gameResult);

      // 6. ✅ NOVO: Limpar canais do Discord se disponível
      if (this.discordService) {
        try {
          console.log(`🤖 [GameInProgress] Limpando canais do Discord para partida ${matchId}...`);
          await this.discordService.cleanupMatchByCustomId(matchId);
          console.log(`🤖 [GameInProgress] Canais do Discord limpos para partida ${matchId}`);
        } catch (discordError) {
          console.error(`❌ [GameInProgress] Erro ao limpar Discord para partida ${matchId}:`, discordError);
        }
      } else {
        console.warn(`⚠️ [GameInProgress] DiscordService não disponível para limpar partida ${matchId}`);
      }

      // 7. Notificar frontend sobre fim do jogo
      this.notifyGameFinished(matchId, gameResult);

      // 8. Remover do tracking local
      this.activeGames.delete(matchId);

      console.log(`✅ [GameInProgress] Jogo ${matchId} finalizado com sucesso`);

    } catch (error) {
      console.error(`❌ [GameInProgress] Erro ao finalizar jogo ${matchId}:`, error);
      throw error;
    }
  }

  // ✅ Processar recompensas pós-jogo (LP/MMR)
  private async processPostGameRewards(matchId: number, gameResult: GameResult): Promise<void> {
    console.log(`💰 [GameInProgress] Processando recompensas para partida ${matchId}...`);
    
    try {
      // Buscar partida para obter dados dos jogadores
      const match = await this.dbManager.getCustomMatchById(matchId);
      if (!match) {
        console.error('❌ [GameInProgress] Partida não encontrada para processar recompensas');
        return;
      }

      // Parsear jogadores dos times
      let team1Players: string[] = [];
      let team2Players: string[] = [];
      
      try {
        team1Players = typeof match.team1_players === 'string' 
          ? JSON.parse(match.team1_players) 
          : (match.team1_players || []);
        team2Players = typeof match.team2_players === 'string' 
          ? JSON.parse(match.team2_players) 
          : (match.team2_players || []);
      } catch (parseError) {
        console.error('❌ [GameInProgress] Erro ao parsear jogadores para recompensas');
        return;
      }

      // Calcular mudanças de LP
      const lpChanges: { [playerName: string]: number } = {};
      
      // Time vencedor ganha LP, perdedor perde
      const winnerPlayers = gameResult.winnerTeam === 1 ? team1Players : team2Players;
      const loserPlayers = gameResult.winnerTeam === 1 ? team2Players : team1Players;
      
      // LP base ganho/perdido
      const baseLPGain = 20;
      const baseLPLoss = -15;
      
      // Aplicar mudanças
      for (const playerName of winnerPlayers) {
        lpChanges[playerName] = baseLPGain;
        try {
          const player = await this.dbManager.getPlayerBySummonerName(playerName);
          if (player) {
            const newLP = (player.custom_lp || 0) + baseLPGain;
            await this.dbManager.updatePlayer(player.id!, { custom_lp: newLP });
          }
        } catch (error) {
          console.error(`❌ [GameInProgress] Erro ao atualizar LP de ${playerName}:`, error);
        }
      }
      
      for (const playerName of loserPlayers) {
        lpChanges[playerName] = baseLPLoss;
        try {
          const player = await this.dbManager.getPlayerBySummonerName(playerName);
          if (player) {
            const newLP = Math.max(0, (player.custom_lp || 0) + baseLPLoss); // Não deixar LP negativo
            await this.dbManager.updatePlayer(player.id!, { custom_lp: newLP });
          }
        } catch (error) {
          console.error(`❌ [GameInProgress] Erro ao atualizar LP de ${playerName}:`, error);
        }
      }

      // Salvar mudanças de LP na partida
      await this.dbManager.updateCustomMatch(matchId, {
        lp_changes: JSON.stringify(lpChanges)
      });

      console.log(`✅ [GameInProgress] Recompensas processadas:`, lpChanges);

    } catch (error) {
      console.error(`❌ [GameInProgress] Erro ao processar recompensas:`, error);
    }
  }

  // ✅ Cancelar jogo
  async cancelGame(matchId: number, reason: string): Promise<void> {
    console.log(`🚫 [GameInProgress] Cancelando jogo ${matchId}: ${reason}`);
    
    try {
      const gameData = this.activeGames.get(matchId);
      if (gameData) {
        gameData.status = 'cancelled';
        
        await this.recordGameEvent(matchId, 'surrender', { reason }, 
          `Jogo cancelado: ${reason}`);
      }

      // Atualizar no banco
      await this.dbManager.updateCustomMatchStatus(matchId, 'cancelled');

      // ✅ NOVO: Limpar canais do Discord se disponível
      if (this.discordService) {
        try {
          console.log(`🤖 [GameInProgress] Limpando canais do Discord para partida cancelada ${matchId}...`);
          await this.discordService.cleanupMatchByCustomId(matchId);
          console.log(`🤖 [GameInProgress] Canais do Discord limpos para partida cancelada ${matchId}`);
        } catch (discordError) {
          console.error(`❌ [GameInProgress] Erro ao limpar Discord para partida cancelada ${matchId}:`, discordError);
        }
      } else {
        console.warn(`⚠️ [GameInProgress] DiscordService não disponível para limpar partida cancelada ${matchId}`);
      }

      // Notificar frontend
      this.notifyGameCancelled(matchId, reason);

      // Remover do tracking
      this.activeGames.delete(matchId);

      console.log(`✅ [GameInProgress] Jogo ${matchId} cancelado`);

    } catch (error) {
      console.error(`❌ [GameInProgress] Erro ao cancelar jogo:`, error);
      throw error;
    }
  }

  // ✅ Monitoramento de jogos
  private startGameMonitoring(): void {
    console.log('🔍 [GameInProgress] Iniciando monitoramento de jogos...');
    
    this.monitoringInterval = setInterval(async () => {
      await this.monitorGames();
    }, 5000); // Verificar a cada 5 segundos
  }

  private async monitorGames(): Promise<void> {
    try {
      // Buscar partidas que finalizaram draft e precisam iniciar jogo
      const draftedMatches = await this.dbManager.getCustomMatchesByStatus('draft');
      
      for (const match of draftedMatches) {
        // Verificar se o draft foi realmente completado
        if (match.pick_ban_data && !this.activeGames.has(match.id)) {
          console.log(`🎮 [GameInProgress] Partida ${match.id} pronta para iniciar jogo...`);
          
          try {
            const draftResults = typeof match.pick_ban_data === 'string' 
              ? JSON.parse(match.pick_ban_data) 
              : match.pick_ban_data;
            
            await this.startGame(match.id, draftResults);
          } catch (error) {
            console.error(`❌ [GameInProgress] Erro ao iniciar jogo ${match.id}:`, error);
          }
        }
      }
    } catch (error) {
      console.error('❌ [GameInProgress] Erro no monitoramento:', error);
    }
  }

  // ✅ Carregar jogos ativos existentes
  private async loadActiveGames(): Promise<void> {
    try {
      const activeMatches = await this.dbManager.getCustomMatchesByStatus('in_progress');
      
      for (const match of activeMatches) {
        console.log(`🔄 [GameInProgress] Carregando jogo ativo: ${match.id}`);
        
        // Reconstruir dados do jogo a partir do banco
        const gameData: GameData = {
          matchId: match.id,
          status: 'in_progress',
          startedAt: new Date(match.created_at),
          estimatedDuration: match.duration || 1800,
          team1: [], // Seria reconstruído dos dados salvos
          team2: [],
          draftResults: match.pick_ban_data ? JSON.parse(match.pick_ban_data) : {},
          gameEvents: match.game_events ? JSON.parse(match.game_events) : []
        };
        
        this.activeGames.set(match.id, gameData);
      }
      
      console.log(`✅ [GameInProgress] ${activeMatches.length} jogos ativos carregados`);
    } catch (error) {
      console.error('❌ [GameInProgress] Erro ao carregar jogos ativos:', error);
    }
  }

  // ✅ Notificações WebSocket
  private notifyGameStarted(matchId: number, gameData: GameData): void {
    if (!this.wss) return;

    const message = {
      type: 'game_started',
      data: {
        matchId,
        gameData,
        message: 'Jogo iniciado! Boa sorte!'
      },
      timestamp: Date.now()
    };

    this.broadcastMessage(message);
    console.log(`📢 [GameInProgress] Notificação de jogo iniciado enviada (${matchId})`);
  }

  private notifyGameEvent(matchId: number, event: GameEvent): void {
    if (!this.wss) return;

    const message = {
      type: 'game_event',
      data: {
        matchId,
        event
      },
      timestamp: Date.now()
    };

    this.broadcastMessage(message);
  }

  private notifyGameFinished(matchId: number, gameResult: GameResult): void {
    if (!this.wss) return;

    const message = {
      type: 'game_finished',
      data: {
        matchId,
        gameResult,
        message: `Jogo finalizado! Time ${gameResult.winnerTeam} venceu!`
      },
      timestamp: Date.now()
    };

    this.broadcastMessage(message);
    console.log(`📢 [GameInProgress] Notificação de jogo finalizado enviada (${matchId})`);
  }

  private notifyGameCancelled(matchId: number, reason: string): void {
    if (!this.wss) return;

    const message = {
      type: 'game_cancelled',
      data: {
        matchId,
        reason,
        message: `Jogo cancelado: ${reason}`
      },
      timestamp: Date.now()
    };

    this.broadcastMessage(message);
    console.log(`📢 [GameInProgress] Notificação de jogo cancelado enviada (${matchId})`);
  }

  private broadcastMessage(message: any): void {
    if (!this.wss?.clients) return;

    this.wss.clients.forEach((client: WebSocket) => {
      if (client.readyState === WebSocket.OPEN) {
        try {
          client.send(JSON.stringify(message));
        } catch (error) {
          console.error('❌ [GameInProgress] Erro ao enviar mensagem:', error);
        }
      }
    });
  }

  // ✅ Métodos de consulta
  getActiveGame(matchId: number): GameData | undefined {
    return this.activeGames.get(matchId);
  }

  getActiveGamesCount(): number {
    return this.activeGames.size;
  }

  getActiveGamesList(): GameData[] {
    return Array.from(this.activeGames.values());
  }

  // ✅ Shutdown
  shutdown(): void {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
    }

    this.activeGames.clear();
    console.log('🛑 [GameInProgress] GameInProgressService desligado');
  }
}
