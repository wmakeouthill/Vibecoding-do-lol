import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ChampionService, Champion } from '../../services/champion.service';

interface PickBanPhase {
  team: 'blue' | 'red';
  action: 'ban' | 'pick';
  champion?: Champion;
  playerId?: string;
  playerName?: string;
  locked: boolean;
  timeRemaining: number;
}

interface CustomPickBanSession {
  id: string;
  phase: 'bans' | 'picks' | 'completed';
  currentAction: number;
  extendedTime: number;
  phases: PickBanPhase[];
  blueTeam: any[];
  redTeam: any[];
  currentPlayerIndex: number;
}

interface TeamSlot {
  player: any;
  champion?: Champion;
  phaseIndex?: number;
}

@Component({
  selector: 'app-draft-confirmation-modal',
  imports: [CommonModule],
  templateUrl: './draft-confirmation-modal.html',
  styleUrl: './draft-confirmation-modal.scss'
})
export class DraftConfirmationModalComponent {
  @Input() session: CustomPickBanSession | null = null;
  @Input() currentPlayer: any = null;
  @Input() isVisible: boolean = false;
  @Output() onClose = new EventEmitter<void>();
  @Output() onConfirm = new EventEmitter<void>();
  @Output() onCancel = new EventEmitter<void>();
  @Output() onEditPick = new EventEmitter<{ playerId: string, phaseIndex: number }>();

  // PROPRIEDADES PARA CACHE
  private _cachedBannedChampions: Champion[] | null = null;
  private _cachedBlueTeamPicks: Champion[] | null = null;
  private _cachedRedTeamPicks: Champion[] | null = null;
  private _cachedBlueTeamByLane: TeamSlot[] | null = null;
  private _cachedRedTeamByLane: TeamSlot[] | null = null;
  private _lastCacheUpdate: number = 0;
  private readonly CACHE_DURATION = 100;

  constructor(private championService: ChampionService) { }

  // MÉTODOS PARA COMPARAÇÃO DE JOGADORES
  private comparePlayerWithId(player: any, targetId: string): boolean {
    if (!player || !targetId) return false;

    const playerId = player.id?.toString();
    const playerName = player.summonerName || player.name || '';

    if (playerId === targetId) {
      return true;
    }

    if (playerName === targetId) {
      return true;
    }

    if (playerName.includes('#')) {
      const gameName = playerName.split('#')[0];
      if (gameName === targetId) {
        return true;
      }
    }

    return false;
  }

  private comparePlayers(player1: any, player2: any): boolean {
    if (!player1 || !player2) return false;

    const id1 = player1.id?.toString();
    const name1 = player1.summonerName || player1.name || '';
    const id2 = player2.id?.toString();
    const name2 = player2.summonerName || player2.name || '';

    if (id1 && id2 && id1 === id2) {
      return true;
    }

    if (name1 && name2 && name1 === name2) {
      return true;
    }

    if (name1 && name2 && name1.includes('#')) {
      const gameName1 = name1.split('#')[0];
      if (name2.includes('#')) {
        const gameName2 = name2.split('#')[0];
        if (gameName1 === gameName2) {
          return true;
        }
      } else if (gameName1 === name2) {
        return true;
      }
    }

    if (name1 && name2 && name1.startsWith(name2 + '#')) {
      return true;
    }

    return false;
  }

  // MÉTODOS PARA VERIFICAR ESTADO DOS CAMPEÕES
  getBannedChampions(): Champion[] {
    if (this.isCacheValid() && this._cachedBannedChampions) {
      return this._cachedBannedChampions;
    }

    if (!this.session) return [];

    const bannedChampions = this.session.phases
      .filter(phase => phase.action === 'ban' && phase.champion)
      .map(phase => phase.champion!)
      .filter((champion, index, self) =>
        index === self.findIndex(c => c.id === champion.id)
      );

    this._cachedBannedChampions = bannedChampions;
    this._lastCacheUpdate = Date.now();

    return bannedChampions;
  }

