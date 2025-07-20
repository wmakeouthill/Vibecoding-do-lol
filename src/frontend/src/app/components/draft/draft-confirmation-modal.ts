import { Component, Input, Output, EventEmitter, OnChanges, SimpleChanges } from '@angular/core';
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
  phaseIndex: number;
}

@Component({
  selector: 'app-draft-confirmation-modal',
  imports: [CommonModule],
  templateUrl: './draft-confirmation-modal.html',
  styleUrl: './draft-confirmation-modal.scss'
})
export class DraftConfirmationModalComponent implements OnChanges {
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

  ngOnChanges(changes: SimpleChanges): void {
    // ✅ NOVO: Invalidar cache quando session ou isVisible mudam
    if (changes['session'] || changes['isVisible']) {
      console.log('🔄 [ngOnChanges] Detectada mudança na session ou visibilidade');
      this.forceRefresh();
    }
  }

  // MÉTODOS PARA COMPARAÇÃO DE JOGADORES
  private comparePlayerWithId(player: any, targetId: string): boolean {
    if (!player || !targetId) return false;

    // ✅ CORREÇÃO: Normalizar nome do player
    const getNormalizedName = (player: any): string => {
      if (player.gameName && player.tagLine) {
        return `${player.gameName}#${player.tagLine}`;
      }
      return player.summonerName || player.name || '';
    };

    const playerId = player.id?.toString();
    const playerName = getNormalizedName(player);

    console.log('🔍 [comparePlayerWithId] Comparando:', {
      playerId: playerId,
      playerName: playerName,
      targetId: targetId,
      idMatch: playerId === targetId,
      nameMatch: playerName === targetId
    });

    // Comparar por ID
    if (playerId === targetId) {
      console.log('✅ [comparePlayerWithId] Match por ID');
      return true;
    }

    // Comparar por nome completo
    if (playerName === targetId) {
      console.log('✅ [comparePlayerWithId] Match por nome completo');
      return true;
    }

    // Comparar apenas gameName (sem tagLine)
    if (playerName.includes('#')) {
      const gameName = playerName.split('#')[0];
      if (gameName === targetId) {
        console.log('✅ [comparePlayerWithId] Match por gameName');
        return true;
      }
    }

    console.log('❌ [comparePlayerWithId] Nenhum match encontrado');
    return false;
  }

  private comparePlayers(player1: any, player2: any): boolean {
    if (!player1 || !player2) return false;

    // ✅ CORREÇÃO: Normalizar nomes para formato gameName#tagLine
    const getNormalizedName = (player: any): string => {
      if (player.gameName && player.tagLine) {
        return `${player.gameName}#${player.tagLine}`;
      }
      return player.summonerName || player.name || '';
    };

    const name1 = getNormalizedName(player1);
    const name2 = getNormalizedName(player2);
    const id1 = player1.id?.toString();
    const id2 = player2.id?.toString();

    console.log('🔍 [comparePlayers] Comparando:', {
      player1: { id: id1, name: name1, original: player1.summonerName || player1.name },
      player2: { id: id2, name: name2, original: player2.summonerName || player2.name },
      idsMatch: id1 && id2 && id1 === id2,
      namesMatch: name1 && name2 && name1 === name2
    });

    // Comparar por ID primeiro
    if (id1 && id2 && id1 === id2) {
      console.log('✅ [comparePlayers] Match por ID');
      return true;
    }

    // Comparar por nome normalizado
    if (name1 && name2 && name1 === name2) {
      console.log('✅ [comparePlayers] Match por nome normalizado');
      return true;
    }

    // Comparar apenas parte do gameName (sem tagLine)
    if (name1 && name2) {
      const gameName1 = name1.includes('#') ? name1.split('#')[0] : name1;
      const gameName2 = name2.includes('#') ? name2.split('#')[0] : name2;

      if (gameName1 === gameName2) {
        console.log('✅ [comparePlayers] Match por gameName');
        return true;
      }
    }

    console.log('❌ [comparePlayers] Nenhum match encontrado');
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

    console.log(`🎯 [getTeamByLane] Organizando time ${team}...`);
    const teamPlayers = this.getSortedTeamByLane(team);
    const teamPicks = this.getTeamPicks(team);

    console.log(`🎯 [getTeamByLane] Time ${team}:`, {
      playersCount: teamPlayers.length,
      picksCount: teamPicks.length,
      players: teamPlayers.map(p => ({ name: p.summonerName || p.name, lane: p.lane })),
      picks: teamPicks.map(c => c.name)
    });

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
    return teamPlayers.map((player, index) => {
      const phaseIndex = this.getPhaseIndexForPlayer(player) || 0;
      console.log('🎯 [organizeTeamByLanes] Criando slot para jogador:', {
        playerIndex: index,
        playerName: player.summonerName || player.name,
        playerLane: player.lane,
        phaseIndex: phaseIndex,
        hasChampion: !!teamPicks[index]
      });

      return {
        player,
        champion: teamPicks[index] || undefined,
        phaseIndex: phaseIndex
      };
    });
  }

