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

  queueTimer = 0;
  private timerInterval?: number;

  // Lane selector
  showLaneSelector = false;
  queuePreferences: QueuePreferences = {
    primaryLane: '',
    secondaryLane: '',
    autoAccept: false
  };

  // Discord Integration - Dados vêm do backend via WebSocket
  isDiscordConnected = false;
  discordUsersOnline: any[] = [];

  // Players table
  activeTab: 'queue' | 'lobby' | 'all' = 'all';
  isRefreshing = false;
  autoRefreshEnabled = false;

  // Auto-refresh
  private autoRefreshInterval?: number;
  private readonly AUTO_REFRESH_INTERVAL_MS = 2000; // 2 segundos

  // ✅ NOVO: Subject para gerenciar limpeza de subscriptions
  private destroy$ = new Subject<void>();

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
    
    // ✅ NOVO: Notificar o app.ts sobre o estado inicial do auto-refresh
    this.autoRefreshToggle.emit(this.autoRefreshEnabled);
    
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
    
    // ✅ Finalizar observables Discord e outros subscriptions
    this.destroy$.next();
    this.destroy$.complete();
    
    // Parar sincronização MySQL
    this.queueStateService.stopMySQLSync();
    
    // Parar auto-refresh
    this.stopAutoRefresh();
    
    // Parar timer
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
    }
    
    console.log('✅ [Queue] Cleanup completo - observables Discord finalizados');
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
      
      // ✅ REMOVIDO: Frontend não faz mais identificação - Backend faz automaticamente
      
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
    // ✅ REMOVIDO: Refresh inicial automático que ignorava configuração do usuário
    // this.refreshPlayersData();
    
    // Buscar profile icon do backend se necessário
    this.fetchProfileIconFromBackend();
    
    console.log('🔄 [Queue] Auto-refresh configurado - aguardando habilitação manual pelo usuário');
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
    
    // ✅ NOVO: Notificar o app.ts sobre a mudança
    this.autoRefreshToggle.emit(this.autoRefreshEnabled);
    
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
    this.queueStateService.getQueueState().pipe(
      takeUntil(this.destroy$)
    ).subscribe(state => {
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

  // ✅ REMOVIDO: getLaneDisplayName() - duplicado de getLaneName()

  // ✅ CORRIGIDO: Discord Integration via WebSocket em tempo real
  private setupDiscordListeners() {
    console.log('🔗 [Queue] Configurando listeners Discord via WebSocket...');
    
    // ✅ Usar observables em tempo real com takeUntil para cleanup automático
    
    // Discord connection status via observable
    this.discordService.onConnectionChange().pipe(
      takeUntil(this.destroy$)
    ).subscribe(connected => {
      if (this.isDiscordConnected !== connected) {
        this.isDiscordConnected = connected;
        console.log(`🔗 [Queue] Discord connection status via WebSocket: ${connected}`);
        this.cdr.detectChanges();
      }
    });

    // Discord users online via observable
    this.discordService.onUsersUpdate().pipe(
      takeUntil(this.destroy$)
    ).subscribe(users => {
      if (JSON.stringify(this.discordUsersOnline) !== JSON.stringify(users)) {
        this.discordUsersOnline = users;
        console.log(`👥 [Queue] Discord users updated via WebSocket: ${users.length}`);
        console.log('👥 [Queue] Usuários Discord recebidos:', users.map(u => ({
          username: u.username,
          displayName: u.displayName,
          hasLinkedNickname: !!u.linkedNickname,
          linkedNickname: u.linkedNickname
        })));
        
        // ✅ REMOVIDO: Backend identifica usuário automaticamente
        
        this.cdr.detectChanges();
      }
    });

    // ✅ Solicitar status inicial UMA VEZ apenas
    console.log('🔍 [Queue] Solicitando status inicial do Discord...');
    this.discordService.checkConnection();
  }

  private checkDiscordConnection() {
    // ✅ Apenas para uso manual/refresh - não em loop
    console.log('🔄 [Queue] Verificação manual da conexão Discord');
    this.discordService.checkConnection();
  }

  // ✅ REMOVIDO: tryIdentifyCurrentDiscordUser() - Backend faz identificação automática

  onJoinDiscordQueue() {
    console.log('🎮 [Queue] Abrindo seletor de lanes...');
    // ✅ SIMPLIFICADO: Backend faz todas as validações, frontend apenas exibe UI
    this.showLaneSelector = true;
  }

  // ✅ REMOVIDO: performDiscordValidation() - Backend faz todas as validações

  onConfirmDiscordQueue(preferences: QueuePreferences) {
    console.log('✅ [Queue] Confirmando entrada na fila Discord com preferências:', preferences);
    
    this.queuePreferences = preferences;
    this.showLaneSelector = false;
    
    // ✅ VALIDAÇÕES LOCAIS ANTES DE EMITIR EVENTO
    
    // Validação 1: Dados do jogador atual
    if (!this.currentPlayer) {
      console.error('❌ [Queue] Dados do jogador atual não disponíveis');
      alert('Erro: Dados do jogador não disponíveis. Certifique-se de que o League of Legends está aberto.');
      return;
    }

    // Validação 2: gameName e tagLine
    if (!this.currentPlayer.gameName || !this.currentPlayer.tagLine) {
      console.error('❌ [Queue] gameName ou tagLine não disponíveis');
      console.error('❌ [Queue] Dados do jogador:', {
        summonerName: this.currentPlayer.summonerName,
        gameName: this.currentPlayer.gameName,
        tagLine: this.currentPlayer.tagLine
      });
      alert('Erro: Dados do Riot ID (gameName#tagLine) não disponíveis.\n\nCertifique-se de que:\n1. O League of Legends está aberto\n2. Você está logado na sua conta\n3. Aguarde alguns segundos para o sistema detectar seus dados');
      return;
    }

    // Validação 3: Conexão Discord
    if (!this.isDiscordConnected) {
      console.error('❌ [Queue] Discord não conectado');
      alert('Erro: Discord não está conectado.\n\nVerifique se:\n1. O bot Discord está online\n2. Você está no servidor Discord correto\n3. Há conexão com a internet');
      return;
    }

    // Validação 4: Usuários Discord online
    if (this.discordUsersOnline.length === 0) {
      console.error('❌ [Queue] Nenhum usuário Discord online encontrado');
      alert('Erro: Nenhum usuário encontrado no canal Discord.\n\nVerifique se:\n1. Você está no canal #lol-matchmaking\n2. Outros usuários estão online no canal\n3. O bot Discord está funcionando');
      return;
    }

    // ✅ NOVA VALIDAÇÃO: Verificar se há vinculação Discord
    const lcuFullName = `${this.currentPlayer.gameName}#${this.currentPlayer.tagLine}`;
    const hasLinkedAccount = this.discordUsersOnline.some(user => {
      if (user.linkedNickname) {
        // ✅ CORRIGIDO: linkedNickname pode ser um objeto {gameName, tagLine} ou uma string
        let discordFullName = '';
        
        if (typeof user.linkedNickname === 'string') {
          // Se for string, usar diretamente
          discordFullName = user.linkedNickname;
        } else if (user.linkedNickname.gameName && user.linkedNickname.tagLine) {
          // Se for objeto, formar a string
          discordFullName = `${user.linkedNickname.gameName}#${user.linkedNickname.tagLine}`;
        } else {
          return false;
        }
        
        return discordFullName === lcuFullName;
      }
      return false;
    });

    if (!hasLinkedAccount) {
      console.warn('⚠️ [Queue] Conta não vinculada ao Discord, mas permitindo entrada (backend validará)');
      console.log('🔍 [Queue] Dados para debug:', {
        lcuAccount: lcuFullName,
        discordUsers: this.discordUsersOnline.map(u => ({
          username: u.username,
          linkedNickname: u.linkedNickname
        }))
      });
      
      // Mostrar aviso mas permitir continuar
      const confirmResult = confirm(
        `Aviso: Sua conta LoL (${lcuFullName}) não foi encontrada vinculada no Discord.\n\n` +
        'Para entrar na fila, você precisa:\n' +
        '1. Estar no canal #lol-matchmaking do Discord\n' +
        '2. Usar o comando !vincular no Discord\n\n' +
        'Deseja tentar entrar na fila mesmo assim?\n' +
        '(O sistema tentará fazer a vinculação automaticamente)'
      );
      
      if (!confirmResult) {
        console.log('🚫 [Queue] Usuário cancelou entrada na fila sem vinculação');
        return;
      }
    }

    console.log('✅ [Queue] Todas as validações passaram, emitindo evento para app.ts');
    
    // ✅ EMITIR EVENTO PARA APP.TS
    this.joinDiscordQueueWithFullData.emit({
      player: this.currentPlayer,
      preferences: preferences
    });
    
    this.queueTimer = 0;
    this.startQueueTimer();
    
    console.log('✅ [Queue] Evento emitido com sucesso, timer iniciado');
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

  refreshPlayersData(forceManual: boolean = false): void {
    if (this.isRefreshing) {
      console.log('⏳ [Queue] Refresh já em andamento, ignorando...');
      return;
    }

    this.isRefreshing = true;
    console.log('🔄 [Queue] Atualizando dados dos jogadores...');

    // ✅ CORRIGIDO: Só emitir refreshData se auto-refresh estiver habilitado OU se for um refresh manual forçado
    if (this.autoRefreshEnabled || forceManual) {
      if (forceManual) {
        console.log('🔄 [Queue] Emitindo refreshData (refresh manual forçado)');
      } else {
        console.log('🔄 [Queue] Emitindo refreshData (auto-refresh habilitado)');
      }
      this.refreshData.emit();
    } else {
      console.log('⏭️ [Queue] Refresh ignorado - auto-refresh desabilitado e não é manual');
    }

    // Reset isRefreshing após um delay
    setTimeout(() => {
      this.isRefreshing = false;
      this.cdr.detectChanges();
    }, 1000);
  }

  refreshQueueData(): void {
    console.log('🔄 [Queue] Refresh manual da fila solicitado');
    // ✅ SEMPRE funcionar quando clicado manualmente
    this.refreshPlayersData(true); // forceManual = true
  }

  // ✅ REMOVIDO: refreshDataManual() - funcionalidade integrada em refreshPlayersData()

  // Track functions for *ngFor performance
  trackByPlayerId(index: number, player: any): string {
    return player?.id?.toString() || index.toString();
  }

  trackByDiscordUserId(index: number, user: any): string {
    return user?.id?.toString() || index.toString();
  }

  isCurrentPlayer(player: any): boolean {
    // ✅ SIMPLIFICADO: Backend marca jogador atual
    return player?.isCurrentPlayer || false;
  }

  getTimeInQueue(player: any): string {
    // ✅ SIMPLIFICADO: Backend calcula e fornece tempo formatado
    return player?.timeInQueue || '0s';
  }

  isUserInQueue(user: any): boolean {
    // ✅ SIMPLIFICADO: Backend fornece dados processados
    return user.isInQueue || false;
  }

  // ✅ REMOVIDO: Métodos de desenvolvimento não implementados
  // - inviteToLink() e inviteToQueue() 
  // - extractGameName() nunca usado

  // ✅ PLACEHOLDER: Métodos necessários para o template mas simplificados
  inviteToLink(user: any): void {
    // Placeholder - Backend gerencia vinculações
    console.log('🔗 [Queue] Use !vincular no Discord para:', user.username);
  }

  inviteToQueue(user: any): void {
    // Placeholder - Backend gerencia convites
    console.log('📝 [Queue] Backend gerencia convites automaticamente:', user.username);
  }
} 