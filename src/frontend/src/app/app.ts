import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subject, takeUntil } from 'rxjs';
import { HttpErrorResponse } from '@angular/common/http';

import { DashboardComponent } from './components/dashboard/dashboard';
import { QueueComponent } from './components/queue/queue';
import { MatchHistoryComponent } from './components/match-history/match-history';
import { LeaderboardComponent } from './components/leaderboard/leaderboard';
import { MatchFoundComponent, MatchFoundData } from './components/match-found/match-found';
import { DraftPickBanComponent } from './components/draft/draft-pick-ban';
import { GameInProgressComponent } from './components/game-in-progress/game-in-progress';
import { ApiService } from './services/api';
import { QueueStateService } from './services/queue-state';
import { DiscordIntegrationService } from './services/discord-integration.service';
import { BotService } from './services/bot.service';
import { Player, QueueStatus, LCUStatus, MatchFound, QueuePreferences, RefreshPlayerResponse } from './interfaces';
import type { Notification } from './interfaces';

@Component({
  selector: 'app-root',
  imports: [
    CommonModule,
    FormsModule,
    DashboardComponent,
    QueueComponent,
    MatchHistoryComponent,
    LeaderboardComponent,
    MatchFoundComponent,
    DraftPickBanComponent,
    GameInProgressComponent
  ],
  templateUrl: './app-simple.html',
  styleUrl: './app.scss'
})
export class App implements OnInit, OnDestroy {
  protected title = 'LoL Matchmaking';

  // ✅ MANTIDO: Estado da aplicação (interface)
  currentView: 'dashboard' | 'queue' | 'history' | 'leaderboard' | 'settings' = 'dashboard';
  isElectron = false;
  isConnected = false;
  isInQueue: boolean = false;

  // ✅ MANTIDO: Dados do jogador
  currentPlayer: Player | null = null;

  // ✅ MANTIDO: Status da fila e do LCU (para exibição)
  queueStatus: QueueStatus = {
    playersInQueue: 0,
    averageWaitTime: 0,
    estimatedMatchTime: 0,
    isActive: true
  };
  lcuStatus: LCUStatus = { isConnected: false };

  // ✅ MANTIDO: Estados das fases (interface)
  matchFoundData: MatchFoundData | null = null;
  showMatchFound = false;
  inDraftPhase = false;
  draftData: any = null;
  inGamePhase = false;
  gameData: any = null;
  gameResult: any = null;

  // ✅ MANTIDO: Interface (sem lógica)
  notifications: Notification[] = [];
  settingsForm = {
    summonerName: '',
    region: 'br1',
    riotApiKey: '',
    discordBotToken: '',
    discordChannel: ''
  };
  discordStatus = {
    isConnected: false,
    botUsername: '',
    queueSize: 0,
    activeMatches: 0,
    inChannel: false
  };

  private destroy$ = new Subject<void>();
  private lastIgnoreLogTime = 0;
  private lastTimerUpdate = 0; // ✅ NOVO: Throttle para timer updates
  private lastMatchId: number | null = null; // ✅ NOVO: Rastrear última partida processada
  private lastMessageTimestamp = 0; // ✅ NOVO: Throttle para mensagens backend

  // ✅ NOVO: Controle de auto-refresh para sincronizar com o queue component
  private autoRefreshEnabled = false;

  // ✅ NOVO: Controle para priorizar backend sobre QueueStateService
  private hasRecentBackendQueueStatus = false;

  constructor(
    private apiService: ApiService,
    private queueStateService: QueueStateService,
    private discordService: DiscordIntegrationService,
    private botService: BotService
  ) {
    this.isElectron = !!(window as any).electronAPI;
  }

  ngOnInit(): void {
    console.log('🚀 [App] Inicializando frontend como interface para backend...');

    // ✅ MANTIDO: Configurações básicas
    this.loadPlayerData();
    this.setupDiscordStatusListener();
    this.startLCUStatusCheck();
    // ✅ REMOVIDO: startQueueStatusCheck() - usar apenas WebSocket em tempo real
    this.checkBackendConnection();
    this.loadConfigFromDatabase();

    // ✅ NOVO: Registrar ApiService no DiscordService para repasse de mensagens
    this.discordService.setApiService(this.apiService);

    // ✅ NOVO: Configurar comunicação com backend
    this.setupBackendCommunication();

    // ✅ NOVO: Buscar status inicial da fila UMA VEZ apenas
    this.refreshQueueStatus();

    // ✅ NOVO: Forçar atualização do status da fila a cada 10 segundos para garantir sincronização
    setInterval(() => {
      if (this.currentPlayer?.displayName) {
        console.log('🔄 [App] Atualização periódica do status da fila');
        this.refreshQueueStatus();
      }
    }, 10000);
  }

  // ✅ NOVO: Configurar comunicação centralizada com backend
  private setupBackendCommunication(): void {
    console.log('🔌 [App] Configurando comunicação com backend via WebSocket...');

    // ✅ CORREÇÃO: ApiService é responsável por toda comunicação de matchmaking
    // DiscordService é usado APENAS para identificação de jogadores Discord

    // Escutar estado da fila via MySQL apenas para mudanças de estado críticas
    this.queueStateService.getQueueState().pipe(
      takeUntil(this.destroy$)
    ).subscribe(queueState => {
      console.log('📊 [App] Estado crítico da fila atualizado via backend:', queueState);

      // ✅ CORRIGIDO: Não sobrescrever o estado isInQueue se já foi determinado pelo backend
      // O backend (via refreshQueueStatus) tem prioridade sobre o QueueStateService
      const wasInQueue = this.isInQueue;

      // Só atualizar se não tivermos uma determinação recente do backend
      if (!this.hasRecentBackendQueueStatus) {
        this.isInQueue = queueState.isInQueue;
        console.log(`🔄 [App] Estado da fila atualizado via QueueStateService: ${this.isInQueue ? 'na fila' : 'fora da fila'}`);
      } else {
        console.log(`🎯 [App] Mantendo estado determinado pelo backend: ${this.isInQueue ? 'na fila' : 'fora da fila'}`);
      }

      // Se mudou o estado de estar na fila, buscar dados atualizados UMA VEZ
      if (wasInQueue !== this.isInQueue) {
        console.log(`🔄 [App] Estado da fila mudou: ${wasInQueue} → ${this.isInQueue}`);
        this.refreshQueueStatus();
      }
    });

    // Escutar mensagens WebSocket do backend
    this.apiService.onWebSocketMessage().pipe(
      takeUntil(this.destroy$)
    ).subscribe({
      next: (message) => {
        console.log('📡 [App] Mensagem do backend recebida:', message.type, message);
        console.log('📡 [App] Dados completos da mensagem:', JSON.stringify(message, null, 2));
        this.handleBackendMessage(message);
      },
      error: (error) => {
        console.error('❌ [App] Erro na comunicação com backend:', error);
      }
    });

    // Configurar listener para mensagens do componente queue
    this.setupQueueComponentListener();
  }

