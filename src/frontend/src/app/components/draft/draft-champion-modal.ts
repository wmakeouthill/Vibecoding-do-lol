import { Component, Input, Output, EventEmitter, OnInit, OnDestroy, OnChanges, SimpleChanges, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ChampionService, Champion } from '../../services/champion.service';

interface PickBanPhase {
  team: 'blue' | 'red';
  action: 'ban' | 'pick';
  champion?: Champion;
  playerId?: string;
  playerName?: string;
  playerIndex?: number;
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
  styleUrl: './draft-champion-modal.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class DraftChampionModalComponent implements OnInit, OnDestroy, OnChanges {
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
  private readonly CACHE_DURATION = 5000;
  private _lastSessionHash: string = '';

  constructor(private championService: ChampionService, private changeDetectorRef: ChangeDetectorRef) { }

  ngOnInit() {
    this.loadChampions();
  }

  ngOnDestroy() {
    this.stopModalTimer();
  }

  ngOnChanges(changes: SimpleChanges) {
    if (changes['isVisible']) {
      if (changes['isVisible'].currentValue === true) {
        this.onModalShow();
      } else {
        this.stopModalTimer();
      }
    }

    if (changes['session'] && changes['session'].currentValue !== changes['session'].previousValue) {
      this.invalidateCache();
    }

    if (changes['currentPlayer'] && changes['currentPlayer'].currentValue !== changes['currentPlayer'].previousValue) {
      this.invalidateCache();
    }
  }

  private async loadChampions() {
    try {
      this.championService.getAllChampions().subscribe({
        next: (champions) => {
          this.champions = champions;
          this.organizeChampionsByRole();
        },
        error: (error) => {
          console.error('❌ [Modal] Erro ao carregar campeões:', error);
        }
      });
    } catch (error) {
      console.error('❌ [Modal] Erro ao carregar campeões:', error);
    }
  }

  private organizeChampionsByRole() {
    this.championService.getChampionsByRole().subscribe({
      next: (championsByRole) => {
        this.championsByRole = championsByRole;
      },
      error: (error) => {
        console.error('Erro ao organizar campeões por role:', error);
        // Fallback manual se necessário
        this.championsByRole = {
          top: this.champions.filter(c => c.tags?.includes('Fighter') || c.tags?.includes('Tank')),
          jungle: this.champions.filter(c => c.tags?.includes('Fighter') || c.tags?.includes('Assassin')),
          mid: this.champions.filter(c => c.tags?.includes('Mage') || c.tags?.includes('Assassin')),
          adc: this.champions.filter(c => c.tags?.includes('Marksman')),
          support: this.champions.filter(c => c.tags?.includes('Support'))
        };
      }
    });
  }

