import { Component, Input, Output, EventEmitter, OnInit, OnDestroy, OnChanges, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ProfileIconService } from '../../services/profile-icon.service';
import { Observable, of } from 'rxjs';
import { BotService } from '../../services/bot.service';

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

function logMatchFound(...args: any[]) {
  const fs = (window as any).electronAPI?.fs;
  const path = (window as any).electronAPI?.path;
  const process = (window as any).electronAPI?.process;
  const logPath = path && process ? path.join(process.cwd(), 'frontend.log') : '';
  const logLine = `[${new Date().toISOString()}] [MatchFound] ` + args.map(a => (typeof a === 'object' ? JSON.stringify(a) : a)).join(' ') + '\n';
  if (fs && logPath) {
    fs.appendFile(logPath, logLine, (err: any) => { });
  }
  console.log('[MatchFound]', ...args);
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
  sortedBlueTeam: PlayerInfo[] = [];
  sortedRedTeam: PlayerInfo[] = [];
  private countdownTimer?: number;
  isTimerUrgent = false;

  private playerIconMap = new Map<string, number>();

  constructor(private profileIconService: ProfileIconService, public botService: BotService) { }

  ngOnInit() {
    if (this.matchData && this.matchData.phase === 'accept') {
      this.startAcceptCountdown();
    }
    this.updateSortedTeams();
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

      logMatchFound('🎮 [MatchFound] === ngOnChanges CHAMADO ===');
      logMatchFound('🎮 [MatchFound] MatchId anterior:', previousMatchId);
      logMatchFound('🎮 [MatchFound] MatchId atual:', currentMatchId);
      logMatchFound('🎮 [MatchFound] Timer ativo:', !!this.countdownTimer);
      logMatchFound('🎮 [MatchFound] Accept time atual:', this.acceptTimeLeft);

      // ✅ CORREÇÃO: Verificações mais rigorosas para evitar reprocessamento
      const isExactSameData = previousMatchData && currentMatchData &&
        JSON.stringify(previousMatchData) === JSON.stringify(currentMatchData);

      if (isExactSameData) {
        logMatchFound('🎮 [MatchFound] Dados idênticos - ignorando ngOnChanges');
        return;
      }

      // ✅ CORREÇÃO: Só processar se realmente é uma nova partida
      const isNewMatch = previousMatchId !== currentMatchId && currentMatchId !== undefined;
      const isFirstTime = !previousMatchId && currentMatchId && !this.countdownTimer;

      logMatchFound('🎮 [MatchFound] Análise de mudança:', {
        isNewMatch,
        isFirstTime,
        sameId: previousMatchId === currentMatchId,
        hasTimer: !!this.countdownTimer
      });

      if (isNewMatch || isFirstTime) {
        logMatchFound('🎮 [MatchFound] ✅ NOVA PARTIDA CONFIRMADA - configurando timer');

        // ✅ CORREÇÃO: Limpar timer anterior se existir
        if (this.countdownTimer) {
          logMatchFound('🎮 [MatchFound] Limpando timer anterior');
          clearInterval(this.countdownTimer);
          this.countdownTimer = undefined;
        }

        // ✅ CORREÇÃO: Configurar timer apenas se backend não está controlando
        if (this.matchData && this.matchData.phase === 'accept') {
          // ✅ CORREÇÃO: Usar acceptanceTimer do backend primeiro, depois acceptTimeout como fallback
          const backendTimer = this.matchData.acceptanceTimer || this.matchData.acceptTimeout || 30;

          logMatchFound('🎮 [MatchFound] Timer recebido do backend:', backendTimer);
          this.acceptTimeLeft = backendTimer;
          this.isTimerUrgent = this.acceptTimeLeft <= 10;

          // ✅ CORREÇÃO: Timer local apenas como fallback após 2 segundos
          setTimeout(() => {
            const expectedTimer = this.matchData?.acceptanceTimer || this.matchData?.acceptTimeout || 30;
            if (this.acceptTimeLeft === expectedTimer) {
              logMatchFound('🎮 [MatchFound] Backend não enviou timer, iniciando timer local');
              this.startAcceptCountdown();
            }
          }, 2000);
        }

        this.updateSortedTeams();
      } else {
        logMatchFound('🎮 [MatchFound] ❌ MESMA PARTIDA - ignorando ngOnChanges');
        logMatchFound('🎮 [MatchFound] Motivo: previousMatchId =', previousMatchId, ', currentMatchId =', currentMatchId);
      }
    }
  }

  ngOnDestroy() {
    logMatchFound('🧹 [MatchFound] Destruindo componente - limpando recursos');

    // ✅ CORREÇÃO: Limpar timer local se existir
    if (this.countdownTimer) {
      clearInterval(this.countdownTimer);
      this.countdownTimer = undefined;
    }

    // ✅ NOVO: Remover listener de timer
    document.removeEventListener('matchTimerUpdate', this.onTimerUpdate);

    logMatchFound('✅ [MatchFound] Recursos limpos com sucesso');
  }

  private updateSortedTeams(): void {
    logMatchFound('🎯 [MatchFound] === updateSortedTeams CHAMADO ===');
    logMatchFound('🎯 [MatchFound] matchData presente:', !!this.matchData);

    if (!this.matchData) {
      logMatchFound('🎯 [MatchFound] matchData é null - limpando times');
      this.sortedBlueTeam = [];
      this.sortedRedTeam = [];
      return;
    }

    logMatchFound('🎯 [MatchFound] Dados do matchData:', {
      matchId: this.matchData.matchId,
      playerSide: this.matchData.playerSide,
      teammatesCount: this.matchData.teammates?.length || 0,
      enemiesCount: this.matchData.enemies?.length || 0
    });

    const blueTeamPlayers = this.getBlueTeamPlayers();
    const redTeamPlayers = this.getRedTeamPlayers();

    logMatchFound('🎯 [MatchFound] Blue team players:', blueTeamPlayers.map(p => ({
      name: p.summonerName,
      assignedLane: p.assignedLane,
      teamIndex: p.teamIndex,
      isAutofill: p.isAutofill
    })));

    logMatchFound('🎯 [MatchFound] Red team players:', redTeamPlayers.map(p => ({
      name: p.summonerName,
      assignedLane: p.assignedLane,
      teamIndex: p.teamIndex,
      isAutofill: p.isAutofill
    })));

    this.sortedBlueTeam = this.getSortedPlayersByLane(blueTeamPlayers);
    this.sortedRedTeam = this.getSortedPlayersByLane(redTeamPlayers);

    logMatchFound('🎯 [MatchFound] Times ordenados:', {
      blueTeam: this.sortedBlueTeam.map(p => ({ name: p.summonerName, lane: p.assignedLane })),
      redTeam: this.sortedRedTeam.map(p => ({ name: p.summonerName, lane: p.assignedLane }))
    });
  }

  // ✅ NOVO: Configurar listener para atualizações de timer do backend
  private setupTimerListener(): void {
    document.addEventListener('matchTimerUpdate', this.onTimerUpdate);
  }

  // ✅ CORREÇÃO: Handler para atualizações de timer do backend
  private onTimerUpdate = (event: any): void => {
    if (event.detail && this.matchData) {
      logMatchFound('⏰ [MatchFound] Timer atualizado pelo backend:', event.detail);

      // Verificar se a atualização é para esta partida
      if (event.detail.matchId && event.detail.matchId !== this.matchData.matchId) {
        logMatchFound('⏰ [MatchFound] Timer para partida diferente - ignorando');
        return;
      }

      // ✅ CORREÇÃO: Só atualizar se o valor mudou significativamente
      const newTimeLeft = event.detail.timeLeft;
      const timeDifference = Math.abs(this.acceptTimeLeft - newTimeLeft);

      if (timeDifference > 0) {
        logMatchFound(`⏰ [MatchFound] Atualizando timer: ${this.acceptTimeLeft} → ${newTimeLeft}`);
        this.acceptTimeLeft = newTimeLeft;
        this.isTimerUrgent = event.detail.isUrgent || newTimeLeft <= 10;

        // ✅ NOVO: Parar timer local se backend está controlando
        if (this.countdownTimer) {
          logMatchFound('⏰ [MatchFound] Backend assumiu controle - parando timer local');
          clearInterval(this.countdownTimer);
          this.countdownTimer = undefined;
        }

        // Auto-decline se tempo esgotar
        if (this.acceptTimeLeft <= 0) {
          logMatchFound('⏰ [MatchFound] Timer expirou via backend - auto-decline');
          this.onDeclineMatch();
        }
      }
    }
  }

  /**
   * Obtém a URL do ícone de perfil para um jogador
   */
  getPlayerProfileIconUrl(player: PlayerInfo): Observable<string> {
    const identifier = (player.riotIdGameName && player.riotIdTagline)
      ? `${player.riotIdGameName}#${player.riotIdTagline}`
      : player.summonerName;
    return this.profileIconService.getProfileIconUrl(identifier);
  }

  /**
   * Retorna o Observable da URL do ícone de perfil se for humano, ou null se for bot
   */
  getPlayerProfileIconUrlIfHuman(player: PlayerInfo): Observable<string | null> {
    // Checa se é bot pelo nome
    if (this.botService.isBot(player)) {
      return of(null);
    }
    const identifier = (player.riotIdGameName && player.riotIdTagline)
      ? `${player.riotIdGameName}#${player.riotIdTagline}`
      : player.summonerName;
    return this.profileIconService.getProfileIconUrl(identifier);
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
      logMatchFound('⏰ [MatchFound] Timer já existe - não iniciando novo');
      return;
    }

    // ✅ CORREÇÃO: Usar acceptanceTimer do backend primeiro, depois acceptTimeout como fallback
    const backendTimer = this.matchData?.acceptanceTimer || this.matchData?.acceptTimeout || 30;

    // ✅ CORREÇÃO: Se já é um número em segundos, não dividir por 1000
    this.acceptTimeLeft = typeof backendTimer === 'number' ? backendTimer : 30;
    this.isTimerUrgent = this.acceptTimeLeft <= 10;

    logMatchFound('⏰ [MatchFound] Iniciando timer local como fallback com', this.acceptTimeLeft, 'segundos');

    // ✅ CORREÇÃO: Timer local apenas como fallback quando backend não responde
    this.countdownTimer = window.setInterval(() => {
      // ✅ NOVO: Verificar se backend assumiu controle
      if (!this.countdownTimer) {
        logMatchFound('⏰ [MatchFound] Timer local cancelado - backend assumiu controle');
        return;
      }

      this.acceptTimeLeft--;
      this.isTimerUrgent = this.acceptTimeLeft <= 10;

      logMatchFound('⏰ [MatchFound] Timer local (fallback):', this.acceptTimeLeft, 'segundos restantes');

      if (this.acceptTimeLeft <= 0) {
        logMatchFound('⏰ [MatchFound] Timer local expirou - auto-decline');
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
      logMatchFound('✅ [MatchFound] Emitindo aceitação para:', this.matchData.matchId);
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
      logMatchFound('❌ [MatchFound] Emitindo recusa para:', this.matchData.matchId);
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
    logMatchFound('🎯 [MatchFound] getAssignedLaneDisplay chamado para:', {
      name: player.summonerName,
      assignedLane: player.assignedLane,
      isAutofill: player.isAutofill,
      teamIndex: player.teamIndex
    });

    if (!player.assignedLane) {
      console.warn('⚠️ [MatchFound] assignedLane está vazio para:', player.summonerName);
      return '❓ Desconhecido';
    }

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
    logMatchFound('🎯 [MatchFound] Ordenando jogadores por lane:', players.map(p => ({
      name: p.summonerName,
      teamIndex: p.teamIndex,
      assignedLane: p.assignedLane,
      primaryLane: p.primaryLane
    })));

    // ✅ CORREÇÃO: Usar teamIndex se disponível, senão ordenar por lane
    return [...players].sort((a, b) => {
      // Se ambos têm teamIndex, usar ele para ordenação
      if (a.teamIndex !== undefined && b.teamIndex !== undefined) {
        logMatchFound(`🎯 [MatchFound] Ordenando por teamIndex: ${a.summonerName}(${a.teamIndex}) vs ${b.summonerName}(${b.teamIndex})`);
        return a.teamIndex - b.teamIndex;
      }

      // ✅ CORREÇÃO: Normalizar lanes para minúsculas e mapear ADC -> bot
      const normalizeAndMapLane = (lane: string) => {
        const normalized = lane.toLowerCase();
        return normalized === 'adc' ? 'bot' : normalized;
      };

      const laneA = normalizeAndMapLane(a.assignedLane || a.primaryLane || 'fill');
      const laneB = normalizeAndMapLane(b.assignedLane || b.primaryLane || 'fill');

      // ✅ CORREÇÃO: Ordenar por ordem das lanes (top, jungle, mid, bot, support)
      const laneOrder = ['top', 'jungle', 'mid', 'bot', 'support'];
      const indexA = laneOrder.indexOf(laneA);
      const indexB = laneOrder.indexOf(laneB);

      logMatchFound(`🎯 [MatchFound] Ordenando por lane: ${a.summonerName}(${laneA}:${indexA}) vs ${b.summonerName}(${laneB}:${indexB})`);

      if (indexA === -1 && indexB === -1) return 0;
      if (indexA === -1) return 1;
      if (indexB === -1) return -1;
      return indexA - indexB;
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