  getTeamPicks(team: 'blue' | 'red'): Champion[] {
    if (team === 'blue' && this.isCacheValid() && this._cachedBlueTeamPicks) {
      return this._cachedBlueTeamPicks;
    }
    if (team === 'red' && this.isCacheValid() && this._cachedRedTeamPicks) {
      return this._cachedRedTeamPicks;
    }

    if (!this.session) return [];

    const teamPicks = this.session.phases
      .filter(phase => phase.team === team && phase.action === 'pick' && phase.champion)
      .map(phase => phase.champion!);

    if (team === 'blue') {
      this._cachedBlueTeamPicks = teamPicks;
    } else {
      this._cachedRedTeamPicks = teamPicks;
    }
    this._lastCacheUpdate = Date.now();

    return teamPicks;
  }

  getTeamBans(team: 'blue' | 'red'): Champion[] {
    if (!this.session) return [];

    return this.session.phases
      .filter(phase => phase.team === team && phase.action === 'ban' && phase.champion)
      .map(phase => phase.champion!);
  }

  // MÉTODOS PARA ORGANIZAR TIMES POR LANE
  getSortedTeamByLane(team: 'blue' | 'red'): any[] {
    if (!this.session) return [];

    const teamPlayers = team === 'blue' ? this.session.blueTeam : this.session.redTeam;
    return this.sortPlayersByLane(teamPlayers);
  }

  private sortPlayersByLane(players: any[]): any[] {
    const laneOrder = ['top', 'jungle', 'mid', 'adc', 'support'];

    return players.sort((a, b) => {
      const laneA = a.lane || 'unknown';
      const laneB = b.lane || 'unknown';

      const indexA = laneOrder.indexOf(laneA);
      const indexB = laneOrder.indexOf(laneB);

      if (indexA === -1 && indexB === -1) return 0;
      if (indexA === -1) return 1;
      if (indexB === -1) return -1;

      return indexA - indexB;
    });
  }

  // MÉTODOS PARA ORGANIZAR TIMES COM PICKS
  getTeamByLane(team: 'blue' | 'red'): TeamSlot[] {
    if (team === 'blue' && this.isCacheValid() && this._cachedBlueTeamByLane) {
      return this._cachedBlueTeamByLane;
    }
    if (team === 'red' && this.isCacheValid() && this._cachedRedTeamByLane) {
      return this._cachedRedTeamByLane;
    }

    if (!this.session) return [];

    const teamPlayers = this.getSortedTeamByLane(team);
    const teamPicks = this.getTeamPicks(team);
    const organizedTeam = this.organizeTeamByLanes(teamPlayers, teamPicks);

    if (team === 'blue') {
      this._cachedBlueTeamByLane = organizedTeam;
    } else {
      this._cachedRedTeamByLane = organizedTeam;
    }
    this._lastCacheUpdate = Date.now();

    return organizedTeam;
  }

  private organizeTeamByLanes(teamPlayers: any[], teamPicks: any[]): TeamSlot[] {
    return teamPlayers.map((player, index) => ({
      player,
      champion: teamPicks[index] || undefined,
      phaseIndex: this.getPhaseIndexForPlayer(player)
    }));
  }

  private getPhaseIndexForPlayer(player: any): number {
    if (!this.session) return -1;

    // Encontrar a fase onde este jogador fez pick
    for (let i = 0; i < this.session.phases.length; i++) {
      const phase = this.session.phases[i];
      if (phase.action === 'pick' && phase.champion && this.comparePlayerWithId(player, phase.playerId!)) {
        return i;
      }
    }

    return -1;
  }

  // MÉTODOS PARA SLOTS VAZIOS
  getEmptyBanSlots(banCount: number): number[] {
    const totalBans = 5;
    const emptySlots = totalBans - banCount;
    return Array.from({ length: Math.max(0, emptySlots) }, (_, i) => i);
  }