  // ✅ NOVO: Processar mensagens do backend
  private handleBackendMessage(message: any): void {
    console.log('🔍 [App] === handleBackendMessage ===');
    console.log('🔍 [App] Tipo da mensagem:', message.type);
    console.log('🔍 [App] Timestamp da mensagem:', Date.now());

    // ✅ NOVO: Throttle geral para mensagens backend (evitar spam)
    const now = Date.now();
    if (message.type === 'match_found' || message.type === 'match_timer_update') {
      const timeSinceLastMessage = now - this.lastMessageTimestamp;
      if (timeSinceLastMessage < 1000) { // Máximo 1 mensagem por segundo
        console.log('🔍 [App] Throttling mensagem backend - muito frequente');
        console.log('🔍 [App] Tipo:', message.type, 'Intervalo:', timeSinceLastMessage + 'ms');
        return;
      }
      this.lastMessageTimestamp = now;
    }

    switch (message.type) {
      case 'match_found':
        console.log('🎮 [App] === MATCH_FOUND RECEBIDO ===');
        console.log('🎮 [App] Partida encontrada pelo backend');
        console.log('🎮 [App] MatchId recebido:', message.data?.matchId);
        console.log('🎮 [App] Última partida processada:', this.lastMatchId);
        console.log('🎮 [App] Estado antes do processamento:', {
          showMatchFound: this.showMatchFound,
          currentPlayer: this.currentPlayer?.displayName || 'N/A',
          isInQueue: this.isInQueue
        });
        this.handleMatchFound(message.data);
        console.log('🎮 [App] Estado após processamento:', {
          showMatchFound: this.showMatchFound,
          matchFoundData: !!this.matchFoundData,
          isInQueue: this.isInQueue
        });
        break;

      case 'match_acceptance_progress':
        console.log('📊 [App] Progresso de aceitação');
        this.handleAcceptanceProgress(message.data);
        break;

      case 'match_fully_accepted':
        console.log('✅ [App] Partida totalmente aceita');
        this.handleMatchFullyAccepted(message.data);
        break;

      case 'draft_started':
        console.log('🎯 [App] Draft iniciado pelo backend');
        this.handleDraftStarted(message.data);
        break;

      case 'draft_action':
        console.log('🎯 [App] Ação de draft');
        this.handleDraftAction(message.data);
        break;

      case 'game_starting':
        console.log('🎮 [App] Jogo iniciando');
        this.handleGameStarting(message.data);
        break;

      case 'match_cancelled':
        console.log('❌ [App] Partida cancelada pelo backend');
        this.handleMatchCancelled(message.data);
        break;

      case 'match_timer_update':
        console.log('⏰ [App] === MATCH_TIMER_UPDATE RECEBIDO ===');
        console.log('⏰ [App] Dados do timer:', message.data);
        console.log('⏰ [App] Estado atual:', {
          showMatchFound: this.showMatchFound,
          matchFoundData: !!this.matchFoundData,
          matchId: this.matchFoundData?.matchId
        });
        this.handleMatchTimerUpdate(message.data);
        break;

      case 'queue_update':
        console.log('🔄 [App] Atualização da fila');
        this.handleQueueUpdate(message.data);
        break;

      default:
        console.log('📡 [App] Mensagem não reconhecida:', message.type);
    }
  }

  // ✅ NOVO: Configurar listener do componente queue
  private setupQueueComponentListener(): void {
    document.addEventListener('matchFound', (event: any) => {
      console.log('🎮 [App] Match found do componente queue:', event.detail);
      this.handleMatchFound(event.detail.data);
    });
  }

  // ✅ SIMPLIFICADO: Handlers apenas atualizam interface
  private handleMatchFound(data: any): void {
    console.log('🎮 [App] === MATCH FOUND RECEBIDO ===');
    console.log('🎮 [App] MatchId recebido:', data?.matchId);
    console.log('🎮 [App] Última partida processada:', this.lastMatchId);

    // ✅ NOVO: Verificar se já processamos esta partida
    if (this.lastMatchId === data?.matchId) {
      console.log('🎮 [App] ❌ PARTIDA JÁ PROCESSADA - ignorando duplicata');
      console.log('🎮 [App] MatchId duplicado:', data.matchId);
      return;
    }

    // ✅ NOVO: Verificar se já temos esta partida ativa
    if (this.matchFoundData && this.matchFoundData.matchId === data.matchId) {
      console.log('🎮 [App] ❌ PARTIDA JÁ ESTÁ ATIVA - ignorando duplicata');
      console.log('🎮 [App] Match atual:', this.matchFoundData.matchId, 'Match recebido:', data.matchId);
      return;
    }

    // ✅ NOVO: Verificar se já estamos mostrando uma partida
    if (this.showMatchFound && this.matchFoundData) {
      console.log('🎮 [App] ❌ JÁ EXISTE UMA PARTIDA ATIVA - ignorando nova');
      console.log('🎮 [App] Partida ativa:', this.matchFoundData.matchId, 'Nova partida:', data.matchId);
      return;
    }

    // ✅ NOVO: Marcar esta partida como processada
    this.lastMatchId = data.matchId;
    console.log('🎮 [App] ✅ PROCESSANDO NOVA PARTIDA:', data.matchId);

    // ✅ CORREÇÃO: Converter dados do backend para formato do frontend
    const matchFoundData: MatchFoundData = {
      matchId: data.matchId,
      playerSide: 'blue', // Determinar lado do jogador
      teammates: [],
      enemies: [],
      averageMMR: { yourTeam: 1200, enemyTeam: 1200 },
      estimatedGameDuration: 25,
      phase: 'accept',
      acceptTimeout: data.acceptTimeout || data.acceptanceTimer || 30,
      acceptanceTimer: data.acceptanceTimer || data.acceptTimeout || 30,
      acceptanceDeadline: data.acceptanceDeadline,
      teamStats: data.teamStats,
      balancingInfo: data.balancingInfo
    };

    // ✅ CORREÇÃO: Usar dados diretos do backend (teammates e enemies)
    console.log('🎮 [App] Processando dados diretos do backend:');
    console.log('🎮 [App] Teammates recebidos:', data.teammates);
    console.log('🎮 [App] Enemies recebidos:', data.enemies);

    if (data.teammates && data.enemies) {
      const teammates = data.teammates || [];
      const enemies = data.enemies || [];

      console.log('🎮 [App] Teammates count:', teammates.length);
      console.log('🎮 [App] Enemies count:', enemies.length);

      // Determinar em qual time o jogador atual está
      const currentPlayerName = this.currentPlayer?.displayName || this.currentPlayer?.summonerName;
      console.log('🎮 [App] Current player name:', currentPlayerName);
      console.log('🎮 [App] Teammates players:', teammates.map((p: any) => p.summonerName));
      console.log('🎮 [App] Enemies players:', enemies.map((p: any) => p.summonerName));

      // ✅ CORREÇÃO: Verificar se o jogador está nos teammates (time azul por padrão)
      const isInTeammates = teammates.some((p: any) => p.summonerName === currentPlayerName);
      const isInEnemies = enemies.some((p: any) => p.summonerName === currentPlayerName);

      console.log('🎮 [App] Is in teammates:', isInTeammates);
      console.log('🎮 [App] Is in enemies:', isInEnemies);

      // ✅ CORREÇÃO: Usar teammates e enemies diretos do backend
      matchFoundData.playerSide = isInTeammates ? 'blue' : 'red';
      matchFoundData.teammates = this.convertPlayersToPlayerInfo(teammates);
      matchFoundData.enemies = this.convertPlayersToPlayerInfo(enemies);

      console.log('🎮 [App] Final teammates:', matchFoundData.teammates);
      console.log('🎮 [App] Final enemies:', matchFoundData.enemies);

      // ✅ CORREÇÃO: Usar teamStats do backend se disponível
      if (data.teamStats) {
        matchFoundData.averageMMR = {
          yourTeam: isInTeammates ? data.teamStats.team1.averageMMR : data.teamStats.team2.averageMMR,
          enemyTeam: isInTeammates ? data.teamStats.team2.averageMMR : data.teamStats.team1.averageMMR
        };
      } else {
        console.warn('🎮 [App] teamStats não encontrado nos dados');
      }
    } else {
      console.error('🎮 [App] ❌ ERRO: teammates ou enemies não encontrados nos dados');
      console.log('🎮 [App] Dados recebidos:', data);
    }

    this.matchFoundData = matchFoundData;
    this.isInQueue = false;

    console.log('🎯 [App] === EXIBINDO MATCH FOUND ===');
    console.log('🎯 [App] Current player completo:', {
      hasCurrentPlayer: !!this.currentPlayer,
      currentPlayer: this.currentPlayer,
      displayName: this.currentPlayer?.displayName,
      summonerName: this.currentPlayer?.summonerName,
      gameName: this.currentPlayer?.gameName,
      tagLine: this.currentPlayer?.tagLine
    });

    // ✅ CORREÇÃO: Modal só deve ser exibido para jogadores humanos
    // Bots são auto-aceitos pelo backend e não precisam do modal
    if (this.isCurrentPlayerBot()) {
      console.log('🎯 [App] Jogador atual é bot - não exibindo modal');
      console.log('� [App] Auto-aceitação de bots é processada pelo backend');
      return;
    }

    console.log('🎮 [App] Mostrando tela de match-found para jogador humano');
    this.showMatchFound = true;
    console.log('🎮 [App] showMatchFound definido como:', this.showMatchFound);
    console.log('🎮 [App] matchFoundData definido como:', !!this.matchFoundData);
    this.addNotification('success', 'Partida Encontrada!', 'Você tem 30 segundos para aceitar.');

    console.log('🎯 [App] Estado final:', {
      showMatchFound: this.showMatchFound,
      matchFoundData: !!this.matchFoundData,
      isInQueue: this.isInQueue
    });

    // Som de notificação
    try {
      const audio = new Audio('assets/sounds/match-found.mp3');
      audio.play().catch(() => {});
    } catch (error) {}
  }

