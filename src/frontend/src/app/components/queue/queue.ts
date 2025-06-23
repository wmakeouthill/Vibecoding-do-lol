import { Component, Input, Output, EventEmitter, OnInit, OnDestroy, OnChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Player, QueueStatus, QueuePreferences } from '../../interfaces';
import { LaneSelectorComponent } from '../lane-selector/lane-selector';

@Component({
  selector: 'app-queue',
  imports: [CommonModule, FormsModule, LaneSelectorComponent],
  templateUrl: './queue.html',
  styleUrl: './queue.scss'
})
export class QueueComponent implements OnInit, OnDestroy, OnChanges {
  @Input() isInQueue: boolean = false;  @Input() queueStatus: QueueStatus = {
    playersInQueue: 0,
    averageWaitTime: 0,
    estimatedMatchTime: 0,
    isActive: true
  };
  @Input() currentPlayer: Player | null = null;
  @Output() joinQueue = new EventEmitter<QueuePreferences>();
  @Output() leaveQueue = new EventEmitter<void>();
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

  ngOnInit() {
    if (this.isInQueue) {
      this.startTimer();
    }
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
  }  getQueueHealthColor(): string {
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
    return '';  }

  onProfileIconError(event: Event): void {
    // Fallback para ícone padrão se falhar o carregamento
    // console.log('Erro ao carregar ícone de perfil no queue, tentando fallback');

    const target = event.target as HTMLImageElement;
    if (!target) return;

    const iconId = this.currentPlayer?.profileIconId || 29;    const fallbackUrls = [
      `https://ddragon.leagueoflegends.com/cdn/15.12.1/img/profileicon/${iconId}.png`,
      `https://ddragon.leagueoflegends.com/cdn/14.23.1/img/profileicon/${iconId}.png`,
      `https://ddragon.leagueoflegends.com/cdn/14.22.1/img/profileicon/${iconId}.png`,
      `https://ddragon.leagueoflegends.com/cdn/14.21.1/img/profileicon/${iconId}.png`,
      `https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/v1/profile-icons/${iconId}.jpg`,
      'https://ddragon.leagueoflegends.com/cdn/15.12.1/img/profileicon/29.png', // Default icon
      'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iODAiIGhlaWdodD0iODAiIHZpZXdCb3g9IjAgMCA4MCA4MCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPGNpcmNsZSBjeD0iNDAiIGN5PSI0MCIgcj0iNDAiIGZpbGw9IiM0Njc0ODEiLz4KPHN2ZyB4PSIxNiIgeT0iMTYiIHdpZHRoPSI0OCIgaGVpZGh0PSI0OCIgdmlld0JveD0iMCAwIDI0IDI0IiBmaWxsPSIjRkZGRkZGIj4KPHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIGZpbGw9Im5vbmUiIHZpZXdCb3g9IjAgMCAyNCAyNCIgc3Ryb2tlLXdpZHRoPSIxLjUiIHN0cm9rZT0iY3VycmVudENvbG9yIj4KICA8cGF0aCBzdHJva2UtbGluZWNhcD0icm91bmQiIHN0cm9rZS1saW5lam9pbj0icm91bmQiIGQ9Ik0xNS43NSA2YTMuNzUgMy43NSAwIDEgMS03LjUgMCAzLjc1IDMuNzUgMCAwIDEgNy41IDBaTTQuNTAxIDIwLjExOGE3LjUgNy41IDAgMCAxIDE0Ljk5OCAwQTMuNzE4IDMuNzE4IDAgMCAxIDE2Ljk5OCAyMmgtNy45OTZhMy43MTggMy43MTggMCAwIDEtMi40OTctMS44ODJ6IiAvPgo8L3N2Zz4K'
    ];

    const fallbackAttempt = parseInt(target.dataset['fallbackAttempt'] || '0');

    // Se já tentou todos os fallbacks, usar um ícone SVG genérico
    if (fallbackAttempt >= fallbackUrls.length - 1) {
      return;
    }

    const attemptIndex = fallbackAttempt + 1;
    target.dataset['fallbackAttempt'] = attemptIndex.toString();
    target.src = fallbackUrls[attemptIndex];
  }

