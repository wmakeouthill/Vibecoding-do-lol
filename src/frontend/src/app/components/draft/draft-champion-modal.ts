import { Component, Input, Output, EventEmitter, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
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

@Component({
  selector: 'app-draft-champion-modal',
  imports: [CommonModule, FormsModule],
  templateUrl: './draft-champion-modal.html',
  styleUrl: './draft-champion-modal.scss'
})
export class DraftChampionModalComponent implements OnInit, OnDestroy {
  @Input() session: CustomPickBanSession | null = null;
  @Input() currentPlayer: any = null;
  @Input() isVisible: boolean = false;
  @Output() onClose = new EventEmitter<void>();
  @Output() onChampionSelected = new EventEmitter<Champion>();

  champions: Champion[] = [];
  championsByRole: any = {};
  searchFilter: string = '';
  selectedChampion: Champion | null = null;
  selectedRole: string = 'all';
  timeRemaining: number = 30;
  modalTimer: any = null;

  // PROPRIEDADES PARA CACHE
  private _cachedBannedChampions: Champion[] | null = null;
  private _cachedBlueTeamPicks: Champion[] | null = null;
  private _cachedRedTeamPicks: Champion[] | null = null;
  private _cachedModalFilteredChampions: Champion[] | null = null;
  private _lastCacheUpdate: number = 0;
  private readonly CACHE_DURATION = 100;

  constructor(private championService: ChampionService) { }

  ngOnInit() {
    this.loadChampions();
  }

  ngOnDestroy() {
    this.stopModalTimer();
  }

  private async loadChampions() {
    try {
      this.champions = await this.championService.getAllChampions();
      this.organizeChampionsByRole();
    } catch (error) {
      console.error('Erro ao carregar campeões:', error);
    }
  }

  private organizeChampionsByRole() {
    this.championsByRole = {
      top: this.champions.filter(c => c.tags?.includes('Fighter') || c.tags?.includes('Tank')),
      jungle: this.champions.filter(c => c.tags?.includes('Fighter') || c.tags?.includes('Assassin')),
      mid: this.champions.filter(c => c.tags?.includes('Mage') || c.tags?.includes('Assassin')),
      adc: this.champions.filter(c => c.tags?.includes('Marksman')),
      support: this.champions.filter(c => c.tags?.includes('Support'))
    };
  }

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

  isChampionBanned(champion: Champion): boolean {
    return this.getBannedChampions().some(c => c.id === champion.id);
  }

  isChampionPicked(champion: Champion): boolean {
    const bluePicks = this.getTeamPicks('blue');
    const redPicks = this.getTeamPicks('red');

    return [...bluePicks, ...redPicks].some(c => c.id === champion.id);
  }

  // MÉTODOS PARA FILTRAGEM
  getModalFilteredChampions(): Champion[] {
    if (this.isCacheValid() && this._cachedModalFilteredChampions) {
      return this._cachedModalFilteredChampions;
    }

    let filtered = this.champions;

    // Filtrar por role
    if (this.selectedRole !== 'all') {
      filtered = filtered.filter(champion => {
        const tags = champion.tags || [];
        switch (this.selectedRole) {
          case 'top':
            return tags.includes('Fighter') || tags.includes('Tank');
          case 'jungle':
            return tags.includes('Fighter') || tags.includes('Assassin');
          case 'mid':
            return tags.includes('Mage') || tags.includes('Assassin');
          case 'adc':
            return tags.includes('Marksman');
          case 'support':
            return tags.includes('Support');
          default:
            return true;
        }
      });
    }

    // Filtrar por busca
    if (this.searchFilter.trim()) {
      const searchTerm = this.searchFilter.toLowerCase().trim();
      filtered = filtered.filter(champion =>
        champion.name.toLowerCase().includes(searchTerm)
      );
    }

    this._cachedModalFilteredChampions = filtered;
    this._lastCacheUpdate = Date.now();

    return filtered;
  }

  // MÉTODOS PARA SELEÇÃO
  selectRoleInModal(role: string): void {
    this.selectedRole = role;
    this.invalidateCache();
  }

  selectChampionInModal(champion: Champion): void {
    if (this.isChampionBanned(champion) || this.isChampionPicked(champion)) {
      return;
    }
    this.selectedChampion = champion;
  }

  // MÉTODOS PARA CONFIRMAÇÃO
  confirmModalSelection(): void {
    if (!this.selectedChampion || this.isChampionBanned(this.selectedChampion) || this.isChampionPicked(this.selectedChampion)) {
      return;
    }

    this.onChampionSelected.emit(this.selectedChampion);
    this.closeModal();
  }

  cancelModalSelection(): void {
    this.closeModal();
  }

  // MÉTODOS PARA CONTROLE DO MODAL
  closeModal(): void {
    this.selectedChampion = null;
    this.searchFilter = '';
    this.selectedRole = 'all';
    this.stopModalTimer();
    this.onClose.emit();
  }

  // MÉTODOS PARA TIMER
  startModalTimer(): void {
    this.stopModalTimer();
    this.timeRemaining = 30;

    this.modalTimer = setInterval(() => {
      if (this.timeRemaining > 0) {
        this.timeRemaining--;
      } else {
        this.handleModalTimeOut();
      }
    }, 1000);
  }

  stopModalTimer(): void {
    if (this.modalTimer) {
      clearInterval(this.modalTimer);
      this.modalTimer = null;
    }
  }

  handleModalTimeOut(): void {
    this.stopModalTimer();
    this.closeModal();
  }

  // MÉTODOS PARA INFORMAÇÕES DO JOGADOR ATUAL
  getCurrentPlayerNameForModal(): string {
    if (!this.session) return '';

    const currentPhase = this.session.phases[this.session.currentAction];
    if (!currentPhase) return '';

    return currentPhase.playerName || 'Jogador Desconhecido';
  }

  getCurrentPlayerTeamForModal(): string {
    if (!this.session) return '';

    const currentPhase = this.session.phases[this.session.currentAction];
    if (!currentPhase) return '';

    return currentPhase.team === 'blue' ? 'Time Azul' : 'Time Vermelho';
  }

  isCurrentPlayerForModal(): boolean {
    if (!this.currentPlayer || !this.session) return false;

    const currentPhase = this.session.phases[this.session.currentAction];
    if (!currentPhase) return false;

    return this.comparePlayerWithId(this.currentPlayer, currentPhase.playerId!);
  }

  getCurrentActionText(): string {
    if (!this.session) return '';

    const currentPhase = this.session.phases[this.session.currentAction];
    if (!currentPhase) return '';

    return currentPhase.action === 'ban' ? 'Banir Campeão' : 'Escolher Campeão';
  }

  getCurrentActionIcon(): string {
    if (!this.session) return '';

    const currentPhase = this.session.phases[this.session.currentAction];
    if (!currentPhase) return '';

    return currentPhase.action === 'ban' ? '🚫' : '⭐';
  }

  getCurrentTeamColor(): string {
    if (!this.session) return '#5bc0de';

    const currentPhase = this.session.phases[this.session.currentAction];
    if (!currentPhase) return '#5bc0de';

    return currentPhase.team === 'blue' ? '#5bc0de' : '#d9534f';
  }

  // MÉTODOS PARA CACHE
  private invalidateCache(): void {
    this._cachedBannedChampions = null;
    this._cachedBlueTeamPicks = null;
    this._cachedRedTeamPicks = null;
    this._cachedModalFilteredChampions = null;
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
      this.startModalTimer();
      this.invalidateCache();
    }
  }
} 