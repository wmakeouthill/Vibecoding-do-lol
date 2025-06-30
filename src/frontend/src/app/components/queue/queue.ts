import { Component, Input, Output, EventEmitter, OnInit, OnDestroy, OnChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Player, QueueStatus, QueuePreferences } from '../../interfaces';
import { DiscordIntegrationService } from '../../services/discord-integration.service';
import { QueueStateService } from '../../services/queue-state';
import { LaneSelectorComponent } from '../lane-selector/lane-selector';

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
  // Remover outputs para funcionalidade de bots
  // @Output() addBot = new EventEmitter<void>();
  // @Output() simulateLastMatch = new EventEmitter<void>();
  // @Output() cleanupTestMatches = new EventEmitter<void>();

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

  // Development tools
  // showDevTools = false;

  // Players table
  activeTab: 'queue' | 'lobby' | 'all' = 'all';
  isRefreshing = false;
  autoRefreshEnabled = true;

  constructor(
    public discordService: DiscordIntegrationService,
    private queueStateService: QueueStateService
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

  // NOVO: Configurar listener do estado da fila
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

  onJoinQueue() {
    if (!this.queueStatus.isActive) return;
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
      'support': 'Suporte',
      'fill': 'Preenchimento'
    };
    return lanes[laneId] || laneId;
  }

  getLaneIcon(laneId: string): string {
    const lanes: { [key: string]: string } = {
      'top': '🛡️',
      'jungle': '🌲',
      'mid': '⚡',
      'bot': '🏹',
      'support': '🛡️',
      'fill': '🔄'
    };
    return lanes[laneId] || '❓';
  }

  getPlayerRankDisplay(): string {
    if (!this.currentPlayer?.rank) return 'Sem rank';
    return this.currentPlayer.rank.display;
  }

  getPlayerTag(): string {
    if (this.currentPlayer?.tagLine) {
      return ` #${this.currentPlayer.tagLine}`;
    }
    return '';
  }

  onProfileIconError(event: Event): void {
    // Fallback para ícone padrão se falhar o carregamento
    const target = event.target as HTMLImageElement;
    if (!target) return;

    const iconId = this.currentPlayer?.profileIconId || 29;
    const fallbackUrls = [
      `https://ddragon.leagueoflegends.com/cdn/15.13.1/img/profileicon/${iconId}.png`,
      `https://ddragon.leagueoflegends.com/cdn/14.24.1/img/profileicon/${iconId}.png`,
      `https://ddragon.leagueoflegends.com/cdn/14.23.1/img/profileicon/${iconId}.png`,
      'https://ddragon.leagueoflegends.com/cdn/15.13.1/img/profileicon/29.png', // Default icon
      'https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/v1/profile-icons/29.jpg'
    ];

    // Tentar próximo fallback
    const currentIndex = fallbackUrls.indexOf(target.src);
    if (currentIndex < fallbackUrls.length - 1) {
      target.src = fallbackUrls[currentIndex + 1];
    } else {
      // Último fallback: ícone padrão
      target.src = fallbackUrls[fallbackUrls.length - 1];
    }
  }

  getProfileIconUrl(): string {
    if (!this.currentPlayer?.profileIconId) {
      return 'https://ddragon.leagueoflegends.com/cdn/15.13.1/img/profileicon/29.png';
    }
    return `https://ddragon.leagueoflegends.com/cdn/15.13.1/img/profileicon/${this.currentPlayer.profileIconId}.png`;
  }

  getLaneDisplayName(laneId: string): string {
    const laneNames: { [key: string]: string } = {
      'top': 'Topo',
      'jungle': 'Selva', 
      'mid': 'Meio',
      'bot': 'Atirador',
      'support': 'Suporte'
    };
    return laneNames[laneId] || laneId;
  }

  getEmptySlots(): number[] {
    return Array.from({ length: 10 - this.queueStatus.playersInQueue }, (_, i) => i);
  }

  getTimeAgo(timestamp: Date | string): string {
    const now = new Date();
    const time = new Date(timestamp);
    const diffMs = now.getTime() - time.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    
    if (diffMins < 1) return 'Agora';
    if (diffMins < 60) return `${diffMins}m atrás`;
    const diffHours = Math.floor(diffMins / 60);
    return `${diffHours}h atrás`;
  }

  isPlayerAutofilled(player: any): boolean {
    return player.role !== player.preferredRole;
  }

  getAssignedLane(player: any): string {
    return this.getLaneDisplayName(player.role || 'unknown');
  }

  getAutofillIndicator(player: any): string {
    return this.isPlayerAutofilled(player) ? '🔄' : '';
  }

  onAddBot(): void {
    // Implementar lógica para adicionar um bot
    console.log('Adicionando bot');
  }

  onSimulateLastMatch(): void {
    // Implementar lógica para simular o último match
    console.log('Simulando último match');
  }

  onCleanupTestMatches(): void {
    // Implementar lógica para limpar testes de match
    console.log('Limpando testes de match');
  }

  getLaneSystemExplanation(): string {
    return 'Sistema de lanes: Cada jogador escolhe 2 lanes preferidas. O sistema tenta colocar todos em suas primeiras escolhas, mas pode usar a segunda escolha se necessário.';
  }

  private setupDiscordListeners() {
    // Listener para atualizações de usuários Discord
    this.discordService.onUsersUpdate().subscribe(users => {
      console.log('👥 [Queue] Usuários Discord atualizados:', users?.length || 0, 'usuários');
      this.discordUsersOnline = users || [];
      
      // Identificar usuário atual quando os usuários forem atualizados
      if (this.currentPlayer && this.currentPlayer.gameName && this.currentPlayer.tagLine) {
        this.discordService.identifyCurrentUserFromLCU({
          gameName: this.currentPlayer.gameName,
          tagLine: this.currentPlayer.tagLine
        });
      }
      this.currentDiscordUser = this.discordService.getCurrentDiscordUser();
      
      console.log('✅ [Queue] Usuário atual atualizado:', this.currentDiscordUser);
    });

    // Listener para mudanças de conexão
    this.discordService.onConnectionChange().subscribe(isConnected => {
      console.log('🔗 [Queue] Status de conexão Discord alterado:', isConnected);
      this.isDiscordConnected = isConnected;
      this.showDiscordMode = isConnected;
    });

    // Listener para entrada na fila
    this.discordService.onQueueJoined().subscribe(data => {
      if (data) {
        console.log('✅ [Queue] Entrou na fila Discord com sucesso!', data);
        this.isInQueue = true;
        this.queueTimer = 0;
        this.startQueueTimer();
      }
    });
  }

  private checkDiscordConnection() {
    // Verificar status inicial do Discord
    this.isDiscordConnected = this.discordService.isConnected();
    this.isInDiscordChannel = this.discordService.isInChannel();
    
    // Identificar usuário atual baseado nos dados do LCU
    if (this.currentPlayer && this.currentPlayer.gameName && this.currentPlayer.tagLine) {
      this.discordService.identifyCurrentUserFromLCU({
        gameName: this.currentPlayer.gameName,
        tagLine: this.currentPlayer.tagLine
      });
    }
    
    this.currentDiscordUser = this.discordService.getCurrentDiscordUser();
    this.discordUsersOnline = this.discordService.getDiscordUsersOnline() || [];
    this.discordQueue = this.discordService.getQueueParticipants() || [];
    
    // Mostrar Discord toggle se WebSocket estiver conectado (não apenas se Discord estiver conectado)
    this.showDiscordMode = this.discordService.isConnected();
    
    console.log('🔍 [Queue] Status Discord atualizado:', {
      isConnected: this.isDiscordConnected,
      isDiscordBackendConnected: this.discordService.isDiscordBackendConnected(),
      isInChannel: this.isInDiscordChannel,
      usersOnline: this.discordUsersOnline.length,
      queueSize: this.discordQueue.length,
      showDiscordMode: this.showDiscordMode,
      currentUser: this.currentDiscordUser
    });
  }

  onJoinDiscordQueue() {
    if (!this.currentPlayer) {
      alert('❌ Precisa ter um jogador carregado para entrar na fila Discord!');
      return;
    }

    // Verificar se tem dados do LCU
    if (!this.currentPlayer.gameName || !this.currentPlayer.tagLine) {
      alert('❌ Dados do LoL não detectados! Certifique-se de que o League of Legends está aberto.');
      return;
    }

    // Verificar se o WebSocket está conectado
    if (!this.discordService.isConnected()) {
      alert('❌ Não conectado ao servidor! Certifique-se de que o backend está rodando.');
      return;
    }

    // Verificar se o Discord está conectado (mas não bloquear se não estiver)
    const discordConnected = this.discordService.isDiscordBackendConnected();
    if (!discordConnected) {
      console.warn('⚠️ Discord não está conectado, mas permitindo entrada na fila...');
      // Não bloquear, apenas avisar
    }

    // Forçar atualização do status do Discord
    this.discordService.requestDiscordStatus();
    
    // Aguardar um pouco para receber a resposta
    setTimeout(() => {
      this.checkDiscordConnection();
      
      // Debug: Verificar status do canal
      console.log('🔍 [DEBUG] Status do Discord:', {
        isConnected: this.discordService.isConnected(),
        isDiscordBackendConnected: this.discordService.isDiscordBackendConnected(),
        isInChannel: this.discordService.isInChannel(),
        currentUser: this.discordService.getCurrentDiscordUser(),
        usersOnline: this.discordService.getDiscordUsersOnline().length
      });

      // Verificar se está no canal correto (só se Discord estiver conectado)
      if (discordConnected && !this.discordService.isInChannel()) {
        // Tentar verificar o canal novamente
        this.discordService.requestChannelStatus();
        
        setTimeout(() => {
          if (!this.discordService.isInChannel()) {
            alert('❌ Você precisa estar no canal #lol-matchmaking no Discord para usar a fila!');
            return;
          }
          this.showLaneSelector = true;
        }, 1000);
      } else {
        this.showLaneSelector = true;
      }

      console.log('🎮 Entrando na fila Discord com dados do LCU:', {
        gameName: this.currentPlayer?.gameName,
        tagLine: this.currentPlayer?.tagLine,
        summonerName: this.currentPlayer?.summonerName,
        discordConnected: discordConnected
      });
    }, 500);
  }

  onConfirmDiscordQueue(preferences: QueuePreferences) {
    if (!this.currentPlayer) {
      alert('❌ Dados do jogador não encontrados!');
      return;
    }

    // Verificar se temos dados do LCU
    if (!this.currentPlayer.gameName || !this.currentPlayer.tagLine) {
      alert('❌ Dados do LCU não disponíveis. Certifique-se de estar logado no LoL!');
      return;
    }

    // Usar dados do LCU automaticamente
    const lcuData = {
      gameName: this.currentPlayer.gameName,
      tagLine: this.currentPlayer.tagLine
    };

    console.log('🎮 Confirmando entrada na fila Discord com dados do LCU:', lcuData);

    // Chamar diretamente o DiscordService com os dados do LCU
    const success = this.discordService.joinDiscordQueue(
      preferences.primaryLane,
      preferences.secondaryLane,
      this.currentPlayer.summonerName,
      lcuData
    );

    if (success) {
      this.showLaneSelector = false;
      this.queuePreferences = preferences;
      this.isInQueue = true;
      this.queueTimer = 0;
      this.startQueueTimer();
    } else {
      alert('❌ Falha ao entrar na fila Discord. Verifique se está no canal correto e logado no LoL.');
    }
  }

  onLeaveDiscordQueue() {
    this.discordService.leaveDiscordQueue();
    this.leaveQueue.emit();
    this.stopQueueTimer();
    this.queueTimer = 0;
    this.isInQueue = false;
  }

  private mapLaneToRole(lane: string): string {
    const laneMap: { [key: string]: string } = {
      'top': 'Top',
      'jungle': 'Jungle', 
      'mid': 'Mid',
      'bot': 'ADC',
      'support': 'Support'
    };
    return laneMap[lane] || lane;
  }

  private handleDiscordMatchFound(matchData: any) {
    console.log('🎮 Match encontrado via Discord!', matchData);
    // Aqui você pode emitir um evento para o componente pai
    // ou navegar para a tela de match
  }

  getDiscordQueueDisplay(): string {
    return this.discordQueue.length > 0 ? 
      `${this.discordQueue.length} jogadores na fila Discord` : 
      'Fila Discord vazia';
  }

  // Players table methods
  setActiveTab(tab: 'queue' | 'lobby' | 'all'): void {
    this.activeTab = tab;
  }

  refreshPlayersData(): void {
    this.isRefreshing = true;
    
    console.log('🔄 [Queue] Atualizando dados dos jogadores...');
    
    // PRIMEIRO: EMITIR evento para o App atualizar queueStatus
    this.refreshData.emit();
    
    // SEGUNDO: FORÇAR sincronização com MySQL (prioridade máxima)
    this.queueStateService.forceSync();
    
    // TERCEIRO: Solicitar atualização completa do Discord
    this.discordService.requestDiscordStatus();
    
    // QUARTO: Atualizar dados locais imediatamente
    this.discordUsersOnline = this.discordService.getDiscordUsersOnline() || [];
    this.isDiscordConnected = this.discordService.isConnected();
    this.isInDiscordChannel = this.discordService.isInChannel();
    this.discordQueue = this.discordService.getQueueParticipants() || [];
    
    // QUINTO: Identificar usuário atual baseado nos dados do LCU
    if (this.currentPlayer && this.currentPlayer.gameName && this.currentPlayer.tagLine) {
      this.discordService.identifyCurrentUserFromLCU({
        gameName: this.currentPlayer.gameName,
        tagLine: this.currentPlayer.tagLine
      });
    }
    this.currentDiscordUser = this.discordService.getCurrentDiscordUser();
    
    // SEXTO: Atualizar status de conexão
    this.checkDiscordConnection();
    
    console.log('✅ [Queue] Primeira fase de atualização concluída:', {
      usersOnline: this.discordUsersOnline.length,
      queueSize: this.discordQueue.length,
      isDiscordConnected: this.isDiscordConnected,
      isInChannel: this.isInDiscordChannel,
      currentUser: this.currentDiscordUser
    });
    
    // SÉTIMO: Aguardar e fazer segunda sincronização MySQL (garantir consistência)
    setTimeout(() => {
      console.log('🔄 [Queue] Segunda fase: sincronização MySQL...');
      
      // Forçar segunda sincronização MySQL
      this.queueStateService.forceSync();
      
      // Verificar estado atual da fila MySQL
      this.queueStateService.getQueueState().subscribe(state => {
        console.log('📊 [Queue] Estado MySQL verificado:', {
          isInQueue: state.isInQueue,
          position: state.position,
          playersInQueue: state.playersInQueue
        });
        
        // Atualizar estado do componente baseado no MySQL
        if (state.isInQueue !== this.isInQueue) {
          console.log(`🔄 [Queue] Atualizando estado local: ${this.isInQueue} → ${state.isInQueue}`);
          this.isInQueue = state.isInQueue;
          
          // Atualizar timer se necessário
          if (state.isInQueue && !this.timerInterval) {
            console.log('⏱️ [Queue] Iniciando timer (usuário estava na fila)');
            this.startQueueTimer();
          } else if (!state.isInQueue && this.timerInterval) {
            console.log('⏱️ [Queue] Parando timer (usuário não está na fila)');
            this.stopQueueTimer();
            this.queueTimer = 0;
          }
        }
      });
      
      // Atualizar dados Discord finais
      this.discordUsersOnline = this.discordService.getDiscordUsersOnline() || [];
      this.discordQueue = this.discordService.getQueueParticipants() || [];
      
      // Re-identificar usuário atual
      if (this.currentPlayer && this.currentPlayer.gameName && this.currentPlayer.tagLine) {
        this.discordService.identifyCurrentUserFromLCU({
          gameName: this.currentPlayer.gameName,
          tagLine: this.currentPlayer.tagLine
        });
      }
      this.currentDiscordUser = this.discordService.getCurrentDiscordUser();
      
      this.isRefreshing = false;
      
      console.log('✅ [Queue] Atualização completa finalizada:', {
        usersOnline: this.discordUsersOnline.length,
        queueSize: this.discordQueue.length,
        currentUser: this.currentDiscordUser,
        isInQueue: this.isInQueue,
        timerActive: !!this.timerInterval
      });
    }, 1000); // Aguardar 1 segundo para sincronização completa
  }

  // Método para atualizar especificamente a fila (MySQL + estado)
  refreshQueueData(): void {
    console.log('🔄 [Queue] Atualizando dados da fila MySQL...');
    
    // FORÇAR sincronização com MySQL (PRINCIPAL)
    this.queueStateService.forceSync();
    
    // Solicitar status atualizado da fila do Discord (SECUNDÁRIO)
    this.discordService.requestDiscordStatus();
    
    // Verificar estado da fila após sincronização
    setTimeout(() => {
      console.log('🔍 [Queue] Verificando estado pós-sincronização...');
      
      // Segunda sincronização para garantir
      this.queueStateService.forceSync();
      
      // Verificar se estado mudou
      this.queueStateService.getQueueState().subscribe(state => {
        console.log('📋 [Queue] Estado final da fila:', {
          isInQueue: state.isInQueue,
          position: state.position,
          playersInQueue: state.playersInQueue,
          averageWaitTime: state.averageWaitTime
        });
        
        // Atualizar estado local se necessário
        if (state.isInQueue !== this.isInQueue) {
          console.log(`🔄 [Queue] Estado da fila atualizado: ${this.isInQueue} → ${state.isInQueue}`);
          this.isInQueue = state.isInQueue;
        }
      });
    }, 500);
  }

  trackByPlayerId(index: number, player: any): string {
    return player.summonerName || index.toString();
  }

  trackByDiscordUserId(index: number, user: any): string {
    return user.id || user.username || index.toString();
  }

  isCurrentPlayer(player: any): boolean {
    if (!this.currentPlayer) return false;
    
    // Obter dados do jogador atual
    const currentSummonerName = this.currentPlayer.summonerName;
    const currentTagLine = this.currentPlayer.tagLine;
    const currentGameName = this.currentPlayer.gameName;
    
    // Obter dados do jogador na fila
    const playerSummonerName = player.summonerName;
    const playerTagLine = player.tagLine;
    
    // Criar diferentes formatos possíveis para comparação
    const currentFormats = [
      currentSummonerName,
      currentTagLine ? `${currentSummonerName}#${currentTagLine}` : null,
      currentGameName && currentTagLine ? `${currentGameName}#${currentTagLine}` : null,
      currentGameName ? currentGameName : null
    ].filter(Boolean);
    
    const playerFormats = [
      playerSummonerName,
      playerTagLine ? `${playerSummonerName}#${playerTagLine}` : null
    ].filter(Boolean);
    
    // Comparar usando diferentes formatos
    const isMatch = currentFormats.some(currentFormat => 
      playerFormats.some(playerFormat => 
        currentFormat && playerFormat && currentFormat.toLowerCase() === playerFormat.toLowerCase()
      )
    );
    
    if (isMatch) {
      console.log('✅ [Queue] Usuário atual identificado na fila:', {
        currentPlayer: {
          summonerName: currentSummonerName,
          tagLine: currentTagLine,
          gameName: currentGameName
        },
        queuePlayer: {
          summonerName: playerSummonerName,
          tagLine: playerTagLine
        },
        matchedFormat: currentFormats.find(currentFormat => 
          playerFormats.some(playerFormat => 
            currentFormat && playerFormat && currentFormat.toLowerCase() === playerFormat.toLowerCase()
          )
        )
      });
    }
    
    return isMatch;
  }

  getTimeInQueue(joinTime: Date | string): string {
    const now = new Date();
    const join = new Date(joinTime);
    const diffMs = now.getTime() - join.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffSecs = Math.floor((diffMs % 60000) / 1000);
    
    if (diffMins > 0) {
      return `${diffMins}m ${diffSecs}s`;
    }
    return `${diffSecs}s`;
  }

  isUserInQueue(user: any): boolean {
    if (!user.linkedNickname) return false;
    
    // Criar o nome completo do LoL (gameName#tagLine)
    const userSummonerName = `${user.linkedNickname.gameName}#${user.linkedNickname.tagLine}`;
    const playersList = this.queueStatus.playersInQueueList;
    
    if (!playersList || playersList.length === 0) return false;
    
    console.log(`🔍 [DEBUG] Verificando se usuário está na fila:`, {
      userSummonerName,
      playersInQueue: playersList.length,
      players: playersList.map(p => p.summonerName)
    });
    
    // Comparar com diferentes formatos possíveis
    const isInQueue = playersList.some(player => {
      // Comparar summonerName completo
      if (player.summonerName === userSummonerName) {
        console.log(`✅ [DEBUG] Usuário encontrado na fila: ${userSummonerName}`);
        return true;
      }
      
      // Comparar usando summonerName e tagLine separadamente
      if (player.tagLine) {
        const playerSummonerName = `${player.summonerName}#${player.tagLine}`;
        if (playerSummonerName === userSummonerName) {
          console.log(`✅ [DEBUG] Usuário encontrado na fila (formato separado): ${userSummonerName}`);
          return true;
        }
      }
      
      return false;
    });
    
    return isInQueue;
  }

  inviteToLink(user: any): void {
    // Implementar convite para vincular conta
    console.log('Convidando usuário para vincular:', user.username);
    // Aqui você pode emitir um evento ou chamar um serviço
  }

  inviteToQueue(user: any): void {
    // Implementar convite para entrar na fila
    console.log('Convidando usuário para fila:', user.username);
    // Aqui você pode emitir um evento ou chamar um serviço
  }

  // Método para debugar dados dos jogadores na fila
  debugPlayerData(player: any): void {
    console.log('🔍 [Queue] Dados do jogador:', {
      id: player.id,
      name: player.summonerName,
      primaryLane: player.primaryLane,
      secondaryLane: player.secondaryLane,
      preferences: player.preferences,
      fullPlayer: player
    });
  }

  // Novo método: Verificar se o usuário já está na fila (apenas quando necessário)
  private checkIfUserInQueue() {
    if (!this.currentPlayer) {
      console.log('⚠️ [Queue] checkIfUserInQueue: currentPlayer não disponível');
      return;
    }
    
    console.log('🔍 [Queue] Verificando se usuário está na fila...', {
      currentPlayer: {
        summonerName: this.currentPlayer.summonerName,
        tagLine: this.currentPlayer.tagLine,
        gameName: this.currentPlayer.gameName
      },
      queueStatus: {
        playersInQueue: this.queueStatus.playersInQueue,
        playersList: this.queueStatus.playersInQueueList?.map((p: { summonerName: string; tagLine?: string }) => ({
          summonerName: p.summonerName,
          tagLine: p.tagLine
        }))
      },
      currentState: {
        isInQueue: this.isInQueue
      }
    });
    
    // Verificar se o usuário está na lista de jogadores da fila usando a mesma lógica do isCurrentPlayer
    const playersInQueue = this.queueStatus.playersInQueueList || [];
    const isUserInQueue = playersInQueue.some(player => this.isCurrentPlayer(player));
    
    console.log('🔍 [Queue] Resultado da verificação:', {
      isUserInQueue,
      wasInQueue: this.isInQueue,
      shouldUpdate: isUserInQueue !== this.isInQueue,
      playersChecked: playersInQueue.length
    });
    
    if (isUserInQueue && !this.isInQueue) {
      console.log('✅ [Queue] Usuário encontrado na fila, atualizando estado...');
      this.isInQueue = true;
      this.queueTimer = 0; // Resetar timer
      this.startQueueTimer();
    } else if (!isUserInQueue && this.isInQueue) {
      console.log('❌ [Queue] Usuário não está mais na fila, atualizando estado...');
      this.isInQueue = false;
      this.stopQueueTimer();
      this.queueTimer = 0;
    } else {
      console.log('ℹ️ [Queue] Estado da fila não mudou:', {
        isUserInQueue,
        isInQueue: this.isInQueue
      });
    }
  }

  // Novo método: Verificar se o usuário está na fila baseado nos dados do Discord
  private checkUserInDiscordQueue() {
    if (!this.currentPlayer || !this.discordService.isConnected()) return;
    
    // Verificar se o usuário está na lista de participantes da fila Discord
    const queueParticipants = this.discordService.getQueueParticipants();
    
    // Verificar se queueParticipants existe e é um array
    if (!queueParticipants || !Array.isArray(queueParticipants)) {
      console.log('⚠️ [Queue] queueParticipants não está disponível ou não é um array');
      return;
    }
    
    // Usar a mesma lógica de identificação do isCurrentPlayer
    const isInDiscordQueue = queueParticipants.some(participant => {
      if (participant && participant.linkedNickname) {
        // Criar um objeto temporário para usar com isCurrentPlayer
        const tempPlayer = {
          summonerName: participant.linkedNickname.gameName,
          tagLine: participant.linkedNickname.tagLine
        };
        return this.isCurrentPlayer(tempPlayer);
      }
      return false;
    });
    
    if (isInDiscordQueue && !this.isInQueue) {
      console.log('✅ [Queue] Usuário encontrado na fila Discord, atualizando estado...');
      this.isInQueue = true;
      this.queueTimer = 0;
      this.startQueueTimer();
    }
  }
} 