  getProfileIconUrl(): string {
    const iconId = this.currentPlayer?.profileIconId || 29;
    // Usar a versão mais atual do CDN Data Dragon
    return `https://ddragon.leagueoflegends.com/cdn/15.12.1/img/profileicon/${iconId}.png`;
  }
  // Método para obter nome exibível da lane
  getLaneDisplayName(laneId: string): string {
    const laneNames: { [key: string]: string } = {
      'top': 'Topo',
      'jungle': 'Selva',
      'mid': 'Meio',
      'bot': 'Atirador',
      'adc': 'Atirador',
      'support': 'Suporte',
      'any': 'Qualquer'
    };
    return laneNames[laneId] || 'Qualquer';
  }

  // Método para obter slots vazios na fila
  getEmptySlots(): number[] {
    const playersCount = this.queueStatus.playersInQueue || 0;
    const maxPlayers = 10;
    const emptyCount = Math.max(0, maxPlayers - playersCount);
    return Array(emptyCount).fill(0).map((_, i) => i);
  }

  // Método para calcular tempo passado
  getTimeAgo(timestamp: Date | string): string {
    const now = new Date();
    const time = new Date(timestamp);
    const diffInSeconds = Math.floor((now.getTime() - time.getTime()) / 1000);

    if (diffInSeconds < 60) {
      return 'agora';
    } else if (diffInSeconds < 3600) {
      const minutes = Math.floor(diffInSeconds / 60);
      return `há ${minutes} min`;
    } else if (diffInSeconds < 86400) {
      const hours = Math.floor(diffInSeconds / 3600);
      return `há ${hours}h`;
    } else {
      const days = Math.floor(diffInSeconds / 86400);
      return `há ${days}d`;
    }
  }

  // Verificar se o usuário atual é o popcorn seller que pode adicionar bots
  isSpecialUser(): boolean {
    return this.currentPlayer?.summonerName === 'popcorn seller' &&
           this.currentPlayer?.tagLine === 'coup';
  }

  // Método para verificar se o player foi auto-preenchido em uma lane
  isPlayerAutofilled(player: any): boolean {
    return player?.preferences?.isAutofill || false;
  }

  // Método para obter a lane atribuída final
  getAssignedLane(player: any): string {
    return player?.preferences?.assignedLane || player?.preferences?.primaryLane || 'any';
  }

  // Método para exibir indicador de autofill
  getAutofillIndicator(player: any): string {
    return this.isPlayerAutofilled(player) ? ' (Autofill)' : '';
  }

  // Método para adicionar bot na fila
  onAddBot(): void {
    if (!this.isSpecialUser()) {
      console.warn('Usuário não autorizado para adicionar bots');
      return;
    }
    this.addBot.emit();
  }

  // Método para simular última partida customizada (apenas para usuário especial)
  onSimulateLastMatch(): void {
    if (!this.isSpecialUser()) {
      console.warn('Usuário não autorizado para simular partidas');
      return;
    }
    this.simulateLastMatch.emit();
  }

  // Método para limpar partidas de teste (apenas para usuário especial)
  onCleanupTestMatches(): void {
    if (!this.isSpecialUser()) {
      console.warn('Usuário não autorizado para limpar partidas de teste');
      return;
    }
    this.cleanupTestMatches.emit();
  }

  // Método para obter texto explicativo do sistema de lanes
  getLaneSystemExplanation(): string {
    return 'Sistema de lanes: Jogadores com MMR mais alto têm prioridade na sua lane preferida. ' +
           'Se sua lane não estiver disponível, você será colocado na sua segunda opção ou ' +
           'em autofill para uma lane disponível.';
  }
}
