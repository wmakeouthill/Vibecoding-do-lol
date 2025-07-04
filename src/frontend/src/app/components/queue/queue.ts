import { Component, Input, Output, EventEmitter, OnInit, OnDestroy, OnChanges, ChangeDetectorRef, NgZone, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { Player, QueueStatus, QueuePreferences } from '../../interfaces';
import { DiscordIntegrationService } from '../../services/discord-integration.service';
import { QueueStateService } from '../../services/queue-state';
import { LaneSelectorComponent } from '../lane-selector/lane-selector';
import { ApiService } from '../../services/api';
import { ProfileIconService } from '../../services/profile-icon.service';

@Component({
  selector: 'app-queue',
  imports: [CommonModule, FormsModule, LaneSelectorComponent],
  templateUrl: './queue.html',
  styleUrl: './queue.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class QueueComponent implements OnInit, OnDestroy, OnChanges {
  // =============================================================================
  // INPUTS & OUTPUTS
  // =============================================================================
  @Input() isInQueue: boolean = false;
  @Input() queueStatus: QueueStatus = {
    playersInQueue: 0,
    averageWaitTime: 0,
    estimatedMatchTime: 0,
    isActive: true
  };
  @Input() currentPlayer: Player | null = null;
  @Output() joinQueue = new EventEmitter<QueuePreferences>();
  @Output() leaveQueue = new EventEmitter<void>();
  @Output() joinDiscordQueueWithFullData = new EventEmitter<{player: Player | null, preferences: QueuePreferences}>();
  @Output() refreshData = new EventEmitter<void>();
  @Output() autoRefreshToggle = new EventEmitter<boolean>();

  // =============================================================================
  // COMPONENT STATE
  // =============================================================================
  // Timer (gerenciado pelo backend, mas exibido localmente)
  queueTimer = 0;
  private timerInterval?: number;

  // Lane selector
  showLaneSelector = false;
  queuePreferences: QueuePreferences = {
    primaryLane: '',
    secondaryLane: '',
    autoAccept: false
  };

  // Discord Integration (dados vindos do backend)
  isDiscordConnected = false;
  discordUsersOnline: any[] = [];

  // UI state
  activeTab: 'queue' | 'lobby' | 'all' = 'all';
  isRefreshing = false;
  autoRefreshEnabled = false;

  // Auto-refresh (controlado pelo QueueStateService)
  private autoRefreshInterval?: number;
  private readonly AUTO_REFRESH_INTERVAL_MS = 2000;

  // Cleanup
  private destroy$ = new Subject<void>();

  // ✅ NOVO: Timer para atualizar tempos dos jogadores na fila
  private playersTimeInterval?: number;

  constructor(
    public discordService: DiscordIntegrationService,
    private queueStateService: QueueStateService,
    private apiService: ApiService,
    private profileIconService: ProfileIconService,
    private cdr: ChangeDetectorRef,
    private ngZone: NgZone
  ) {}

  // =============================================================================
  // LIFECYCLE METHODS
  // =============================================================================
  ngOnInit(): void {
    console.log('🎯 [Queue] Componente inicializado');
    
    this.setupDiscordListeners();
    this.setupQueueStateListener();
    this.autoRefreshToggle.emit(this.autoRefreshEnabled);
    
    // ✅ NOVO: Fazer refresh inicial SEMPRE que entrar no componente
    console.log('🔄 [Queue] Fazendo refresh inicial do estado da fila...');
    this.refreshData.emit();
    
    if (this.isInQueue) {
      this.startQueueTimer();
    }
    
    // ✅ NOVO: Iniciar timer para atualizar tempos dos jogadores na fila
    this.startPlayersTimeUpdate();
  }

  ngOnDestroy(): void {
    console.log('🛑 [Queue] Componente destruído');
    
    this.destroy$.next();
    this.destroy$.complete();
    this.cleanup();
    
    console.log('✅ [Queue] Cleanup completo');
  }

  ngOnChanges(changes: any): void {
    if (changes.currentPlayer?.currentValue) {
      this.handleCurrentPlayerChange(changes.currentPlayer.currentValue);
    }

    if (changes.queueStatus?.currentValue) {
      console.log('🔄 [Queue] QueueStatus atualizado');
      this.cdr.detectChanges();
    }
    
    // ✅ NOVO: Debug do estado isInQueue
    if (changes.isInQueue) {
      console.log(`🎯 [Queue] Estado isInQueue mudou: ${changes.isInQueue.previousValue} → ${changes.isInQueue.currentValue}`);
      console.log(`🎯 [Queue] Estado atual do componente:`, {
        isInQueue: this.isInQueue,
        currentPlayerDisplayName: this.currentPlayer?.displayName,
        queuePlayersCount: this.queueStatus?.playersInQueue || 0
      });
      this.cdr.detectChanges();
    }
  }

  private handleCurrentPlayerChange(newPlayer: Player): void {
    console.log('🔄 [Queue] CurrentPlayer atualizado');
    this.queueStateService.updateCurrentPlayer(newPlayer);
    
    if (this.autoRefreshEnabled) {
      this.queueStateService.startPolling();
    }
    
    // Enviar dados LCU para Discord (backend gerencia a vinculação)
    if (newPlayer?.displayName) {
      console.log('🎮 [Queue] Enviando dados do LCU para identificação Discord...');
      // Enviar displayName diretamente - o backend vai processar
      this.discordService.sendLCUData({
        displayName: newPlayer.displayName
      });
    }
    
    this.cdr.detectChanges();
  }

  private cleanup(): void {
    this.queueStateService.stopMySQLSync();
    this.stopAutoRefresh();
    this.stopQueueTimer();
    this.stopPlayersTimeUpdate();
  }

  // =============================================================================
  // SETUP METHODS
  // =============================================================================
  private setupQueueStateListener(): void {
    this.queueStateService.getQueueState().pipe(
      takeUntil(this.destroy$)
    ).subscribe(state => {
      console.log('🔄 [Queue] Estado da fila atualizado via backend:', state);
      
      this.isInQueue = state.isInQueue;
      
      if (state.isInQueue && !this.timerInterval) {
        this.startQueueTimer();
      } else if (!state.isInQueue) {
        this.stopQueueTimer();
        this.queueTimer = 0;
      }
      
      this.cdr.detectChanges();
    });
  }

  private setupDiscordListeners(): void {
    console.log('🔗 [Queue] Configurando listeners Discord...');
    
    this.discordService.onConnectionChange().pipe(
      takeUntil(this.destroy$)
    ).subscribe(connected => {
      if (this.isDiscordConnected !== connected) {
        this.isDiscordConnected = connected;
        console.log(`🔗 [Queue] Discord connection: ${connected}`);
        this.cdr.detectChanges();
      }
    });

    this.discordService.onUsersUpdate().pipe(
      takeUntil(this.destroy$)
    ).subscribe(users => {
      if (JSON.stringify(this.discordUsersOnline) !== JSON.stringify(users)) {
        this.discordUsersOnline = users;
        console.log(`👥 [Queue] Discord users: ${users.length}`);
        this.cdr.detectChanges();
      }
    });

    this.discordService.checkConnection();
  }

  // =============================================================================
  // AUTO-REFRESH METHODS (simplificados - backend gerencia a sincronização)
  // =============================================================================
  onAutoRefreshChange(): void {
    console.log(`🔄 [Queue] Auto-refresh ${this.autoRefreshEnabled ? 'habilitado' : 'desabilitado'}`);
    
    this.autoRefreshToggle.emit(this.autoRefreshEnabled);
    
    if (this.autoRefreshEnabled) {
      if (this.currentPlayer && this.currentPlayer.displayName) {
        this.queueStateService.updateCurrentPlayer(this.currentPlayer);
        this.queueStateService.startPolling();
      }
      this.startAutoRefresh();
    } else {
      this.queueStateService.stopMySQLSync();
      this.stopAutoRefresh();
    }
  }

  private startAutoRefresh(): void {
    if (this.autoRefreshInterval) {
      clearInterval(this.autoRefreshInterval);
    }

    console.log('🔄 [Queue] Auto-refresh iniciado');
    this.autoRefreshInterval = setInterval(() => {
      if (this.autoRefreshEnabled && !this.isRefreshing) {
        this.refreshData.emit();
      }
    }, this.AUTO_REFRESH_INTERVAL_MS);
  }

  private stopAutoRefresh(): void {
    if (this.autoRefreshInterval) {
      clearInterval(this.autoRefreshInterval);
      this.autoRefreshInterval = undefined;
      console.log('🛑 [Queue] Auto-refresh parado');
    }
  }

  refreshQueueData(): void {
    if (this.isRefreshing) return;
    
    this.isRefreshing = true;
    console.log('🔄 [Queue] Refresh manual solicitado');
    this.refreshData.emit();
    
    setTimeout(() => {
      this.isRefreshing = false;
      this.cdr.detectChanges();
    }, 1000);
  }

  // Método chamado pelo template (compatibilidade)
  refreshPlayersData(): void {
    console.log('🔄 [Queue] refreshPlayersData chamado - forçando atualização completa');
    console.log('🔄 [Queue] Estado atual:', {
      isInQueue: this.isInQueue,
      currentPlayer: this.currentPlayer?.displayName,
      playersInQueue: this.queueStatus?.playersInQueue
    });
    
    this.isRefreshing = true;
    
    // ✅ NOVO: Emitir evento para o componente pai atualizar o estado da fila
    console.log('🔄 [Queue] Solicitando atualização completa do estado da fila ao componente pai...');
    this.refreshData.emit();
    
    // ✅ NOVO: Forçar atualização do QueueStateService
    if (this.currentPlayer?.displayName) {
      console.log('🔄 [Queue] Atualizando QueueStateService com jogador atual...');
      this.queueStateService.updateCurrentPlayer(this.currentPlayer);
      this.queueStateService.forceSync();
    }
    
    // ✅ NOVO: Forçar detecção de mudanças imediatamente
    this.cdr.detectChanges();
    
    // Parar refresh após 2 segundos
    setTimeout(() => {
      this.isRefreshing = false;
      this.cdr.detectChanges();
      console.log('✅ [Queue] Refresh completo');
    }, 2000);
  }

  // =============================================================================
  // TIMER METHODS (UI apenas - backend gerencia tempo real na fila)
  // =============================================================================
  private startQueueTimer(): void {
    this.stopQueueTimer();
    
    console.log('⏱️ [Queue] Iniciando timer da fila');
    this.timerInterval = this.ngZone.runOutsideAngular(() => {
      return window.setInterval(() => {
        this.ngZone.run(() => {
          this.queueTimer++;
          this.cdr.detectChanges();
        });
      }, 1000);
    });
  }

  private stopQueueTimer(): void {
    if (this.timerInterval) {
      console.log('⏱️ [Queue] Parando timer da fila');
      clearInterval(this.timerInterval);
      this.timerInterval = undefined;
    }
  }

  getTimerDisplay(): string {
    const minutes = Math.floor(this.queueTimer / 60);
    const seconds = this.queueTimer % 60;
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  }

  // =============================================================================
  // QUEUE ACTIONS (backend gerencia a lógica da fila)
  // =============================================================================
  onJoinQueue(): void {
    if (!this.queueStatus.isActive) return;
    console.log('🎮 [Queue] Abrindo seletor de lanes...');
    this.showLaneSelector = true;
  }

  // Métodos Discord chamados pelo template
  onJoinDiscordQueue(): void {
    console.log('🔍 [Queue] Entrada Discord solicitada');
    console.log('🔍 [Queue] Estado atual antes da entrada:', {
      isInQueue: this.isInQueue,
      currentPlayer: this.currentPlayer?.displayName,
      isDiscordConnected: this.isDiscordConnected
    });
    this.showLaneSelector = true;
  }

  onLeaveDiscordQueue(): void {
    console.log('🔍 [Queue] Saída Discord solicitada');
    this.onLeaveQueue();
  }

  onConfirmDiscordQueue(preferences: QueuePreferences): void {
    console.log('✅ [Queue] Confirmação Discord recebida');
    this.onConfirmJoinQueue(preferences);
  }

  onConfirmJoinQueue(preferences: QueuePreferences): void {
    console.log('✅ [Queue] Confirmando entrada na fila');
    console.log('✅ [Queue] Estado atual na confirmação:', {
      isInQueue: this.isInQueue,
      currentPlayer: this.currentPlayer?.displayName,
      preferences: preferences
    });
    
    this.queuePreferences = preferences;
    this.showLaneSelector = false;
    
    // Validações básicas (backend fará validações completas)
    if (!this.currentPlayer?.displayName) {
      alert('Erro: Dados do Riot ID não disponíveis. Certifique-se de que o League of Legends está aberto.');
      return;
    }

    if (!this.isDiscordConnected) {
      alert('Erro: Discord não conectado. Verifique a conexão.');
      return;
    }

    // Backend gerenciará todas as validações de vinculação e fila
    console.log('✅ [Queue] Delegando entrada na fila para o backend');
    this.joinDiscordQueueWithFullData.emit({
      player: this.currentPlayer,
      preferences: preferences
    });
    
    this.queueTimer = 0;
    this.startQueueTimer();
    
    console.log('✅ [Queue] Emissão de entrada na fila concluída');
  }

  onCloseLaneSelector(): void {
    this.showLaneSelector = false;
  }

  onLeaveQueue(): void {
    console.log('🔍 [Queue] Saindo da fila');
    this.leaveQueue.emit();
    this.stopQueueTimer();
    this.queueTimer = 0;
  }

  // =============================================================================
  // DISPLAY UTILITIES (funções puras para UI)
  // =============================================================================
  getEstimatedTimeText(): string {
    if (!this.queueStatus.estimatedMatchTime) return 'Calculando...';

    const minutes = Math.floor(this.queueStatus.estimatedMatchTime / 60);
    const seconds = this.queueStatus.estimatedMatchTime % 60;

    return minutes > 0 ? `~${minutes}m ${seconds}s` : `~${seconds}s`;
  }

  getQueueHealthColor(): string {
    if (!this.queueStatus.isActive) return '#ff4444';
    if (this.queueStatus.playersInQueue >= 10) return '#44ff44';
    if (this.queueStatus.playersInQueue >= 5) return '#ffaa44';
    return '#ff8844';
  }

  getLaneName(laneId: string): string {
    const lanes: { [key: string]: string } = {
      'top': 'Topo',
      'jungle': 'Selva', 
      'mid': 'Meio',
      'bot': 'Atirador',
      'adc': 'Atirador',
      'support': 'Suporte',
      'fill': 'Qualquer'
    };
    return lanes[laneId] || 'Qualquer';
  }

  getLaneIcon(laneId: string): string {
    const icons: { [key: string]: string } = {
      'top': '⚔️',
      'jungle': '🌲',
      'mid': '⭐', 
      'bot': '🏹',
      'adc': '🏹',
      'support': '🛡️',
      'fill': '🎲'
    };
    return icons[laneId] || '🎲';
  }

  getPlayerRankDisplay(): string {
    return this.currentPlayer?.customLp ? `${this.currentPlayer.customLp} LP` : '0 LP';
  }

  getPlayerTag(): string {
    return this.currentPlayer?.tagLine ? `#${this.currentPlayer.tagLine}` : '';
  }

  getProfileIconUrl(): string {
    console.log('🖼️ [Queue] getProfileIconUrl chamado:', {
      hasCurrentPlayer: !!this.currentPlayer,
      displayName: this.currentPlayer?.displayName,
      gameName: this.currentPlayer?.gameName,
      tagLine: this.currentPlayer?.tagLine,
      profileIconId: this.currentPlayer?.profileIconId
    });
    
    // ✅ PRIORIDADE 1: Se tem profileIconId direto, usar
    if (this.currentPlayer?.profileIconId && Number(this.currentPlayer.profileIconId) > 0) {
      const iconId = Number(this.currentPlayer.profileIconId);
      console.log('🖼️ [Queue] Usando profileIconId direto:', iconId);
      return `https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/v1/profile-icons/${iconId}.jpg`;
    }
    
    // ✅ PRIORIDADE 2: Se tem displayName, tentar buscar do cache
    if (this.currentPlayer?.displayName) {
      const cachedIconId = this.profileIconService.getProfileIconId(
        this.currentPlayer.displayName,
        this.currentPlayer.gameName,
        this.currentPlayer.tagLine
      );
      
      console.log('🖼️ [Queue] Cache check:', {
        displayName: this.currentPlayer.displayName,
        cachedIconId: cachedIconId
      });
      
      if (cachedIconId && cachedIconId > 0) {
        console.log('🖼️ [Queue] Usando ícone do cache:', cachedIconId);
        return `https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/v1/profile-icons/${cachedIconId}.jpg`;
      } else {
        // ✅ BUSCAR AUTOMATICAMENTE se não está no cache
        console.log('🖼️ [Queue] Ícone não encontrado no cache, buscando do servidor...');
        this.profileIconService.fetchProfileIcon(
          this.currentPlayer.displayName,
          this.currentPlayer.gameName,
          this.currentPlayer.tagLine
        ).then((iconId: number | null) => {
          console.log('🖼️ [Queue] Ícone obtido do servidor:', iconId);
          this.cdr.detectChanges(); // Forçar atualização da UI
        }).catch((error: any) => {
          console.warn('⚠️ [Queue] Erro ao buscar ícone do servidor:', error);
        });
        
        // ✅ RETORNAR ÍCONE PADRÃO enquanto busca
        return `https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/v1/profile-icons/29.jpg`;
      }
    }
    
    // ✅ FALLBACK: Ícone padrão
    console.log('🖼️ [Queue] Usando ícone padrão (fallback)');
    return `https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/v1/profile-icons/29.jpg`;
  }

  onProfileIconError(event: Event): void {
    const target = event.target as HTMLImageElement;
    if (!target) return;

    // ✅ CORRIGIDO: Usar o método do ProfileIconService para fallbacks
    const profileIconId = this.currentPlayer?.profileIconId ? Number(this.currentPlayer.profileIconId) : undefined;
    this.profileIconService.onProfileIconError(event, profileIconId);
  }

  // =============================================================================
  // TABLE UTILITIES
  // =============================================================================
  setActiveTab(tab: 'queue' | 'lobby' | 'all'): void {
    this.activeTab = tab;
    this.cdr.detectChanges();
  }

  trackByPlayerId(index: number, player: any): string {
    return player?.id?.toString() || index.toString();
  }

  trackByDiscordUserId(index: number, user: any): string {
    return user?.id?.toString() || index.toString();
  }

  isCurrentPlayer(player: any): boolean {
    return player?.isCurrentPlayer || false;
  }

  getTimeInQueue(player: any): string {
    if (!player?.joinTime) {
      return '0s';
    }
    
    try {
      // ✅ CORRIGIDO: Calcular tempo real baseado no joinTime
      const joinTime = new Date(player.joinTime);
      const now = new Date();
      const diffMs = now.getTime() - joinTime.getTime();
      
      if (diffMs < 0) {
        return '0s';
      }
      
      const diffSeconds = Math.floor(diffMs / 1000);
      const minutes = Math.floor(diffSeconds / 60);
      const seconds = diffSeconds % 60;
      
      if (minutes > 0) {
        return `${minutes}m ${seconds}s`;
      } else {
        return `${seconds}s`;
      }
    } catch (error) {
      console.warn('⚠️ [Queue] Erro ao calcular tempo na fila:', error);
      return '0s';
    }
  }

  isUserInQueue(user: any): boolean {
    return user.isInQueue || false;
  }

  // =============================================================================
  // DISCORD UTILITIES (backend gerencia vinculação)
  // =============================================================================
  hasLinkedNickname(user: any): boolean {
    // Verificar se tem linkedNickname (string ou objeto)
    if (user?.linkedNickname) {
      if (typeof user.linkedNickname === 'string') {
        return true;
      }
      if (typeof user.linkedNickname === 'object' && 
          user.linkedNickname.gameName && 
          user.linkedNickname.tagLine) {
        return true;
      }
    }
    
    // Verificar novo formato linkedDisplayName
    if (user?.linkedDisplayName && typeof user.linkedDisplayName === 'string') {
      return true;
    }
    
    return false;
  }

  getLinkedNickname(user: any): string {
    if (!user?.linkedNickname) {
      return '';
    }

    // Se for string (displayName direto), retornar
    if (typeof user.linkedNickname === 'string') {
      return user.linkedNickname;
    }

    // Se for objeto com {gameName, tagLine}, montar displayName
    if (typeof user.linkedNickname === 'object' && 
        user.linkedNickname.gameName && 
        user.linkedNickname.tagLine) {
      return `${user.linkedNickname.gameName}#${user.linkedNickname.tagLine}`;
    }

    // Verificar se tem linkedDisplayName (novo formato)
    if (user.linkedDisplayName && typeof user.linkedDisplayName === 'string') {
      return user.linkedDisplayName;
    }

    // Fallback para casos inesperados
    console.warn('⚠️ [Queue] linkedNickname em formato inesperado:', user.linkedNickname);
    return '[Vinculado]';
  }

  // Métodos simplificados - backend gerencia convites e vinculação
  inviteToLink(user: any): void {
    console.log('🔗 [Queue] Use !vincular no Discord:', user.username);
  }

  inviteToQueue(user: any): void {
    console.log('📝 [Queue] Backend gerencia convites:', user.username);
  }

  // ✅ NOVO: Iniciar timer para atualizar tempos dos jogadores na fila
  private startPlayersTimeUpdate(): void {
    // Atualizar a cada 1 segundo para mostrar tempos em tempo real
    this.playersTimeInterval = setInterval(() => {
      // Forçar detecção de mudanças para atualizar os tempos exibidos
      this.cdr.detectChanges();
    }, 1000);
    
    console.log('🔄 [Queue] Timer de atualização de tempos dos jogadores iniciado');
  }

  // ✅ NOVO: Parar timer de atualização de tempos
  private stopPlayersTimeUpdate(): void {
    if (this.playersTimeInterval) {
      clearInterval(this.playersTimeInterval);
      this.playersTimeInterval = undefined;
      console.log('🛑 [Queue] Timer de atualização de tempos dos jogadores parado');
    }
  }
} 