  private getPhaseIndexForPlayer(player: any): number {
    if (!this.session) return 0;

    console.log('🔍 [getPhaseIndexForPlayer] Procurando fase para jogador:', {
      id: player.id,
      summonerName: player.summonerName,
      name: player.name,
      lane: player.lane
    });

    // Encontrar a fase onde este jogador fez pick
    for (let i = 0; i < this.session.phases.length; i++) {
      const phase = this.session.phases[i];
      if (phase.action === 'pick' && phase.champion && phase.playerId) {
        const isMatch = this.comparePlayerWithId(player, phase.playerId);
        console.log(`🔍 [getPhaseIndexForPlayer] Fase ${i}:`, {
          phasePlayerId: phase.playerId,
          phasePlayerName: phase.playerName,
          champion: phase.champion?.name,
          isMatch: isMatch
        });

        if (isMatch) {
          console.log(`✅ [getPhaseIndexForPlayer] Encontrada fase ${i} para jogador ${player.summonerName || player.name}`);
          return i;
        }
      }
    }

    console.log(`❌ [getPhaseIndexForPlayer] Nenhuma fase encontrada para jogador ${player.summonerName || player.name}, retornando 0`);
    return 0;
  }

  // MÉTODOS PARA SLOTS VAZIOS
  getEmptyBanSlots(banCount: number): number[] {
    const totalBans = 5;
    const emptySlots = totalBans - banCount;
    return Array.from({ length: Math.max(0, emptySlots) }, (_, i) => i);
  }

  // MÉTODOS PARA VERIFICAR JOGADOR ATUAL
  isCurrentPlayer(player: any): boolean {
    console.log('🔍 [isCurrentPlayer] Verificando:', {
      hasCurrentPlayer: !!this.currentPlayer,
      currentPlayer: this.currentPlayer,
      player: player,
      playerName: player?.summonerName || player?.name
    });

    if (!this.currentPlayer || !player) {
      console.log('❌ [isCurrentPlayer] currentPlayer ou player é null');
      return false;
    }

    const result = this.comparePlayers(this.currentPlayer, player);
    console.log('🔍 [isCurrentPlayer] Resultado:', result);
    return result;
  }

