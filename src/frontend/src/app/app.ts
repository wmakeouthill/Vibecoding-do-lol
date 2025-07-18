import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subject, takeUntil, filter, delay, take } from 'rxjs';
import { HttpErrorResponse } from '@angular/common/http';
import { Router } from '@angular/router';

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

  private lcuCheckInterval: any;
  private readonly LCU_CHECK_INTERVAL = 5000; // Intervalo de verificação do status do LCU

  // Update the notifications array and addNotification method
  private maxNotifications = 2; // Limit to 2 visible notifications
  private notificationQueue: Notification[] = []; // Queue for pending notifications

  // ✅ NOVO: Sistema de polling inteligente para sincronização
  private pollingInterval: any = null;
  private lastPollingStatus: string | null = null;
  private readonly POLLING_INTERVAL_MS = 2000; // 2 segundos - aguardar backend processar
  private lastCacheInvalidation = 0; // ✅ NOVO: Controle de invalidação de cache
  private readonly CACHE_INVALIDATION_COOLDOWN = 3000; // ✅ NOVO: 3 segundos entre invalidações
  private lastBackendAction = 0; // ✅ NOVO: Controle de ações do backend
  private readonly BACKEND_ACTION_COOLDOWN = 1500; // ✅ NOVO: 1.5 segundos após ação do backend

  constructor(
    private apiService: ApiService,
    private queueStateService: QueueStateService,
    private discordService: DiscordIntegrationService,
    private botService: BotService,
    private router: Router,
    private cdr: ChangeDetectorRef
  ) {
    console.log(`[App] Constructor`);

    // Inicialização da verificação de status do LCU
    this.lcuCheckInterval = setInterval(() => this.startLCUStatusCheck(), this.LCU_CHECK_INTERVAL);

    this.isElectron = !!(window as any).electronAPI;
  }

  ngOnInit(): void {
    console.log('🚀 [App] Inicializando frontend como interface para backend...');

    // ✅ NOVO: Sequência de inicialização corrigida
    this.initializeAppSequence();
  }

  // ✅ NOVO: Sequência de inicialização estruturada para evitar race conditions
  private async initializeAppSequence(): Promise<void> {
    try {
      console.log('🔄 [App] === INÍCIO DA SEQUÊNCIA DE INICIALIZAÇÃO ===');

      // 1. Configurações básicas (não dependem de conexões)
      console.log('🔄 [App] Passo 1: Configurações básicas...');
      this.setupDiscordStatusListener();
      this.startLCUStatusCheck();

      // 2. Verificar se backend está acessível
      console.log('🔄 [App] Passo 2: Verificando backend...');
      await this.ensureBackendIsReady();

      // 3. Configurar comunicação WebSocket
      console.log('🔄 [App] Passo 3: Configurando WebSocket...');
      await this.setupBackendCommunication();

      // 4. Carregar dados do jogador
      console.log('🔄 [App] Passo 4: Carregando dados do jogador...');
      await this.loadPlayerDataWithRetry();

      // 5. Identificar jogador no WebSocket (agora que temos os dados)
      console.log('🔄 [App] Passo 5: Identificando jogador...');
      await this.identifyPlayerSafely();

      // 6. Buscar status inicial da fila
      console.log('🔄 [App] Passo 6: Buscando status da fila...');
      this.refreshQueueStatus();

      // 7. Carregar configurações do banco
      console.log('🔄 [App] Passo 7: Carregando configurações...');
      this.loadConfigFromDatabase();

      // 8. Iniciar atualizações periódicas
      console.log('🔄 [App] Passo 8: Iniciando atualizações periódicas...');
      this.startPeriodicUpdates();

      // 9. Iniciar polling inteligente para sincronização
      console.log('🔄 [App] Passo 9: Iniciando polling inteligente...');
      this.startIntelligentPolling();

      console.log('✅ [App] === INICIALIZAÇÃO COMPLETA ===');
      this.isConnected = true;

    } catch (error) {
      console.error('❌ [App] Erro na sequência de inicialização:', error);
      this.handleInitializationError(error);
    }
  }

  // ✅ NOVO: Garantir que backend está pronto antes de prosseguir
  private async ensureBackendIsReady(): Promise<void> {
    const maxAttempts = 10;
    const delayBetweenAttempts = 2000; // 2 segundos

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        await this.apiService.checkHealth().toPromise();
        console.log(`✅ [App] Backend está pronto (tentativa ${attempt}/${maxAttempts})`);
        return;
      } catch (error) {
        console.log(`⏳ [App] Backend não está pronto (tentativa ${attempt}/${maxAttempts})`);

        if (attempt === maxAttempts) {
          throw new Error('Backend não ficou pronto após múltiplas tentativas');
        }

        await new Promise(resolve => setTimeout(resolve, delayBetweenAttempts));
      }
    }
  }

  // ✅ CORRIGIDO: Configurar comunicação com backend de forma assíncrona
  private async setupBackendCommunication(): Promise<void> {
    console.log('🔗 [App] Configurando comunicação com backend...');

    // Configurar listener de mensagens WebSocket
    this.apiService.onWebSocketMessage().pipe(
      takeUntil(this.destroy$)
    ).subscribe({
      next: (message: any) => {
        console.log('📨 [App] Mensagem do backend:', message);
        this.handleBackendMessage(message);
      },
      error: (error: any) => {
        console.error('❌ [App] Erro na comunicação:', error);
        this.isConnected = false;
      },
      complete: () => {
        console.log('🔌 [App] Conexão WebSocket fechada');
        this.isConnected = false;
      }
    });

    // ✅ NOVO: Aguardar explicitamente que WebSocket esteja pronto
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Timeout aguardando WebSocket conectar'));
      }, 15000); // 15 segundos de timeout

      this.apiService.onWebSocketReady().pipe(
        filter(isReady => isReady),
        take(1)
      ).subscribe({
        next: () => {
          clearTimeout(timeout);
          console.log('✅ [App] WebSocket está pronto para comunicação');
          resolve();
        },
        error: (error) => {
          clearTimeout(timeout);
          reject(error);
        }
      });
    });
  }

  // ✅ NOVO: Carregar dados do jogador com retry
  private async loadPlayerDataWithRetry(): Promise<void> {
    const maxAttempts = 3;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        console.log(`🔄 [App] Tentativa ${attempt}/${maxAttempts} de carregar dados do jogador...`);

        await new Promise<void>((resolve, reject) => {
          this.apiService.getPlayerFromLCU().subscribe({
            next: (player: Player) => {
              console.log('✅ [App] Dados do jogador carregados do LCU:', player);
              this.currentPlayer = player;
              this.savePlayerData(player);
              this.updateSettingsForm();
              resolve();
            },
            error: (error) => {
              console.warn(`⚠️ [App] Tentativa ${attempt} falhou:`, error);
              if (attempt === maxAttempts) {
                // Última tentativa - tentar localStorage
                this.tryLoadFromLocalStorage();
                if (this.currentPlayer) {
                  resolve();
                } else {
                  reject(new Error('Não foi possível carregar dados do jogador'));
                }
              } else {
                reject(error);
              }
            }
          });
        });

        // Se chegou até aqui, dados foram carregados com sucesso
        console.log('✅ [App] Dados do jogador carregados com sucesso');
        return;

      } catch (error) {
        console.warn(`⚠️ [App] Tentativa ${attempt} de carregar dados falhou:`, error);

        if (attempt < maxAttempts) {
          // Aguardar antes da próxima tentativa
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
      }
    }

    // Se todas as tentativas falharam
    console.warn('⚠️ [App] Todas as tentativas de carregar dados falharam, usando dados padrão se disponíveis');
  }

  // ✅ MELHORADO: Identificar jogador de forma segura
  private async identifyPlayerSafely(): Promise<void> {
    if (!this.currentPlayer) {
      console.warn('⚠️ [App] Nenhum jogador disponível para identificação');
      return;
    }

    const playerIdentifier = this.buildPlayerIdentifier(this.currentPlayer);
    if (!playerIdentifier) {
      console.error('❌ [App] Não foi possível construir identificador único para identificação');
      return;
    }

    console.log('🆔 [App] Iniciando identificação com identificador único:', playerIdentifier);

    const maxAttempts = 3;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        console.log(`🆔 [App] Tentativa ${attempt}/${maxAttempts} de identificação...`);

        await new Promise<void>((resolve, reject) => {
          this.apiService.identifyPlayer(this.currentPlayer).subscribe({
            next: (response: any) => {
              if (response.success) {
                console.log('✅ [App] Jogador identificado com sucesso no backend:', playerIdentifier);
                resolve();
              } else {
                reject(new Error(response.error || 'Erro desconhecido na identificação'));
              }
            },
            error: (error: any) => {
              reject(error);
            }
          });
        });

        // Se chegou até aqui, identificação foi bem-sucedida
        console.log('✅ [App] Identificação do jogador completa:', playerIdentifier);
        return;

      } catch (error) {
        console.error(`❌ [App] Tentativa ${attempt} de identificação falhou:`, error);

        if (attempt < maxAttempts) {
          // Aguardar antes da próxima tentativa
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
      }
    }

    console.warn('⚠️ [App] Todas as tentativas de identificação falharam, mas continuando...');
  }

  // ✅ NOVO: Iniciar atualizações periódicas
  private startPeriodicUpdates(): void {
    // Atualização periódica da fila a cada 10 segundos
    setInterval(() => {
      if (this.currentPlayer?.displayName) {
        console.log('🔄 [App] Atualização periódica do status da fila');
        this.refreshQueueStatus();
      }
    }, 10000);
  }

  // ✅ NOVO: Lidar com erros de inicialização
  private handleInitializationError(error: any): void {
    console.error('❌ [App] Erro crítico na inicialização:', error);

    // Marcar como conectado mesmo com erros para permitir funcionalidade básica
    this.isConnected = true;

    // Notificar usuário sobre problemas
    this.addNotification('warning', 'Inicialização Parcial',
      'Algumas funcionalidades podem não estar disponíveis. Verifique a conexão com o backend.');

    // Tentar reconectar após um tempo
    setTimeout(() => {
      console.log('🔄 [App] Tentando reinicializar após erro...');
      this.initializeAppSequence();
    }, 30000); // Tentar novamente em 30 segundos
  }

  // ✅ NOVO: Salvar dados do jogador
  private savePlayerData(player: Player): void {
    console.log('💾 [App] === SALVANDO DADOS DO JOGADOR ===');
    console.log('💾 [App] Dados originais do player:', {
      id: player.id,
      summonerName: player.summonerName,
      gameName: player.gameName,
      tagLine: player.tagLine,
      displayName: player.displayName
    });

    // ✅ PADRONIZAÇÃO COMPLETA: Sempre usar gameName#tagLine como identificador único
    const playerIdentifier = this.buildPlayerIdentifier(player);

    if (playerIdentifier) {
      player.displayName = playerIdentifier;
      player.summonerName = playerIdentifier;
      console.log('✅ [App] Identificador único padronizado:', playerIdentifier);
    } else {
      console.warn('⚠️ [App] Não foi possível construir identificador único:', {
        gameName: player.gameName,
        tagLine: player.tagLine,
        summonerName: player.summonerName,
        displayName: player.displayName
      });

      // Fallback: usar dados disponíveis
      if (player.displayName) {
        player.summonerName = player.displayName;
      } else if (player.gameName && player.tagLine) {
        player.displayName = `${player.gameName}#${player.tagLine}`;
        player.summonerName = player.displayName;
      }
    }

    // Adicionar propriedade customLp se não existir
    if (!player.customLp) {
      player.customLp = player.currentMMR || 1200;
    }

    // Salvar no localStorage para backup
    localStorage.setItem('currentPlayer', JSON.stringify(player));

    console.log('✅ [App] Jogador salvo com identificador único:', player.displayName);
    console.log('💾 [App] Dados finais do player:', {
      id: player.id,
      summonerName: player.summonerName,
      gameName: player.gameName,
      tagLine: player.tagLine,
      displayName: player.displayName
    });
    console.log('💾 [App] === FIM DO SALVAMENTO ===');
  }

  // ✅ NOVO: Construir identificador único padronizado
  private buildPlayerIdentifier(player: Player): string | null {
    // ✅ PRIORIDADE 1: gameName#tagLine (padrão)
    if (player.gameName && player.tagLine) {
      return `${player.gameName}#${player.tagLine}`;
    }

    // ✅ PRIORIDADE 2: displayName (se já está no formato correto)
    if (player.displayName && player.displayName.includes('#')) {
      return player.displayName;
    }

    // ✅ PRIORIDADE 3: summonerName (fallback)
    if (player.summonerName) {
      return player.summonerName;
    }

    return null;
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
      if (timeSinceLastMessage < 500) { // Máximo 1 mensagem a cada 500ms - menos agressivo
        console.log('🔍 [App] Throttling mensagem backend - muito frequente');
        console.log('🔍 [App] Tipo:', message.type, 'Intervalo:', timeSinceLastMessage + 'ms');
        return;
      }
      this.lastMessageTimestamp = now;
    }

    // ✅ NOVO: Marcar ação do backend para controle de timing
    this.markBackendAction();

    switch (message.type) {
      case 'backend_connection_success':
        console.log('🔗 [App] Backend conectado com sucesso');
        // ✅ NOVO: Re-identificar jogador quando WebSocket reconecta
        if (this.currentPlayer) {
          console.log('🆔 [App] Re-identificando jogador após reconexão do WebSocket');
          this.identifyPlayerSafely();
        }
        break;

      case 'match_found':
        console.log('🎮 [App] === MATCH_FOUND RECEBIDO ===');
        console.log('🎮 [App] Partida encontrada pelo backend');
        console.log('🎮 [App] MatchId recebido:', message.data?.matchId);
        console.log('🎮 [App] Última partida processada:', this.lastMatchId);
        console.log('�� [App] Estado antes do processamento:', {
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

      case 'draft_cancelled':
        console.log('🚫 [App] Draft cancelado pelo backend');
        this.handleDraftCancelled(message.data);
        break;

      case 'draft_action':
        console.log('🎯 [App] Ação de draft');
        this.handleDraftAction(message.data);
        break;

      case 'draft_data_sync':
        console.log('🔄 [App] Sincronização de dados do draft');
        this.handleDraftDataSync(message.data);
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

  // ✅ MANTIDO: Compatibilidade para métodos legacy
  private identifyCurrentPlayerOnConnect(): void {
    console.log('🔄 [App] Método legacy - redirecionando para identifyPlayerSafely()');
    this.identifyPlayerSafely();
  }

  // ✅ NOVO: Configurar listener do componente queue
  private setupQueueComponentListener(): void {
    document.addEventListener('matchFound', (event: any) => {
      console.log('🎮 [App] Match found do componente queue:', event.detail);
      // this.handleMatchFound(event.detail.data);
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

    // ✅ SIMPLIFICADO: Como o backend agora envia apenas para jogadores da partida,
    // não precisamos verificar se o jogador atual está na partida
    console.log('🎮 [App] ✅ PROCESSANDO PARTIDA RECEBIDA DO BACKEND:', data.matchId);

    // ✅ NOVO: Marcar esta partida como processada
    this.lastMatchId = data.matchId;

    // ✅ CORREÇÃO: Processar dados da partida vindos do backend
    const matchFoundData: MatchFoundData = {
      matchId: data.matchId,
      playerSide: 'blue', // Será determinado pelos dados
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

    // ✅ CORREÇÃO: Usar dados do MatchmakingService se disponível
    if (data.teammates && data.enemies) {
      console.log('🎮 [App] Usando dados estruturados do MatchmakingService');
      console.log('🎮 [App] Dados recebidos:', {
        teammates: data.teammates?.map((p: any) => ({ name: p.summonerName, lane: p.assignedLane })),
        enemies: data.enemies?.map((p: any) => ({ name: p.summonerName, lane: p.assignedLane })),
        hasTeamStats: !!data.teamStats,
        hasBalancingInfo: !!data.balancingInfo
      });

      // ✅ IDENTIFICAR: Em qual time o jogador atual está
      const currentPlayerIdentifiers = this.getCurrentPlayerIdentifiers();
      const isInTeammates = this.isPlayerInTeam(currentPlayerIdentifiers, data.teammates);
      const isInEnemies = this.isPlayerInTeam(currentPlayerIdentifiers, data.enemies);

      console.log('🎮 [App] Identificação do time:', {
        currentPlayerIdentifiers,
        isInTeammates,
        isInEnemies,
        currentPlayer: this.currentPlayer
      });

      matchFoundData.playerSide = isInTeammates ? 'blue' : 'red';
      matchFoundData.teammates = this.convertPlayersToPlayerInfo(data.teammates);
      matchFoundData.enemies = this.convertPlayersToPlayerInfo(data.enemies);

      // ✅ CORREÇÃO: Usar teamStats do backend se disponível
      if (data.teamStats) {
        matchFoundData.averageMMR = {
          yourTeam: isInTeammates ? data.teamStats.team1.averageMMR : data.teamStats.team2.averageMMR,
          enemyTeam: isInTeammates ? data.teamStats.team2.averageMMR : data.teamStats.team1.averageMMR
        };
      }
    } else if (data.team1 && data.team2) {
      console.log('🎮 [App] Usando dados básicos do MatchFoundService');

      // ✅ FALLBACK: Usar dados básicos team1/team2
      const allPlayers = [...data.team1, ...data.team2];
      const currentPlayerIdentifiers = this.getCurrentPlayerIdentifiers();
      const isInTeam1 = data.team1.some((name: string) =>
        currentPlayerIdentifiers.some(id => this.namesMatch(id, name))
      );

      matchFoundData.playerSide = isInTeam1 ? 'blue' : 'red';
      matchFoundData.teammates = this.convertBasicPlayersToPlayerInfo(isInTeam1 ? data.team1 : data.team2);
      matchFoundData.enemies = this.convertBasicPlayersToPlayerInfo(isInTeam1 ? data.team2 : data.team1);
    } else {
      console.error('🎮 [App] ❌ ERRO: Formato de dados não reconhecido');
      console.log('🎮 [App] Dados recebidos:', data);
      return;
    }

    this.matchFoundData = matchFoundData;
    this.isInQueue = false;

    console.log('🎯 [App] === EXIBINDO MATCH FOUND ===');

    // ✅ CORREÇÃO: Modal só deve ser exibido para jogadores humanos
    // Bots são auto-aceitos pelo backend e não precisam do modal
    if (this.isCurrentPlayerBot()) {
      console.log('🎯 [App] Jogador atual é bot - não exibindo modal');
      console.log('🎯 [App] Auto-aceitação de bots é processada pelo backend');
      return;
    }

    console.log('🎮 [App] Mostrando tela de match-found para jogador humano');
    this.showMatchFound = true;
    this.addNotification('success', 'Partida Encontrada!', 'Você tem 30 segundos para aceitar.');

    console.log('🎯 [App] Estado final:', {
      showMatchFound: this.showMatchFound,
      matchFoundData: !!this.matchFoundData,
      isInQueue: this.isInQueue
    });

    // Som de notificação
    try {
      const audio = new Audio('assets/sounds/match-found.mp3');
      audio.play().catch(() => { });
    } catch (error) { }
  }

  // ✅ NOVO: Comparar se dois nomes coincidem (com diferentes formatos)
  private namesMatch(name1: string, name2: string): boolean {
    if (name1 === name2) return true;

    // Comparação por gameName (ignorando tag)
    if (name1.includes('#') && name2.includes('#')) {
      const gameName1 = name1.split('#')[0];
      const gameName2 = name2.split('#')[0];
      return gameName1 === gameName2;
    }

    if (name1.includes('#')) {
      const gameName1 = name1.split('#')[0];
      return gameName1 === name2;
    }

    if (name2.includes('#')) {
      const gameName2 = name2.split('#')[0];
      return name1 === gameName2;
    }

    return false;
  }

  // ✅ NOVO: Converter jogadores básicos (apenas nomes) para PlayerInfo
  private convertBasicPlayersToPlayerInfo(playerNames: string[]): any[] {
    return playerNames.map((name: string, index: number) => ({
      id: index,
      summonerName: name,
      mmr: 1200, // MMR padrão
      primaryLane: 'fill',
      secondaryLane: 'fill',
      assignedLane: 'FILL',
      teamIndex: index,
      isAutofill: false,
      riotIdGameName: name.includes('#') ? name.split('#')[0] : name,
      riotIdTagline: name.includes('#') ? name.split('#')[1] : undefined,
      profileIconId: 1
    }));
  }

  // ✅ NOVO: Obter identificadores do jogador atual
  private getCurrentPlayerIdentifiers(): string[] {
    if (!this.currentPlayer) return [];

    const identifiers = [];

    // Adicionar todas as possíveis variações do nome
    if (this.currentPlayer.displayName) {
      identifiers.push(this.currentPlayer.displayName);
    }
    if (this.currentPlayer.summonerName) {
      identifiers.push(this.currentPlayer.summonerName);
    }
    if (this.currentPlayer.gameName) {
      identifiers.push(this.currentPlayer.gameName);
      // Adicionar com tag se tiver
      if (this.currentPlayer.tagLine) {
        identifiers.push(`${this.currentPlayer.gameName}#${this.currentPlayer.tagLine}`);
      }
    }

    // Remover duplicatas
    return [...new Set(identifiers)];
  }

  // ✅ NOVO: Verificar se um jogador está em um time
  private isPlayerInTeam(playerIdentifiers: string[], team: any[]): boolean {
    if (!playerIdentifiers.length || !team.length) return false;

    console.log('🔍 [App] Verificando se jogador está no time:', {
      playerIdentifiers,
      teamPlayers: team.map(p => p.summonerName || p.name)
    });

    return team.some(player => {
      const playerName = player.summonerName || player.name || '';

      // Verificar se algum identificador do jogador atual coincide
      return playerIdentifiers.some((identifier: string) => {
        // Comparação exata
        if (identifier === playerName) {
          console.log(`✅ [App] Match exato encontrado: ${identifier} === ${playerName}`);
          return true;
        }

        // Comparação sem tag (gameName vs gameName#tagLine)
        if (identifier.includes('#') && playerName.includes('#')) {
          const identifierGameName = identifier.split('#')[0];
          const playerGameName = playerName.split('#')[0];
          if (identifierGameName === playerGameName) {
            console.log(`✅ [App] Match por gameName encontrado: ${identifierGameName} === ${playerGameName}`);
            return true;
          }
        }

        // Comparação de gameName com nome completo
        if (identifier.includes('#')) {
          const identifierGameName = identifier.split('#')[0];
          if (identifierGameName === playerName) {
            console.log(`✅ [App] Match por gameName vs nome completo: ${identifierGameName} === ${playerName}`);
            return true;
          }
        }

        if (playerName.includes('#')) {
          const playerGameName = playerName.split('#')[0];
          if (identifier === playerGameName) {
            console.log(`✅ [App] Match por nome vs gameName: ${identifier} === ${playerGameName}`);
            return true;
          }
        }

        return false;
      });
    });
  }

  // ✅ NOVO: Converter dados do backend para PlayerInfo
  private convertPlayersToPlayerInfo(players: any[]): any[] {
    console.log('🔄 [App] Convertendo players para PlayerInfo:', players);
    console.log('🔄 [App] Dados brutos dos players:', players.map(p => ({
      summonerName: p.summonerName,
      assignedLane: p.assignedLane,
      primaryLane: p.primaryLane,
      secondaryLane: p.secondaryLane,
      teamIndex: p.teamIndex,
      isAutofill: p.isAutofill
    })));

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

      console.log(`🔄 [App] Player ${index} convertido:`, {
        name: playerInfo.summonerName,
        lane: playerInfo.assignedLane,
        teamIndex: playerInfo.teamIndex,
        autofill: playerInfo.isAutofill,
        originalAssignedLane: player.assignedLane
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

  private handleDraftCancelled(data: any): void {
    console.log('🚫 [App] Draft cancelado pelo backend');

    // Limpar estado do draft
    this.inDraftPhase = false;
    this.draftData = null;
    this.currentView = 'dashboard';

    // Mostrar notificação
    this.addNotification('warning', 'Draft Cancelado', data.reason || 'O draft foi cancelado.');
  }

  private handleDraftAction(data: any): void {
    console.log('🎯 [App] Ação de draft:', data);
    // Atualizar estado do draft
    if (this.draftData) {
      this.draftData = { ...this.draftData, ...data };
    }
  }

  // ✅ NOVO: Handler para sincronização de dados do draft
  private handleDraftDataSync(data: any): void {
    console.log('🔄 [App] Sincronizando dados do draft:', data);

    // Verificar se estamos na fase de draft e se é a partida correta
    if (!this.inDraftPhase || !this.draftData || this.draftData.matchId !== data.matchId) {
      console.log('⚠️ [App] Sincronização ignorada - não estamos no draft desta partida');
      return;
    }

    // Atualizar dados do draft com informações sincronizadas
    if (data.pickBanData) {
      console.log('🔄 [App] Atualizando pickBanData:', {
        totalActions: data.totalActions,
        totalPicks: data.totalPicks,
        totalBans: data.totalBans,
        lastAction: data.lastAction?.action || 'none'
      });

      // Mergear dados de pick/ban mantendo estrutura existente
      this.draftData = {
        ...this.draftData,
        pickBanData: data.pickBanData,
        totalActions: data.totalActions,
        totalPicks: data.totalPicks,
        totalBans: data.totalBans,
        team1Stats: data.team1Stats,
        team2Stats: data.team2Stats,
        lastAction: data.lastAction,
        lastSyncTime: Date.now()
      };

      // ✅ NOVO: Notificar componente de draft sobre a sincronização
      const draftComponent = document.querySelector('app-draft-pick-ban') as any;
      if (draftComponent && draftComponent.handleDraftDataSync) {
        console.log('🔄 [App] Notificando componente de draft sobre sincronização');
        draftComponent.handleDraftDataSync(data);
      } else {
        console.log('⚠️ [App] Componente de draft não encontrado ou não suporta sincronização');
      }

      // ✅ NOVO: Forçar atualização da interface
      this.cdr.detectChanges();

      console.log('✅ [App] Dados do draft sincronizados com sucesso');
    }
  }

  private handleGameStarting(data: any): void {
    console.log('🎮 [App] ========== INÍCIO DO handleGameStarting ==========');
    console.log('🎮 [App] Jogo iniciando:', data);
    console.log('🔍 [App] DEBUG - gameData originalMatchId:', data.originalMatchId);
    console.log('🔍 [App] DEBUG - gameData matchId:', data.matchId);
    console.log('🔍 [App] DEBUG - gameData completo:', JSON.stringify(data, null, 2));
    console.log('🔍 [App] DEBUG - gameData.gameData:', data.gameData);
    console.log('🔍 [App] DEBUG - gameData.gameData?.matchId:', data.gameData?.matchId);
    console.log('🎮 [App] ========== FIM DO handleGameStarting ==========');

    // ✅ CORREÇÃO: Verificar se os dados dos times estão presentes
    if (!data.team1 || !data.team2) {
      console.error('❌ [App] Dados dos times ausentes no evento game_starting:', {
        hasTeam1: !!data.team1,
        hasTeam2: !!data.team2,
        team1Length: data.team1?.length || 0,
        team2Length: data.team2?.length || 0,
        dataKeys: Object.keys(data)
      });
    } else {
      console.log('✅ [App] Dados dos times recebidos:', {
        team1Length: data.team1.length,
        team2Length: data.team2.length,
        team1Players: data.team1.map((p: any) => p.summonerName || p.name),
        team2Players: data.team2.map((p: any) => p.summonerName || p.name)
      });
    }

    this.inDraftPhase = false;
    this.draftData = null;
    this.inGamePhase = true;
    this.gameData = data;

    this.addNotification('success', 'Jogo Iniciado!', 'A partida começou.');
  }

  private handleMatchCancelled(data: any): void {
    console.log('❌ [App] Partida cancelada pelo backend');

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
    // ✅ NOVO: Guarda de proteção para dados inválidos
    if (!data) {
      console.warn('⚠️ [App] handleQueueUpdate recebeu dados nulos, ignorando.');
      return;
    }

    // ✅ VERIFICAR SE AUTO-REFRESH ESTÁ HABILITADO ANTES DE PROCESSAR
    if (!this.autoRefreshEnabled) {
      // Só processar atualizações críticas mesmo com auto-refresh desabilitado
      const currentPlayerCount = this.queueStatus?.playersInQueue || 0;
      const newPlayerCount = data?.playersInQueue || 0;
      const isCriticalUpdate = newPlayerCount >= 10 && currentPlayerCount < 10; // Matchmaking threshold

      if (!isCriticalUpdate && !data?.critical) {
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
      if (timeSinceLastIgnoreLog > 5000) { // Log apenas a cada 5 segundos
        console.log('⏭️ [App] Atualizações da fila ignoradas - sem mudanças significativas');
        this.lastIgnoreLogTime = Date.now();
      }
    }
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    clearInterval(this.lcuCheckInterval);

    // ✅ PARAR: Polling inteligente
    this.stopIntelligentPolling();
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

  // ✅ ENHANCED: Métodos de notificação com animações suaves
  private addNotification(type: 'success' | 'error' | 'warning' | 'info', title: string, message: string): void {
    const notification: Notification = {
      id: Date.now().toString() + Math.random().toString(36).substr(2, 9), // More unique ID
      type,
      title,
      message,
      timestamp: new Date(),
      isVisible: false,
      isHiding: false
    };

    // Add to notifications array
    if (this.notifications.length < this.maxNotifications) {
      this.notifications.push(notification);
    } else {
      // Remove oldest notification and add new one
      this.notifications.shift();
      this.notifications.push(notification);
    }

    // Trigger change detection for initial render
    this.cdr.detectChanges();

    // Show animation after a brief delay
    setTimeout(() => {
      notification.isVisible = true;
      this.cdr.detectChanges();
    }, 50);

    // Auto-hide after 4 seconds (reduced from 5)
    const autoHideTimeout = setTimeout(() => {
      this.dismissNotification(notification.id);
    }, 4000);

    notification.autoHideTimeout = autoHideTimeout;

    // Process queue if there are pending notifications
    this.processNotificationQueue();
  }

  dismissNotification(id: string): void {
    const notification = this.notifications.find(n => n.id === id);
    if (notification) {
      // Clear auto-hide timeout if exists
      if (notification.autoHideTimeout) {
        clearTimeout(notification.autoHideTimeout);
      }

      // Start hide animation
      notification.isHiding = true;
      this.cdr.detectChanges();

      // Remove from array after animation completes
      setTimeout(() => {
        this.notifications = this.notifications.filter(n => n.id !== id);
        this.cdr.detectChanges();
      }, 400); // Match CSS transition duration
    }
  }

  private processNotificationQueue(): void {
    // This method can be used for future queue processing if needed
    // For now, we're using a simpler approach with direct replacement
    if (this.notificationQueue.length > 0 && this.notifications.length < this.maxNotifications) {
      const next = this.notificationQueue.shift();
      if (next) {
        this.notifications.push(next);
        this.cdr.detectChanges();
      }
    }
  }

  trackNotification(index: number, notification: Notification): string {
    return notification.id;
  }

  // ✅ CORRIGIDO: Métodos necessários para carregamento de dados
  private loadPlayerData(): void {
    console.log('👤 [App] Carregando dados do jogador...');

    // Strategy 1: Try to get player from LCU (best option if LoL is running)
    this.apiService.getPlayerFromLCU().subscribe({
      next: (player: Player) => {
        console.log('✅ [App] Dados do jogador carregados do LCU:', player);
        this.currentPlayer = player;
        this.savePlayerData(player);
        this.updateSettingsForm();

        // ✅ NOVO: Identificar jogador no WebSocket após carregar dados
        this.identifyCurrentPlayerOnConnect();

        this.addNotification('success', 'Dados Carregados', 'Dados do jogador carregados do League of Legends');
      },
      error: (error) => {
        console.warn('⚠️ [App] Erro ao carregar do LCU:', error);
        console.log('🔄 [App] Tentando carregar do localStorage como fallback...');

        // Fallback to localStorage if LCU fails
        this.tryLoadFromLocalStorage();
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
    console.log('🔍 [App] DEBUG - Criando gameData a partir do event:', JSON.stringify(event, null, 2));

    // ✅ CORREÇÃO: Extrair picks de cada jogador das phases
    const blueTeamWithChampions = this.assignChampionsToTeam(event.blueTeam || [], event.session, 'blue');
    const redTeamWithChampions = this.assignChampionsToTeam(event.redTeam || [], event.session, 'red');

    console.log('🔍 [App] Times com campeões atribuídos:', {
      blueTeam: blueTeamWithChampions,
      redTeam: redTeamWithChampions
    });

    // ✅ CORREÇÃO: Criar gameData corretamente a partir dos dados do draft
    const gameData = {
      sessionId: `game_${event.session?.id || Date.now()}`,
      gameId: `custom_${event.session?.id || Date.now()}`,
      team1: blueTeamWithChampions,
      team2: redTeamWithChampions,
      startTime: new Date(),
      pickBanData: event.session || {},
      isCustomGame: true,
      originalMatchId: event.session?.id || null,
      originalMatchData: event.session || null,
      riotId: null
    };

    console.log('✅ [App] gameData criado com campeões:', gameData);

    this.draftData = event;
    this.gameData = gameData; // ✅ CORREÇÃO: Definir gameData
    this.inDraftPhase = false;
    this.inGamePhase = true;
  }

  // ✅ NOVO: Método para atribuir campeões aos jogadores baseado nas phases
  private assignChampionsToTeam(team: any[], session: any, teamSide: 'blue' | 'red'): any[] {
    if (!session?.phases || !Array.isArray(session.phases)) {
      console.warn('⚠️ [App] Sessão não tem phases, retornando time original');
      return team;
    }

    console.log(`🎯 [App] Atribuindo campeões ao time ${teamSide}:`, {
      teamPlayersCount: team.length,
      phasesCount: session.phases.length,
      teamPlayers: team.map((p: any) => ({ name: p.summonerName || p.name, id: p.id }))
    });

    // Obter picks do time
    const teamPicks = session.phases
      .filter((phase: any) =>
        phase.action === 'pick' &&
        phase.team === teamSide &&
        phase.champion &&
        phase.locked
      )
      .map((phase: any) => ({
        championId: phase.champion.id,
        championName: phase.champion.name,
        champion: phase.champion
      }));

    console.log(`✅ [App] Picks encontrados para time ${teamSide}:`, teamPicks);

    // Atribuir campeões aos jogadores (assumindo ordem)
    return team.map((player: any, index: number) => {
      const pick = teamPicks[index]; // Por ordem (pode ser melhorado com lógica mais específica)

      const playerWithChampion = {
        ...player,
        champion: pick?.champion || null,
        championId: pick?.championId || null,
        championName: pick?.championName || null
      };

      console.log(`🎯 [App] Jogador ${player.summonerName || player.name} recebeu campeão:`, {
        championName: pick?.championName || 'Nenhum',
        hasChampion: !!pick?.champion
      });

      return playerWithChampion;
    });
  }

  exitDraft(): void {
    console.log('🚪 [App] Saindo do draft');

    // ✅ CORREÇÃO: Notificar backend sobre cancelamento antes de limpar estado
    if (this.draftData?.matchId) {
      console.log(`📤 [App] Enviando cancelamento de draft para backend: ${this.draftData.matchId}`);

      this.apiService.sendWebSocketMessage({
        type: 'cancel_draft',
        data: {
          matchId: this.draftData.matchId,
          reason: 'Cancelado pelo usuário'
        }
      });
    }

    // Limpar estado local
    this.inDraftPhase = false;
    this.draftData = null;
    this.currentView = 'dashboard';

    // Adicionar notificação
    this.addNotification('info', 'Draft Cancelado', 'O draft foi cancelado e você retornará à fila.');
  }

  onGameComplete(event: any): void {
    console.log('🏁 [App] Jogo completado:', event);
    this.gameResult = event;

    // ✅ NOVO: Salvar resultado no banco de dados
    this.saveGameResultToDatabase(event);

    // Limpar estado
    this.inGamePhase = false;
    this.gameData = null;
    this.currentView = 'dashboard';
    this.addNotification('success', 'Jogo Concluído!', 'Resultado salvo com sucesso');
  }

  // ✅ NOVO: Método para salvar resultado no banco
  private saveGameResultToDatabase(gameResult: any): void {
    console.log('💾 [App] Salvando resultado no banco:', gameResult);

    try {
      // Preparar dados para salvar
      const matchData = {
        title: gameResult.originalMatchId ? `Partida Simulada ${gameResult.originalMatchId}` : 'Partida Customizada',
        description: gameResult.detectedByLCU ? 'Partida detectada via LCU' : 'Partida manual',
        team1Players: gameResult.team1.map((p: any) => p.summonerName || p.name),
        team2Players: gameResult.team2.map((p: any) => p.summonerName || p.name),
        createdBy: this.currentPlayer?.summonerName || 'Sistema',
        matchLeader: 'popcorn seller#coup', // ✅ SEMPRE popcorn seller#coup para partidas simuladas
        gameMode: '5v5',
        winnerTeam: gameResult.winner === 'blue' ? 1 : (gameResult.winner === 'red' ? 2 : null),
        duration: gameResult.duration,
        pickBanData: gameResult.pickBanData,
        participantsData: gameResult.originalMatchData?.participants || [],
        riotGameId: gameResult.originalMatchId?.toString(),
        detectedByLCU: gameResult.detectedByLCU,
        status: 'completed'
      };

      console.log('💾 [App] Dados preparados para salvar:', matchData);

      // Salvar via API
      this.apiService.saveCustomMatch(matchData).subscribe({
        next: (response) => {
          console.log('✅ [App] Resultado salvo no banco:', response);
          this.addNotification('success', 'Resultado Salvo', 'Dados da partida foram salvos no histórico');
        },
        error: (error) => {
          console.error('❌ [App] Erro ao salvar resultado:', error);
          this.addNotification('error', 'Erro ao Salvar', 'Não foi possível salvar o resultado da partida');
        }
      });

    } catch (error) {
      console.error('❌ [App] Erro ao preparar dados para salvar:', error);
      this.addNotification('error', 'Erro Interno', 'Erro ao processar dados da partida');
    }
  }

  onGameCancel(): void {
    console.log('🚪 [App] ========== INÍCIO DO onGameCancel ==========');
    console.log('🚪 [App] Jogo cancelado - MÉTODO CORRETO CHAMADO');
    console.log('🚪 [App] ========== VERIFICANDO SE ESTE LOG APARECE ==========');
    console.log('🔍 [App] DEBUG - gameData:', this.gameData);
    console.log('🔍 [App] DEBUG - gameData.originalMatchId:', this.gameData?.originalMatchId);
    console.log('🔍 [App] DEBUG - gameData.matchId:', this.gameData?.matchId);
    console.log('🔍 [App] DEBUG - gameData.gameData:', this.gameData?.gameData);
    console.log('🔍 [App] DEBUG - gameData.gameData?.matchId:', this.gameData?.gameData?.matchId);
    console.log('🔍 [App] DEBUG - gameData.data:', this.gameData?.data);
    console.log('🔍 [App] DEBUG - gameData.data?.matchId:', this.gameData?.data?.matchId);
    console.log('🔍 [App] DEBUG - gameData completo:', JSON.stringify(this.gameData, null, 2));

    // ✅ CORREÇÃO: Notificar backend sobre cancelamento ANTES de limpar estado
    let matchIdToUse = null;

    // ✅ PRIORIDADE 1: originalMatchId (mais confiável)
    if (this.gameData?.originalMatchId) {
      matchIdToUse = this.gameData.originalMatchId;
      console.log(`📤 [App] Usando originalMatchId: ${matchIdToUse}`);
    }
    // ✅ PRIORIDADE 2: matchId direto
    else if (this.gameData?.matchId) {
      matchIdToUse = this.gameData.matchId;
      console.log(`📤 [App] FALLBACK: Usando matchId: ${matchIdToUse}`);
    }
    // ✅ PRIORIDADE 3: matchId aninhado em gameData
    else if (this.gameData?.gameData?.matchId) {
      matchIdToUse = this.gameData.gameData.matchId;
      console.log(`📤 [App] FALLBACK: Usando gameData.matchId: ${matchIdToUse}`);
    }
    // ✅ PRIORIDADE 4: matchId do gameData do backend
    else if (this.gameData?.data?.matchId) {
      matchIdToUse = this.gameData.data.matchId;
      console.log(`📤 [App] FALLBACK: Usando data.matchId: ${matchIdToUse}`);
    }
    // ✅ PRIORIDADE 5: Busca profunda em todos os objetos aninhados
    else {
      console.log(`🔍 [App] Busca profunda por matchId...`);
      const deepSearch = (obj: any, path: string = ''): any => {
        if (!obj || typeof obj !== 'object') return null;

        // Verificar se este objeto tem matchId
        if (obj.matchId !== undefined) {
          console.log(`🔍 [App] MatchId encontrado em ${path}: ${obj.matchId}`);
          return obj.matchId;
        }

        // Verificar se este objeto tem id
        if (obj.id !== undefined && typeof obj.id === 'number') {
          console.log(`🔍 [App] ID encontrado em ${path}: ${obj.id}`);
          return obj.id;
        }

        // Buscar recursivamente em todas as propriedades
        for (const [key, value] of Object.entries(obj)) {
          if (typeof value === 'object' && value !== null) {
            const result = deepSearch(value, `${path}.${key}`);
            if (result !== null) return result;
          }
        }

        return null;
      };

      const deepMatchId = deepSearch(this.gameData, 'gameData');
      if (deepMatchId !== null) {
        matchIdToUse = deepMatchId;
        console.log(`📤 [App] FALLBACK: Usando matchId da busca profunda: ${matchIdToUse}`);
      }
    }

    if (matchIdToUse) {
      console.log(`📤 [App] Enviando cancelamento de jogo para backend: ${matchIdToUse}`);

      // ✅ CORREÇÃO: Enviar mensagem WebSocket para cancelar jogo
      this.apiService.sendWebSocketMessage({
        type: 'cancel_game_in_progress',
        data: {
          matchId: matchIdToUse,
          reason: 'Cancelado pelo usuário'
        }
      });

      console.log(`✅ [App] Mensagem de cancelamento enviada para backend`);
    } else {
      console.error('❌ [App] Nenhum ID de partida disponível para cancelamento');
      console.error('❌ [App] gameData é null ou não tem IDs válidos');
      console.error('❌ [App] Estrutura do gameData:', {
        hasGameData: !!this.gameData,
        hasOriginalMatchId: !!this.gameData?.originalMatchId,
        hasMatchId: !!this.gameData?.matchId,
        hasGameDataMatchId: !!this.gameData?.gameData?.matchId,
        hasDataMatchId: !!this.gameData?.data?.matchId
      });

      // ✅ CORREÇÃO: Tentar usar o último matchId conhecido como fallback
      if (this.lastMatchId) {
        console.log(`📤 [App] FALLBACK FINAL: Usando lastMatchId: ${this.lastMatchId}`);
        this.apiService.sendWebSocketMessage({
          type: 'cancel_game_in_progress',
          data: {
            matchId: this.lastMatchId,
            reason: 'Cancelado pelo usuário (fallback)'
          }
        });
        console.log(`✅ [App] Mensagem de cancelamento enviada com fallback`);
      } else {
        this.addNotification('error', 'Erro', 'Não foi possível cancelar o jogo - ID da partida não encontrado');
      }
    }

    // ✅ CORREÇÃO: Aguardar um pouco antes de limpar o estado para garantir que a mensagem seja enviada
    setTimeout(() => {
      // Limpar estado local
      this.inGamePhase = false;
      this.gameData = null;
      this.currentView = 'dashboard';

      // Adicionar notificação
      this.addNotification('info', 'Jogo Cancelado', 'O jogo foi cancelado e você retornará à fila.');
    }, 100);
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
      // ✅ CORREÇÃO: Verificar múltiplas variações do nome
      const playerIdentifiers = this.getCurrentPlayerIdentifiers();

      const isSpecial = specialUsers.some(specialUser =>
        playerIdentifiers.some(identifier => {
          // Comparação exata
          if (identifier === specialUser) return true;

          // Comparação case-insensitive
          if (identifier.toLowerCase() === specialUser.toLowerCase()) return true;

          // Comparação por gameName (ignorando tag)
          if (identifier.includes('#') && specialUser.includes('#')) {
            const gameName1 = identifier.split('#')[0].toLowerCase();
            const gameName2 = specialUser.split('#')[0].toLowerCase();
            return gameName1 === gameName2;
          }

          // Comparação de gameName com nome completo
          if (identifier.includes('#')) {
            const gameName = identifier.split('#')[0].toLowerCase();
            return gameName === specialUser.toLowerCase();
          }

          return false;
        })
      );

      console.log(`🔍 [App] Verificação de usuário especial:`, {
        currentPlayerName: this.currentPlayer.summonerName,
        playerIdentifiers,
        isSpecialUser: isSpecial,
        specialUsers: specialUsers
      });
      return isSpecial;
    }

    return false;
  }

  simulateLastMatch(): void {
    console.log('[simular game] 🎮 Iniciando simulação da última partida ranqueada');
    console.log('[simular game] Current player:', this.currentPlayer);

    if (!this.currentPlayer) {
      this.addNotification('warning', 'Nenhum Jogador', 'Carregue os dados do jogador primeiro');
      return;
    }

    // ✅ IMPLEMENTAÇÃO COMPLETA: Buscar última partida ranqueada e criar simulação
    console.log('[simular game] Chamando getLCUMatchHistoryAll com customOnly=false...');
    this.apiService.getLCUMatchHistoryAll(0, 20, false).subscribe({
      next: (response) => {
        console.log('[simular game] Resposta completa do LCU Match History All:', JSON.stringify(response, null, 2));

        // Verificar se a resposta existe e tem dados
        const matches = response?.matches || response?.games || [];
        console.log('[simular game] Matches encontrados:', matches.length);

        if (matches && matches.length > 0) {
          // Buscar a primeira partida ranqueada (RANKED_FLEX_SR ou RANKED_SOLO_5x5)
          const rankedMatch = matches.find((game: any) =>
            game.queueId === 440 || // RANKED_FLEX_SR
            game.queueId === 420    // RANKED_SOLO_5x5
          );

          console.log('[simular game] Partida ranqueada encontrada:', rankedMatch);

          if (rankedMatch) {
            console.log('[simular game] Simulando partida ranqueada do LCU:', rankedMatch);
            console.log(`[simular game] Total de partidas encontradas: ${matches.length}, Tipo: ${rankedMatch.queueId === 440 ? 'Flex' : 'Solo/Duo'}`);

            this.addNotification('info', 'Simulação Iniciada',
              `Buscando dados da partida ranqueada ${rankedMatch.queueId === 440 ? 'Flex' : 'Solo/Duo'} (ID: ${rankedMatch.gameId})...`);

            // ✅ NOVO: Criar partida customizada baseada nos dados do LCU
            const playerIdentifier = this.currentPlayer?.summonerName || '';
            if (!playerIdentifier) {
              this.addNotification('error', 'Erro na Simulação', 'Nome do jogador não disponível.');
              return;
            }

            this.apiService.createLCUBasedMatch({
              lcuMatchData: rankedMatch,
              playerIdentifier: playerIdentifier
            }).subscribe({
              next: (createResponse) => {
                console.log('[simular game] ✅ Partida customizada criada:', createResponse);

                this.addNotification('success', 'Simulação Criada',
                  `Partida ranqueada simulada com sucesso! Match ID: ${createResponse.matchId}`);

                // ✅ NOVO: Iniciar GameInProgress com os dados da partida criada
                this.startGameInProgressFromSimulation(createResponse);
              },
              error: (createError) => {
                console.error('❌ [App] Erro ao criar partida customizada:', createError);
                this.addNotification('error', 'Erro na Simulação',
                  'Não foi possível criar a partida customizada. Verifique se o LoL está aberto.');
              }
            });

          } else {
            // Se não houver partidas ranqueadas, usar a última partida disponível
            const lastMatch = matches[0];
            console.log('🎮 [App] Nenhuma partida ranqueada encontrada, simulando última partida:', lastMatch);

            this.addNotification('warning', 'Simulando Última Partida',
              `Nenhuma partida ranqueada encontrada. Simulando última partida (ID: ${lastMatch.gameId || lastMatch.id})...`);

            // ✅ NOVO: Criar partida customizada mesmo para partidas não-ranqueadas
            const playerIdentifier = this.currentPlayer?.summonerName || '';
            if (!playerIdentifier) {
              this.addNotification('error', 'Erro na Simulação', 'Nome do jogador não disponível.');
              return;
            }

            this.apiService.createLCUBasedMatch({
              lcuMatchData: lastMatch,
              playerIdentifier: playerIdentifier
            }).subscribe({
              next: (createResponse) => {
                console.log('✅ [App] Partida customizada criada (não-ranqueada):', createResponse);

                this.addNotification('success', 'Simulação Criada',
                  `Última partida simulada com sucesso! Match ID: ${createResponse.matchId}`);

                // ✅ NOVO: Iniciar GameInProgress com os dados da partida criada
                this.startGameInProgressFromSimulation(createResponse);
              },
              error: (createError) => {
                console.error('❌ [App] Erro ao criar partida customizada:', createError);
                this.addNotification('error', 'Erro na Simulação',
                  'Não foi possível criar a partida customizada. Verifique se o LoL está aberto.');
              }
            });
          }
        } else {
          console.log('🎮 [App] Nenhuma partida encontrada no LCU');
          this.addNotification('warning', 'Nenhuma Partida', 'Não há partidas no histórico do LCU para simular');
        }
      },
      error: (error) => {
        console.error('❌ [App] Erro detalhado ao buscar partidas do LCU:', error);
        this.addNotification('error', 'Erro Simulação LCU', 'Não foi possível carregar partidas do LCU. Verifique se o LoL está aberto.');
      }
    });
  }

  // ✅ NOVO: Método para iniciar GameInProgress com dados da simulação
  private startGameInProgressFromSimulation(simulationData: any): void {
    console.log('[simular game] 🎮 Iniciando GameInProgress com dados da simulação:', simulationData);

    try {
      // Extrair dados da resposta da simulação
      const matchId = simulationData.matchId;
      const gameId = simulationData.gameId;
      const pickBanData = simulationData.pickBanData;
      const participantsCount = simulationData.participantsCount;

      // ✅ NOVO: Buscar dados completos da partida criada
      const playerName = this.currentPlayer?.summonerName || '';
      if (!playerName) {
        this.addNotification('error', 'Erro na Simulação', 'Nome do jogador não disponível.');
        return;
      }

      this.apiService.getCustomMatches(playerName, 0, 1).subscribe({
        next: (matchesResponse) => {
          console.log('[simular game] Dados da partida criada:', matchesResponse);
          console.log('[simular game] Estrutura completa da resposta:', JSON.stringify(matchesResponse, null, 2));

          const matches = matchesResponse.matches || [];
          console.log('[simular game] Matches encontrados:', matches.length);

          if (matches.length > 0) {
            const latestMatch = matches[0]; // A partida mais recente (que acabamos de criar)
            console.log('[simular game] Dados da partida mais recente:', latestMatch);
            console.log('[simular game] Pick/ban data da partida:', latestMatch.pick_ban_data);

            // ✅ NOVO: Preparar dados para o GameInProgress
            // ✅ CORREÇÃO: Extrair pickBanData da partida real
            let extractedPickBanData = {};
            try {
              if (latestMatch.pick_ban_data) {
                extractedPickBanData = typeof latestMatch.pick_ban_data === 'string'
                  ? JSON.parse(latestMatch.pick_ban_data)
                  : latestMatch.pick_ban_data;
                console.log('[simular game] Pick/ban data extraída da partida real:', extractedPickBanData);
              }
            } catch (parseError) {
              console.warn('[simular game] Erro ao parsear pick_ban_data da partida real:', parseError);
            }

            const gameData = {
              sessionId: `simulation_${matchId}`,
              gameId: gameId?.toString() || `sim_${matchId}`,
              team1: this.extractTeamFromMatchData(latestMatch, 1),
              team2: this.extractTeamFromMatchData(latestMatch, 2),
              startTime: new Date(),
              pickBanData: extractedPickBanData, // ✅ CORREÇÃO: Usar dados reais da partida
              isCustomGame: true,
              originalMatchId: matchId,
              originalMatchData: latestMatch,
              riotId: this.currentPlayer?.summonerName || ''
            };

            console.log('[simular game] Dados preparados para GameInProgress:', gameData);

            // ✅ NOVO: Iniciar fase de jogo
            console.log('[simular game] Definindo inGamePhase = true');
            this.inGamePhase = true;
            console.log('[simular game] Definindo gameData:', gameData);
            this.gameData = gameData;
            console.log('[simular game] Definindo inDraftPhase = false');
            this.inDraftPhase = false; // Garantir que não está em draft
            this.draftData = null;
            console.log('[simular game] Definindo currentView = dashboard');
            this.currentView = 'dashboard'; // Garantir que estamos na view correta

            // ✅ NOVO: Forçar detecção de mudanças
            console.log('[simular game] Forçando detecção de mudanças...');
            this.cdr.detectChanges();

            // ✅ NOVO: Usar setTimeout para garantir que a mudança seja aplicada
            setTimeout(() => {
              console.log('[simular game] ⏰ Verificação após timeout:');
              console.log('[simular game] - inGamePhase:', this.inGamePhase);
              console.log('[simular game] - inDraftPhase:', this.inDraftPhase);
              console.log('[simular game] - gameData existe:', !!this.gameData);
              this.cdr.detectChanges();
            }, 100);

            console.log('[simular game] ✅ GameInProgress iniciado com sucesso:', {
              inGamePhase: this.inGamePhase,
              inDraftPhase: this.inDraftPhase,
              hasGameData: !!this.gameData,
              team1Length: this.gameData?.team1?.length || 0,
              team2Length: this.gameData?.team2?.length || 0,
              currentView: this.currentView
            });

            // ✅ NOVO: Verificar se as condições do template estão corretas
            console.log('[simular game] 🔍 Verificação das condições do template:');
            console.log('[simular game] - inGamePhase:', this.inGamePhase);
            console.log('[simular game] - inDraftPhase:', this.inDraftPhase);
            console.log('[simular game] - !inDraftPhase && !inGamePhase:', !this.inDraftPhase && !this.inGamePhase);
            console.log('[simular game] - currentView:', this.currentView);
            console.log('[simular game] - gameData existe:', !!this.gameData);

            this.addNotification('success', 'Simulação Ativa',
              `Partida simulada iniciada! ${participantsCount} jogadores, ${gameData.team1.length} vs ${gameData.team2.length}`);

          } else {
            console.error('❌ [App] Nenhuma partida encontrada após criação');
            this.addNotification('error', 'Erro na Simulação', 'Partida criada mas não foi possível carregar os dados.');
          }
        },
        error: (matchesError) => {
          console.error('❌ [App] Erro ao buscar dados da partida criada:', matchesError);
          this.addNotification('error', 'Erro na Simulação', 'Partida criada mas não foi possível carregar os dados.');
        }
      });

    } catch (error) {
      console.error('❌ [App] Erro ao preparar dados para GameInProgress:', error);
      this.addNotification('error', 'Erro na Simulação', 'Erro interno ao preparar dados da partida.');
    }
  }

  // ✅ NOVO: Método auxiliar para extrair dados dos times da partida
  private extractTeamFromMatchData(matchData: any, teamNumber: number): any[] {
    try {
      console.log(`[simular game] Extraindo time ${teamNumber} de:`, matchData);

      // ✅ NOVO: Tentar extrair dados do pick_ban_data primeiro
      let pickBanData = null;
      try {
        if (matchData.pick_ban_data) {
          pickBanData = typeof matchData.pick_ban_data === 'string'
            ? JSON.parse(matchData.pick_ban_data)
            : matchData.pick_ban_data;
          console.log(`[simular game] Pick/ban data encontrada para time ${teamNumber}:`, pickBanData);
        }
      } catch (parseError) {
        console.warn(`[simular game] Erro ao parsear pick_ban_data:`, parseError);
      }

      // ✅ NOVO: Se temos dados de pick/ban, usar eles para extrair campeões e lanes
      if (pickBanData && pickBanData.team1Picks && pickBanData.team2Picks) {
        const picks = teamNumber === 1 ? pickBanData.team1Picks : pickBanData.team2Picks;
        console.log(`[simular game] Picks encontrados para time ${teamNumber}:`, picks);

        if (Array.isArray(picks) && picks.length > 0) {
          // ✅ NOVO: Criar estrutura compatível com GameInProgress
          return picks.map((pick: any, index: number) => {
            // ✅ CORREÇÃO: Usar championName processado pelo backend como prioridade
            let championName = null;
            if (pick.championName) {
              // ✅ PRIORIDADE 1: championName já processado pelo backend
              championName = pick.championName;
            } else if (pick.champion) {
              // ✅ PRIORIDADE 2: champion (pode ser nome ou ID)
              championName = pick.champion;
            } else if (pick.championId) {
              // ✅ PRIORIDADE 3: championId - usar fallback
              championName = `Champion${pick.championId}`;
            }

            // ✅ NOVO: Mapear lanes corretamente
            const mapLane = (lane: string): string => {
              if (!lane || lane === 'UNKNOWN' || lane === 'unknown') {
                // ✅ FALLBACK: Tentar determinar lane baseada no índice ou campeão
                const laneByIndex = ['top', 'jungle', 'mid', 'adc', 'support'][index] || 'unknown';
                console.log(`[simular game] Lane UNKNOWN, usando lane por índice ${index}: ${laneByIndex}`);
                return laneByIndex;
              }

              // Mapear valores do Riot API para valores do nosso sistema
              const laneMap: { [key: string]: string } = {
                'TOP': 'top',
                'JUNGLE': 'jungle',
                'MIDDLE': 'mid',
                'BOTTOM': 'adc',
                'UTILITY': 'support',
                'NONE': 'unknown'
              };

              return laneMap[lane.toUpperCase()] || lane.toLowerCase() || 'unknown';
            };

            const mappedLane = mapLane(pick.lane);
            const teamIndex = teamNumber === 1 ? index : index + 5; // 0-4 para team1, 5-9 para team2

            console.log(`[simular game] Criando jogador: ${pick.player} (${mappedLane}) - champion: ${championName} - teamIndex: ${teamIndex}`);

            return {
              summonerName: pick.player || pick.summonerName || 'Unknown',
              name: pick.player || pick.summonerName || 'Unknown',
              id: null,
              champion: championName, // ✅ CORREÇÃO: Usar championName resolvido
              championName: championName, // ✅ ADICIONADO: Para compatibilidade
              championId: pick.championId || null,
              lane: mappedLane,
              assignedLane: mappedLane,
              // ✅ NOVO: Adicionar campos necessários para GameInProgress
              teamIndex: teamIndex,
              mmr: 1000, // MMR padrão para simulação
              primaryLane: mappedLane,
              secondaryLane: 'unknown',
              isAutofill: false
            };
          });
        }
      }

      // ✅ FALLBACK: Usar dados básicos dos jogadores se não houver pick/ban data
      const teamPlayers = teamNumber === 1 ? matchData.team1_players : matchData.team2_players;
      console.log(`[simular game] Usando fallback - teamPlayers para time ${teamNumber}:`, teamPlayers);

      if (typeof teamPlayers === 'string') {
        const players = JSON.parse(teamPlayers);
        return players.map((playerName: string, index: number) => {
          const teamIndex = teamNumber === 1 ? index : index + 5;
          const laneByIndex = ['top', 'jungle', 'mid', 'adc', 'support'][index] || 'unknown';

          return {
            summonerName: playerName,
            name: playerName,
            id: null,
            champion: null,
            championName: null, // ✅ ADICIONADO: Para compatibilidade
            championId: null,
            lane: laneByIndex,
            assignedLane: laneByIndex,
            teamIndex: teamIndex,
            mmr: 1000,
            primaryLane: laneByIndex,
            secondaryLane: 'unknown',
            isAutofill: false
          };
        });
      } else if (Array.isArray(teamPlayers)) {
        return teamPlayers.map((playerName: string, index: number) => {
          const teamIndex = teamNumber === 1 ? index : index + 5;
          const laneByIndex = ['top', 'jungle', 'mid', 'adc', 'support'][index] || 'unknown';

          return {
            summonerName: playerName,
            name: playerName,
            id: null,
            champion: null,
            championName: null, // ✅ ADICIONADO: Para compatibilidade
            championId: null,
            lane: laneByIndex,
            assignedLane: laneByIndex,
            teamIndex: teamIndex,
            mmr: 1000,
            primaryLane: laneByIndex,
            secondaryLane: 'unknown',
            isAutofill: false
          };
        });
      }

      return [];
    } catch (error) {
      console.error(`❌ [App] Erro ao extrair time ${teamNumber}:`, error);
      return [];
    }
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

  // ✅ NOVO: Iniciar polling inteligente
  private startIntelligentPolling(): void {
    console.log('🔄 [App] Iniciando polling inteligente para sincronização...');

    this.pollingInterval = setInterval(async () => {
      await this.checkSyncStatus();
    }, this.POLLING_INTERVAL_MS);
  }

  // ✅ NOVO: Parar polling
  private stopIntelligentPolling(): void {
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
      this.pollingInterval = null;
      console.log('🛑 [App] Polling inteligente parado');
    }
  }

  // ✅ NOVO: Verificar status de sincronização com controle de timing
  private async checkSyncStatus(): Promise<void> {
    if (!this.currentPlayer?.displayName) {
      return; // Sem jogador identificado
    }

    // ✅ NOVO: Verificar se há ação recente do backend
    const now = Date.now();
    const timeSinceLastBackendAction = now - this.lastBackendAction;

    if (timeSinceLastBackendAction < this.BACKEND_ACTION_COOLDOWN) {
      console.log(`⏳ [App] Aguardando backend processar (${this.BACKEND_ACTION_COOLDOWN - timeSinceLastBackendAction}ms restantes)`);
      return;
    }

    try {
      const response = await this.apiService.checkSyncStatus(this.currentPlayer.displayName).toPromise();
      const currentStatus = response.status;

      console.log(`🔄 [App] Polling status: ${currentStatus} (anterior: ${this.lastPollingStatus})`);

      // ✅ VERIFICAR: Se o status mudou desde a última verificação
      if (currentStatus !== this.lastPollingStatus) {
        console.log(`🔄 [App] Mudança de status detectada: ${this.lastPollingStatus} → ${currentStatus}`);
        await this.handleStatusChange(currentStatus, response);
        this.lastPollingStatus = currentStatus;

        // ✅ NOVO: Invalidar cache apenas quando há mudança real
        this.invalidateCacheIntelligently();
      }
    } catch (error) {
      console.error('❌ [App] Erro no polling de sincronização:', error);
    }
  }

  // ✅ NOVO: Invalidar cache de forma inteligente (com cooldown)
  private invalidateCacheIntelligently(): void {
    const now = Date.now();
    const timeSinceLastInvalidation = now - this.lastCacheInvalidation;

    if (timeSinceLastInvalidation < this.CACHE_INVALIDATION_COOLDOWN) {
      console.log(`⏳ [App] Cache invalidation throttled - aguardando ${this.CACHE_INVALIDATION_COOLDOWN - timeSinceLastInvalidation}ms`);
      return;
    }

    console.log('🔄 [App] Invalidando cache (mudança de status detectada)');
    this.lastCacheInvalidation = now;

    // ✅ NOVO: Forçar atualização da interface apenas quando necessário
    this.cdr.detectChanges();
  }

  // ✅ NOVO: Marcar ação do backend para controle de timing
  private markBackendAction(): void {
    this.lastBackendAction = Date.now();
    console.log('🔄 [App] Ação do backend marcada - aguardando processamento');
  }

  // ✅ NOVO: Lidar com mudança de status detectada via polling
  private async handleStatusChange(newStatus: string, response: any): Promise<void> {
    console.log(`🔄 [App] === PROCESSANDO MUDANÇA DE STATUS ===`);
    console.log(`🔄 [App] Novo status: ${newStatus}`);
    console.log(`🔄 [App] Dados da resposta:`, response);

    switch (newStatus) {
      case 'match_found':
        await this.handleMatchFoundFromPolling(response);
        break;
      case 'draft':
        await this.handleDraftFromPolling(response);
        break;
      case 'game_in_progress':
        await this.handleGameInProgressFromPolling(response);
        break;
      case 'none':
        await this.handleNoStatusFromPolling();
        break;
      default:
        console.warn(`⚠️ [App] Status desconhecido: ${newStatus}`);
    }
  }

  // ✅ NOVO: Processar match_found detectado via polling
  private async handleMatchFoundFromPolling(response: any): Promise<void> {
    console.log('🎮 [App] Match found detectado via polling!');

    // ✅ VERIFICAR: Se já estamos mostrando match_found
    if (this.showMatchFound && this.matchFoundData?.matchId === response.matchId) {
      console.log('✅ [App] Match found já está sendo exibido, ignorando');
      return;
    }

    // ✅ PROCESSAR: Dados do match_found
    const matchData = response.match;
    if (!matchData) {
      console.error('❌ [App] Dados do match não encontrados na resposta');
      return;
    }

    // ✅ CONSTRUIR: Dados estruturados para o frontend
    let team1Players: string[] = [];
    let team2Players: string[] = [];

    try {
      team1Players = typeof matchData.team1_players === 'string'
        ? JSON.parse(matchData.team1_players)
        : (matchData.team1_players || []);
      team2Players = typeof matchData.team2_players === 'string'
        ? JSON.parse(matchData.team2_players)
        : (matchData.team2_players || []);
    } catch (error) {
      console.error('❌ [App] Erro ao parsear dados dos times:', error);
      return;
    }

    // ✅ IDENTIFICAR: Time do jogador atual
    const currentPlayerIdentifiers = this.getCurrentPlayerIdentifiers();
    const isInTeam1 = team1Players.some((name: string) =>
      currentPlayerIdentifiers.some(id => this.namesMatch(id, name))
    );

    // ✅ CONSTRUIR: Dados do match_found
    const matchFoundData: MatchFoundData = {
      matchId: response.matchId,
      playerSide: isInTeam1 ? 'blue' : 'red',
      teammates: this.convertBasicPlayersToPlayerInfo(isInTeam1 ? team1Players : team2Players),
      enemies: this.convertBasicPlayersToPlayerInfo(isInTeam1 ? team2Players : team1Players),
      averageMMR: { yourTeam: 1200, enemyTeam: 1200 },
      estimatedGameDuration: 25,
      phase: 'accept',
      acceptTimeout: 30,
      acceptanceTimer: 30
    };

    // ✅ ATUALIZAR: Estado local
    this.matchFoundData = matchFoundData;
    this.isInQueue = false;
    this.showMatchFound = true;
    this.lastMatchId = response.matchId;

    console.log('✅ [App] Match found processado via polling:', {
      matchId: response.matchId,
      playerSide: matchFoundData.playerSide,
      teammatesCount: matchFoundData.teammates.length,
      enemiesCount: matchFoundData.enemies.length
    });

    this.addNotification('success', 'Partida Encontrada!', 'Você tem 30 segundos para aceitar.');
  }

  // ✅ NOVO: Processar draft detectado via polling
  private async handleDraftFromPolling(response: any): Promise<void> {
    console.log('🎯 [App] Draft detectado via polling!');

    // ✅ VERIFICAR: Se já estamos em draft
    if (this.inDraftPhase && this.draftData?.matchId === response.matchId) {
      console.log('✅ [App] Draft já está ativo, ignorando');
      return;
    }

    // ✅ PROCESSAR: Dados do draft
    const matchData = response.match;
    if (!matchData) {
      console.error('❌ [App] Dados do draft não encontrados na resposta');
      return;
    }

    // ✅ NOVO: Se vier pick_ban_data do backend, usar diretamente
    if (response.pick_ban_data) {
      console.log('✅ [App] Usando pick_ban_data do backend para inicializar draft:', response.pick_ban_data);
      this.draftData = {
        matchId: response.matchId,
        ...response.pick_ban_data // Inclui phases, currentAction, blueTeam, redTeam, etc.
      };
      this.inDraftPhase = true;
      this.showMatchFound = false;
      this.isInQueue = false;
      this.lastMatchId = response.matchId;
      this.addNotification('success', 'Draft Iniciado!', 'A fase de seleção de campeões começou.');
      return;
    }

    // ✅ CONSTRUIR: Dados do draft (fallback antigo)
    let team1Players: string[] = [];
    let team2Players: string[] = [];

    try {
      team1Players = typeof matchData.team1_players === 'string'
        ? JSON.parse(matchData.team1_players)
        : (matchData.team1_players || []);
      team2Players = typeof matchData.team2_players === 'string'
        ? JSON.parse(matchData.team2_players)
        : (matchData.team2_players || []);
    } catch (error) {
      console.error('❌ [App] Erro ao parsear dados dos times do draft:', error);
      return;
    }

    // ✅ IDENTIFICAR: Time do jogador atual
    const currentPlayerIdentifiers = this.getCurrentPlayerIdentifiers();
    const isInTeam1 = team1Players.some((name: string) =>
      currentPlayerIdentifiers.some(id => this.namesMatch(id, name))
    );

    // ✅ CONSTRUIR: Dados estruturados do draft
    const draftData = {
      matchId: response.matchId,
      teammates: this.convertBasicPlayersToPlayerInfo(isInTeam1 ? team1Players : team2Players),
      enemies: this.convertBasicPlayersToPlayerInfo(isInTeam1 ? team2Players : team1Players),
      team1: this.convertBasicPlayersToPlayerInfo(team1Players),
      team2: this.convertBasicPlayersToPlayerInfo(team2Players),
      phase: 'draft',
      phases: [],
      currentAction: 0
    };

    // ✅ ATUALIZAR: Estado local
    this.draftData = draftData;
    this.inDraftPhase = true;
    this.showMatchFound = false;
    this.isInQueue = false;
    this.lastMatchId = response.matchId;

    console.log('✅ [App] Draft processado via polling:', {
      matchId: response.matchId,
      teammatesCount: draftData.teammates.length,
      enemiesCount: draftData.enemies.length
    });

    this.addNotification('success', 'Draft Iniciado!', 'A fase de seleção de campeões começou.');
  }

  // ✅ NOVO: Processar game_in_progress detectado via polling
  private async handleGameInProgressFromPolling(response: any): Promise<void> {
    console.log('🎮 [App] Game in progress detectado via polling!');

    // ✅ VERIFICAR: Se já estamos em game
    if (this.inGamePhase && this.gameData?.matchId === response.matchId) {
      console.log('✅ [App] Game já está ativo, ignorando');
      return;
    }

    // ✅ PROCESSAR: Dados do game
    const matchData = response.match;
    if (!matchData) {
      console.error('❌ [App] Dados do game não encontrados na resposta');
      return;
    }

    // ✅ CONSTRUIR: Dados do game
    let team1Players: string[] = [];
    let team2Players: string[] = [];

    try {
      team1Players = typeof matchData.team1_players === 'string'
        ? JSON.parse(matchData.team1_players)
        : (matchData.team1_players || []);
      team2Players = typeof matchData.team2_players === 'string'
        ? JSON.parse(matchData.team2_players)
        : (matchData.team2_players || []);
    } catch (error) {
      console.error('❌ [App] Erro ao parsear dados dos times do game:', error);
      return;
    }

    // ✅ IDENTIFICAR: Time do jogador atual
    const currentPlayerIdentifiers = this.getCurrentPlayerIdentifiers();
    const isInTeam1 = team1Players.some((name: string) =>
      currentPlayerIdentifiers.some(id => this.namesMatch(id, name))
    );

    // ✅ CONSTRUIR: Dados do game
    const gameData = {
      matchId: response.matchId,
      team1: this.convertBasicPlayersToPlayerInfo(team1Players),
      team2: this.convertBasicPlayersToPlayerInfo(team2Players),
      status: 'in_progress',
      startedAt: new Date(),
      estimatedDuration: 1800
    };

    // ✅ ATUALIZAR: Estado local
    this.gameData = gameData;
    this.inGamePhase = true;
    this.inDraftPhase = false;
    this.showMatchFound = false;
    this.isInQueue = false;
    this.lastMatchId = response.matchId;

    console.log('✅ [App] Game in progress processado via polling:', {
      matchId: response.matchId,
      team1Count: gameData.team1.length,
      team2Count: gameData.team2.length
    });

    this.addNotification('success', 'Jogo Iniciado!', 'A partida começou.');
  }

  // ✅ NOVO: Processar status 'none' detectado via polling
  private async handleNoStatusFromPolling(): Promise<void> {
    console.log('🔄 [App] Status "none" detectado via polling');

    // ✅ VERIFICAR: Se estamos em algum estado que deveria ser limpo
    if (this.showMatchFound || this.inDraftPhase || this.inGamePhase) {
      console.log('🔄 [App] Estados ativos detectados, verificando se devem ser limpos...');

      // ✅ PROTEÇÃO: Aguardar um pouco antes de limpar para dar tempo ao WebSocket
      // Se estamos em draft, dar mais tempo para sincronização
      const shouldWait = this.inDraftPhase;
      if (shouldWait) {
        console.log('🔄 [App] Aguardando 5 segundos antes de limpar estado do draft...');
        await new Promise(resolve => setTimeout(resolve, 5000));

        // Verificar novamente se ainda não temos status
        try {
          const currentPlayer = this.currentPlayer?.displayName || this.currentPlayer?.summonerName;
          if (currentPlayer) {
            const response = await this.apiService.checkSyncStatus(currentPlayer).toPromise();
            if (response && response.status !== 'none') {
              console.log('🔄 [App] Status recuperado durante espera, não limpando estado');
              return;
            }
          }
        } catch (error) {
          console.log('🔄 [App] Erro ao verificar status durante espera:', error);
        }
      }

      console.log('🔄 [App] Limpando estados ativos...');

      // ✅ LIMPAR: Estados ativos
      this.showMatchFound = false;
      this.inDraftPhase = false;
      this.inGamePhase = false;
      this.matchFoundData = null;
      this.draftData = null;
      this.gameData = null;
      this.lastMatchId = null;

      // ✅ VOLTAR: Para fila se não estiver
      if (!this.isInQueue) {
        this.isInQueue = true;
        console.log('🔄 [App] Voltando para fila');
      }
    }
  }
}
