import { Component, Input, Output, EventEmitter, OnInit, OnDestroy, OnChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Player, QueueStatus, QueuePreferences } from '../../interfaces';
import { DiscordIntegrationService } from '../../services/discord-integration.service';
import { QueueStateService } from '../../services/queue-state';
import { LaneSelectorComponent } from '../lane-selector/lane-selector';
import { ApiService } from '../../services/api';

@Component({
  selector: 'app-queue',
  imports: [CommonModule, FormsModule, LaneSelectorComponent],
  templateUrl: './queue.html',
  styleUrl: './queue.scss'
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
  autoRefreshEnabled = true;

  constructor(
    public discordService: DiscordIntegrationService,
    private queueStateService: QueueStateService,
    private apiService: ApiService
  ) {}

  ngOnInit(): void {
    console.log('🎯 [Queue] Componente inicializado');
    
    // Iniciar sincronização MySQL imediatamente
    if (this.currentPlayer) {
      this.queueStateService.updateCurrentPlayer(this.currentPlayer);
      this.queueStateService.startMySQLSync(this.currentPlayer);
    }

    // Configurar listeners do Discord
    this.setupDiscordListeners();
    
    // Configurar listener do estado da fila
    this.setupQueueStateListener();
    
    // Verificar conexão inicial do Discord
    this.checkDiscordConnection();
    
    // Iniciar timer se estiver na fila
    if (this.isInQueue) {
      this.startQueueTimer();
    }
  }

  ngOnDestroy(): void {
    console.log('🛑 [Queue] Componente destruído');
    
    // Parar sincronização MySQL
    this.queueStateService.stopMySQLSync();
    
    // Parar timer
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
    }
  }

  ngOnChanges(changes: any): void {
    if (changes.currentPlayer && changes.currentPlayer.currentValue) {
      console.log('🔄 [Queue] CurrentPlayer atualizado, reiniciando sincronização MySQL');
      this.queueStateService.updateCurrentPlayer(changes.currentPlayer.currentValue);
      this.queueStateService.startMySQLSync(changes.currentPlayer.currentValue);
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
   * REGRA: Entrada na fila com verificação Discord
   * Verifica se o jogador está presente no lobby Discord antes de permitir entrada
   */
  onJoinQueue() {
    if (!this.queueStatus.isActive) return;
    
    // ✅ VALIDAÇÃO MANTIDA: Para ENTRAR na fila (não para visualizar)
    // REGRA: Verificar se está no Discord antes de mostrar lane selector
    if (this.isDiscordConnected && !this.isInDiscordChannel) {
      console.log('⚠️ [Queue] Usuário não está no canal Discord necessário para ENTRAR na fila');
      alert('Você precisa estar no canal Discord para entrar na fila!');
      return;
    }
    
    this.showLaneSelector = true;
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
   * REGRA: Saída da fila via botão "Sair da Fila" - remove linha da tabela queue_players
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
    this.timerInterval = window.setInterval(() => {
      this.queueTimer++;
      // Log a cada minuto para debug
      if (this.queueTimer % 60 === 0) {
        console.log(`⏱️ [Queue] Timer: ${this.getTimerDisplay()}`);
      }
    }, 1000);
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
    if (!this.currentPlayer?.rank) return 'Sem Rank';
    if (typeof this.currentPlayer.rank === 'string') return this.currentPlayer.rank;
    return this.currentPlayer.rank.display || 'Sem Rank';
  }

  getPlayerTag(): string {
    if (!this.currentPlayer) return '';
    
    const tagLine = this.currentPlayer.tagLine;
    return tagLine ? `#${tagLine}` : '';
  }

  onProfileIconError(event: Event): void {
    const img = event.target as HTMLImageElement;
    console.log('❌ Erro ao carregar ícone do perfil, usando placeholder');
    img.src = 'assets/images/champion-placeholder.svg';
  }

  getProfileIconUrl(): string {
    if (!this.currentPlayer) {
      return 'assets/images/champion-placeholder.svg';
    }

    // Usar profileIconId se disponível
    const iconId = this.currentPlayer.profileIconId || 0;
    return `https://ddragon.leagueoflegends.com/cdn/14.24.1/img/profileicon/${iconId}.png`;
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

  getEmptySlots(): number[] {
    const emptyCount = Math.max(0, 10 - (this.queueStatus.playersInQueue || 0));
    return Array(emptyCount).fill(0).map((_, i) => i);
  }

  getTimeAgo(timestamp: Date | string): string {
    const now = new Date();
    const time = new Date(timestamp);
    const diffMs = now.getTime() - time.getTime();
    const diffMinutes = Math.floor(diffMs / (1000 * 60));
    
    if (diffMinutes < 1) return 'Agora mesmo';
    if (diffMinutes < 60) return `${diffMinutes}min atrás`;
    
    const diffHours = Math.floor(diffMinutes / 60);
    return `${diffHours}h atrás`;
  }

  isPlayerAutofilled(player: any): boolean {
    return player.assignedLane && player.assignedLane !== player.primaryLane && player.assignedLane !== player.secondaryLane;
  }

  getAssignedLane(player: any): string {
    return player.assignedLane || player.primaryLane || 'fill';
  }

  getAutofillIndicator(player: any): string {
    return this.isPlayerAutofilled(player) ? '⚠️' : '';
  }

  onAddBot(): void {
    // Funcionalidade removida - sem adição manual de bots
  }

  onSimulateLastMatch(): void {
    // Funcionalidade removida - sem simulação manual
  }

  onCleanupTestMatches(): void {
    // Funcionalidade removida - sem limpeza manual
  }

  getLaneSystemExplanation(): string {
    return 'Sistema de lanes: Topo, Selva, Meio, Atirador, Suporte. Escolha suas preferências de lane.';
  }

  private setupDiscordListeners() {
    // Listener para conexão Discord
    this.discordService.onConnectionChange().subscribe((isConnected: boolean) => {
      console.log('🎮 [Queue] Status Discord atualizado:', isConnected);
      this.isDiscordConnected = isConnected;
      this.isInDiscordChannel = this.discordService.isInChannel();
      this.currentDiscordUser = this.discordService.getCurrentDiscordUser();
    });

    // Listener para usuários online
    this.discordService.onUsersUpdate().subscribe((users: any[]) => {
      console.log('👥 [Queue] Usuários Discord atualizados:', users);
      this.discordUsersOnline = users || [];
    });

    // Listener para fila Discord
    this.discordService.onQueueUpdate().subscribe((queue: any) => {
      console.log('📝 [Queue] Fila Discord atualizada:', queue);
      this.discordQueue = queue || [];
    });

    // Listener para match found
    this.discordService.onMatchFound().subscribe((matchData: any) => {
      if (matchData) {
        this.handleDiscordMatchFound(matchData);
      }
    });
  }

  private checkDiscordConnection() {
    console.log('🔍 [Queue] Verificando conexão Discord inicial');
    this.discordService.requestDiscordStatus();
  }

  onJoinDiscordQueue() {
    if (!this.isDiscordConnected) {
      console.log('⚠️ [Queue] Discord não conectado');
      alert('Discord não está conectado!');
      return;
    }

    if (!this.isInDiscordChannel) {
      console.log('⚠️ [Queue] Usuário não está no canal necessário');
      alert('Você precisa estar no canal Discord para entrar na fila!');
      return;
    }

    if (!this.currentPlayer) {
      console.log('⚠️ [Queue] Dados do jogador não disponíveis');
      alert('Dados do jogador não disponíveis!');
      return;
    }

    // Verificar se a conta está vinculada
    const linkedAccount = this.discordUsersOnline.find(user => 
      user.id === this.currentDiscordUser?.id && user.linkedNickname
    );

    if (!linkedAccount) {
      console.log('⚠️ [Queue] Conta Discord não vinculada ao LoL');
      alert('Sua conta Discord não está vinculada ao League of Legends!');
      return;
    }

    console.log('✅ [Queue] Verificações Discord passaram, iniciando entrada na fila');
    this.showLaneSelector = true;
  }

  onConfirmDiscordQueue(preferences: QueuePreferences) {
    if (!this.currentPlayer || !this.currentDiscordUser) {
      console.log('⚠️ [Queue] Dados necessários não disponíveis');
      return;
    }

    console.log('🎮 [Queue] Confirmando entrada na fila Discord com preferências:', preferences);

    // Preparar dados completos para a fila Discord
    const discordQueueData = {
      player: this.currentPlayer,
      preferences: preferences,
      discordId: this.currentDiscordUser.id,
      gameName: this.currentPlayer.gameName || this.currentPlayer.summonerName?.split('#')[0],
      tagLine: this.currentPlayer.tagLine || this.currentPlayer.summonerName?.split('#')[1]
    };

    // Usar emitter para notificar parent component
    this.joinDiscordQueueWithFullData.emit(discordQueueData);

    this.queuePreferences = preferences;
    this.showLaneSelector = false;
    this.queueTimer = 0;
    this.startQueueTimer();
  }

  onLeaveDiscordQueue() {
    console.log('🔍 [Queue] Saindo da fila Discord');
    this.leaveQueue.emit();
    this.stopQueueTimer();
    this.queueTimer = 0;
  }

  private mapLaneToRole(lane: string): string {
    const roleMapping: { [key: string]: string } = {
      'top': 'TOP',
      'jungle': 'JUNGLE', 
      'mid': 'MIDDLE',
      'bot': 'BOTTOM',
      'adc': 'BOTTOM',
      'support': 'UTILITY'
    };
    return roleMapping[lane] || 'FILL';
  }

  private handleDiscordMatchFound(matchData: any) {
    console.log('🎯 [Queue] Match encontrado via Discord:', matchData);
    // Implementar lógica de match found se necessário
  }

  getDiscordQueueDisplay(): string {
    const queueCount = this.discordQueue.length;
    return queueCount > 0 ? `${queueCount} na fila Discord` : 'Fila Discord vazia';
  }

  setActiveTab(tab: 'queue' | 'lobby' | 'all'): void {
    this.activeTab = tab;
  }

  /**
   * REGRA: Visualização e Atualização - fazer nova consulta ao banco MySQL
   * Ao clicar no botão "Atualizar", buscar dados mais recentes da tabela queue_players
   */
  refreshPlayersData(): void {
    if (this.isRefreshing) return;
    
    console.log('🔄 [Queue] Atualizando dados dos jogadores da tabela queue_players');
    this.isRefreshing = true;
    
    // REGRA: Fazer nova consulta ao banco de dados MySQL para buscar registros atuais
    this.apiService.getQueueStatus().subscribe({
      next: (queueStatus) => {
        console.log('✅ [Queue] Dados atualizados da tabela queue_players:', queueStatus);
        
        // Atualizar dados locais com os dados frescos da tabela
        this.queueStatus = queueStatus;
        
        // Forçar sincronização do estado da fila
        this.queueStateService.forceSync();
        
        this.isRefreshing = false;
        
        // Log detalhado dos dados obtidos
        console.log('📊 [Queue] Status da fila atualizado:', {
          playersInQueue: this.queueStatus.playersInQueue,
          playersList: this.queueStatus.playersInQueueList?.map(p => ({
            name: p.summonerName,
            position: p.queuePosition,
            primaryLane: p.primaryLane
          })) || []
        });
      },
      error: (error) => {
        console.error('❌ [Queue] Erro ao atualizar dados da tabela queue_players:', error);
        this.isRefreshing = false;
      }
    });
    
    // Também atualizar dados do Discord
    if (this.isDiscordConnected) {
      this.discordService.requestDiscordStatus();
    }
  }

  refreshQueueData(): void {
    console.log('🔄 [Queue] Atualizando dados da fila...');
    
    // Emitir evento para o componente pai atualizar os dados
    this.refreshData.emit();
    
    // Também forçar sincronização local
    this.queueStateService.forceSync();
  }

  trackByPlayerId(index: number, player: any): string {
    return player.summonerName + '_' + player.queuePosition;
  }

  trackByDiscordUserId(index: number, user: any): string {
    return user.id;
  }

  isCurrentPlayer(player: any): boolean {
    if (!this.currentPlayer || !player) return false;
    
    // Verificar por nome do invocador
    const currentName = this.currentPlayer.summonerName || '';
    const playerName = player.summonerName || '';
    
    // Comparar nomes (com e sem tag)
    if (currentName === playerName) return true;
    
    // Se um tem tag e outro não, comparar apenas a parte do nome
    const currentBaseName = currentName.split('#')[0];
    const playerBaseName = playerName.split('#')[0];
    
    return currentBaseName === playerBaseName;
  }

  getTimeInQueue(joinTime: Date | string): string {
    if (!joinTime) return '0min';
    
    const now = new Date();
    const join = new Date(joinTime);
    const diffMs = now.getTime() - join.getTime();
    const diffMinutes = Math.floor(diffMs / (1000 * 60));
    
    if (diffMinutes < 1) return '<1min';
    if (diffMinutes < 60) return `${diffMinutes}min`;
    
    const hours = Math.floor(diffMinutes / 60);
    const minutes = diffMinutes % 60;
    return `${hours}h ${minutes}min`;
  }

  isUserInQueue(user: any): boolean {
    if (!user.linkedNickname || !this.queueStatus.playersInQueueList) return false;
    
    return this.queueStatus.playersInQueueList.some(player => 
      player.summonerName === user.linkedNickname ||
      player.summonerName.startsWith(user.linkedNickname + '#')
    );
  }

  inviteToLink(user: any): void {
    if (!user) return;
    
    console.log('🔗 [Queue] Convidando usuário para vincular conta:', user);
    // Implementar lógica de convite para vinculação
    alert(`Funcionalidade em desenvolvimento: Convidar ${user.displayName || user.username} para vincular conta LoL`);
  }

  inviteToQueue(user: any): void {
    if (!user) return;
    
    console.log('📝 [Queue] Convidando usuário para a fila:', user);
    // Implementar lógica de convite para fila
    alert(`Funcionalidade em desenvolvimento: Convidar ${user.displayName || user.username} para a fila`);
  }

  debugPlayerData(player: any): void {
    console.log('🔍 [Queue] Debug dados do jogador:', {
      player: player,
      currentPlayer: this.currentPlayer,
      isCurrentPlayer: this.isCurrentPlayer(player),
      comparison: {
        playerName: player?.summonerName,
        currentName: this.currentPlayer?.summonerName
      }
    });
  }

  private checkIfUserInQueue() {
    if (!this.currentPlayer || !this.queueStatus.playersInQueueList) {
      console.log('🔍 [Queue] Não é possível verificar se usuário está na fila - dados insuficientes');
      return;
    }

    const userInQueue = this.queueStatus.playersInQueueList.find(player => 
      this.isCurrentPlayer(player)
    );

    const wasInQueue = this.isInQueue;
    this.isInQueue = !!userInQueue;

    if (wasInQueue !== this.isInQueue) {
      console.log(`🔄 [Queue] Estado da fila alterado: ${wasInQueue} -> ${this.isInQueue}`);
      
      if (this.isInQueue && !this.timerInterval) {
        console.log('⏱️ [Queue] Iniciando timer - usuário entrou na fila');
        this.startQueueTimer();
      } else if (!this.isInQueue && this.timerInterval) {
        console.log('⏱️ [Queue] Parando timer - usuário saiu da fila');
        this.stopQueueTimer();
        this.queueTimer = 0;
      }
    }

    if (userInQueue) {
      console.log(`✅ [Queue] Usuário encontrado na fila:`, {
        position: userInQueue.queuePosition,
        primaryLane: userInQueue.primaryLane,
        timeInQueue: this.getTimeInQueue(userInQueue.joinTime)
      });
    }
  }

  private checkUserInDiscordQueue() {
    if (!this.currentDiscordUser || !this.discordQueue) return;

    const userInDiscordQueue = this.discordQueue.find(player => 
      player.discordId === this.currentDiscordUser.id
    );

    if (userInDiscordQueue) {
      console.log('✅ [Queue] Usuário encontrado na fila Discord:', userInDiscordQueue);
    }
  }
} 