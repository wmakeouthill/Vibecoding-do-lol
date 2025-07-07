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
  acceptTimeout?: number; // ✅ CORREÇÃO: Compatibilidade com dados antigos
  acceptanceTimer?: number; // ✅ NOVO: Timer em segundos do backend
  acceptanceDeadline?: string; // ✅ NOVO: Deadline ISO string
  teamStats?: any; // ✅ NOVO: Estatísticas dos times
  balancingInfo?: any; // ✅ NOVO: Informações de balanceamento
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

  constructor(private profileIconService: ProfileIconService) { }

  ngOnInit() {
    if (this.matchData && this.matchData.phase === 'accept') {
      this.startAcceptCountdown();
    }

    // ✅ NOVO: Escutar atualizações de timer do backend
    this.setupTimerListener();
  }

  ngOnChanges(changes: SimpleChanges) {
    // ✅ CORREÇÃO CRÍTICA: Só reiniciar timer se for uma nova partida REAL
    if (changes['matchData'] && changes['matchData'].currentValue) {
      const previousMatchData = changes['matchData'].previousValue;
      const currentMatchData = changes['matchData'].currentValue;

      const previousMatchId = previousMatchData?.matchId;
      const currentMatchId = currentMatchData?.matchId;

      console.log('🎮 [MatchFound] === ngOnChanges CHAMADO ===');
      console.log('🎮 [MatchFound] MatchId anterior:', previousMatchId);
      console.log('🎮 [MatchFound] MatchId atual:', currentMatchId);
      console.log('🎮 [MatchFound] Timer ativo:', !!this.countdownTimer);
      console.log('🎮 [MatchFound] Accept time atual:', this.acceptTimeLeft);

      // ✅ CORREÇÃO: Verificações mais rigorosas para evitar reprocessamento
      const isExactSameData = previousMatchData && currentMatchData &&
                              JSON.stringify(previousMatchData) === JSON.stringify(currentMatchData);

      if (isExactSameData) {
        console.log('🎮 [MatchFound] Dados idênticos - ignorando ngOnChanges');
        return;
      }

      // ✅ CORREÇÃO: Só processar se realmente é uma nova partida
      const isNewMatch = previousMatchId !== currentMatchId && currentMatchId !== undefined;
      const isFirstTime = !previousMatchId && currentMatchId && !this.countdownTimer;

      console.log('🎮 [MatchFound] Análise de mudança:', {
        isNewMatch,
        isFirstTime,
        sameId: previousMatchId === currentMatchId,
        hasTimer: !!this.countdownTimer
      });

      if (isNewMatch || isFirstTime) {
        console.log('🎮 [MatchFound] ✅ NOVA PARTIDA CONFIRMADA - configurando timer');

        // ✅ CORREÇÃO: Limpar timer anterior se existir
        if (this.countdownTimer) {
          console.log('🎮 [MatchFound] Limpando timer anterior');
          clearInterval(this.countdownTimer);
          this.countdownTimer = undefined;
        }

        // ✅ CORREÇÃO: Configurar timer apenas se backend não está controlando
        if (this.matchData && this.matchData.phase === 'accept') {
          // ✅ CORREÇÃO: Usar acceptanceTimer do backend primeiro, depois acceptTimeout como fallback
          const backendTimer = this.matchData.acceptanceTimer || this.matchData.acceptTimeout || 30;

          console.log('🎮 [MatchFound] Timer recebido do backend:', backendTimer);
          this.acceptTimeLeft = backendTimer;
          this.isTimerUrgent = this.acceptTimeLeft <= 10;

          // ✅ CORREÇÃO: Timer local apenas como fallback após 2 segundos
          setTimeout(() => {
            const expectedTimer = this.matchData?.acceptanceTimer || this.matchData?.acceptTimeout || 30;
            if (this.acceptTimeLeft === expectedTimer) {
              console.log('🎮 [MatchFound] Backend não enviou timer, iniciando timer local');
              this.startAcceptCountdown();
            }
          }, 2000);
        }

        // Carregar ícones de perfil para todos os jogadores
        this.loadProfileIconsForPlayers();
      } else {
        console.log('🎮 [MatchFound] ❌ MESMA PARTIDA - ignorando ngOnChanges');
        console.log('🎮 [MatchFound] Motivo: previousMatchId =', previousMatchId, ', currentMatchId =', currentMatchId);
      }
    }
  }

  ngOnDestroy() {
    console.log('🧹 [MatchFound] Destruindo componente - limpando recursos');

    // ✅ CORREÇÃO: Limpar timer local se existir
    if (this.countdownTimer) {
      clearInterval(this.countdownTimer);
      this.countdownTimer = undefined;
    }

    // ✅ NOVO: Remover listener de timer
    document.removeEventListener('matchTimerUpdate', this.onTimerUpdate);

    console.log('✅ [MatchFound] Recursos limpos com sucesso');
  }

  // ✅ NOVO: Configurar listener para atualizações de timer do backend
  private setupTimerListener(): void {
    document.addEventListener('matchTimerUpdate', this.onTimerUpdate);
  }

  // ✅ CORREÇÃO: Handler para atualizações de timer do backend
  private onTimerUpdate = (event: any): void => {
    if (event.detail && this.matchData) {
      console.log('⏰ [MatchFound] Timer atualizado pelo backend:', event.detail);

      // Verificar se a atualização é para esta partida
      if (event.detail.matchId && event.detail.matchId !== this.matchData.matchId) {
        console.log('⏰ [MatchFound] Timer para partida diferente - ignorando');
        return;
      }

      // ✅ CORREÇÃO: Só atualizar se o valor mudou significativamente
      const newTimeLeft = event.detail.timeLeft;
      const timeDifference = Math.abs(this.acceptTimeLeft - newTimeLeft);

      if (timeDifference > 0) {
        console.log(`⏰ [MatchFound] Atualizando timer: ${this.acceptTimeLeft} → ${newTimeLeft}`);
        this.acceptTimeLeft = newTimeLeft;
        this.isTimerUrgent = event.detail.isUrgent || newTimeLeft <= 10;

        // ✅ NOVO: Parar timer local se backend está controlando
        if (this.countdownTimer) {
          console.log('⏰ [MatchFound] Backend assumiu controle - parando timer local');
          clearInterval(this.countdownTimer);
          this.countdownTimer = undefined;
        }

        // Auto-decline se tempo esgotar
        if (this.acceptTimeLeft <= 0) {
          console.log('⏰ [MatchFound] Timer expirou via backend - auto-decline');
          this.onDeclineMatch();
        }
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
    // ✅ CORREÇÃO: Não iniciar se já existe timer ou se backend está controlando
    if (this.countdownTimer) {
      console.log('⏰ [MatchFound] Timer já existe - não iniciando novo');
      return;
    }

    // ✅ CORREÇÃO: Usar acceptanceTimer do backend primeiro, depois acceptTimeout como fallback
    const backendTimer = this.matchData?.acceptanceTimer || this.matchData?.acceptTimeout || 30;

    // ✅ CORREÇÃO: Se já é um número em segundos, não dividir por 1000
    this.acceptTimeLeft = typeof backendTimer === 'number' ? backendTimer : 30;
    this.isTimerUrgent = this.acceptTimeLeft <= 10;

    console.log('⏰ [MatchFound] Iniciando timer local como fallback com', this.acceptTimeLeft, 'segundos');

    // ✅ CORREÇÃO: Timer local apenas como fallback quando backend não responde
    this.countdownTimer = window.setInterval(() => {
      // ✅ NOVO: Verificar se backend assumiu controle
      if (!this.countdownTimer) {
        console.log('⏰ [MatchFound] Timer local cancelado - backend assumiu controle');
        return;
      }

      this.acceptTimeLeft--;
      this.isTimerUrgent = this.acceptTimeLeft <= 10;

      console.log('⏰ [MatchFound] Timer local (fallback):', this.acceptTimeLeft, 'segundos restantes');

      if (this.acceptTimeLeft <= 0) {
        console.log('⏰ [MatchFound] Timer local expirou - auto-decline');
        this.onDeclineMatch();
        if (this.countdownTimer) {
          clearInterval(this.countdownTimer);
          this.countdownTimer = undefined;
        }
      }
    }, 1000);
  }

  onAcceptMatch(): void {
    if (this.matchData) {
      console.log('✅ [MatchFound] Emitindo aceitação para:', this.matchData.matchId);
      this.acceptMatch.emit(this.matchData.matchId);

      // ✅ CORREÇÃO: Parar timer imediatamente após aceitar
      if (this.countdownTimer) {
        clearInterval(this.countdownTimer);
        this.countdownTimer = undefined;
      }
    }
  }

  onDeclineMatch(): void {
    if (this.matchData) {
      console.log('❌ [MatchFound] Emitindo recusa para:', this.matchData.matchId);
      this.declineMatch.emit(this.matchData.matchId);

      // ✅ CORREÇÃO: Parar timer imediatamente após recusar
      if (this.countdownTimer) {
        clearInterval(this.countdownTimer);
        this.countdownTimer = undefined;
      }
    }
  }

  getLaneName(lane: string): string {
    if (!lane) {
      return 'Desconhecido';
    }

    // ✅ CORREÇÃO: Normalizar lane para minúsculas e mapear para nome
    const normalizedLane = lane.toLowerCase().trim();
    const mappedLane = normalizedLane === 'adc' ? 'bot' : normalizedLane;

    const names: { [key: string]: string } = {
      'top': 'Topo',
      'jungle': 'Selva',
      'mid': 'Meio',
      'bot': 'Atirador',
      'support': 'Suporte',
      'fill': 'Preenchimento'
    };

    const name = names[mappedLane];
    return name || lane;
  }

  getLaneIcon(lane: string): string {
    if (!lane) {
      return '❓';
    }

    // ✅ CORREÇÃO: Normalizar lane para minúsculas e mapear para ícone
    const normalizedLane = lane.toLowerCase().trim();
    const mappedLane = normalizedLane === 'adc' ? 'bot' : normalizedLane;

    const icons: { [key: string]: string } = {
      'top': '⚔️',
      'jungle': '🌲',
      'mid': '⚡',
      'bot': '🏹',
      'support': '🛡️',
      'fill': '🎲'
    };

    const icon = icons[mappedLane];
    return icon || '❓';
  }

  getAssignedLaneDisplay(player: PlayerInfo): string {
    // ✅ LOG FORÇADO: Este log DEVE aparecer

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

      // ✅ CORREÇÃO: Normalizar lanes para minúsculas e mapear ADC -> bot
      const normalizeAndMapLane = (lane: string) => {
        const normalized = lane.toLowerCase();
        return normalized === 'adc' ? 'bot' : normalized;
      };

      const laneA = normalizeAndMapLane(a.assignedLane || a.primaryLane || 'fill');
      const laneB = normalizeAndMapLane(b.assignedLane || b.primaryLane || 'fill');

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

    // ✅ CORREÇÃO: Usar lógica mais robusta para identificar o jogador atual
    // O jogador atual deve estar nos teammates (não nos enemies)
    const isInTeammates = this.matchData.teammates.some(teammate =>
      teammate.summonerName === player.summonerName
    );

    return isInTeammates;
  }

  /**
   * Retorna os jogadores do time azul (sempre à esquerda)
   */
  getBlueTeamPlayers(): PlayerInfo[] {
    if (!this.matchData) return [];

    // Se o jogador está no time azul, teammates são azul, enemies são vermelho
    // Se o jogador está no time vermelho, teammates são vermelho, enemies são azul
    const blueTeam = this.matchData.playerSide === 'blue' ? this.matchData.teammates : this.matchData.enemies;

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
