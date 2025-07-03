import { Component, Input, Output, EventEmitter, OnInit, OnDestroy, OnChanges, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ProfileIconService } from '../../services/profile-icon.service';

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
  teamIndex?: number; // ✅ NOVO: Índice para o draft (0-4)
  isAutofill: boolean;
  riotIdGameName?: string;
  riotIdTagline?: string;
  profileIconId?: number;
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
  isTimerUrgent = false;

  constructor(private profileIconService: ProfileIconService) {}

  ngOnInit() {
    if (this.matchData && this.matchData.phase === 'accept') {
      this.startAcceptCountdown();
    }
    
    // ✅ NOVO: Escutar atualizações de timer do backend
    this.setupTimerListener();
  }

  ngOnChanges(changes: SimpleChanges) {
    // Reinicia o timer quando uma nova partida é encontrada
    if (changes['matchData'] && changes['matchData'].currentValue) {
      console.log('🎮 [MatchFound] Dados recebidos:', this.matchData);
      console.log('🎮 [MatchFound] Teammates:', this.matchData?.teammates?.map(p => ({
        name: p.summonerName,
        lane: p.assignedLane,
        teamIndex: p.teamIndex,
        isAutofill: p.isAutofill
      })));
      console.log('🎮 [MatchFound] Enemies:', this.matchData?.enemies?.map(p => ({
        name: p.summonerName,
        lane: p.assignedLane,
        teamIndex: p.teamIndex,
        isAutofill: p.isAutofill
      })));
      
      if (this.countdownTimer) {
        clearInterval(this.countdownTimer);
      }

      if (this.matchData && this.matchData.phase === 'accept') {
        this.startAcceptCountdown();
      }

      // Carregar ícones de perfil para todos os jogadores
      this.loadProfileIconsForPlayers();
    }
  }

  ngOnDestroy() {
    if (this.countdownTimer) {
      clearInterval(this.countdownTimer);
    }
    
    // ✅ NOVO: Remover listener de timer
    document.removeEventListener('matchTimerUpdate', this.onTimerUpdate);
  }

  // ✅ NOVO: Configurar listener para atualizações de timer do backend
  private setupTimerListener(): void {
    document.addEventListener('matchTimerUpdate', this.onTimerUpdate);
  }

  // ✅ NOVO: Handler para atualizações de timer do backend
  private onTimerUpdate = (event: any): void => {
    if (event.detail) {
      this.acceptTimeLeft = event.detail.timeLeft;
      this.isTimerUrgent = event.detail.isUrgent;
      
      // Auto-decline se tempo esgotar
      if (this.acceptTimeLeft <= 0) {
        this.onDeclineMatch();
      }
    }
  }

  /**
   * Carrega os ícones de perfil para todos os jogadores da partida
   */
  private async loadProfileIconsForPlayers(): Promise<void> {
    if (!this.matchData) return;

    const allPlayers = [...this.matchData.teammates, ...this.matchData.enemies];
    
    // Carregar ícones em paralelo para melhor performance
    const iconPromises = allPlayers.map(async (player) => {
      try {
        const profileIconId = await this.profileIconService.getOrFetchProfileIcon(
          player.summonerName,
          player.riotIdGameName,
          player.riotIdTagline
        );
        if (profileIconId) {
          player.profileIconId = profileIconId;
        }
      } catch (error) {
        console.warn(`Erro ao carregar ícone para ${player.summonerName}:`, error);
      }
    });

    await Promise.all(iconPromises);
  }

  /**
   * Obtém a URL do ícone de perfil para um jogador
   */
  getPlayerProfileIconUrl(player: PlayerInfo): string {
    return this.profileIconService.getProfileIconUrl(
      player.summonerName,
      player.riotIdGameName,
      player.riotIdTagline
    );
  }

  /**
   * Handler para erro de carregamento de imagem de perfil
   */
  onProfileIconError(event: Event, player: PlayerInfo): void {
    this.profileIconService.onProfileIconError(event, player.profileIconId);
  }

  private startAcceptCountdown(): void {
    this.acceptTimeLeft = Math.floor((this.matchData?.acceptTimeout || 30000) / 1000); // Converter ms para segundos
    this.isTimerUrgent = this.acceptTimeLeft <= 10; // Verificar urgência inicial

    // ✅ MUDANÇA: Timer local como fallback, sincronizado com backend
    this.countdownTimer = window.setInterval(() => {
      // Só decrementar localmente se não estiver recebendo atualizações do backend
      // (as atualizações do backend têm prioridade via onTimerUpdate)
      this.acceptTimeLeft--;
      this.isTimerUrgent = this.acceptTimeLeft <= 10; // Atualizar urgência

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
   * Ordena jogadores por teamIndex (0-4) conforme o draft espera
   */
  getSortedPlayersByLane(players: PlayerInfo[]): PlayerInfo[] {
    // ✅ CORREÇÃO: Usar teamIndex se disponível, senão ordenar por lane
    return [...players].sort((a, b) => {
      // Se ambos têm teamIndex, usar ele para ordenação
      if (a.teamIndex !== undefined && b.teamIndex !== undefined) {
        return a.teamIndex - b.teamIndex;
      }
      
      // Fallback: ordenar por lane se teamIndex não estiver disponível
      const laneOrder = ['top', 'jungle', 'mid', 'bot', 'support'];
      const laneA = a.assignedLane || a.primaryLane || 'fill';
      const laneB = b.assignedLane || b.primaryLane || 'fill';
      
      const indexA = laneOrder.indexOf(laneA);
      const indexB = laneOrder.indexOf(laneB);
      
      if (indexA !== -1 && indexB !== -1) {
        return indexA - indexB;
      }
      
      if (indexA !== -1) return -1;
      if (indexB !== -1) return 1;
      
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

  /**
   * Determina se um jogador é o jogador atual
   */
  isCurrentPlayer(player: PlayerInfo): boolean {
    if (!this.matchData) return false;
    return player.summonerName.includes('popcorn seller');
  }

  /**
   * Retorna os jogadores do time azul (sempre à esquerda)
   */
  getBlueTeamPlayers(): PlayerInfo[] {
    if (!this.matchData) return [];
    
    // Se o jogador está no time azul, teammates são azul, enemies são vermelho
    // Se o jogador está no time vermelho, teammates são vermelho, enemies são azul
    const blueTeam = this.matchData.playerSide === 'blue' ? this.matchData.teammates : this.matchData.enemies;
    
    console.log('🎮 [MatchFound] getBlueTeamPlayers:', {
      playerSide: this.matchData.playerSide,
      teammatesCount: this.matchData.teammates?.length,
      enemiesCount: this.matchData.enemies?.length,
      blueTeamCount: blueTeam?.length,
      blueTeam: blueTeam?.map(p => ({ name: p.summonerName, lane: p.assignedLane }))
    });
    
    return blueTeam;
  }

  /**
   * Retorna os jogadores do time vermelho (sempre à direita)
   */
  getRedTeamPlayers(): PlayerInfo[] {
    if (!this.matchData) return [];
    
    // Se o jogador está no time azul, teammates são azul, enemies são vermelho
    // Se o jogador está no time vermelho, teammates são vermelho, enemies são azul
    const redTeam = this.matchData.playerSide === 'blue' ? this.matchData.enemies : this.matchData.teammates;
    
    console.log('🎮 [MatchFound] getRedTeamPlayers:', {
      playerSide: this.matchData.playerSide,
      teammatesCount: this.matchData.teammates?.length,
      enemiesCount: this.matchData.enemies?.length,
      redTeamCount: redTeam?.length,
      redTeam: redTeam?.map(p => ({ name: p.summonerName, lane: p.assignedLane }))
    });
    
    return redTeam;
  }

  /**
   * Retorna o MMR médio do time azul
   */
  getBlueTeamMMR(): number {
    if (!this.matchData) return 0;
    
    return this.matchData.playerSide === 'blue' 
      ? this.matchData.averageMMR.yourTeam 
      : this.matchData.averageMMR.enemyTeam;
  }

  /**
   * Retorna o MMR médio do time vermelho
   */
  getRedTeamMMR(): number {
    if (!this.matchData) return 0;
    
    return this.matchData.playerSide === 'blue' 
      ? this.matchData.averageMMR.enemyTeam 
      : this.matchData.averageMMR.yourTeam;
  }
}
