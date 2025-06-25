import { Component, Input, Output, EventEmitter, OnInit, OnDestroy, OnChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Player, QueueStatus, QueuePreferences } from '../../interfaces';
import { DiscordIntegrationService } from '../../services/discord-integration.service';

@Component({
  selector: 'app-queue',
  imports: [CommonModule, FormsModule],
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

  // Nickname linking
  hasLinkedNickname = false;
  linkedNickname: {gameName: string, tagLine: string} | null = null;
  showLinkModal = false;
  linkForm = {
    gameName: '',
    tagLine: ''
  };

  // Development tools
  showDevTools = false;

  constructor(private discordService: DiscordIntegrationService) {}

  ngOnInit() {
    if (this.isInQueue) {
      this.startTimer();
    }

    // Setup Discord integration
    this.setupDiscordListeners();
    this.checkDiscordConnection();
    
    // Check for linked nickname
    this.checkLinkedNickname();
    
    // Show dev tools for special users
    this.showDevTools = this.isSpecialUser();
  }

  ngOnDestroy() {
    this.stopTimer();
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
    const specialUsers = ['wcaco', 'admin', 'dev'];
    return specialUsers.includes(this.currentPlayer?.gameName?.toLowerCase() || '');
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
    // Escutar eventos do Discord
    window.addEventListener('discordUsersUpdate', ((event: CustomEvent) => {
      this.discordUsersOnline = event.detail.users;
      this.isDiscordConnected = this.discordService.isConnected();
      this.isInDiscordChannel = this.discordService.isInChannel();
    }) as EventListener);

    window.addEventListener('queueUpdate', ((event: CustomEvent) => {
      this.discordQueue = event.detail.queue;
    }) as EventListener);

    window.addEventListener('matchFound', ((event: CustomEvent) => {
      this.handleDiscordMatchFound(event.detail);
    }) as EventListener);
  }

  private checkDiscordConnection() {
    // Verificar status inicial do Discord
    this.isDiscordConnected = this.discordService.isConnected();
    this.isInDiscordChannel = this.discordService.isInChannel();
    this.currentDiscordUser = this.discordService.getCurrentDiscordUser();
    this.discordUsersOnline = this.discordService.getDiscordUsersOnline();
    this.discordQueue = this.discordService.getQueueParticipants();
  }

  onJoinDiscordQueue() {
    if (!this.isInDiscordChannel) {
      alert('❌ Você precisa estar no canal #lol-matchmaking no Discord!');
      return;
    }

    if (!this.currentDiscordUser) {
      alert('❌ Não foi possível identificar seu usuário Discord!');
      return;
    }

    this.showLaneSelector = true;
  }

  onConfirmDiscordQueue(preferences: QueuePreferences) {
    this.queuePreferences = preferences;
    this.showLaneSelector = false;
    
    const role = this.mapLaneToRole(preferences.primaryLane);
    const username = this.currentDiscordUser?.username || 'Unknown';
    
    this.discordService.joinDiscordQueue(role, username);
    console.log(`🎯 Entrou na fila Discord como ${role}`);
  }

  onLeaveDiscordQueue() {
    this.discordService.leaveDiscordQueue();
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

  async checkLinkedNickname() {
    const currentUser = this.discordService.getCurrentDiscordUser();
    if (!currentUser) return;

    const linkedNickname = this.discordService.getLinkedNickname(currentUser.id);
    this.hasLinkedNickname = !!linkedNickname;
    this.linkedNickname = linkedNickname;
  }

  showLinkNicknameModal() {
    if (!this.currentPlayer) {
      alert('❌ Precisa ter um jogador carregado para vincular!');
      return;
    }

    this.linkForm.gameName = this.currentPlayer.gameName || '';
    this.linkForm.tagLine = this.currentPlayer.tagLine || '';
    this.showLinkModal = true;
  }

  closeLinkModal() {
    this.showLinkModal = false;
    this.linkForm = { gameName: '', tagLine: '' };
  }

  async linkNickname() {
    if (!this.linkForm.gameName || !this.linkForm.tagLine) {
      alert('❌ Preencha o Game Name e Tag Line!');
      return;
    }

    const currentUser = this.discordService.getCurrentDiscordUser();
    if (!currentUser) {
      alert('❌ Não foi possível identificar seu usuário Discord!');
      return;
    }

    // Tentar auto-vinculação com LCU
    const success = await this.discordService.autoLinkWithLCU({
      gameName: this.linkForm.gameName,
      tagLine: this.linkForm.tagLine
    });

    if (success) {
      this.closeLinkModal();
      this.checkLinkedNickname();
      alert('✅ Nickname vinculado com sucesso!');
    } else {
      alert('❌ Erro ao vincular nickname. Tente novamente.');
    }
  }

  async unlinkNickname() {
    // Implementar desvinculação se necessário
    this.hasLinkedNickname = false;
    this.linkedNickname = null;
  }
} 