import { Component, Input, Output, EventEmitter, OnInit, OnDestroy, OnChanges } from '@angular/core';
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
  autoRefreshEnabled = false;

  // ✅ NOVO: Controle de auto-refresh
  private autoRefreshInterval?: number;
  private readonly AUTO_REFRESH_INTERVAL_MS = 2000; // 2 segundos

  constructor(
    public discordService: DiscordIntegrationService,
    private queueStateService: QueueStateService,
    private apiService: ApiService,
    private profileIconService: ProfileIconService
  ) {}

  ngOnInit(): void {
    console.log('🎯 [Queue] Componente inicializado');
    
    // ✅ MUDANÇA: Não iniciar sincronização MySQL automaticamente
    // Só será iniciada se auto-refresh estiver habilitado ou manualmente
    
    // Configurar listeners do Discord
    this.setupDiscordListeners();
    
    // ✅ MUDANÇA: Configurar listener do estado da fila (sem polling automático)
    this.setupQueueStateListener();
    
    // Verificar conexão inicial do Discord
    this.checkDiscordConnection();
    
    // Iniciar timer se estiver na fila
    if (this.isInQueue) {
      this.startQueueTimer();
    }

    // ✅ NOVO: Configurar listener para auto-refresh
    this.setupAutoRefreshControl();
  }

  ngOnDestroy(): void {
    console.log('🛑 [Queue] Componente destruído');
    
    // ✅ MUDANÇA: Parar sincronização MySQL
    this.queueStateService.stopMySQLSync();
    
    // ✅ NOVO: Parar auto-refresh
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
      
      // ✅ MUDANÇA: Só iniciar sincronização se auto-refresh estiver habilitado
      if (this.autoRefreshEnabled) {
        this.queueStateService.startMySQLSync(changes.currentPlayer.currentValue);
      }
      
      // NOVO: Enviar dados do LCU para identificação automática do usuário Discord
      if (this.currentPlayer && this.currentPlayer.gameName && this.currentPlayer.tagLine) {
        console.log('🎮 [Queue] Enviando dados do LCU para identificação Discord...');
        this.discordService.sendLCUData({
          gameName: this.currentPlayer.gameName,
          tagLine: this.currentPlayer.tagLine
        });
      }
      
      // NOVO: Tentar identificar o usuário Discord quando o currentPlayer for atualizado
      if (this.discordUsersOnline.length > 0) {
        this.tryIdentifyCurrentDiscordUser();
      }
    }
  }

  // ✅ NOVO: Configurar controle de auto-refresh
  private setupAutoRefreshControl(): void {
    // Fazer refresh inicial manual
    this.refreshPlayersData();
    
    // ✅ NOVO: Buscar profile icon do backend se necessário
    this.fetchProfileIconFromBackend();
  }

  // ✅ NOVO: Iniciar auto-refresh
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

  // ✅ NOVO: Parar auto-refresh
  private stopAutoRefresh(): void {
    if (this.autoRefreshInterval) {
      clearInterval(this.autoRefreshInterval);
      this.autoRefreshInterval = undefined;
      console.log('🛑 [Queue] Auto-refresh parado');
    }
  }

  // ✅ NOVO: Listener para mudanças no auto-refresh
  onAutoRefreshChange(): void {
    console.log(`🔄 [Queue] Auto-refresh ${this.autoRefreshEnabled ? 'habilitado' : 'desabilitado'}`);
    
    if (this.autoRefreshEnabled) {
      // Iniciar sincronização MySQL e polling
      if (this.currentPlayer) {
        this.queueStateService.updateCurrentPlayer(this.currentPlayer);
        this.queueStateService.startPolling(); // ✅ MUDANÇA: Usar polling específico
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
   * REGRA: Entrada na fila com verificação Discord
   * Verifica se o jogador está presente no lobby Discord antes de permitir entrada
   */
  onJoinQueue() {
    if (!this.queueStatus.isActive) return;
    
    // ✅ CORREÇÃO: Usar a verificação de vinculação Discord
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

    // ✅ CORREÇÃO: Usar ProfileIconService que se conecta ao backend
    const iconId = this.currentPlayer.profileIconId || 29;
    
    // ✅ MUDANÇA: Usar Community Dragon (mais confiável) em vez de Data Dragon
    return `https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/v1/profile-icons/${iconId}.jpg`;
  }

  // ✅ NOVO: Método para buscar profile icon do backend se necessário
  async fetchProfileIconFromBackend(): Promise<void> {
    if (!this.currentPlayer) return;

    try {
      // Se temos gameName e tagLine, buscar do backend
      if (this.currentPlayer.gameName && this.currentPlayer.tagLine) {
        const riotId = `${this.currentPlayer.gameName}#${this.currentPlayer.tagLine}`;
        const iconId = await this.profileIconService.fetchProfileIcon(
          this.currentPlayer.summonerName || '',
          this.currentPlayer.gameName,
          this.currentPlayer.tagLine
        );
        
        if (iconId) {
          console.log(`✅ [Queue] Profile icon obtido do backend: ${iconId}`);
          // Atualizar o currentPlayer com o iconId correto
          this.currentPlayer.profileIconId = iconId;
        }
      }
    } catch (error) {
      console.log('⚠️ [Queue] Erro ao buscar profile icon do backend:', error);
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

  // ✅ REMOVIDO: Métodos desnecessários que não estão sendo usados no template

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
      
      // NOVO: Tentar identificar o usuário atual quando receber atualizações
      if (this.currentPlayer && this.discordUsersOnline.length > 0) {
        this.tryIdentifyCurrentDiscordUser();
      }
    });

    // Listener para fila Discord
    this.discordService.onQueueUpdate().subscribe((queue: any) => {
      console.log('📝 [Queue] Fila Discord atualizada:', queue);
      this.discordQueue = queue || [];
    });

    // NOVO: Listener para atualizações do usuário atual
    // Isso será atualizado quando o DiscordService receber informações do usuário atual via WebSocket
    // O currentDiscordUser será atualizado automaticamente no DiscordService

    // ✅ REMOVIDO: Listener para match found - não implementado ainda
  }

  private checkDiscordConnection() {
    console.log('🔍 [Queue] Verificando conexão Discord inicial');
    this.discordService.requestDiscordStatus();
  }

  // NOVO: Método para tentar identificar o usuário Discord atual
  private tryIdentifyCurrentDiscordUser() {
    if (!this.currentPlayer) {
      console.log('⚠️ [Queue] CurrentPlayer não disponível para identificação');
      return;
    }

    console.log('🔍 [Queue] === IDENTIFICAÇÃO DE USUÁRIO DISCORD ===');
    console.log('🔍 [Queue] Dados do LCU:', {
      gameName: this.currentPlayer.gameName,
      tagLine: this.currentPlayer.tagLine,
      summonerName: this.currentPlayer.summonerName
    });
    
    // Usar o método do DiscordService para identificar o usuário
    const identifiedUser = this.discordService.identifyCurrentUserFromLCU({
      gameName: this.currentPlayer.gameName || this.currentPlayer.summonerName?.split('#')[0],
      tagLine: this.currentPlayer.tagLine || this.currentPlayer.summonerName?.split('#')[1]
    });

    if (identifiedUser) {
      this.currentDiscordUser = identifiedUser;
      console.log('✅ [Queue] Usuário Discord identificado com sucesso:', this.currentDiscordUser);
    } else {
      console.log('❌ [Queue] Usuário Discord não identificado');
      console.log('❌ [Queue] Verificando se há usuários Discord online:', this.discordUsersOnline.length);
      console.log('❌ [Queue] Usuários com nick vinculado:', this.discordUsersOnline.filter(u => u.linkedNickname).length);
      this.currentDiscordUser = null;
    }
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

    // ✅ MELHORIA: Tentar identificar o usuário Discord se não estiver identificado
    if (!this.currentDiscordUser) {
      console.log('🔍 [Queue] Usuário Discord não identificado, tentando identificar...');
      this.tryIdentifyCurrentDiscordUser();
      
      // Aguardar um pouco para a identificação ser processada
      setTimeout(() => {
        this.performDiscordValidation();
      }, 100);
      return;
    }

    // Se já temos o usuário identificado, fazer validação imediatamente
    this.performDiscordValidation();
  }

  // ✅ NOVO: Método separado para validação Discord
  private performDiscordValidation() {
    console.log('🔍 [Queue] === VALIDAÇÃO DISCORD INICIADA ===');
    console.log('🔍 [Queue] Current Discord User:', this.currentDiscordUser);
    console.log('🔍 [Queue] Current Player:', {
      gameName: this.currentPlayer?.gameName,
      tagLine: this.currentPlayer?.tagLine,
      summonerName: this.currentPlayer?.summonerName
    });
    console.log('🔍 [Queue] Discord Users Online:', this.discordUsersOnline);

    // Buscar usuário Discord atual na lista de usuários online
    const currentDiscordUser = this.discordUsersOnline.find(user => 
      user.id === this.currentDiscordUser?.id
    );

    console.log('🔍 [Queue] Current Discord User found:', currentDiscordUser);

    if (!currentDiscordUser) {
      console.log('⚠️ [Queue] Usuário Discord não encontrado na lista de usuários online');
      alert('Usuário Discord não encontrado na lista de usuários online!');
      return;
    }

    if (!currentDiscordUser.linkedNickname) {
      console.log('⚠️ [Queue] Usuário Discord não tem nickname vinculado');
      alert('Sua conta Discord não está vinculada ao League of Legends! Use /vincular no Discord.');
      return;
    }

    // ✅ MELHORIA: Comparação mais robusta dos nicks
    const linkedGameName = currentDiscordUser.linkedNickname.gameName?.trim();
    const linkedTagLine = currentDiscordUser.linkedNickname.tagLine?.trim();
    const currentGameName = this.currentPlayer?.gameName?.trim();
    const currentTagLine = this.currentPlayer?.tagLine?.trim();

    console.log('🔍 [Queue] === COMPARAÇÃO DE NICKS ===');
    console.log('  - Vinculado no Discord:', `"${linkedGameName}#${linkedTagLine}"`);
    console.log('  - Detectado no LoL:', `"${currentGameName}#${currentTagLine}"`);
    console.log('  - Comparação gameName:', `"${linkedGameName}" === "${currentGameName}" = ${linkedGameName === currentGameName}`);
    console.log('  - Comparação tagLine:', `"${linkedTagLine}" === "${currentTagLine}" = ${linkedTagLine === currentTagLine}`);

    // Verificar se os nicks coincidem (case-insensitive para maior compatibilidade)
    const nickMatch = linkedGameName?.toLowerCase() === currentGameName?.toLowerCase() && 
                     linkedTagLine?.toLowerCase() === currentTagLine?.toLowerCase();

    console.log('🔍 [Queue] Resultado da comparação:', nickMatch);

    if (!nickMatch) {
      console.log('⚠️ [Queue] Nicks não coincidem');
      alert(`Nicks não coincidem!\n\nDiscord: ${linkedGameName}#${linkedTagLine}\nLoL: ${currentGameName}#${currentTagLine}\n\nUse /vincular no Discord para corrigir.`);
      return;
    }

    console.log('✅ [Queue] === VERIFICAÇÕES DISCORD APROVADAS ===');
    console.log('✅ [Queue] Iniciando entrada na fila...');
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

  // ✅ REMOVIDO: Métodos desnecessários que não estão sendo usados

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
        
        // ✅ MUDANÇA: Só forçar sincronização se auto-refresh estiver habilitado
        if (this.autoRefreshEnabled) {
          this.queueStateService.forceSync();
        }
        
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
} 