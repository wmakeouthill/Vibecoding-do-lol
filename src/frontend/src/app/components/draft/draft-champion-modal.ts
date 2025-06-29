import { Component, Input, Output, EventEmitter, OnInit, OnDestroy, OnChanges, SimpleChanges } from '@angular/core';
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
  styleUrl: './draft-champion-modal.scss'
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
  private readonly CACHE_DURATION = 100;
  private _lastSessionHash: string = '';

  constructor(private championService: ChampionService) { }

  ngOnInit() {
    this.loadChampions();
  }

  ngOnDestroy() {
    this.stopModalTimer();
  }

  ngOnChanges(changes: SimpleChanges) {
    console.log('🔄 [Modal] ngOnChanges detectado:', changes);
    
    if (changes['isVisible']) {
      console.log('🔄 [Modal] isVisible mudou:', {
        previousValue: changes['isVisible'].previousValue,
        currentValue: changes['isVisible'].currentValue
      });
      
      if (changes['isVisible'].currentValue === true) {
        console.log('🔄 [Modal] Modal se tornou visível - chamando onModalShow');
        this.onModalShow();
      } else {
        console.log('🔄 [Modal] Modal se tornou invisível - parando timer');
        this.stopModalTimer();
      }
    }

    // ✅ NOVO: Detectar mudanças no session e invalidar cache
    if (changes['session']) {
      console.log('🔄 [Modal] Session mudou - invalidando cache');
      this.invalidateCache();
    }

    // ✅ NOVO: Detectar mudanças no currentPlayer
    if (changes['currentPlayer']) {
      console.log('🔄 [Modal] CurrentPlayer mudou - invalidando cache');
      this.invalidateCache();
    }
  }

  private async loadChampions() {
    console.log('🎯 [Modal] loadChampions() iniciado');
    try {
      this.championService.getAllChampions().subscribe({
        next: (champions) => {
          console.log('🎯 [Modal] Campeões carregados:', champions.length, 'campeões');
          console.log('🎯 [Modal] Primeiros 5 campeões:', champions.slice(0, 5).map(c => c.name));
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
      console.log(`🎯 [Modal] Dados inválidos - player: ${!!player}, targetId: ${targetId}`);
      return false;
    }

    const playerId = player.id?.toString();
    const playerName = player.summonerName || player.name || '';

    console.log(`🎯 [Modal] Comparando:`, {
      playerId: playerId,
      playerName: playerName,
      targetId: targetId,
      teamIndex: player.teamIndex
    });

    if (playerId === targetId) {
      console.log(`🎯 [Modal] Match por ID: ${playerId} === ${targetId}`);
      return true;
    }

    if (playerName === targetId) {
      console.log(`🎯 [Modal] Match por nome: ${playerName} === ${targetId}`);
      return true;
    }

    if (playerName.includes('#')) {
      const gameName = playerName.split('#')[0];
      if (gameName === targetId) {
        console.log(`🎯 [Modal] Match por gameName: ${gameName} === ${targetId}`);
        return true;
      }
    }

    // ✅ NOVO: Verificar teamIndex
    if (player.teamIndex !== undefined && player.teamIndex !== null) {
      const teamIndexStr = player.teamIndex.toString();
      if (teamIndexStr === targetId) {
        console.log(`🎯 [Modal] Match por teamIndex: ${teamIndexStr} === ${targetId}`);
        return true;
      }
    }

    console.log(`🎯 [Modal] Nenhum match encontrado`);
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

    console.log('🚫 [Modal] Campeões banidos:', bannedChampions.map(c => c.name));
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

    console.log(`⭐ [Modal] Picks do time ${team}:`, teamPicks.map(c => c.name));
    return teamPicks;
  }

  isChampionBanned(champion: Champion): boolean {
    const isBanned = this.getBannedChampions().some(c => c.id === champion.id);
    if (isBanned) {
      console.log('🚫 [Modal] Campeão banido:', champion.name);
    }
    return isBanned;
  }

  isChampionPicked(champion: Champion): boolean {
    const bluePicks = this.getTeamPicks('blue');
    const redPicks = this.getTeamPicks('red');
    const isPicked = [...bluePicks, ...redPicks].some(c => c.id === champion.id);
    if (isPicked) {
      console.log('⭐ [Modal] Campeão escolhido:', champion.name);
    }
    return isPicked;
  }

  // MÉTODOS PARA FILTRAGEM
  getModalFilteredChampions(): Champion[] {
    console.log('🎯 [Modal] getModalFilteredChampions() chamado');
    console.log('🎯 [Modal] Total de campeões disponíveis:', this.champions.length);
    console.log('🎯 [Modal] Role selecionada:', this.selectedRole);
    console.log('🎯 [Modal] Filtro de busca:', this.searchFilter);
    
    // ✅ CORREÇÃO: Sempre invalidar cache se o session mudou
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
        console.log('🔄 [Modal] Session mudou - invalidando cache');
        this._lastSessionHash = sessionHash;
        this.invalidateCache();
      }
    }
    
    if (this.isCacheValid() && this._cachedModalFilteredChampions) {
      console.log('🎯 [Modal] Retornando cache:', this._cachedModalFilteredChampions.length, 'campeões');
      return this._cachedModalFilteredChampions;
    }

    let filtered = this.champions;
    console.log('🎯 [Modal] Campeões antes da filtragem:', filtered.length);

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
      console.log('🎯 [Modal] Campeões após filtro de role:', filtered.length);
    }

    // Filtrar por busca
    if (this.searchFilter.trim()) {
      const searchTerm = this.searchFilter.toLowerCase().trim();
      filtered = filtered.filter(champion =>
        champion.name.toLowerCase().includes(searchTerm)
      );
      console.log('🎯 [Modal] Campeões após filtro de busca:', filtered.length);
    }

    this._cachedModalFilteredChampions = filtered;
    this._lastCacheUpdate = Date.now();

    console.log('🎯 [Modal] Campeões finais filtrados:', filtered.length);
    console.log('🎯 [Modal] Primeiros 5 campeões filtrados:', filtered.slice(0, 5).map(c => c.name));
    
    return filtered;
  }

  // MÉTODOS PARA SELEÇÃO
  selectRoleInModal(role: string): void {
    this.selectedRole = role;
    this.invalidateCache();
  }

  selectChampion(champion: Champion): void {
    console.log('🎯 [Modal] selectChampion() chamado:', champion.name);
    
    // ✅ CORREÇÃO: Verificar se o campeão pode ser selecionado
    if (this.isChampionBanned(champion)) {
      console.log('🚫 [Modal] Campeão banido:', champion.name);
      return;
    }
    
    if (this.isChampionPicked(champion)) {
      console.log('⭐ [Modal] Campeão já escolhido:', champion.name);
      return;
    }
    
    // ✅ CORREÇÃO: Limpar seleção anterior e selecionar novo
    this.selectedChampion = champion;
    console.log('✅ [Modal] Campeão selecionado:', champion.name);
  }

  // MÉTODOS PARA CONFIRMAÇÃO
  confirmModalSelection(): void {
    console.log('🎯 [Modal] confirmModalSelection() chamado');
    console.log('🎯 [Modal] Campeão selecionado:', this.selectedChampion?.name);
    
    if (!this.selectedChampion) {
      console.log('❌ [Modal] Nenhum campeão selecionado');
      return;
    }
    
    if (this.isChampionBanned(this.selectedChampion) || this.isChampionPicked(this.selectedChampion)) {
      console.log('❌ [Modal] Campeão inválido para seleção');
      return;
    }

    console.log('✅ [Modal] Emitindo campeão selecionado e invalidando cache');
    this.onChampionSelected.emit(this.selectedChampion);
    
    // Invalidar cache do modal imediatamente
    this.invalidateCache();
    
    // ✅ CORREÇÃO: Limpar seleção ANTES de fechar o modal
    this.selectedChampion = null;
    
    this.closeModal();
  }

  cancelModalSelection(): void {
    this.closeModal();
  }

  // MÉTODOS PARA CONTROLE DO MODAL
  openModal(): void {
    console.log('🎯 [Modal] openModal() chamado');
    this.isVisible = true;
    this.loadChampions();
    this.startModalTimer();
  }

  closeModal(): void {
    console.log('🎯 [Modal] closeModal() chamado');
    this.isVisible = false;
    this.stopModalTimer();
    
    // ✅ CORREÇÃO: Limpar seleção quando fechar o modal
    this.selectedChampion = null;
    this.searchFilter = '';
    this.selectedRole = 'all';
    
    // ✅ CORREÇÃO: Emitir evento de fechamento
    this.onClose.emit();
    
    console.log('🎯 [Modal] Modal fechado e seleção limpa');
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
    if (!currentPhase) {
      console.log(`🎯 [Modal] isCurrentPlayerForModal - Fase não encontrada para currentAction: ${this.session.currentAction}`);
      return false;
    }

    console.log(`🎯 [Modal] isCurrentPlayerForModal - Verificando:`, {
      currentPlayer: {
        id: this.currentPlayer.id,
        name: this.currentPlayer.summonerName,
        teamIndex: this.currentPlayer.teamIndex
      },
      currentPhase: {
        playerId: currentPhase.playerId,
        playerIndex: currentPhase.playerIndex,
        team: currentPhase.team,
        action: currentPhase.action
      }
    });

    // ✅ CORREÇÃO: Tentar múltiplas formas de comparação
    let isCurrent = false;

    // 1. Tentar por playerId
    if (currentPhase.playerId) {
      isCurrent = this.comparePlayerWithId(this.currentPlayer, currentPhase.playerId);
      if (isCurrent) {
        console.log(`🎯 [Modal] isCurrentPlayerForModal - Match por playerId: ${currentPhase.playerId}`);
        return true;
      }
    }

    // 2. Tentar por teamIndex se disponível
    if (currentPhase.playerIndex !== undefined && this.currentPlayer.teamIndex !== undefined) {
      if (this.currentPlayer.teamIndex === currentPhase.playerIndex) {
        console.log(`🎯 [Modal] isCurrentPlayerForModal - Match por teamIndex: ${this.currentPlayer.teamIndex} === ${currentPhase.playerIndex}`);
        return true;
      }
    }

    // 3. Tentar por nome do jogador
    if (currentPhase.playerName) {
      const currentPlayerName = this.currentPlayer.summonerName || this.currentPlayer.name;
      if (currentPlayerName === currentPhase.playerName) {
        console.log(`🎯 [Modal] isCurrentPlayerForModal - Match por playerName: ${currentPlayerName}`);
        return true;
      }
    }

    console.log(`🎯 [Modal] isCurrentPlayerForModal - Nenhum match encontrado`);
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
    console.log('🗑️ [Modal] Invalidando cache do modal');
    this._cachedBannedChampions = null;
    this._cachedBlueTeamPicks = null;
    this._cachedRedTeamPicks = null;
    this._cachedModalFilteredChampions = null;
    this._lastCacheUpdate = Date.now();
    
    // Forçar detecção de mudanças se o modal estiver visível
    if (this.isVisible) {
      console.log('🔄 [Modal] Forçando atualização da interface');
      // Usar setTimeout para garantir que a mudança seja detectada
      setTimeout(() => {
        // Trigger change detection
      }, 0);
    }
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