  // MÉTODOS PARA VERIFICAR SE É BOT
  isPlayerBot(player: any): boolean {
    if (!player) return false;

    const name = player.summonerName || player.name || '';
    const id = player.id;

    console.log('🤖 [isPlayerBot] Verificando bot:', {
      playerName: name,
      playerId: id,
      isNegativeId: id < 0
    });

    if (id < 0) {
      console.log('✅ [isPlayerBot] É bot (ID negativo)');
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

    // ✅ ATUALIZADO: Padrões de bot (incluindo novo padrão sequencial)
    const botPatterns = [
      /^bot\d+$/i,           // ✅ NOVO: Bot1, Bot2, etc (padrão sequencial)
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

  // MÉTODO PARA VERIFICAR SE BOTÃO DEVE APARECER
  shouldShowEditButton(slot: any): boolean {
    const isCurrentPlayerResult = this.isCurrentPlayer(slot.player);
    const isBotResult = this.isPlayerBot(slot.player);

    // ✅ CORREÇÃO: Mostrar botão APENAS para o jogador atual (não para bots)
    const shouldShow = isCurrentPlayerResult && !isBotResult;

    console.log('🔍 [shouldShowEditButton] Verificando botão para:', {
      playerName: slot.player.summonerName || slot.player.name,
      isCurrentPlayer: isCurrentPlayerResult,
      isBot: isBotResult,
      shouldShow: shouldShow
    });

    return shouldShow;
  }

  // MÉTODO PARA DEBUG DE CLIQUE
  onButtonClick(slot: any): void {
    console.log('🎯 [onButtonClick] === BOTÃO CLICADO ===');
    console.log('🎯 [onButtonClick] slot:', slot);
    console.log('🎯 [onButtonClick] player:', slot.player);
    console.log('🎯 [onButtonClick] phaseIndex:', slot.phaseIndex);
    console.log('🎯 [onButtonClick] isBot:', this.isPlayerBot(slot.player));

    if (this.isPlayerBot(slot.player)) {
      this.confirmBotPick(slot.player.id || slot.player.summonerName, slot.phaseIndex);
    } else {
      this.startEditingPick(slot.player.id || slot.player.summonerName, slot.phaseIndex);
    }
  }

  // MÉTODOS PARA EDIÇÃO
  startEditingPick(playerId: string, phaseIndex: number): void {
    console.log('🎯 [startEditingPick] === INICIANDO EDIÇÃO ===');
    console.log('🎯 [startEditingPick] playerId:', playerId);
    console.log('🎯 [startEditingPick] phaseIndex:', phaseIndex);
    console.log('🎯 [startEditingPick] currentPlayer:', this.currentPlayer);
    console.log('🎯 [startEditingPick] session:', this.session);

    this.onEditPick.emit({ playerId, phaseIndex });
    console.log('🎯 [startEditingPick] Evento emitido');
  }

  // ✅ NOVO: Método para editar o pick do jogador atual via botão principal
  startEditingCurrentPlayer(): void {
    console.log('🎯 [startEditingCurrentPlayer] === INICIANDO EDIÇÃO DO JOGADOR ATUAL ===');
    console.log('🎯 [startEditingCurrentPlayer] currentPlayer:', this.currentPlayer);
    console.log('🎯 [startEditingCurrentPlayer] session:', this.session);

    if (!this.currentPlayer || !this.session) {
      console.log('❌ [startEditingCurrentPlayer] currentPlayer ou session não disponível');
      return;
    }

    // Procurar o pick do jogador atual
    const currentPlayerFormatted = this.currentPlayer.gameName && this.currentPlayer.tagLine
      ? `${this.currentPlayer.gameName}#${this.currentPlayer.tagLine}`
      : this.currentPlayer.summonerName || this.currentPlayer.name;

    console.log('🎯 [startEditingCurrentPlayer] currentPlayer formatado:', currentPlayerFormatted);

    // Procurar a fase de pick do jogador atual
    let playerPhaseIndex = -1;
    for (let i = 0; i < this.session.phases.length; i++) {
      const phase = this.session.phases[i];
      if (phase.action === 'pick' && phase.locked && phase.champion) {
        console.log('🔍 [startEditingCurrentPlayer] Verificando fase', i, ':', {
          playerId: phase.playerId,
          playerName: phase.playerName,
          champion: phase.champion?.name,
          isMatch: this.comparePlayerWithId(this.currentPlayer, phase.playerId || '')
        });

        if (this.comparePlayerWithId(this.currentPlayer, phase.playerId || '')) {
          playerPhaseIndex = i;
          console.log('✅ [startEditingCurrentPlayer] Encontrada fase do jogador atual:', i);
          break;
        }
      }
    }

    if (playerPhaseIndex === -1) {
      console.log('❌ [startEditingCurrentPlayer] Fase de pick do jogador atual não encontrada');
      return;
    }

    // Usar o ID formatado do currentPlayer para garantir consistência
    const playerIdForEdit = this.currentPlayer.id?.toString() || currentPlayerFormatted;

    console.log('🎯 [startEditingCurrentPlayer] Iniciando edição:', {
      playerId: playerIdForEdit,
      phaseIndex: playerPhaseIndex,
      playerFormatted: currentPlayerFormatted
    });

    this.startEditingPick(playerIdForEdit, playerPhaseIndex);
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

  // ✅ NOVO: Método para forçar atualização completa
  forceRefresh(): void {
    console.log('🔄 [forceRefresh] Forçando atualização do modal de confirmação');
    this.invalidateCache();
    // Forçar recálculo de todos os dados
    this._cachedBannedChampions = null;
    this._cachedBlueTeamPicks = null;
    this._cachedRedTeamPicks = null;
    this._cachedBlueTeamByLane = null;
    this._cachedRedTeamByLane = null;
    this._lastCacheUpdate = 0; // Forçar recache
  }
} 