  // ✅ NOVO: Converter dados do backend para PlayerInfo
  private convertPlayersToPlayerInfo(players: any[]): any[] {
    console.log('🔄 [App] Convertendo players para PlayerInfo:', players);

    return players.map((player: any, index: number) => {
      const playerInfo = {
        id: player.teamIndex || index, // ✅ USAR teamIndex do backend
        summonerName: player.summonerName,
        mmr: player.mmr || 1200,
        primaryLane: player.primaryLane || 'fill',
        secondaryLane: player.secondaryLane || 'fill',
        assignedLane: player.assignedLane || 'FILL', // ✅ Lane já vem correta do backend
        teamIndex: player.teamIndex || index, // ✅ Índice correto do backend
        isAutofill: player.isAutofill || false,
        riotIdGameName: player.gameName,
        riotIdTagline: player.tagLine,
        profileIconId: player.profileIconId
      };

      console.log(`🔄 [App] Player ${index}:`, {
        name: playerInfo.summonerName,
        lane: playerInfo.assignedLane,
        teamIndex: playerInfo.teamIndex,
        autofill: playerInfo.isAutofill,
        // ✅ ADICIONADO: Log detalhado das lanes
        primaryLane: playerInfo.primaryLane,
        secondaryLane: playerInfo.secondaryLane,
        assignedLaneType: typeof playerInfo.assignedLane,
        assignedLaneValue: playerInfo.assignedLane,
        // ✅ NOVO: Log dos dados originais do backend
        originalAssignedLane: player.assignedLane,
        originalPrimaryLane: player.primaryLane,
        originalSecondaryLane: player.secondaryLane
      });

      return playerInfo;
    });
  }

  private handleAcceptanceProgress(data: any): void {
    console.log('📊 [App] Progresso de aceitação:', data);
    // Atualizar UI de progresso se necessário
  }

  private handleMatchFullyAccepted(data: any): void {
    console.log('✅ [App] Partida totalmente aceita:', data);
    this.addNotification('success', 'Partida Aceita!', 'Todos os jogadores aceitaram. Preparando draft...');
  }

  private handleDraftStarted(data: any): void {
    console.log('🎯 [App] Iniciando draft:', data);

    // ✅ NOVO: Limpar controle de partida
    this.lastMatchId = null;
    this.showMatchFound = false;
    this.matchFoundData = null;
    this.inDraftPhase = true;
    this.draftData = data;

    console.log('🎯 [App] Estado limpo para draft');
    this.addNotification('success', 'Draft Iniciado!', 'A fase de draft começou.');
  }

  private handleDraftAction(data: any): void {
    console.log('🎯 [App] Ação de draft:', data);
    // Atualizar estado do draft
    if (this.draftData) {
      this.draftData = { ...this.draftData, ...data };
    }
  }

  private handleGameStarting(data: any): void {
    console.log('🎮 [App] Jogo iniciando:', data);

    this.inDraftPhase = false;
    this.draftData = null;
    this.inGamePhase = true;
    this.gameData = data;

    this.addNotification('success', 'Jogo Iniciado!', 'A partida começou.');
  }

  private handleMatchCancelled(data: any): void {
    console.log('❌ [App] Partida cancelada:', data);

    // ✅ NOVO: Limpar controle de partida
    this.lastMatchId = null;
    this.showMatchFound = false;
    this.matchFoundData = null;
    this.inDraftPhase = false;
    this.draftData = null;
    this.isInQueue = true; // Voltar para fila

    console.log('❌ [App] Estado limpo após cancelamento');
    this.addNotification('info', 'Partida Cancelada', data.message || 'A partida foi cancelada.');
  }

  private handleMatchTimerUpdate(data: any): void {
    console.log('⏰ [App] === handleMatchTimerUpdate ===');
    console.log('⏰ [App] Timer atualizado:', data);
    console.log('⏰ [App] Verificando condições:', {
      showMatchFound: this.showMatchFound,
      hasMatchFoundData: !!this.matchFoundData,
      matchDataId: this.matchFoundData?.matchId,
      timerDataId: data.matchId,
      idsMatch: this.matchFoundData?.matchId === data.matchId
    });

    // ✅ CORREÇÃO: Verificar se devemos processar esta atualização
    if (!this.showMatchFound || !this.matchFoundData) {
      console.log('⏰ [App] Match não está visível - ignorando timer');
      return;
    }

    if (this.matchFoundData.matchId !== data.matchId) {
      console.log('⏰ [App] Timer para partida diferente - ignorando');
      return;
    }

    // ✅ NOVO: Throttle para evitar atualizações excessivas
    const now = Date.now();
    const timeSinceLastUpdate = now - (this.lastTimerUpdate || 0);

    if (timeSinceLastUpdate < 500) { // Máximo 2 atualizações por segundo
      console.log('⏰ [App] Throttling timer update - muito frequente');
      return;
    }

    this.lastTimerUpdate = now;

    console.log('⏰ [App] Condições atendidas - emitindo evento para componente');

    // ✅ CORREÇÃO: Emitir evento apenas quando necessário
    try {
      document.dispatchEvent(new CustomEvent('matchTimerUpdate', {
        detail: {
          matchId: data.matchId,
          timeLeft: data.timeLeft,
          isUrgent: data.isUrgent || data.timeLeft <= 10
        }
      }));
      console.log('⏰ [App] Evento matchTimerUpdate emitido com sucesso');
    } catch (error) {
      console.error('❌ [App] Erro ao emitir evento matchTimerUpdate:', error);
    }
  }