  // MÉTODOS PARA COMPARAÇÃO DE JOGADORES
  private comparePlayerWithId(player: any, targetId: string): boolean {
    if (!player || !targetId) {
      return false;
    }

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

    // ✅ NOVO: Verificar teamIndex
    if (player.teamIndex !== undefined && player.teamIndex !== null) {
      const teamIndexStr = player.teamIndex.toString();
      if (teamIndexStr === targetId) {
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

    if (!this.session) {
      return [];
    }

    const bannedPhases = this.session.phases.filter(phase => phase.action === 'ban' && phase.champion);

    const bannedChampions = bannedPhases
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
    const bannedChampions = this.getBannedChampions();

    const isBanned = bannedChampions.some(c => c.id === champion.id);

    return isBanned;
  }

  isChampionPicked(champion: Champion): boolean {
    const bluePicks = this.getTeamPicks('blue');
    const redPicks = this.getTeamPicks('red');
    const isPicked = [...bluePicks, ...redPicks].some(c => c.id === champion.id);
    return isPicked;
  }

  // MÉTODOS PARA FILTRAGEM
  getModalFilteredChampions(): Champion[] {
    if (this.session && this.session.currentAction !== undefined) {
      const sessionHash = JSON.stringify({
        currentAction: this.session.currentAction,
        phases: this.session.phases.map(p => ({
          action: p.action,
          team: p.team,
          locked: p.locked,
          championId: p.champion?.id
        }))
      });

      if (sessionHash !== this._lastSessionHash) {
        this._lastSessionHash = sessionHash;
        this.invalidateCache();
      }
    }

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

    // ✅ NOVO: Log temporário para verificar quantos campeões estão sendo marcados como banidos
    const bannedCount = filtered.filter(c => this.isChampionBanned(c)).length;
    const pickedCount = filtered.filter(c => this.isChampionPicked(c)).length;

    this._cachedModalFilteredChampions = filtered;
    this._lastCacheUpdate = Date.now();

    return filtered;
  }

  // MÉTODOS PARA SELEÇÃO
  selectRoleInModal(role: string): void {
    this.selectedRole = role;
    this.invalidateCache();
    this.changeDetectorRef.markForCheck();
  }

  selectChampion(champion: Champion): void {
    // ✅ CORREÇÃO: Log detalhado da seleção
    console.log('🎯 [DraftChampionModal] === SELECIONANDO CAMPEÃO ===');
    console.log('🎯 [DraftChampionModal] Campeão clicado:', champion.name);
    console.log('🎯 [DraftChampionModal] ID do campeão:', champion.id);
    console.log('🎯 [DraftChampionModal] Está banido?', this.isChampionBanned(champion));
    console.log('🎯 [DraftChampionModal] Está escolhido?', this.isChampionPicked(champion));

    if (this.isChampionBanned(champion)) {
      console.log('❌ [DraftChampionModal] Campeão banido - não pode ser selecionado');
      return;
    }

    if (this.isChampionPicked(champion)) {
      console.log('❌ [DraftChampionModal] Campeão já escolhido - não pode ser selecionado');
      return;
    }

    // ✅ CORREÇÃO: Definir seleção
    this.selectedChampion = champion;
    console.log('✅ [DraftChampionModal] Campeão selecionado:', champion.name);

    // ✅ CORREÇÃO: Forçar atualização da interface
    this.changeDetectorRef.markForCheck();
  }

  // MÉTODOS PARA CONFIRMAÇÃO
  confirmModalSelection(): void {
    if (!this.selectedChampion) {
      return;
    }

    if (this.isChampionBanned(this.selectedChampion) || this.isChampionPicked(this.selectedChampion)) {
      return;
    }

    // ✅ CORREÇÃO: Log detalhado da seleção para debug
    console.log('🎯 [DraftChampionModal] === CONFIRMANDO SELEÇÃO ===');
    console.log('🎯 [DraftChampionModal] Campeão selecionado:', this.selectedChampion.name);
    console.log('🎯 [DraftChampionModal] ID do campeão:', this.selectedChampion.id);
    console.log('🎯 [DraftChampionModal] Sessão atual:', this.session?.currentAction);
    console.log('🎯 [DraftChampionModal] Fase atual:', this.session?.phases?.[this.session?.currentAction || 0]);

    // ✅ CORREÇÃO: Emitir o campeão selecionado
    this.onChampionSelected.emit(this.selectedChampion);

    // ✅ CORREÇÃO: Limpar seleção e cache
    this.selectedChampion = null;
    this.invalidateCache();

    // ✅ CORREÇÃO: Fechar modal
    this.closeModal();

    // ✅ CORREÇÃO: Forçar atualização
    this.changeDetectorRef.markForCheck();

    console.log('✅ [DraftChampionModal] Seleção confirmada e modal fechado');
  }

  cancelModalSelection(): void {
    this.closeModal();
  }

  // MÉTODOS PARA CONTROLE DO MODAL
  openModal(): void {
    this.isVisible = true;

    this.invalidateCache();

    this.loadChampions();
    this.startModalTimer();

    this.changeDetectorRef.markForCheck();
  }

  closeModal(): void {
    this.isVisible = false;
    this.stopModalTimer();

    this.selectedChampion = null;
    this.searchFilter = '';
    this.selectedRole = 'all';

    this.onClose.emit();

    this.changeDetectorRef.markForCheck();
  }

  // MÉTODOS PARA TIMER
  startModalTimer(): void {
    this.stopModalTimer();
    this.timeRemaining = 30;

    this.modalTimer = setInterval(() => {
      if (this.timeRemaining > 0) {
        this.timeRemaining--;
        this.changeDetectorRef.markForCheck();
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
    if (!currentPhase) {
      return false;
    }

    let isCurrent = false;

    // 1. Tentar por playerId
    if (currentPhase.playerId) {
      isCurrent = this.comparePlayerWithId(this.currentPlayer, currentPhase.playerId);
      if (isCurrent) {
        return true;
      }
    }

    // 2. Tentar por teamIndex se disponível
    if (currentPhase.playerIndex !== undefined && this.currentPlayer.teamIndex !== undefined) {
      if (this.currentPlayer.teamIndex === currentPhase.playerIndex) {
        return true;
      }
    }

    // 3. Tentar por nome do jogador
    if (currentPhase.playerName) {
      const currentPlayerName = this.currentPlayer.summonerName || this.currentPlayer.name;
      if (currentPlayerName === currentPhase.playerName) {
        return true;
      }
    }

    return false;
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
    const isValid = Date.now() - this._lastCacheUpdate < this.CACHE_DURATION;
    return isValid;
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