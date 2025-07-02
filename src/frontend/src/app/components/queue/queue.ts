import { Component, Input, Output, EventEmitter, OnInit, OnDestroy, OnChanges, ChangeDetectorRef, NgZone, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
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

  queueTimer = 0;
  private timerInterval?: number;

  // Lane selector
  showLaneSelector = false;
  queuePreferences: QueuePreferences = {
    primaryLane: '',
    secondaryLane: '',
    autoAccept: false
  };

  // Discord Integration
  discordQueue: any[] = [];
  isDiscordConnected = false;
  currentDiscordUser: any = null;
  showDiscordMode = false;
  discordUsersOnline: any[] = [];
  isInDiscordChannel = false;

  // Players table
  activeTab: 'queue' | 'lobby' | 'all' = 'all';
  isRefreshing = false;
  autoRefreshEnabled = false;

  // Auto-refresh
  private autoRefreshInterval?: number;
  private readonly AUTO_REFRESH_INTERVAL_MS = 2000; // 2 segundos

  constructor(
    public discordService: DiscordIntegrationService,
    private queueStateService: QueueStateService,
    private apiService: ApiService,
    private profileIconService: ProfileIconService,
    private cdr: ChangeDetectorRef,
    private ngZone: NgZone
  ) {}

  ngOnInit(): void {
    console.log('🎯 [Queue] Componente inicializado (Frontend Interface Only)');
    
    // Configurar listeners do Discord
    this.setupDiscordListeners();
    
    // Configurar listener do estado da fila (sem polling automático)
    this.setupQueueStateListener();
    
    // Verificar conexão inicial do Discord
    this.checkDiscordConnection();
    
    // Iniciar timer se estiver na fila
    if (this.isInQueue) {
      this.startQueueTimer();
    }

    // Configurar listener para auto-refresh
    this.setupAutoRefreshControl();
  }

  ngOnDestroy(): void {
    console.log('🛑 [Queue] Componente destruído');
    
    // Parar sincronização MySQL
    this.queueStateService.stopMySQLSync();
    
    // Parar auto-refresh
    this.stopAutoRefresh();
    
    // Parar timer
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
    }
  }

  ngOnChanges(changes: any): void {
    if (changes.currentPlayer && changes.currentPlayer.currentValue) {
      console.log('🔄 [Queue] CurrentPlayer atualizado');
      this.queueStateService.updateCurrentPlayer(changes.currentPlayer.currentValue);
      
      // Só iniciar sincronização se auto-refresh estiver habilitado
      if (this.autoRefreshEnabled) {
        this.queueStateService.startMySQLSync(changes.currentPlayer.currentValue);
      }
      
      // Enviar dados do LCU para identificação automática do usuário Discord
      if (this.currentPlayer && this.currentPlayer.gameName && this.currentPlayer.tagLine) {
        console.log('🎮 [Queue] Enviando dados do LCU para identificação Discord...');
        this.discordService.sendLCUData({
          gameName: this.currentPlayer.gameName,
          tagLine: this.currentPlayer.tagLine
        });
      }
      
      // Tentar identificar o usuário Discord quando o currentPlayer for atualizado
      if (this.discordUsersOnline.length > 0) {
        this.tryIdentifyCurrentDiscordUser();
      }
      
      this.cdr.detectChanges();
    }

    // Backend processa automaticamente quando há 10 jogadores
    if (changes.queueStatus && changes.queueStatus.currentValue) {
      console.log('🔄 [Queue] QueueStatus atualizado - Backend processa matchmaking automaticamente');
      this.cdr.detectChanges();
    }
  }

  // Configurar controle de auto-refresh
  private setupAutoRefreshControl(): void {
    // Fazer refresh inicial manual
    this.refreshPlayersData();
    
    // Buscar profile icon do backend se necessário
    this.fetchProfileIconFromBackend();
  }

  // Iniciar auto-refresh
  private startAutoRefresh(): void {
    if (this.autoRefreshInterval) {
      clearInterval(this.autoRefreshInterval);
    }

    console.log('🔄 [Queue] Auto-refresh iniciado a cada 2 segundos');
    
    this.autoRefreshInterval = setInterval(() => {
      if (this.autoRefreshEnabled && !this.isRefreshing) {
        console.log('🔄 [Queue] Auto-refresh executando...');
        this.refreshPlayersData();
      }
    }, this.AUTO_REFRESH_INTERVAL_MS);
  }

  // Parar auto-refresh
  private stopAutoRefresh(): void {
    if (this.autoRefreshInterval) {
      clearInterval(this.autoRefreshInterval);
      this.autoRefreshInterval = undefined;
      console.log('🛑 [Queue] Auto-refresh parado');
    }
  }

  // Listener para mudanças no auto-refresh
  onAutoRefreshChange(): void {
    console.log(`🔄 [Queue] Auto-refresh ${this.autoRefreshEnabled ? 'habilitado' : 'desabilitado'}`);
    
    if (this.autoRefreshEnabled) {
      // Iniciar sincronização MySQL e polling
      if (this.currentPlayer) {
        this.queueStateService.updateCurrentPlayer(this.currentPlayer);
        this.queueStateService.startPolling();
      }
      this.startAutoRefresh();
    } else {
      // Parar sincronização MySQL e auto-refresh
      this.queueStateService.stopMySQLSync();
      this.stopAutoRefresh();
    }
  }

  // Configurar listener do estado da fila
  private setupQueueStateListener(): void {
    this.queueStateService.getQueueState().subscribe(state => {
      console.log('🔄 [Queue] Estado da fila atualizado via MySQL:', state);
      
      // SEMPRE atualizar estado local baseado na sincronização MySQL
      this.isInQueue = state.isInQueue;
      
      // Atualizar timer se necessário
      if (state.isInQueue && !this.timerInterval) {
        this.startQueueTimer();
      } else if (!state.isInQueue && this.timerInterval) {
        this.stopQueueTimer();
        this.queueTimer = 0;
      }
    });
  }

  /**
   * ENTRADA NA FILA - Sempre usar Discord
   */
  onJoinQueue() {
    if (!this.queueStatus.isActive) return;
    
    // Como só existe fila Discord, sempre usar onJoinDiscordQueue
    this.onJoinDiscordQueue();
  }

  onConfirmJoinQueue(preferences: QueuePreferences) {
    this.queuePreferences = preferences;
    this.showLaneSelector = false;
    this.joinQueue.emit(preferences);
    this.queueTimer = 0;
    this.startQueueTimer();
  }

  onCloseLaneSelector() {
    this.showLaneSelector = false;
  }

  /**
   * SAÍDA DA FILA - Remove linha da tabela queue_players
   */
  onLeaveQueue() {
    console.log('🔍 [Queue] Sair da fila solicitado');
    this.leaveQueue.emit();
    this.stopQueueTimer();
    this.queueTimer = 0;
  }

  private startQueueTimer() {
    // Parar timer existente antes de iniciar novo
    this.stopQueueTimer();
    
    console.log('⏱️ [Queue] Iniciando timer da fila');
    this.timerInterval = this.ngZone.runOutsideAngular(() => {
      return window.setInterval(() => {
        this.ngZone.run(() => {
          this.queueTimer++;
          // Log a cada minuto para debug
          if (this.queueTimer % 60 === 0) {
            console.log(`⏱️ [Queue] Timer: ${this.getTimerDisplay()}`);
          }
          this.cdr.detectChanges();
        });
      }, 1000);
    });
  }

  private stopQueueTimer() {
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

  getEstimatedTimeText(): string {
    if (!this.queueStatus.estimatedMatchTime || this.queueStatus.estimatedMatchTime === 0) return 'Calculando...';

    const minutes = Math.floor(this.queueStatus.estimatedMatchTime / 60);
    const seconds = this.queueStatus.estimatedMatchTime % 60;

    if (minutes > 0) {
      return `~${minutes}m ${seconds}s`;
    }
    return `~${seconds}s`;
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

  onProfileIconError(event: Event): void {
    console.warn('❌ [Queue] Erro ao carregar ícone de perfil, usando placeholder');
    (event.target as HTMLImageElement).src = '/assets/images/champion-placeholder.svg';
  }

  getProfileIconUrl(): string {
    if (this.currentPlayer?.profileIconId && Number(this.currentPlayer.profileIconId) > 0) {
      return this.profileIconService.getProfileIconUrl(String(this.currentPlayer.profileIconId));
    }
    return '/assets/images/champion-placeholder.svg';
  }

  async fetchProfileIconFromBackend(): Promise<void> {
    if (!this.currentPlayer?.summonerName) {
      console.warn('⚠️ [Queue] Não é possível buscar ícone de perfil sem summonerName');
      return;
    }

    try {
      console.log('🎮 [Queue] Buscando dados do jogador do backend...');
      
      this.apiService.getCurrentPlayerDetails().subscribe({
        next: (response: any) => {
          if (response.profileIconId && this.currentPlayer) {
            console.log('✅ [Queue] Ícone de perfil atualizado:', response.profileIconId);
            this.currentPlayer.profileIconId = response.profileIconId;
            this.cdr.detectChanges();
          }
        },
        error: (error: any) => {
          console.warn('⚠️ [Queue] Erro ao buscar dados do jogador do backend:', error);
        }
      });
    } catch (error) {
      console.error('❌ [Queue] Erro ao buscar dados do jogador:', error);
    }
  }

  getLaneDisplayName(laneId: string): string {
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

  // ✅ MANTIDO: Discord Integration (Interface)
  private setupDiscordListeners() {
    // Discord connection status
    setInterval(() => {
      const connected = this.discordService.isConnected();
      if (this.isDiscordConnected !== connected) {
        this.isDiscordConnected = connected;
        console.log(`🔗 [Queue] Discord connection status: ${connected}`);
        this.cdr.detectChanges();
      }
    }, 2000);

    // Discord users online
    setInterval(() => {
      const users = this.discordService.getDiscordUsersOnline();
      if (JSON.stringify(this.discordUsersOnline) !== JSON.stringify(users)) {
        this.discordUsersOnline = users;
        console.log(`👥 [Queue] Discord users online: ${users.length}`);
        
        // Tentar identificar o usuário atual quando a lista for atualizada
        this.tryIdentifyCurrentDiscordUser();
        
        this.cdr.detectChanges();
      }
    }, 3000);

    // Current Discord user
    setInterval(() => {
      const user = this.discordService.getCurrentDiscordUser();
      if (JSON.stringify(this.currentDiscordUser) !== JSON.stringify(user)) {
        this.currentDiscordUser = user;
        console.log('👤 [Queue] Current Discord user updated:', user);
        this.cdr.detectChanges();
      }
    }, 2000);
  }

  private checkDiscordConnection() {
    this.discordService.checkConnection();
  }

  private tryIdentifyCurrentDiscordUser() {
    if (!this.currentPlayer || !this.currentPlayer.gameName || !this.currentPlayer.tagLine) {
      console.log('⚠️ [Queue] Não é possível identificar usuário Discord: dados do LCU incompletos');
      return;
    }

    const expectedRiotId = `${this.currentPlayer.gameName}#${this.currentPlayer.tagLine}`;
    console.log('🔍 [Queue] Procurando usuário Discord com Riot ID:', expectedRiotId);

    const matchingUser = this.discordUsersOnline.find(user => {
      const userRiotId = user.riotId || user.riot_id;
      const matches = userRiotId === expectedRiotId;
      if (matches) {
        console.log('✅ [Queue] Usuário Discord encontrado:', user);
      }
      return matches;
    });

    if (matchingUser && !this.currentDiscordUser) {
      console.log('🎯 [Queue] Identificando usuário Discord automaticamente:', matchingUser);
      // Atualizar localmente (sem método updateCurrentDiscordUser)
      this.currentDiscordUser = matchingUser;
    } else if (!matchingUser) {
      console.log('❌ [Queue] Usuário Discord não encontrado para Riot ID:', expectedRiotId);
      console.log('📋 [Queue] Usuários disponíveis:', this.discordUsersOnline.map(u => ({
        name: u.displayName || u.username,
        riotId: u.riotId || u.riot_id
      })));
    }
  }

  onJoinDiscordQueue() {
    if (!this.queueStatus.isActive) {
      console.warn('⚠️ [Queue] Fila não está ativa');
      return;
    }

    console.log('🎮 [Queue] Tentando entrar na fila Discord...');

    // Verificar se o Discord está conectado
    if (!this.isDiscordConnected) {
      alert('❌ Discord não está conectado. Conecte-se ao Discord primeiro.');
      return;
    }

    // Verificar se há um usuário Discord identificado
    if (!this.currentDiscordUser) {
      console.warn('⚠️ [Queue] Usuário Discord não identificado');
      this.performDiscordValidation();
      return;
    }

    // Verificar se o usuário tem Riot ID vinculado
    const userRiotId = this.currentDiscordUser.riotId || this.currentDiscordUser.riot_id;
    if (!userRiotId) {
      alert('❌ Sua conta Discord não está vinculada ao League of Legends. Use o comando !vincular no Discord.');
      return;
    }

    // Verificar se o Riot ID confere com o jogador atual
    const expectedRiotId = this.currentPlayer ? `${this.currentPlayer.gameName}#${this.currentPlayer.tagLine}` : '';
    if (userRiotId !== expectedRiotId) {
      alert(`❌ Discordância de contas:\n- Discord: ${userRiotId}\n- LoL: ${expectedRiotId}\n\nUse o comando !desvincular e !vincular no Discord.`);
      return;
    }

    console.log('✅ [Queue] Validação Discord passou, abrindo seletor de lanes...');
    this.showLaneSelector = true;
  }

  private performDiscordValidation() {
    console.log('🔍 [Queue] Realizando validação Discord...');

    if (!this.currentPlayer || !this.currentPlayer.gameName || !this.currentPlayer.tagLine) {
      alert('❌ Dados do jogador incompletos. Reinicie o cliente LoL.');
      return;
    }

    const expectedRiotId = `${this.currentPlayer.gameName}#${this.currentPlayer.tagLine}`;
    console.log('🔍 [Queue] Procurando usuário Discord com Riot ID:', expectedRiotId);

    // Procurar usuário Discord baseado no Riot ID
    const matchingUser = this.discordUsersOnline.find(user => {
      const userRiotId = user.riotId || user.riot_id;
      return userRiotId === expectedRiotId;
    });

    if (matchingUser) {
      console.log('✅ [Queue] Usuário Discord encontrado:', matchingUser);
      // Atualizar localmente (sem método updateCurrentDiscordUser)
      this.currentDiscordUser = matchingUser;
      
      // Tentar novamente
      this.onJoinDiscordQueue();
    } else {
      console.log('❌ [Queue] Usuário Discord não encontrado');
      
      const availableUsers = this.discordUsersOnline
        .filter(u => u.riotId || u.riot_id)
        .map(u => `${u.displayName || u.username}: ${u.riotId || u.riot_id}`)
        .join('\n');

      alert(`❌ Conta Discord não encontrada ou não vinculada.\n\nSua conta LoL: ${expectedRiotId}\n\nContas Discord vinculadas:\n${availableUsers || 'Nenhuma'}\n\nUse o comando !vincular no Discord.`);
    }
  }

  onConfirmDiscordQueue(preferences: QueuePreferences) {
    console.log('✅ [Queue] Confirmando entrada na fila Discord com preferências:', preferences);
    
    if (!this.currentPlayer || !this.currentDiscordUser) {
      console.error('❌ [Queue] Dados incompletos para entrar na fila Discord');
      return;
    }

    this.queuePreferences = preferences;
    this.showLaneSelector = false;
    
    // Emitir evento com dados completos
    this.joinDiscordQueueWithFullData.emit({
      player: this.currentPlayer,
      preferences: preferences
    });
    
    this.queueTimer = 0;
    this.startQueueTimer();
  }

  onLeaveDiscordQueue() {
    console.log('🔍 [Queue] Saindo da fila Discord...');
    this.leaveQueue.emit();
    this.stopQueueTimer();
    this.queueTimer = 0;
  }

  // ✅ MANTIDO: Interface Utilities
  setActiveTab(tab: 'queue' | 'lobby' | 'all'): void {
    this.activeTab = tab;
    console.log(`🔄 [Queue] Tab ativa alterada para: ${tab}`);
    this.cdr.detectChanges();
  }

  refreshPlayersData(): void {
    if (this.isRefreshing) {
      console.log('⏳ [Queue] Refresh já em andamento, ignorando...');
      return;
    }

    this.isRefreshing = true;
    console.log('🔄 [Queue] Atualizando dados dos jogadores...');

    this.refreshData.emit();

    // Reset isRefreshing após um delay
    setTimeout(() => {
      this.isRefreshing = false;
      this.cdr.detectChanges();
    }, 1000);
  }

  refreshQueueData(): void {
    console.log('🔄 [Queue] Refresh manual da fila solicitado');
    this.refreshPlayersData();
  }

  // Track functions for *ngFor performance
  trackByPlayerId(index: number, player: any): string {
    return player?.id?.toString() || index.toString();
  }

  trackByDiscordUserId(index: number, user: any): string {
    return user?.id?.toString() || index.toString();
  }

  isCurrentPlayer(player: any): boolean {
    if (!this.currentPlayer || !player) return false;
    
    // Tentar múltiplas formas de comparação
    if (this.currentPlayer.id && player.id) {
      return this.currentPlayer.id === player.id;
    }
    
    if (this.currentPlayer.summonerName && player.summonerName) {
      return this.currentPlayer.summonerName === player.summonerName;
    }
    
    if (this.currentPlayer.gameName && player.gameName) {
      return this.currentPlayer.gameName === player.gameName;
    }
    
    return false;
  }

  getTimeInQueue(joinTime: Date | string): string {
    if (!joinTime) return '0s';
    
    try {
      const now = new Date();
      const start = new Date(joinTime);
      const diffMs = now.getTime() - start.getTime();
      const diffSeconds = Math.floor(diffMs / 1000);
      
      if (diffSeconds < 60) {
        return `${diffSeconds}s`;
      } else {
        const minutes = Math.floor(diffSeconds / 60);
        const seconds = diffSeconds % 60;
        return `${minutes}m ${seconds}s`;
      }
    } catch (error) {
      console.warn('⚠️ [Queue] Erro ao calcular tempo na fila:', error);
      return '0s';
    }
  }

  isUserInQueue(user: any): boolean {
    const userRiotId = user.riotId || user.riot_id;
    if (!userRiotId) return false;
    
    return this.queueStatus.playersInQueueList?.some(player => 
      player.summonerName === userRiotId || 
      `${player.summonerName}#${player.tagLine}` === userRiotId
    ) || false;
  }

  inviteToLink(user: any): void {
    console.log('🔗 [Queue] Convidando usuário para vincular:', user);
    alert(`Funcionalidade em desenvolvimento: Convidar ${user.displayName || user.username} para vincular conta`);
  }

  inviteToQueue(user: any): void {
    console.log('📝 [Queue] Convidando usuário para a fila:', user);
    alert(`Funcionalidade em desenvolvimento: Convidar ${user.displayName || user.username} para a fila`);
  }

  // Extrair apenas o gameName (sem tagLine)
  private extractGameName(fullName: string): string {
    if (fullName.includes('#')) {
      return fullName.split('#')[0];
    }
    return fullName;
  }
} 