  // MÉTODOS PARA VERIFICAR JOGADOR ATUAL
  isCurrentPlayer(player: any): boolean {
    if (!this.currentPlayer || !player) return false;
    return this.comparePlayers(this.currentPlayer, player);
  }

  // MÉTODOS PARA VERIFICAR SE É BOT
  isPlayerBot(player: any): boolean {
    if (!player) return false;

    const name = player.summonerName || player.name || '';
    const id = player.id;

    if (id < 0) {
      return true;
    }

    if (typeof id === 'string') {
      const numericId = parseInt(id);
      if (!isNaN(numericId) && numericId < 0) {
        return true;
      }

      if (id.toLowerCase().includes('bot') || id.startsWith('-')) {
        return true;
      }
    }

    const botPatterns = [
      /^bot\d+$/i,
      /^bot\s*\d+$/i,
      /^ai\s*bot$/i,
      /^computer\s*\d*$/i,
      /^bot\s*player$/i,
      /^ai\s*player$/i,
      /^bot$/i,
      /^ai$/i,
      /^popcornseller$/i,
      /^bot\s*[a-z]*$/i,
      /^ai\s*[a-z]*$/i,
      /^bot\s*\d+\s*[a-z]*$/i,
      /^ai\s*\d+\s*[a-z]*$/i,
      /^bot\d+[a-z]*$/i,
      /^ai\d+[a-z]*$/i
    ];

    for (const pattern of botPatterns) {
      if (pattern.test(name)) {
        return true;
      }
    }

    if (name.toLowerCase().includes('bot')) {
      return true;
    }

    if (name.toLowerCase().includes('ai')) {
      return true;
    }

    if (/\d/.test(name) && (name.toLowerCase().includes('bot') || name.toLowerCase().includes('ai'))) {
      return true;
    }

    return false;
  }

  // MÉTODOS PARA LANE DISPLAY
  getPlayerLaneDisplayForPlayer(player: any): string {
    const lane = player.lane || 'unknown';
    return this.getLaneDisplayName(lane);
  }

  getLaneDisplayName(lane: string): string {
    const laneNames: { [key: string]: string } = {
      'top': '🛡️ Top',
      'jungle': '🌲 Jungle',
      'mid': '⚡ Mid',
      'adc': '🏹 ADC',
      'support': '💎 Support',
      'unknown': '❓ Unknown'
    };
    return laneNames[lane] || laneNames['unknown'];
  }

  // MÉTODOS PARA CONTROLE DO MODAL
  closeModal(): void {
    this.onClose.emit();
  }

  confirmFinalDraft(): void {
    this.onConfirm.emit();
  }

  cancelFinalDraft(): void {
    this.onCancel.emit();
  }

  // MÉTODOS PARA EDIÇÃO
  startEditingPick(playerId: string, phaseIndex: number): void {
    this.onEditPick.emit({ playerId, phaseIndex });
  }

  confirmBotPick(playerId: string, phaseIndex: number): void {
    // Para bots, apenas confirmar (não editar)
    // Pode ser implementado conforme necessário
  }

  // MÉTODOS PARA CACHE
  private invalidateCache(): void {
    this._cachedBannedChampions = null;
    this._cachedBlueTeamPicks = null;
    this._cachedRedTeamPicks = null;
    this._cachedBlueTeamByLane = null;
    this._cachedRedTeamByLane = null;
    this._lastCacheUpdate = Date.now();
  }

  private isCacheValid(): boolean {
    return Date.now() - this._lastCacheUpdate < this.CACHE_DURATION;
  }

  // MÉTODOS AUXILIARES
  onImageError(event: any, champion: Champion): void {
    event.target.src = 'assets/images/champion-placeholder.svg';
  }

  // MÉTODO PARA QUANDO O MODAL SE TORNA VISÍVEL
  onModalShow(): void {
    if (this.isVisible) {
      this.invalidateCache();
    }
  }
} 