import { Component, Input, Output, EventEmitter, OnInit, OnDestroy, OnChanges, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';

export interface MatchFoundData {
  matchId: number;
  playerSide: 'blue' | 'red';
  teammates: PlayerInfo[];
  enemies: PlayerInfo[];
  averageMMR: {
    yourTeam: number;
    enemyTeam: number;
  };
  estimatedGameDuration: number;
  phase: 'accept' | 'draft' | 'in_game';
  acceptTimeout: number;
}

export interface PlayerInfo {
  id: number;
  summonerName: string;
  mmr: number;
  primaryLane: string;
  secondaryLane: string;
  assignedLane: string;
  isAutofill: boolean;
}

@Component({
  selector: 'app-match-found',
  imports: [CommonModule],
  templateUrl: './match-found.html',
  styleUrl: './match-found.scss'
})
export class MatchFoundComponent implements OnInit, OnDestroy, OnChanges {
  @Input() matchData: MatchFoundData | null = null;
  @Input() isVisible = false;
  @Output() acceptMatch = new EventEmitter<number>();
  @Output() declineMatch = new EventEmitter<number>();

  acceptTimeLeft = 30;
  private countdownTimer?: number;

  ngOnInit() {
    if (this.matchData && this.matchData.phase === 'accept') {
      this.startAcceptCountdown();
    }
  }

  ngOnChanges(changes: SimpleChanges) {
    // Reinicia o timer quando uma nova partida é encontrada
    if (changes['matchData'] && changes['matchData'].currentValue) {
      if (this.countdownTimer) {
        clearInterval(this.countdownTimer);
      }

      if (this.matchData && this.matchData.phase === 'accept') {
        this.startAcceptCountdown();
      }
    }
  }

  ngOnDestroy() {
    if (this.countdownTimer) {
      clearInterval(this.countdownTimer);
    }
  }

  private startAcceptCountdown(): void {
    this.acceptTimeLeft = this.matchData?.acceptTimeout || 30;

    this.countdownTimer = window.setInterval(() => {
      this.acceptTimeLeft--;

      if (this.acceptTimeLeft <= 0) {
        this.onDeclineMatch(); // Auto-decline se não aceitar
        clearInterval(this.countdownTimer);
      }
    }, 1000);
  }

  onAcceptMatch(): void {
    if (this.matchData) {
      this.acceptMatch.emit(this.matchData.matchId);
      if (this.countdownTimer) {
        clearInterval(this.countdownTimer);
      }
    }
  }

  onDeclineMatch(): void {
    if (this.matchData) {
      this.declineMatch.emit(this.matchData.matchId);
      if (this.countdownTimer) {
        clearInterval(this.countdownTimer);
      }
    }
  }

  getLaneIcon(lane: string): string {
    const icons: { [key: string]: string } = {
      'top': '⚔️',
      'jungle': '🌲',
      'mid': '⚡',
      'bot': '🏹',
      'support': '🛡️',
      'fill': '🎲'
    };
    return icons[lane] || '❓';
  }

  getLaneName(lane: string): string {
    const names: { [key: string]: string } = {
      'top': 'Topo',
      'jungle': 'Selva',
      'mid': 'Meio',
      'bot': 'Atirador',
      'support': 'Suporte',
      'fill': 'Preenchimento'
    };
    return names[lane] || lane;
  }

  getAssignedLaneDisplay(player: PlayerInfo): string {
    if (player.isAutofill) {
      return `${this.getLaneIcon(player.assignedLane)} ${this.getLaneName(player.assignedLane)} (Auto)`;
    }
    return `${this.getLaneIcon(player.assignedLane)} ${this.getLaneName(player.assignedLane)}`;
  }

  getLanePreferencesDisplay(player: PlayerInfo): string {
    const primary = `${this.getLaneIcon(player.primaryLane)} ${this.getLaneName(player.primaryLane)}`;
    const secondary = `${this.getLaneIcon(player.secondaryLane)} ${this.getLaneName(player.secondaryLane)}`;
    return `${primary} • ${secondary}`;
  }

  /**
   * Ordena jogadores por lane na ordem: top, jungle, mid, adc, support
   */
  getSortedPlayersByLane(players: PlayerInfo[]): PlayerInfo[] {
    const laneOrder = ['top', 'jungle', 'mid', 'bot', 'support'];
    
    return [...players].sort((a, b) => {
      const laneA = a.assignedLane || a.primaryLane || 'fill';
      const laneB = b.assignedLane || b.primaryLane || 'fill';
      
      const indexA = laneOrder.indexOf(laneA);
      const indexB = laneOrder.indexOf(laneB);
      
      // Se ambos têm lane válida, ordenar pela ordem definida
      if (indexA !== -1 && indexB !== -1) {
        return indexA - indexB;
      }
      
      // Se apenas um tem lane válida, priorizar o que tem
      if (indexA !== -1) return -1;
      if (indexB !== -1) return 1;
      
      // Se nenhum tem lane válida, manter ordem original
      return 0;
    });
  }

  getTeamSideName(side: 'blue' | 'red'): string {
    return side === 'blue' ? 'Time Azul' : 'Time Vermelho';
  }

  getTeamColor(side: 'blue' | 'red'): string {
    return side === 'blue' ? '#3498db' : '#e74c3c';
  }

  getBalanceRating(mmrDiff: number): string {
    if (mmrDiff <= 50) return 'Excelente';
    if (mmrDiff <= 100) return 'Bom';
    if (mmrDiff <= 150) return 'Regular';
    return 'Desbalanceado';
  }

  // Métodos auxiliares para cálculos matemáticos no template
  getRoundedMMR(mmr: number): number {
    return Math.round(mmr);
  }

  getMMRDifference(): number {
    if (!this.matchData) return 0;
    return Math.abs(Math.round(this.matchData.averageMMR.yourTeam - this.matchData.averageMMR.enemyTeam));
  }

  isExcellentBalance(): boolean {
    return this.getMMRDifference() <= 50;
  }

  isGoodBalance(): boolean {
    const diff = this.getMMRDifference();
    return diff <= 100 && diff > 50;
  }

  isFairBalance(): boolean {
    return this.getMMRDifference() > 100;
  }
}
