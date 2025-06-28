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
  // Adicionar outputs para funcionalidade de bots
  @Output() addBot = new EventEmitter<void>();
  @Output() simulateLastMatch = new EventEmitter<void>();
  @Output() cleanupTestMatches = new EventEmitter<void>();

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
  showDevTools = false;

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
    
    // Show dev tools for special users
    this.showDevTools = this.isSpecialUser();
  }

  ngOnDestroy() {
    this.stopTimer();
    this.stopAutoRefresh();
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
    this.leaveQueue.emit();
    this.stopTimer();
    this.queueTimer = 0;
  }

  private startTimer() {
    this.timerInterval = window.setInterval(() => {
      this.queueTimer++;
    }, 1000);
  }

  private stopTimer() {
    if (this.timerInterval) {
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
      'support': 'Suporte'
    };
    return lanes[laneId] || laneId;
  }

  getLaneIcon(laneId: string): string {
    const lanes: { [key: string]: string } = {
      'top': '🛡️',
      'jungle': '🌲',
      'mid': '⚡',
      'bot': '🏹',
      'support': '🛡️'
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
      `https://ddragon.leagueoflegends.com/cdn/15.12.1/img/profileicon/${iconId}.png`,
      `https://ddragon.leagueoflegends.com/cdn/14.23.1/img/profileicon/${iconId}.png`,
      `https://ddragon.leagueoflegends.com/cdn/14.22.1/img/profileicon/${iconId}.png`,
      `https://ddragon.leagueoflegends.com/cdn/14.21.1/img/profileicon/${iconId}.png`,
      `https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/v1/profile-icons/${iconId}.jpg`,
      'https://ddragon.leagueoflegends.com/cdn/15.12.1/img/profileicon/29.png', // Default icon
      'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iODAiIGhlaWdodD0iODAiIHZpZXdCb3g9IjAgMCA4MCA4MCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPGNpcmNsZSBjeD0iNDAiIGN5PSI0MCIgcj0iNDAiIGZpbGw9IiM0Njc0ODEiLz4KPHN2ZyB4PSIxNiIgeT0iMTYiIHdpZHRoPSI0OCIgaGVpZ2h0PSI0OCIgdmlld0JveD0iMCAwIDI0IDI0IiBmaWxsPSIjRkZGRkZGIj4KPHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIGZpbGw9Im5vbmUiIHZpZXdCb3g9IjAgMCAyNCAyNCIgc3Ryb2tlLXdpZHRoPSIxLjUiIHN0cm9rZT0iY3VycmVudENvbG9yIj4KICA8cGF0aCBzdHJva2UtbGluZWNhcD0icm91bmQiIHN0cm9rZS1saW5lam9pbj0icm91bmQiIGQ9Ik0xNS43NSA2YTMuNzUgMy43NSAwIDEgMS03LjUgMCAzLjc1IDMuNzUgMCAwIDEgNy41IDBaTTQuNTAxIDIwLjExOGE3LjUgNy41IDAgMCAxIDE0Ljk5OCAwQTMuNzE4IDMuNzE4IDAgMCAxIDE2Ljk5OCAyMmgtNy45OTZhMy43MTggMy43MTggMCAwIDEtMi40OTctMS44ODJ6IiAvPgo8L3N2Zz4K'
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
      return 'https://ddragon.leagueoflegends.com/cdn/15.12.1/img/profileicon/29.png';
    }
    return `https://ddragon.leagueoflegends.com/cdn/15.12.1/img/profileicon/${this.currentPlayer.profileIconId}.png`;
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

  isSpecialUser(): boolean {
    // Verificar se é usuário especial (desenvolvedor, admin, etc.)
    const specialUsers = ['wcaco', 'admin', 'dev', 'popcorn seller'];
    return specialUsers.includes(this.currentPlayer?.gameName?.toLowerCase() || '') ||
           specialUsers.includes(this.currentPlayer?.summonerName?.toLowerCase() || '');
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
    this.addBot.emit();
  }

  onSimulateLastMatch(): void {
    this.simulateLastMatch.emit();
  }

  onCleanupTestMatches(): void {
    this.cleanupTestMatches.emit();
  }

  getLaneSystemExplanation(): string {
    return 'Sistema de lanes: Cada jogador escolhe 2 lanes preferidas. O sistema tenta colocar todos em suas primeiras escolhas, mas pode usar a segunda escolha se necessário.';
  }

  private setupDiscordListeners() {
    console.log('🎧 [Queue] Configurando listeners do Discord...');
    
    // Escutar mudanças de conexão
    this.discordService.onConnectionChange().subscribe((connected) => {
      console.log('🔗 [Queue] Status de conexão Discord mudou:', connected);
      this.checkDiscordConnection();
    });

    // Escutar atualizações de usuários
    this.discordService.onUsersUpdate().subscribe((users) => {
      console.log('👥 [Queue] Usuários Discord atualizados:', users.length);
      this.discordUsersOnline = users;
    });

    // Verificar status do canal periodicamente se Discord estiver conectado
    // Usar uma variável para controlar o intervalo
    if (this.autoRefreshInterval) {
      clearInterval(this.autoRefreshInterval);
    }
    
    this.autoRefreshInterval = setInterval(() => {
      if (this.discordService.isDiscordBackendConnected()) {
        this.discordService.requestChannelStatus();
      }
    }, 30000); // Verificar a cada 30 segundos
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

    // Usar dados do LCU automaticamente
    const playerData = {
      ...this.currentPlayer,
      gameName: this.currentPlayer.gameName,
      tagLine: this.currentPlayer.tagLine,
      summonerName: this.currentPlayer.summonerName,
      preferences: preferences
    };

    console.log('🎮 Confirmando entrada na fila Discord com dados do LCU:', playerData);

    // Emitir evento com dados completos
    this.joinDiscordQueueWithFullData.emit({
      player: playerData,
      preferences: preferences
    });

    this.showLaneSelector = false;
    this.queuePreferences = preferences;
    this.isInQueue = true;
    this.queueTimer = 0;
    this.startTimer();
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
    
    // Aguardar um pouco para receber as respostas
    setTimeout(() => {
      // Atualizar dados locais do Discord
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
      
      this.isRefreshing = false;
    }, 1000);
  }

  // Método para atualizar especificamente a fila
  refreshQueueData(): void {
    console.log('🔄 [Queue] Atualizando dados da fila...');
    
    // Solicitar status da fila
    if (this.discordService.isConnected()) {
      this.discordService.requestDiscordStatus();
    }
    
    // Emitir evento para o componente pai atualizar a fila
    // (se necessário, você pode adicionar um Output para isso)
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

  private startAutoRefresh(): void {
    if (this.autoRefreshInterval) {
      clearInterval(this.autoRefreshInterval);
    }
    
    if (this.autoRefreshEnabled) {
      this.autoRefreshInterval = window.setInterval(() => {
        // Não chamar refreshPlayersData aqui para evitar conflitos
        // Apenas atualizar dados locais se necessário
        this.discordUsersOnline = this.discordService.getDiscordUsersOnline() || [];
        this.discordQueue = this.discordService.getQueueParticipants() || [];
      }, 30000); // Atualizar a cada 30 segundos
    }
  }

  private stopAutoRefresh(): void {
    if (this.autoRefreshInterval) {
      clearInterval(this.autoRefreshInterval);
      this.autoRefreshInterval = undefined;
    }
  }
} 