  private handleQueueUpdate(data: any): void {
    // ✅ VERIFICAR SE AUTO-REFRESH ESTÁ HABILITADO ANTES DE PROCESSAR
    if (!this.autoRefreshEnabled) {
      // Só processar atualizações críticas mesmo com auto-refresh desabilitado
      const currentPlayerCount = this.queueStatus?.playersInQueue || 0;
      const newPlayerCount = data?.playersInQueue || 0;
      const isCriticalUpdate = newPlayerCount >= 10 && currentPlayerCount < 10; // Matchmaking threshold

      if (!isCriticalUpdate && !data.critical) {
        // ✅ IGNORAR: Auto-refresh desabilitado e não é atualização crítica
        const timeSinceLastIgnoreLog = Date.now() - (this.lastIgnoreLogTime || 0);
        if (timeSinceLastIgnoreLog > 30000) { // Log apenas a cada 30 segundos
          console.log('⏭️ [App] Atualizações da fila ignoradas - auto-refresh desabilitado');
          this.lastIgnoreLogTime = Date.now();
        }
        return;
      }
    }

    // ✅ FILTROS MÚLTIPLOS: Só atualizar em casos específicos e necessários
    const currentPlayerCount = this.queueStatus?.playersInQueue || 0;
    const newPlayerCount = data?.playersInQueue || 0;

    // 1. Verificar se há mudança no número de jogadores
    const hasPlayerCountChange = currentPlayerCount !== newPlayerCount;

    // 2. Verificar se há mudança no status ativo da fila
    const currentIsActive = this.queueStatus?.isActive || false;
    const newIsActive = data?.isActive !== undefined ? data.isActive : currentIsActive;
    const hasActiveStatusChange = currentIsActive !== newIsActive;

    // 3. Verificar se é uma mudança crítica (10+ jogadores = matchmaking)
    const isCriticalThreshold = newPlayerCount >= 10 && currentPlayerCount < 10;

    // ✅ SÓ ATUALIZAR SE HOUVER MUDANÇAS SIGNIFICATIVAS
    if (hasPlayerCountChange || hasActiveStatusChange || isCriticalThreshold) {
      console.log(`📊 [App] Status da fila atualizado:`, {
        playersInQueue: `${currentPlayerCount} → ${newPlayerCount}`,
        isActive: `${currentIsActive} → ${newIsActive}`,
        isCritical: isCriticalThreshold,
        autoRefreshEnabled: this.autoRefreshEnabled
      });
      this.queueStatus = data;
    } else {
      // ✅ IGNORAR: Log apenas quando necessário, evitar spam
      const timeSinceLastIgnoreLog = Date.now() - (this.lastIgnoreLogTime || 0);
      if (timeSinceLastIgnoreLog > 10000) { // Log apenas a cada 10 segundos
        console.log('⏭️ [App] Atualizações da fila ignoradas - sem mudanças significativas');
        this.lastIgnoreLogTime = Date.now();
      }
    }
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  // ✅ MANTIDO: Métodos de interface
  setCurrentView(view: 'dashboard' | 'queue' | 'history' | 'leaderboard' | 'settings'): void {
    this.currentView = view;
  }

  // ✅ SIMPLIFICADO: Apenas comunicar com backend
  async joinQueue(preferences?: QueuePreferences): Promise<void> {
    console.log('📞 [App] Solicitando entrada na fila ao backend...');

    if (!this.currentPlayer) {
      this.addNotification('error', 'Erro', 'Dados do jogador não disponíveis');
      return;
    }

    try {
      await this.apiService.joinQueue(this.currentPlayer, preferences).toPromise();
      console.log('✅ [App] Solicitação de entrada na fila enviada');
    } catch (error) {
      console.error('❌ [App] Erro ao entrar na fila:', error);
      this.addNotification('error', 'Erro', 'Falha ao entrar na fila');
    }
  }

  async joinDiscordQueueWithFullData(data: { player: Player | null, preferences: QueuePreferences }): Promise<void> {
    console.log('📞 [App] Solicitando entrada na fila Discord ao backend...', data);

    if (!data.player) {
      console.error('❌ [App] Dados do jogador não disponíveis');
      this.addNotification('error', 'Erro', 'Dados do jogador não disponíveis');
      return;
    }

    if (!data.player.gameName || !data.player.tagLine) {
      console.error('❌ [App] gameName ou tagLine não disponíveis');
      this.addNotification('error', 'Erro', 'Dados do jogador incompletos (gameName/tagLine)');
      return;
    }

    try {
      // ✅ CORRIGIDO: Usar discordService.joinDiscordQueue para entrada via Discord
      const success = this.discordService.joinDiscordQueue(
        data.preferences.primaryLane,
        data.preferences.secondaryLane,
        data.player.summonerName,
        {
          gameName: data.player.gameName,
          tagLine: data.player.tagLine
        }
      );

      if (success) {
        console.log('✅ [App] Solicitação de entrada na fila Discord enviada via WebSocket');
        this.addNotification('success', 'Fila Discord', 'Entrando na fila via Discord...');

        // ✅ CORRIGIDO: Marcar estado como na fila imediatamente
        this.isInQueue = true;
        this.hasRecentBackendQueueStatus = true;

        // Atualizar status após 3 segundos para confirmar
        setTimeout(() => {
          this.refreshQueueStatus();
        }, 3000);
      } else {
        console.error('❌ [App] Falha ao enviar solicitação via Discord WebSocket');
        this.addNotification('error', 'Erro', 'Falha ao conectar com Discord');
      }
    } catch (error) {
      console.error('❌ [App] Erro ao entrar na fila Discord:', error);
      this.addNotification('error', 'Erro', 'Falha ao entrar na fila Discord');
    }
  }

  async leaveQueue(): Promise<void> {
    console.log('📞 [App] Solicitando saída da fila ao backend...');
    console.log('📞 [App] Dados do jogador atual:', {
      id: this.currentPlayer?.id,
      summonerName: this.currentPlayer?.summonerName,
      displayName: this.currentPlayer?.displayName
    });

    if (!this.currentPlayer?.summonerName && !this.currentPlayer?.displayName) {
      console.error('❌ [App] Nenhum identificador do jogador disponível');
      this.addNotification('error', 'Erro', 'Dados do jogador não disponíveis para sair da fila');
      return;
    }

    try {
      // ✅ USAR displayName como prioridade
      const playerIdentifier = this.currentPlayer.displayName || this.currentPlayer.summonerName;
      console.log('📞 [App] Usando identificador:', playerIdentifier);

      // ✅ CORRIGIDO: Priorizar summonerName/displayName ao invés de playerId
      await this.apiService.leaveQueue(undefined, playerIdentifier).toPromise();
      console.log('✅ [App] Solicitação de saída da fila enviada');

      // ✅ CORRIGIDO: Marcar estado como fora da fila imediatamente
      this.isInQueue = false;
      this.hasRecentBackendQueueStatus = true;

      this.addNotification('success', 'Saiu da Fila', 'Você saiu da fila com sucesso');

      // Atualizar status após 2 segundos para confirmar
      setTimeout(() => {
        this.refreshQueueStatus();
      }, 2000);
    } catch (error: any) {
      console.error('❌ [App] Erro ao sair da fila:', error);
      console.error('❌ [App] Detalhes do erro:', {
        status: error.status,
        message: error.message,
        error: error.error
      });

      let errorMessage = 'Falha ao sair da fila';
      if (error.error?.message) {
        errorMessage += `: ${error.error.message}`;
      } else if (error.message) {
        errorMessage += `: ${error.message}`;
      }

      this.addNotification('error', 'Erro', errorMessage);
    }
  }

  async acceptMatch(): Promise<void> {
    console.log('📞 [App] Enviando aceitação ao backend...');

    if (!this.matchFoundData?.matchId || !this.currentPlayer?.summonerName) {
      this.addNotification('error', 'Erro', 'Dados da partida não disponíveis');
      return;
    }

    try {
      await this.apiService.acceptMatch(
        this.matchFoundData.matchId,
        this.currentPlayer.id,
        this.currentPlayer.summonerName
      ).toPromise();

      console.log('✅ [App] Aceitação enviada ao backend');
      this.addNotification('success', 'Partida Aceita!', 'Aguardando outros jogadores aceitar...');

      // ✅ CORREÇÃO: Não fechar o modal imediatamente, aguardar resposta do backend
      // O modal só será fechado quando o backend confirmar que todos aceitaram

    } catch (error: any) {
      console.error('❌ [App] Erro ao aceitar partida:', error);

      let errorMessage = 'Falha ao aceitar partida';
      if (error.status === 404) {
        errorMessage = 'Partida não encontrada ou expirada';
      } else if (error.status === 409) {
        errorMessage = 'Partida já foi aceita ou cancelada';
      } else if (error.error?.message) {
        errorMessage = error.error.message;
      }

      this.addNotification('error', 'Erro na Aceitação', errorMessage);

      // Se a partida não existe mais, fechar o modal
      if (error.status === 404) {
        // ✅ NOVO: Limpar controle de partida
        this.lastMatchId = null;
        this.showMatchFound = false;
        this.matchFoundData = null;
        this.isInQueue = true;
      }
    }
  }

  async declineMatch(): Promise<void> {
    console.log('📞 [App] === INÍCIO DA RECUSA DA PARTIDA ===');
    console.log('📞 [App] Enviando recusa ao backend...');
    console.log('📞 [App] Estado atual:', {
      matchId: this.matchFoundData?.matchId,
      currentPlayer: this.currentPlayer?.summonerName,
      isInQueue: this.isInQueue,
      showMatchFound: this.showMatchFound
    });

    if (!this.matchFoundData?.matchId || !this.currentPlayer?.summonerName) {
      console.error('❌ [App] Dados insuficientes para recusa');
      this.addNotification('error', 'Erro', 'Dados da partida não disponíveis');
      return;
    }

    try {
      // ✅ CORREÇÃO: Enviar recusa ao backend
      await this.apiService.declineMatch(
        this.matchFoundData.matchId,
        this.currentPlayer.id,
        this.currentPlayer.summonerName
      ).toPromise();

      console.log('✅ [App] Recusa enviada ao backend com sucesso');

      // ✅ CORREÇÃO: Atualizar estado local imediatamente
      this.lastMatchId = null; // ✅ NOVO: Limpar controle de partida
      this.showMatchFound = false;
      this.matchFoundData = null;
      this.isInQueue = false;

      // ✅ NOVO: Marcar que temos uma resposta recente do backend
      this.hasRecentBackendQueueStatus = true;

      console.log('✅ [App] Estado atualizado:', {
        showMatchFound: this.showMatchFound,
        matchFoundData: this.matchFoundData,
        isInQueue: this.isInQueue
      });

      this.addNotification('success', 'Partida Recusada', 'Você recusou a partida e saiu da fila.');

      // ✅ CORREÇÃO: Aguardar 2 segundos e atualizar status para confirmar
      setTimeout(() => {
        console.log('🔄 [App] Confirmando status da fila após recusa...');
        this.refreshQueueStatus();
      }, 2000);

    } catch (error: any) {
      console.error('❌ [App] Erro ao recusar partida:', error);
      console.error('❌ [App] Detalhes do erro:', {
        status: error.status,
        message: error.message,
        error: error.error
      });

      let errorMessage = 'Falha ao recusar partida';

      if (error.status === 404) {
        errorMessage = 'Partida não encontrada ou já expirada';
        console.log('⚠️ [App] Partida não encontrada - forçando saída da fila');

        // ✅ CORREÇÃO: Se partida não existe, forçar saída da interface
        this.lastMatchId = null; // ✅ NOVO: Limpar controle de partida
        this.showMatchFound = false;
        this.matchFoundData = null;
        this.isInQueue = false;
        this.hasRecentBackendQueueStatus = true;

        // ✅ NOVO: Tentar sair da fila explicitamente
        setTimeout(() => {
          console.log('🔄 [App] Tentando sair da fila explicitamente...');
          this.leaveQueue().catch(err => {
            console.warn('⚠️ [App] Erro ao sair da fila após recusa:', err);
          });
        }, 1000);

      } else if (error.status === 409) {
        errorMessage = 'Partida já foi aceita ou cancelada';
        // ✅ CORREÇÃO: Mesmo com erro 409, sair da interface
        this.showMatchFound = false;
        this.matchFoundData = null;
        this.isInQueue = false;
      } else if (error.error?.message) {
        errorMessage = error.error.message;
      }

      this.addNotification('error', 'Erro na Recusa', errorMessage);
    }

    console.log('📞 [App] === FIM DA RECUSA DA PARTIDA ===');
  }

  // ✅ MANTIDO: Métodos de interface simples
  addNotification(type: 'success' | 'info' | 'warning' | 'error', title: string, message: string): void {
    const notification: Notification = {
      id: Date.now().toString() + Math.random().toString(36).substr(2, 5),
      type,
      title,
      message,
      timestamp: new Date(),
      isRead: false
    };

    this.notifications.unshift(notification);

    // Auto-remover após 5 segundos para notificações de sucesso/info
    if (type === 'success' || type === 'info') {
      setTimeout(() => {
        this.dismissNotification(notification.id);
      }, 5000);
    }
  }

  dismissNotification(id: string): void {
    this.notifications = this.notifications.filter(n => n.id !== id);
  }

  trackNotification(index: number, notification: Notification): string {
    return notification.id;
  }

  // ✅ CORRIGIDO: Métodos necessários para carregamento de dados
  private loadPlayerData(): void {
    console.log('🔄 [App] Carregando dados do jogador via LCU...');

    this.apiService.getPlayerFromLCU().subscribe({
      next: (player) => {
        console.log('✅ [App] Dados do jogador carregados via LCU:', player);

        // ✅ CORRIGIDO: Usar displayName diretamente do backend se disponível
        if (player.displayName) {
          // O backend já construiu o displayName corretamente
          player.summonerName = player.displayName;
          console.log('✅ [App] Usando displayName do backend:', player.displayName);
        } else if (player.gameName && player.tagLine) {
          // Fallback: construir se não veio do backend
          player.displayName = `${player.gameName}#${player.tagLine}`;
          player.summonerName = player.displayName;
          console.log('✅ [App] DisplayName construído como fallback:', player.displayName);
        } else {
          console.warn('⚠️ [App] Dados incompletos do jogador:', {
            gameName: player.gameName,
            tagLine: player.tagLine,
            summonerName: player.summonerName,
            displayName: player.displayName
          });
          // Se não conseguir formar o nome completo, mostrar erro
          if (!player.summonerName || !player.summonerName.includes('#')) {
            this.addNotification('warning', 'Dados Incompletos', 'Não foi possível obter gameName#tagLine do LCU');
            return;
          }
        }

        this.currentPlayer = player;

        // Adicionar propriedade customLp se não existir
        if (this.currentPlayer && !this.currentPlayer.customLp) {
          this.currentPlayer.customLp = this.currentPlayer.currentMMR || 1200;
        }

        // Salvar no localStorage para backup
        localStorage.setItem('currentPlayer', JSON.stringify(this.currentPlayer));

        // ✅ ADICIONADO: Atualizar formulário de configurações com dados do jogador
        this.updateSettingsForm();

        console.log('✅ [App] Jogador carregado:', this.currentPlayer.summonerName, 'displayName:', this.currentPlayer.displayName);
        this.addNotification('success', 'Jogador Detectado', `Logado como: ${this.currentPlayer.summonerName}`);
      },
      error: (error) => {
        console.warn('⚠️ [App] Falha ao carregar dados do jogador via LCU:', error);
        this.addNotification('error', 'Erro LCU', 'Não foi possível conectar ao cliente do LoL. Verifique se o jogo está aberto.');
        this.tryLoadFromLocalStorage();

        // Se ainda não há dados, tentar getCurrentPlayerDetails como fallback
        if (!this.currentPlayer) {
          this.tryGetCurrentPlayerDetails();
        }
      }
    });
  }

  private tryGetCurrentPlayerDetails(): void {
    console.log('🔄 [App] Tentando carregar dados via getCurrentPlayerDetails...');

    this.apiService.getCurrentPlayerDetails().subscribe({
      next: (response) => {
        console.log('✅ [App] Resposta getCurrentPlayerDetails:', response);

        if (response.success && response.data) {
          const data = response.data;

          // Mapear dados do LCU para Player
          const lcuData = data.lcu || {};
          const riotAccount = data.riotAccount || {};

          const gameName = riotAccount.gameName || lcuData.gameName;
          const tagLine = riotAccount.tagLine || lcuData.tagLine;

          // ✅ CORRIGIDO: Usar displayName do backend se disponível
          let summonerName = 'Unknown';
          let displayName = '';

          // Verificar se o backend já forneceu displayName
          if (lcuData.displayName) {
            displayName = lcuData.displayName;
            summonerName = displayName;
            console.log('✅ [App] Usando displayName do backend:', displayName);
          } else if (gameName && tagLine) {
            displayName = `${gameName}#${tagLine}`;
            summonerName = displayName;
            console.log('✅ [App] DisplayName construído como fallback:', displayName);
          } else {
            console.warn('⚠️ [App] Dados incompletos via getCurrentPlayerDetails:', {
              gameName, tagLine, lcuDisplayName: lcuData.displayName
            });
            this.addNotification('warning', 'Dados Incompletos', 'Não foi possível obter gameName#tagLine');
            return;
          }

          // Garantir que displayName não seja vazio
          if (!displayName) {
            this.addNotification('warning', 'Dados Incompletos', 'Não foi possível obter displayName');
            return;
          }

          const player: Player = {
            id: lcuData.summonerId || 0,
            summonerName: summonerName,
            displayName: displayName, // ✅ ADICIONADO: Definir displayName corretamente (já verificado acima)
            gameName: gameName,
            tagLine: tagLine,
            summonerId: (lcuData.summonerId || 0).toString(),
            puuid: riotAccount.puuid || lcuData.puuid || '',
            profileIconId: lcuData.profileIconId || 29,
            summonerLevel: lcuData.summonerLevel || 30,
            region: 'br1',
            currentMMR: 1200,
            customLp: 1200
          };

          this.currentPlayer = player;
          localStorage.setItem('currentPlayer', JSON.stringify(player));

          // ✅ ADICIONADO: Atualizar formulário de configurações
          this.updateSettingsForm();

          console.log('✅ [App] Dados do jogador mapeados com sucesso:', player.summonerName, 'displayName:', player.displayName);
          this.addNotification('success', 'Jogador Detectado', `Logado como: ${player.summonerName}`);
        }
      },
      error: (error) => {
        console.error('❌ [App] Erro ao carregar getCurrentPlayerDetails:', error);
        this.addNotification('error', 'Erro API', 'Falha ao carregar dados do jogador');
        this.tryLoadFromLocalStorage();
      }
    });
  }

  private tryLoadFromLocalStorage(): void {
    const stored = localStorage.getItem('currentPlayer');
    if (stored) {
      try {
        this.currentPlayer = JSON.parse(stored);

        // ✅ NOVA CORREÇÃO: Garantir que displayName seja definido se ausente
        if (this.currentPlayer && !this.currentPlayer.displayName) {
          if (this.currentPlayer.gameName && this.currentPlayer.tagLine) {
            this.currentPlayer.displayName = `${this.currentPlayer.gameName}#${this.currentPlayer.tagLine}`;
            console.log('🔧 [App] DisplayName construído do localStorage:', this.currentPlayer.displayName);
          } else if (this.currentPlayer.summonerName && this.currentPlayer.summonerName.includes('#')) {
            this.currentPlayer.displayName = this.currentPlayer.summonerName;
            console.log('🔧 [App] DisplayName definido como summonerName do localStorage:', this.currentPlayer.displayName);
          }
        }

        console.log('✅ [App] Dados do jogador carregados do localStorage, displayName:', this.currentPlayer?.displayName);
      } catch (error) {
        console.warn('⚠️ [App] Erro ao carregar do localStorage');
      }
    }
  }

  private refreshQueueStatus(): void {
    // Se temos o jogador atual, passar seu displayName para detecção no backend
    const currentPlayerDisplayName = this.currentPlayer?.displayName;

    console.log('📊 [App] === REFRESH QUEUE STATUS ===');
    console.log('📊 [App] refreshQueueStatus chamado:', {
      currentPlayerDisplayName: currentPlayerDisplayName,
      currentIsInQueue: this.isInQueue,
      hasRecentBackendQueueStatus: this.hasRecentBackendQueueStatus
    });

    this.apiService.getQueueStatus(currentPlayerDisplayName).subscribe({
      next: (status) => {
        console.log('📊 [App] Status da fila recebido do backend:', status);

        // ✅ CORREÇÃO: Marcar que temos uma resposta recente do backend
        this.hasRecentBackendQueueStatus = true;

        // ✅ NOVO: Verificar se o backend retornou informação específica sobre o jogador
        const statusWithPlayerInfo = status as any;

        if (statusWithPlayerInfo.isCurrentPlayerInQueue !== undefined) {
          const previousState = this.isInQueue;
          this.isInQueue = statusWithPlayerInfo.isCurrentPlayerInQueue;

          console.log(`✅ [App] Estado da fila atualizado pelo backend: ${previousState} → ${this.isInQueue}`);

          // ✅ NOVO: Se o estado mudou, notificar
          if (previousState !== this.isInQueue) {
            const statusMessage = this.isInQueue ? 'Você está na fila' : 'Você não está na fila';
            console.log(`🔄 [App] Status da fila mudou: ${statusMessage}`);
          }
        } else {
          // ✅ NOVO: Se backend não retornou info específica, manter estado atual
          console.log('⚠️ [App] Backend não retornou isCurrentPlayerInQueue - mantendo estado atual');
        }

        console.log(`📊 [App] Jogadores na fila: ${status.playersInQueue}`);
        console.log(`📊 [App] Lista de jogadores:`, status.playersInQueueList?.map(p => p.summonerName) || []);

        // ✅ CORREÇÃO: Converter joinTime de Date para string se necessário
        this.queueStatus = {
          ...status,
          playersInQueueList: status.playersInQueueList?.map(player => ({
            ...player,
            joinTime: typeof player.joinTime === 'string' ? player.joinTime : (player.joinTime as Date).toISOString()
          }))
        };

        // ✅ NOVO: Limpar flag após 5 segundos para permitir atualizações do QueueStateService
        setTimeout(() => {
          this.hasRecentBackendQueueStatus = false;
          console.log('🔄 [App] Flag de backend recente limpa, permitindo atualizações do QueueStateService');
        }, 5000);

        console.log('📊 [App] === FIM DO REFRESH QUEUE STATUS ===');
      },
      error: (error) => {
        console.warn('⚠️ [App] Erro ao atualizar status da fila:', error);
        this.hasRecentBackendQueueStatus = false;
      }
    });
  }

  private setupDiscordStatusListener(): void {
    // ✅ CORRIGIDO: Usar observables em tempo real em vez de polling
    this.discordService.onConnectionChange().pipe(
      takeUntil(this.destroy$)
    ).subscribe(isConnected => {
      console.log(`🤖 [App] Discord status atualizado:`, isConnected);
      this.discordStatus.isConnected = isConnected;

      if (isConnected) {
        this.discordStatus.botUsername = 'LoL Matchmaking Bot';
      } else {
        this.discordStatus.botUsername = '';
      }
    });

    // Solicitar status inicial UMA VEZ apenas
    this.discordService.checkConnection();
  }

  private startLCUStatusCheck(): void {
    setInterval(() => {
      this.apiService.getLCUStatus().subscribe({
        next: (status) => this.lcuStatus = status,
        error: () => this.lcuStatus = { isConnected: false }
      });
    }, 5000);
  }

  // ✅ REMOVIDO: Polling automático - usar apenas WebSocket em tempo real
  // private startQueueStatusCheck(): void {
  //   setInterval(() => {
  //     this.refreshQueueStatus();
  //   }, 3000);
  // }

  private checkBackendConnection(): void {
    this.apiService.checkHealth().subscribe({
      next: () => {
        this.isConnected = true;
        console.log('✅ [App] Conectado ao backend');
      },
      error: () => {
        this.isConnected = false;
        console.warn('❌ [App] Backend desconectado');
      }
    });
  }

  private loadConfigFromDatabase(): void {
    this.apiService.getConfigSettings().subscribe({
      next: (config) => {
        console.log('⚙️ [App] Configurações carregadas:', config);
        if (config) {
          this.settingsForm = { ...this.settingsForm, ...config };
        }
      },
      error: (error) => {
        console.warn('⚠️ [App] Erro ao carregar configurações:', error);
      }
    });
  }

  // ✅ MANTIDO: Métodos básicos de interface (MANUAL APENAS)
  onRefreshData(): void {
    console.log('🔄 [App] Refresh MANUAL solicitado pelo usuário');
    this.refreshQueueStatus();
    this.loadPlayerData();
  }

  // ✅ NOVO: Método para o queue component informar sobre mudanças no auto-refresh
  onAutoRefreshToggle(enabled: boolean): void {
    this.autoRefreshEnabled = enabled;
    console.log(`🔄 [App] Auto-refresh ${enabled ? 'habilitado' : 'desabilitado'} - atualizações de fila serão ${enabled ? 'processadas' : 'filtradas'}`);
  }

  // ✅ MANTIDO: Métodos auxiliares para bots (admin)
  async addBotToQueue(): Promise<void> {
    try {
      await this.apiService.addBotToQueue().toPromise();
      this.addNotification('success', 'Bot Adicionado', 'Bot adicionado à fila com sucesso');
    } catch (error) {
      this.addNotification('error', 'Erro', 'Falha ao adicionar bot');
    }
  }

  // ✅ MANTIDO: Métodos do Electron
  minimizeWindow(): void {
    if (this.isElectron && (window as any).electronAPI) {
      (window as any).electronAPI.minimizeWindow();
    }
  }

  maximizeWindow(): void {
    if (this.isElectron && (window as any).electronAPI) {
      (window as any).electronAPI.maximizeWindow();
    }
  }

  closeWindow(): void {
    if (this.isElectron && (window as any).electronAPI) {
      (window as any).electronAPI.closeWindow();
    }
  }

  // ✅ ADICIONADO: Métodos faltantes para o template
  onAcceptMatch(event: any): void {
    this.acceptMatch();
  }

  onDeclineMatch(event: any): void {
    this.declineMatch();
  }

  onPickBanComplete(event: any): void {
    console.log('🎯 [App] Draft completado:', event);
    this.draftData = event;
    this.inDraftPhase = false;
    this.inGamePhase = true;
  }

  exitDraft(): void {
    console.log('🚪 [App] Saindo do draft');
    this.inDraftPhase = false;
    this.draftData = null;
    this.currentView = 'dashboard';
  }

  onGameComplete(event: any): void {
    console.log('🏁 [App] Jogo completado:', event);
    this.gameResult = event;
    this.inGamePhase = false;
    this.currentView = 'dashboard';
    this.addNotification('success', 'Jogo Concluído!', 'Resultado salvo com sucesso');
  }

  onGameCancel(): void {
    console.log('🚪 [App] Jogo cancelado');
    this.inGamePhase = false;
    this.gameData = null;
    this.currentView = 'dashboard';
  }

  refreshLCUConnection(): void {
    console.log('🔄 [App] Atualizando conexão LCU');
    this.startLCUStatusCheck();
  }

  savePlayerSettings(): void {
    console.log('💾 [App] Salvando configurações do jogador:', this.settingsForm);

    if (!this.currentPlayer) {
      this.addNotification('warning', 'Nenhum Jogador', 'Carregue os dados do jogador primeiro');
      return;
    }

    // Atualizar dados do jogador atual
    if (this.settingsForm.summonerName) {
      // Se o nome foi editado manualmente, usar como está
      this.currentPlayer.summonerName = this.settingsForm.summonerName;
    }

    if (this.settingsForm.region) {
      this.currentPlayer.region = this.settingsForm.region;
    }

    // Salvar configurações no backend
    this.apiService.saveSettings({
      summonerName: this.currentPlayer.summonerName,
      region: this.currentPlayer.region,
      gameName: this.currentPlayer.gameName,
      tagLine: this.currentPlayer.tagLine
    }).subscribe({
      next: () => {
        // Salvar no localStorage também
        localStorage.setItem('currentPlayer', JSON.stringify(this.currentPlayer));
        this.addNotification('success', 'Configurações Salvas', 'Suas preferências foram atualizadas no backend');
      },
      error: (error) => {
        console.error('❌ [App] Erro ao salvar configurações:', error);
        this.addNotification('error', 'Erro ao Salvar', 'Não foi possível salvar as configurações');
      }
    });
  }

  onProfileIconError(event: any): void {
    console.warn('⚠️ [App] Erro ao carregar ícone de perfil:', event);
  }

  refreshPlayerData(): void {
    console.log('🔄 [App] Atualizando dados do jogador');
    this.currentPlayer = null; // Limpar dados antigos
    this.loadPlayerData();
    this.addNotification('info', 'Dados Atualizados', 'Dados do jogador foram recarregados do LCU');
  }

  clearPlayerData(): void {
    console.log('🗑️ [App] Limpando dados do jogador');
    this.currentPlayer = null;
    localStorage.removeItem('currentPlayer');
    this.addNotification('info', 'Dados Limpos', 'Dados do jogador foram removidos');
  }

  updateRiotApiKey(): void {
    console.log('🔑 [App] Atualizando Riot API Key:', this.settingsForm.riotApiKey);

    if (!this.settingsForm.riotApiKey || this.settingsForm.riotApiKey.trim() === '') {
      this.addNotification('warning', 'API Key Vazia', 'Digite uma API Key válida');
      return;
    }

    this.apiService.setRiotApiKey(this.settingsForm.riotApiKey).subscribe({
      next: (response) => {
        console.log('✅ [App] Riot API Key atualizada:', response);
        this.addNotification('success', 'API Key Configurada', 'Riot API Key foi salva no backend');
      },
      error: (error) => {
        console.error('❌ [App] Erro ao configurar API Key:', error);
        this.addNotification('error', 'Erro API Key', 'Não foi possível salvar a API Key');
      }
    });
  }

  updateDiscordBotToken(): void {
    console.log('🤖 [App] Atualizando Discord Bot Token:', this.settingsForm.discordBotToken);

    if (!this.settingsForm.discordBotToken || this.settingsForm.discordBotToken.trim() === '') {
      this.addNotification('warning', 'Token Vazio', 'Digite um token do Discord Bot válido');
      return;
    }

    this.apiService.setDiscordBotToken(this.settingsForm.discordBotToken).subscribe({
      next: (response) => {
        console.log('✅ [App] Discord Bot Token atualizado:', response);
        this.addNotification('success', 'Bot Configurado', 'Discord Bot Token foi salvo e o bot está sendo reiniciado');

        // Atualizar status do Discord após um delay
        setTimeout(() => {
          this.setupDiscordStatusListener();
        }, 3000);
      },
      error: (error) => {
        console.error('❌ [App] Erro ao configurar Discord Bot:', error);
        this.addNotification('error', 'Erro Discord Bot', 'Não foi possível salvar o token do bot');
      }
    });
  }

  updateDiscordChannel(): void {
    console.log('📢 [App] Atualizando canal do Discord:', this.settingsForm.discordChannel);

    if (!this.settingsForm.discordChannel || this.settingsForm.discordChannel.trim() === '') {
      this.addNotification('warning', 'Canal Vazio', 'Digite o nome de um canal válido');
      return;
    }

    this.apiService.setDiscordChannel(this.settingsForm.discordChannel).subscribe({
      next: (response) => {
        console.log('✅ [App] Canal do Discord atualizado:', response);
        this.addNotification('success', 'Canal Configurado', `Canal '${this.settingsForm.discordChannel}' foi configurado para matchmaking`);
      },
      error: (error) => {
        console.error('❌ [App] Erro ao configurar canal:', error);
        this.addNotification('error', 'Erro Canal', 'Não foi possível configurar o canal');
      }
    });
  }

  isSpecialUser(): boolean {
    // Usuários especiais que têm acesso às ferramentas de desenvolvimento
    const specialUsers = [
      'Admin',
      'wcaco#BR1',
      'developer#DEV',
      'test#TEST',
      'popcorn seller#coup',
      'popcorn seller',  // Variação sem tag
      'popcorn seller#COUP'  // Variação com tag maiúscula
    ];

    if (this.currentPlayer) {
      const isSpecial = specialUsers.includes(this.currentPlayer.summonerName);
      console.log(`🔍 [App] Verificação de usuário especial:`, {
        currentPlayerName: this.currentPlayer.summonerName,
        isSpecialUser: isSpecial,
        specialUsers: specialUsers
      });
      return isSpecial;
    }

    return false;
  }

  simulateLastCustomMatch(): void {
    console.log('🎮 [App] Simulando última partida customizada');

    if (!this.currentPlayer) {
      this.addNotification('warning', 'Nenhum Jogador', 'Carregue os dados do jogador primeiro');
      return;
    }

    // Chamará endpoint do backend para simular partida
    this.apiService.getCustomMatches(this.currentPlayer.summonerName, 0, 1).subscribe({
      next: (matches) => {
        if (matches && matches.length > 0) {
          const lastMatch = matches[0];
          console.log('🎮 [App] Simulando partida:', lastMatch);
          this.addNotification('success', 'Simulação Iniciada', `Simulando partida ${lastMatch.id}...`);

          // Simular que a partida está sendo executada
          setTimeout(() => {
            this.addNotification('info', 'Simulação Completa', 'Partida simulada com sucesso');
          }, 3000);
        } else {
          this.addNotification('warning', 'Nenhuma Partida', 'Não há partidas customizadas para simular');
        }
      },
      error: (error) => {
        console.error('❌ [App] Erro ao buscar partidas para simulação:', error);
        this.addNotification('error', 'Erro Simulação', 'Não foi possível carregar partidas para simular');
      }
    });
  }

  cleanupTestMatches(): void {
    console.log('🧹 [App] Limpando partidas de teste');

    this.apiService.cleanupTestMatches().subscribe({
      next: (response) => {
        console.log('✅ [App] Partidas de teste limpas:', response);
        this.addNotification('success', 'Limpeza Completa', `${response.deletedCount || 0} partidas de teste removidas`);
      },
      error: (error) => {
        console.error('❌ [App] Erro ao limpar partidas de teste:', error);
        this.addNotification('error', 'Erro Limpeza', 'Não foi possível limpar as partidas de teste');
      }
    });
  }

  // ✅ ADICIONADO: Atualizar formulário com dados do jogador atual
  private updateSettingsForm(): void {
    if (this.currentPlayer) {
      this.settingsForm.summonerName = this.currentPlayer.summonerName;
      this.settingsForm.region = this.currentPlayer.region;
      console.log('✅ [App] Formulário de configurações atualizado:', this.settingsForm);
    }
  }

  // ✅ ADICIONADO: Propriedades faltantes para o template
  get currentMatchData(): any {
    return this.draftData || this.gameData || null;
  }

  // ✅ NOVO: Verificar se jogador atual é bot
  isCurrentPlayerBot(): boolean {
    return this.currentPlayer ? this.botService.isBot(this.currentPlayer) : false;
  }
}
