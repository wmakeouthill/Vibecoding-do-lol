import { Component, Input, Output, EventEmitter, OnInit, OnDestroy, OnChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Player, QueueStatus, QueuePreferences } from '../../interfaces';
import { DiscordIntegrationService } from '../../services/discord-integration.service';
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
  private autoRefreshInterval?: number;

  constructor(public discordService: DiscordIntegrationService) {}

  ngOnInit() {
    if (this.isInQueue) {
      this.startTimer();
    }

    // Setup Discord integration
    this.setupDiscordListeners();
    this.checkDiscordConnection();
    
    // Verificar se o usuário já está na fila quando reconecta
    this.checkIfUserInQueue();
  }

  ngOnDestroy() {
    console.log('🛑 [Queue] Destruindo componente...');
    
    // Parar timer da fila
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.timerInterval = undefined;
    }
    
    // REMOVIDO: Limpeza de autoRefreshInterval - não existe mais polling
    // O DiscordService já cuida de limpar seus próprios recursos
  }

  ngOnChanges() {
    if (this.isInQueue && !this.timerInterval) {
      this.startTimer();
    } else if (!this.isInQueue && this.timerInterval) {
      this.stopTimer();
    }
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
    this.startTimer();
  }

  onCloseLaneSelector() {
    this.showLaneSelector = false;
  }

  onLeaveQueue() {
    console.log('🔍 [Queue] Sair da fila solicitado');
    this.leaveQueue.emit();
    this.stopTimer();
    this.queueTimer = 0;
  }

  private startTimer() {
    // Parar timer existente antes de iniciar novo
    this.stopTimer();
    
    console.log('⏱️ [Queue] Iniciando timer da fila');
    this.timerInterval = window.setInterval(() => {
      this.queueTimer++;
      // Log a cada minuto para debug
      if (this.queueTimer % 60 === 0) {
        console.log(`⏱️ [Queue] Timer: ${this.getTimerDisplay()}`);
      }
    }, 1000);
  }

  private stopTimer() {
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
    // Escutar atualizações de usuários Discord em tempo real
    this.discordService.onUsersUpdate().subscribe(users => {
      console.log('👥 [Queue] Usuários Discord atualizados:', users.length);
      this.discordUsersOnline = users || [];
      
      // Forçar atualização da UI
      this.refreshQueueData();
    });

    // Escutar mudanças de conexão Discord
    this.discordService.onConnectionChange().subscribe(isConnected => {
      console.log('🔗 [Queue] Status de conexão Discord mudou:', isConnected);
      this.isDiscordConnected = isConnected;
      this.showDiscordMode = isConnected;
      
      // Se conectou, verificar status imediatamente
      if (isConnected) {
        this.checkDiscordConnection();
      }
    });

    // Escutar atualizações da fila em tempo real
    this.discordService.onQueueUpdate().subscribe(queueData => {
      console.log('🎯 [Queue] Fila atualizada via WebSocket:', queueData?.playersInQueue || 0, 'jogadores');
      if (queueData) {
        this.discordQueue = queueData.playersInQueueList || [];
        this.refreshQueueData();
      }
    });

    // Escutar quando entrar na fila
    this.discordService.onQueueJoined().subscribe(data => {
      console.log('✅ [Queue] Entrou na fila Discord:', data);
      if (data) {
        this.isInQueue = true;
        this.queueTimer = 0;
        this.startTimer();
      }
    });

    // Escutar quando encontrar partida
    this.discordService.onMatchFound().subscribe(matchData => {
      console.log('🎮 [Queue] Partida encontrada via Discord:', matchData);
      this.handleDiscordMatchFound(matchData);
    });

    // REMOVIDO: Polling desnecessário - WebSocket já fornece atualizações em tempo real
    // O sistema de atualização automática do DiscordService já cuida de backups
  }

  private checkDiscordConnection() {
    // Verificar status inicial do Discord
    this.isDiscordConnected = this.discordService.isConnected();
    this.isInDiscordChannel = this.discordService.isInChannel();
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
      showDiscordMode: this.showDiscordMode
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
      this.startTimer();
    } else {
      alert('❌ Falha ao entrar na fila Discord. Verifique se está no canal correto e logado no LoL.');
    }
  }

  onLeaveDiscordQueue() {
    this.discordService.leaveDiscordQueue();
    this.leaveQueue.emit();
    this.stopTimer();
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
    
    // Solicitar atualização completa do Discord
    this.discordService.requestDiscordStatus();
    
    // Atualizar dados locais imediatamente
    this.discordUsersOnline = this.discordService.getDiscordUsersOnline() || [];
    this.isDiscordConnected = this.discordService.isConnected();
    this.isInDiscordChannel = this.discordService.isInChannel();
    this.discordQueue = this.discordService.getQueueParticipants() || [];
    
    // Atualizar status de conexão
    this.checkDiscordConnection();
    
    console.log('✅ [Queue] Dados atualizados:', {
      usersOnline: this.discordUsersOnline.length,
      queueSize: this.discordQueue.length,
      isDiscordConnected: this.isDiscordConnected,
      isInChannel: this.isInDiscordChannel
    });
    
    // Aguardar um pouco e atualizar novamente para garantir dados mais recentes
    setTimeout(() => {
      this.discordUsersOnline = this.discordService.getDiscordUsersOnline() || [];
      this.discordQueue = this.discordService.getQueueParticipants() || [];
      this.isRefreshing = false;
      
      console.log('✅ [Queue] Atualização finalizada:', {
        usersOnline: this.discordUsersOnline.length,
        queueSize: this.discordQueue.length
      });
    }, 500);
  }

  // Método para atualizar especificamente a fila
  refreshQueueData(): void {
    console.log('🔄 [Queue] Atualizando dados da fila...');
    
    // Solicitar status atualizado da fila
    this.discordService.requestDiscordStatus();
    
    // Verificar se o usuário ainda está na fila após atualização
    setTimeout(() => {
      this.checkIfUserInQueue();
    }, 500);
  }

  trackByPlayerId(index: number, player: any): string {
    return player.summonerName || index.toString();
  }

  trackByDiscordUserId(index: number, user: any): string {
    return user.id || user.username || index.toString();
  }

  isCurrentPlayer(player: any): boolean {
    return !!this.currentPlayer && player.summonerName === this.currentPlayer.summonerName;
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
    
    // Verificar se o usuário está na lista de jogadores da fila
    const userSummonerName = this.currentPlayer.summonerName;
    const userTagLine = this.currentPlayer.tagLine;
    const userGameName = this.currentPlayer.gameName;
    
    // Tentar diferentes formatos de nome
    const possibleNames = [
      userSummonerName,
      userTagLine ? `${userSummonerName}#${userTagLine}` : null,
      userGameName && userTagLine ? `${userGameName}#${userTagLine}` : null,
      userGameName ? userGameName : null
    ].filter(Boolean);
    
    console.log('🔍 [Queue] Possíveis nomes para busca:', possibleNames);
    
    const playersInQueue = this.queueStatus.playersInQueueList || [];
    const isUserInQueue = playersInQueue.some(player => {
      const playerNames = [
        player.summonerName,
        player.tagLine ? `${player.summonerName}#${player.tagLine}` : null
      ].filter(Boolean);
      
      const match = possibleNames.some(userName => 
        playerNames.some(playerName => 
          userName && playerName && userName.toLowerCase() === playerName.toLowerCase()
        )
      );
      
      if (match) {
        console.log('✅ [Queue] Usuário encontrado na fila:', {
          userName: possibleNames.find(name => 
            playerNames.some(playerName => 
              name && playerName && name.toLowerCase() === playerName.toLowerCase()
            )
          ),
          playerName: player.summonerName,
          playerTagLine: player.tagLine
        });
      }
      
      return match;
    });
    
    console.log('🔍 [Queue] Resultado da verificação:', {
      isUserInQueue,
      wasInQueue: this.isInQueue,
      shouldUpdate: isUserInQueue !== this.isInQueue
    });
    
    if (isUserInQueue && !this.isInQueue) {
      console.log('✅ [Queue] Usuário encontrado na fila, atualizando estado...');
      this.isInQueue = true;
      this.queueTimer = 0; // Resetar timer
      this.startTimer();
    } else if (!isUserInQueue && this.isInQueue) {
      console.log('❌ [Queue] Usuário não está mais na fila, atualizando estado...');
      this.isInQueue = false;
      this.stopTimer();
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
    
    const userSummonerName = this.currentPlayer.summonerName;
    const userTagLine = this.currentPlayer.tagLine;
    const userFullName = userTagLine ? `${userSummonerName}#${userTagLine}` : userSummonerName;
    
    // Verificar se o usuário está na lista de participantes da fila Discord
    const queueParticipants = this.discordService.getQueueParticipants();
    
    // Verificar se queueParticipants existe e é um array
    if (!queueParticipants || !Array.isArray(queueParticipants)) {
      console.log('⚠️ [Queue] queueParticipants não está disponível ou não é um array');
      return;
    }
    
    const isInDiscordQueue = queueParticipants.some(participant => {
      if (participant && participant.linkedNickname) {
        const participantFullName = `${participant.linkedNickname.gameName}#${participant.linkedNickname.tagLine}`;
        return participantFullName === userFullName;
      }
      return false;
    });
    
    if (isInDiscordQueue && !this.isInQueue) {
      console.log('✅ [Queue] Usuário encontrado na fila Discord, atualizando estado...');
      this.isInQueue = true;
      this.queueTimer = 0;
      this.startTimer();
    }
  }
} 