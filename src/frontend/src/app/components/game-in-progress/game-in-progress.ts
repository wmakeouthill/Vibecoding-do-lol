import { Component, Input, Output, EventEmitter, OnInit, OnDestroy, OnChanges, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../services/api';
import { interval, Subscription } from 'rxjs';

interface GameData {
  sessionId: string;
  gameId: string;
  team1: any[];
  team2: any[];
  startTime: Date;
  pickBanData: any;
  isCustomGame: boolean;
  originalMatchId?: any;
  originalMatchData?: any;
  riotId?: string | null;
}

interface GameResult {
  sessionId: string;
  gameId: string;
  winner: 'blue' | 'red' | null;
  duration: number;
  endTime: Date;
  team1: any[];
  team2: any[];
  pickBanData: any;
  detectedByLCU: boolean;
  isCustomGame: boolean;
  originalMatchId?: any;
  originalMatchData?: any;
  riotId?: string | null;
}

@Component({
  selector: 'app-game-in-progress',
  imports: [CommonModule, FormsModule],
  templateUrl: './game-in-progress.html',
  styleUrl: './game-in-progress.scss'
})
export class GameInProgressComponent implements OnInit, OnDestroy, OnChanges {
  @Input() gameData: GameData | null = null;
  @Input() currentPlayer: any = null;
  @Output() onGameComplete = new EventEmitter<GameResult>();
  @Output() onGameCancel = new EventEmitter<void>();

  // Game state
  gameStatus: 'waiting' | 'in-progress' | 'ended' = 'waiting';
  gameStartTime: Date | null = null;
  gameDuration: number = 0;

  // LCU detection
  lcuGameDetected: boolean = false;
  lcuDetectionEnabled: boolean = true;

  // Manual result declaration
  selectedWinner: 'blue' | 'red' | null = null;
  // Match confirmation modal
  showMatchConfirmation: boolean = false;
  detectedLCUMatch: any = null;
  matchComparisonResult: any = null;

  // Auto detection state
  isAutoDetecting: boolean = false;

  // Live match linking
  currentLiveMatchId: string | null = null;
  matchLinkingEnabled: boolean = true;
  lastLinkingAttempt: number = 0;
  linkingAttempts: number = 0;
  maxLinkingAttempts: number = 5;
  linkingStartTime: number = 0;

  // Timers
  private gameTimer: Subscription | null = null;
  private lcuDetectionTimer: Subscription | null = null;

  // Game tracking
  private currentGameSession: any = null;

  constructor(private apiService: ApiService) {}  ngOnInit() {
    console.log('🚀 [GameInProgress] Inicializando componente...');
    console.log('📊 [GameInProgress] gameData recebido:', {
      hasGameData: !!this.gameData,
      originalMatchId: this.gameData?.originalMatchId, // ✅ VERIFICAR ESTE VALOR
      gameDataKeys: this.gameData ? Object.keys(this.gameData) : [],
      hasTeam1: !!(this.gameData?.team1),
      hasTeam2: !!(this.gameData?.team2),
      team1Length: this.gameData?.team1?.length || 0,
      team2Length: this.gameData?.team2?.length || 0,
      fullGameData: this.gameData // ✅ LOG COMPLETO
    });
    console.log('👤 [GameInProgress] currentPlayer:', this.currentPlayer);

    // ✅ CORREÇÃO: Só inicializar se temos gameData
    if (this.gameData) {
      this.initializeGame();
    } else {
      console.log('⏳ [GameInProgress] Aguardando gameData...');
    }
  }

  ngOnChanges(changes: SimpleChanges) {
    console.log('🔄 [GameInProgress] ngOnChanges detectado:', changes);

    // ✅ CORREÇÃO: Detectar quando gameData é recebido
    if (changes['gameData'] && changes['gameData'].currentValue && !changes['gameData'].previousValue) {
      console.log('🎮 [GameInProgress] gameData recebido via ngOnChanges, inicializando jogo...');
      this.initializeGame();
    }
  }

  ngOnDestroy() {
    this.stopTimers();
  }  private initializeGame() {
    console.log('🎮 [GameInProgress] Inicializando jogo...');
    console.log('📊 [GameInProgress] gameData atual:', {
      gameData: this.gameData,
      hasGameData: !!this.gameData,
      sessionId: this.gameData?.sessionId,
      team1Length: this.gameData?.team1?.length || 0,
      team2Length: this.gameData?.team2?.length || 0,
      team1Sample: this.gameData?.team1?.[0],
      team2Sample: this.gameData?.team2?.[0]
    });

    if (!this.gameData) {
      console.error('❌ [GameInProgress] gameData não está disponível');
      return;
    }

    // ✅ CORREÇÃO: Verificar se temos os dados mínimos necessários
    if (!this.gameData.team1 || !this.gameData.team2) {
      console.error('❌ [GameInProgress] Dados dos times não estão disponíveis:', {
        hasTeam1: !!this.gameData.team1,
        hasTeam2: !!this.gameData.team2,
        gameDataKeys: Object.keys(this.gameData)
      });
      return;
    }

    if (this.gameData.team1.length === 0 || this.gameData.team2.length === 0) {
      console.error('❌ [GameInProgress] Times estão vazios:', {
        team1Length: this.gameData.team1.length,
        team2Length: this.gameData.team2.length
      });
      return;
    }

    this.gameStartTime = new Date();
    this.gameStatus = 'waiting';
    this.linkingStartTime = Date.now(); // Inicializar tempo para vinculação

    console.log('✅ [GameInProgress] Partida inicializada com sucesso:', {
      sessionId: this.gameData.sessionId,
      team1: this.gameData.team1?.length || 0,
      team2: this.gameData.team2?.length || 0,
      isCustom: this.gameData.isCustomGame
    });

    // Start game timer
    this.startGameTimer();

    // Start live match linking system
    this.startLiveMatchLinking();
  }

  private startGameTimer() {
    this.gameTimer = interval(1000).subscribe(() => {
      if (this.gameStartTime) {
        this.gameDuration = Math.floor((Date.now() - this.gameStartTime.getTime()) / 1000);
      }
    });
  }
  // Live match linking system - tries to link to actual LoL match every 2 minutes
  private startLiveMatchLinking() {
    if (!this.matchLinkingEnabled) return;

    // console.log('🔗 Iniciando sistema de vinculação de partidas ao vivo...');

    // Try to link immediately
    this.tryLinkToLiveMatch();

    // Then try every 2 minutes
    this.lcuDetectionTimer = interval(120000).subscribe(() => { // 2 minutes
      this.tryLinkToLiveMatch();
    });  }

  private async tryLinkToLiveMatch(): Promise<void> {
    const now = Date.now();

    // Check if we've exceeded the maximum number of attempts
    if (this.linkingAttempts >= this.maxLinkingAttempts) {
      // console.log('🚫 Máximo de tentativas de vinculação atingido:', this.linkingAttempts);
      if (this.lcuDetectionTimer) {
        this.lcuDetectionTimer.unsubscribe();
        this.lcuDetectionTimer = null;
      }
      return;
    }

    // Check if we've exceeded the time limit (10 minutes)
    const timeLimitMs = 10 * 60 * 1000; // 10 minutes

    if (now - this.linkingStartTime > timeLimitMs) {
      // console.log('⏰ Tempo limite de vinculação excedido (10 minutos)');
      if (this.lcuDetectionTimer) {
        this.lcuDetectionTimer.unsubscribe();
        this.lcuDetectionTimer = null;
      }
      return;
    }

    // Avoid too frequent attempts
    if (now - this.lastLinkingAttempt < 30000) { // 30 seconds cooldown
      return;
    }

    this.lastLinkingAttempt = now;
    this.linkingAttempts++;

    try {
      // console.log(`🔗 Tentando vincular com partida ao vivo do LoL... (Tentativa ${this.linkingAttempts}/${this.maxLinkingAttempts})`);

      // Get current game from LCU
      const gameState = await this.apiService.getCurrentGame().toPromise();

      if (!gameState || !gameState.success || !gameState.data) {
        // console.log('📡 Nenhum jogo ativo detectado no LCU');
        return;
      }

      const currentGame = gameState.data;

      // Check if this is a valid game to link
      if (currentGame.gameMode && currentGame.gameId) {        // Check if we're already linked to this match
        if (this.currentLiveMatchId === currentGame.gameId.toString()) {
          // console.log('🔗 Já vinculado à partida:', currentGame.gameId);
          return;
        }

        // Check if this match seems to correspond to our draft
        const linkingScore = this.calculateLiveLinkingScore(currentGame);

        if (linkingScore.shouldLink) {
          // console.log('✅ Vinculando à partida ao vivo:', {
          //   gameId: currentGame.gameId,
          //   score: linkingScore.score,
          //   reason: linkingScore.reason
          // });

          // Link to this match
          this.currentLiveMatchId = currentGame.gameId.toString();

          // Update game data with live match ID
          if (this.gameData) {
            this.gameData.originalMatchId = currentGame.gameId;
            this.gameData.riotId = `BR1_${currentGame.gameId}`;
          }          // Notify user about successful linking
          // console.log('🎯 Partida vinculada automaticamente! ID:', currentGame.gameId);

        } else {
          // console.log('⚠️ Partida ao vivo não corresponde ao draft atual:', linkingScore.reason);
        }
      }

    } catch (error) {
      // console.log('❌ Erro ao tentar vincular partida ao vivo:', error);
    }
  }

  // Calculate if current live match should be linked to our draft
  private calculateLiveLinkingScore(liveGame: any): { shouldLink: boolean, score: number, reason: string } {
    if (!this.gameData || !this.gameData.pickBanData) {
      return { shouldLink: false, score: 0, reason: 'Dados de draft não disponíveis' };
    }

    let score = 0;
    let maxScore = 100;
    const reasons: string[] = [];

    // Check game timing (should be recent)
    if (liveGame.gameCreation) {
      const gameTime = new Date(liveGame.gameCreation);
      const draftTime = this.gameData.startTime ? new Date(this.gameData.startTime) : new Date();
      const timeDiff = Math.abs(gameTime.getTime() - draftTime.getTime()) / (1000 * 60); // minutes

      if (timeDiff <= 15) { // Within 15 minutes of draft
        score += 30;
        reasons.push(`Horário compatível (${Math.round(timeDiff)} min)`);
      } else {
        return { shouldLink: false, score: 0, reason: `Muito tempo entre draft e partida (${Math.round(timeDiff)} min)` };
      }
    }

    // Check if it's a custom game (preferred for our use case)
    if (liveGame.gameMode === 'CLASSIC' && liveGame.gameType === 'CUSTOM_GAME') {
      score += 40;
      reasons.push('Partida customizada');
    } else if (liveGame.gameMode === 'CLASSIC') {
      score += 20;
      reasons.push('Partida clássica');
    }

    // Check player participation (if current player is in the game)
    if (this.currentPlayer && liveGame.participants) {
      const currentPlayerInGame = liveGame.participants.some((p: any) =>
        p.summonerName === this.currentPlayer?.summonerName ||
        p.gameName === this.currentPlayer?.summonerName
      );

      if (currentPlayerInGame) {
        score += 30;
        reasons.push('Jogador atual está na partida');
      } else {
        // Not necessarily a deal-breaker, but reduces confidence
        score -= 10;
        reasons.push('Jogador atual não encontrado na partida');
      }
    }

    const shouldLink = score >= 60; // Need at least 60% confidence
    const reason = reasons.join(', ');

    return { shouldLink, score, reason };
  }

  private startLCUDetection() {
    if (!this.lcuDetectionEnabled) return;    // Check LCU every 5 seconds for game state
    this.lcuDetectionTimer = interval(5000).subscribe(() => {
      this.checkLCUStatus();
    });
  }

  private async checkLCUStatus() {
    try {
      const gameState = await this.apiService.getCurrentGame().toPromise();

      if (gameState && gameState.success) {
        const currentGame = gameState.data;

        // Check if we're in a game
        if (currentGame && currentGame.gameMode) {
          if (!this.lcuGameDetected) {
            this.onLCUGameDetected(currentGame);
          }

          // Check if game ended
          if (currentGame.gamePhase === 'EndOfGame' || currentGame.gamePhase === 'PostGame') {
            this.onLCUGameEnded(currentGame);
          }
        } else if (this.lcuGameDetected && this.gameStatus === 'in-progress') {
          // Game was detected but now we're not in game anymore
          this.onLCUGameEnded(null);
        }
      }        } catch (error) {
      // console.log('🔍 LCU não disponível para detecção automática');
    }
  }
  private onLCUGameDetected(gameData: any) {
    // console.log('🎮 Jogo detectado pelo LCU:', gameData);
    this.lcuGameDetected = true;
    this.gameStatus = 'in-progress';
    this.currentGameSession = gameData;
  }  private onLCUGameEnded(endGameData: any) {
    // console.log('🏁 Fim de jogo detectado pelo LCU:', endGameData);

    if (endGameData && endGameData.teams) {
      // Try to detect winner from LCU data
      const winningTeam = endGameData.teams.find((team: any) => team.win === "Win" || team.win === true);
      if (winningTeam) {
        const winner = winningTeam.teamId === 100 ? 'blue' : 'red';
        this.autoCompleteGame(winner, true);
        return;
      }
    }

    // If we can't detect winner automatically, ask user to declare
    this.gameStatus = 'ended';
  }

  private autoCompleteGame(winner: 'blue' | 'red', detectedByLCU: boolean) {
    if (!this.gameData) return;    const result: GameResult = {
      sessionId: this.gameData.sessionId,
      gameId: this.generateGameId(),
      winner: winner,
      duration: this.gameDuration,
      endTime: new Date(),
      team1: this.gameData.team1,
      team2: this.gameData.team2,
      pickBanData: this.gameData.pickBanData,
      detectedByLCU: detectedByLCU,
      isCustomGame: true,
      originalMatchId: this.gameData.originalMatchId,
      originalMatchData: this.gameData.originalMatchData,
      riotId: this.gameData.riotId
    };    // console.log('✅ Partida concluída automaticamente:', result);
    this.onGameComplete.emit(result);
  }
  // Novo método para completar jogo com dados reais do LCU
  private autoCompleteGameWithRealData(winner: 'blue' | 'red' | null, detectedByLCU: boolean, lcuMatchData: any) {
    if (!this.gameData) return;

    const result: GameResult = {
      sessionId: this.gameData.sessionId,
      gameId: this.generateGameId(),
      winner: winner,
      duration: this.gameDuration,
      endTime: new Date(),
      team1: this.gameData.team1,
      team2: this.gameData.team2,
      pickBanData: this.gameData.pickBanData,
      detectedByLCU: detectedByLCU,
      isCustomGame: true,
      originalMatchId: this.gameData.originalMatchId || lcuMatchData.gameId,
      originalMatchData: lcuMatchData, // Incluir dados completos da partida do LCU
      riotId: this.gameData.riotId || (lcuMatchData.platformId ? `${lcuMatchData.platformId}_${lcuMatchData.gameId}` : `BR1_${lcuMatchData.gameId}`)
    };

    console.log('✅ Partida concluída automaticamente com dados reais do LCU:', result);
    this.onGameComplete.emit(result);
  }

  // Manual winner declaration
  declareWinner(winner: 'blue' | 'red') {
    this.selectedWinner = winner;
  }
  confirmWinner() {
    if (!this.selectedWinner || !this.gameData) return;

    // Se temos dados da partida detectada do LCU, incluir eles
    if (this.detectedLCUMatch) {
      console.log('✅ Confirmando vencedor com dados reais do LCU');
      this.autoCompleteGameWithRealData(this.selectedWinner, true, this.detectedLCUMatch);
    } else {
      console.log('✅ Confirmando vencedor sem dados do LCU (manual)');
      const result: GameResult = {
        sessionId: this.gameData.sessionId,
        gameId: this.generateGameId(),
        winner: this.selectedWinner,
        duration: this.gameDuration,
        endTime: new Date(),
        team1: this.gameData.team1,
        team2: this.gameData.team2,
        pickBanData: this.gameData.pickBanData,
        detectedByLCU: false,
        isCustomGame: true,
        originalMatchId: this.gameData.originalMatchId,
        originalMatchData: this.gameData.originalMatchData,
        riotId: this.gameData.riotId
      };

      this.onGameComplete.emit(result);
    }
  }  // Cancel game
  async cancelGame() {
    console.log('❌ [GameInProgress] Cancelando partida...');

    try {
      // ✅ NOVO: Notificar backend para apagar a partida do banco
      if (this.gameData?.originalMatchId) {
        console.log('🗑️ [GameInProgress] Notificando backend para apagar partida:', this.gameData.originalMatchId);

        // Chamar API para cancelar/apagar a partida
        const response = await this.apiService.cancelMatch(this.gameData.originalMatchId).toPromise();
        if (response?.success) {
          console.log('✅ [GameInProgress] Partida apagada do banco com sucesso');
        } else {
          console.warn('⚠️ [GameInProgress] Erro ao apagar partida do banco:', response?.message);
        }
      } else {
        console.warn('⚠️ [GameInProgress] originalMatchId não disponível para apagar do banco');
      }
    } catch (error) {
      console.error('❌ [GameInProgress] Erro ao cancelar partida no backend:', error);
    }

    // Emitir evento de cancelamento para o componente pai
    this.onGameCancel.emit();
  }
  // Try to auto-resolve winner on component load (useful after app restart)
  private async tryAutoResolveWinner() {
    // console.log('🔄 Tentando auto-resolver vencedor...');

    // First, try to get winner from LCU
    const lcuWinner = await this.tryGetWinnerFromLCU();
    if (lcuWinner) {
      // console.log('🏆 Vencedor detectado via LCU:', lcuWinner);
      this.autoCompleteGame(lcuWinner, true);
      return;
    }

    // If LCU fails, try to compare with last custom match
    const historyWinner = await this.tryGetWinnerFromHistory();
    if (historyWinner) {
      // console.log('🏆 Vencedor detectado via histórico:', historyWinner);
      this.autoCompleteGame(historyWinner, false);
      return;
    }

    // console.log('⚠️ Não foi possível auto-resolver o vencedor');
  }  // Enhanced method to detect winner with automatic confirmation
  async retryAutoDetection() {
    console.log('🔄 [MANUAL] Detectando vencedor via comparação com LCU...');

    // Set loading state
    this.isAutoDetecting = true;

    try {
      // Get LCU match history to compare
      const historyResponse = await this.apiService.getLCUMatchHistoryAll(0, 30, false).toPromise();

      if (!historyResponse || !historyResponse.success || !historyResponse.matches || historyResponse.matches.length === 0) {
        console.log('⚠️ [MANUAL] Nenhuma partida encontrada no histórico do LCU');
        alert('Nenhuma partida encontrada no histórico do LCU. Certifique-se de que o League of Legends está aberto.');
        return;
      }

      console.log('🔍 [MANUAL] Histórico LCU obtido:', historyResponse.matches.length, 'partidas');

      // Try to find matching game
      const matchResult = this.findMatchingLCUGame(historyResponse.matches);

      if (!matchResult.match) {
        console.log('⚠️ [MANUAL] Nenhuma partida correspondente encontrada');
        alert('Nenhuma partida correspondente foi encontrada no histórico do LCU. Verifique se a partida foi concluída no League of Legends.');
        return;
      }

      console.log('✅ [MANUAL] Partida correspondente encontrada:', matchResult);

      // Store detected match data
      this.detectedLCUMatch = matchResult.match;
      this.matchComparisonResult = matchResult;

      // Automatically confirm the match without showing modal
      console.log('⚡ [AUTO] Confirmando partida automaticamente...');
      this.confirmDetectedMatch();

    } catch (error) {
      console.log('❌ [MANUAL] Erro ao detectar via histórico do LCU:', error);
      alert('Erro ao acessar o histórico do LCU. Certifique-se de que o League of Legends está aberto.');
    } finally {
      // Reset loading state
      this.isAutoDetecting = false;
    }
  }
  // Find matching LCU game based on current game data
  private findMatchingLCUGame(lcuMatches: any[]): { match: any | null, confidence: number, reason: string } {
    if (!this.gameData) {
      return { match: null, confidence: 0, reason: 'Nenhum dado de jogo disponível' };
    }

    console.log('🔍 Procurando partida correspondente entre', lcuMatches.length, 'partidas do LCU');

    // HIGHEST PRIORITY: Check if we have a live-linked match
    if (this.currentLiveMatchId) {
      const linkedMatch = lcuMatches.find((match: any) => match.gameId.toString() === this.currentLiveMatchId);
      if (linkedMatch) {
        console.log('🎯 Partida encontrada por vinculação automática:', linkedMatch.gameId);
        return {
          match: linkedMatch,
          confidence: 100,
          reason: `Partida vinculada automaticamente durante o jogo (ID: ${linkedMatch.gameId})`
        };
      }
    }

    // SECOND PRIORITY: Try to match by original match ID if this is a simulation
    if (this.gameData.originalMatchId) {
      const exactMatch = lcuMatches.find((match: any) => match.gameId === this.gameData?.originalMatchId);
      if (exactMatch) {
        console.log('✅ Partida encontrada por ID exato:', exactMatch.gameId);
        return {
          match: exactMatch,
          confidence: 100,
          reason: `Partida encontrada por ID exato (${exactMatch.gameId})`
        };
      }
    }

    // THIRD PRIORITY: Compare by similarity (champions, timing, etc.)
    let bestMatch: any = null;
    let bestScore = 0;
    let bestReason = '';

    for (const lcuMatch of lcuMatches) {
      const similarity = this.calculateMatchSimilarity(lcuMatch);
      if (similarity.confidence > bestScore) {
        bestMatch = lcuMatch;
        bestScore = similarity.confidence;
        bestReason = similarity.reason;
      }
    }

    // Only accept matches with reasonable confidence
    if (bestScore >= 70) {
      console.log('✅ Partida correspondente encontrada por similaridade:', { match: bestMatch.gameId, score: bestScore });
      return {
        match: bestMatch,
        confidence: bestScore,
        reason: bestReason
      };
    }

    // No good match found
    console.log('⚠️ Nenhuma partida correspondente encontrada');
    return {
      match: null,
      confidence: 0,
      reason: 'Nenhuma partida correspondente encontrada no histórico'
    };
  }

  // Calculate similarity between current game and LCU match
  private calculateMatchSimilarity(lcuMatch: any): { confidence: number, reason: string } {
    if (!this.gameData || !this.gameData.pickBanData) {
      return { confidence: 0, reason: 'Dados de pick/ban não disponíveis' };
    }

    let totalScore = 0;
    let maxScore = 0;
    const reasons: string[] = [];

    // Extract current game champions
    const currentTeam1Champions = this.extractChampionsFromTeam(this.gameData.team1);
    const currentTeam2Champions = this.extractChampionsFromTeam(this.gameData.team2);

    // Extract LCU match champions
    const lcuChampions = this.extractChampionsFromLCUMatch(lcuMatch);

    // Compare team compositions
    if (currentTeam1Champions.length > 0 && currentTeam2Champions.length > 0) {
      maxScore += 50; // Team composition worth 50 points

      // Check if current teams match either configuration in LCU
      const team1MatchScore = this.compareChampionLists(currentTeam1Champions, lcuChampions.team1) +
                             this.compareChampionLists(currentTeam2Champions, lcuChampions.team2);

      const team2MatchScore = this.compareChampionLists(currentTeam1Champions, lcuChampions.team2) +
                             this.compareChampionLists(currentTeam2Champions, lcuChampions.team1);

      const bestScore = Math.max(team1MatchScore, team2MatchScore);
      totalScore += bestScore;

      if (bestScore > 30) {
        reasons.push(`Composição de times similar (${Math.round(bestScore)}%)`);
      }
    }

    // Check game timing (prefer recent games)
    if (lcuMatch.gameCreation) {
      maxScore += 20; // Timing worth 20 points
      const matchTime = new Date(lcuMatch.gameCreation);
      const gameStartTime = this.gameData.startTime ? new Date(this.gameData.startTime) : new Date();
      const timeDifference = Math.abs(matchTime.getTime() - gameStartTime.getTime()) / (1000 * 60); // minutes

      if (timeDifference <= 30) { // Within 30 minutes
        const timeScore = Math.max(0, 20 - (timeDifference / 30) * 20);
        totalScore += timeScore;
        if (timeScore > 10) {
          reasons.push(`Horário compatível (${Math.round(timeDifference)} min de diferença)`);
        }
      }
    }    // Check if match has ended and has winner
    if (lcuMatch.teams && lcuMatch.teams.length === 2) {
      maxScore += 30; // Complete match worth 30 points
      const hasWinner = lcuMatch.teams.some((team: any) => team.win === "Win" || team.win === true);
      if (hasWinner) {
        totalScore += 30;
        reasons.push('Partida finalizada com vencedor definido');
      }
    }

    const confidence = maxScore > 0 ? Math.round((totalScore / maxScore) * 100) : 0;
    const reason = reasons.length > 0 ? reasons.join(', ') : 'Pouca similaridade encontrada';

    return { confidence, reason };
  }

  // Extract champion names from team
  private extractChampionsFromTeam(team: any[]): string[] {
    return team.map(player => {
      if (player.champion && player.champion.name) {
        return player.champion.name.toLowerCase();
      }
      return null;
    }).filter(name => name !== null);
  }

  // Extract champions from LCU match
  private extractChampionsFromLCUMatch(lcuMatch: any): { team1: string[], team2: string[] } {
    const team1: string[] = [];
    const team2: string[] = [];

    if (lcuMatch.participants && lcuMatch.participantIdentities) {
      lcuMatch.participants.forEach((participant: any) => {
        const championName = this.getChampionNameById(participant.championId);
        if (championName) {
          if (participant.teamId === 100) {
            team1.push(championName.toLowerCase());
          } else if (participant.teamId === 200) {
            team2.push(championName.toLowerCase());
          }
        }
      });
    }

    return { team1, team2 };
  }

  // Compare two champion lists and return similarity percentage
  private compareChampionLists(list1: string[], list2: string[]): number {
    if (list1.length === 0 || list2.length === 0) return 0;

    let matches = 0;
    for (const champion of list1) {
      if (list2.includes(champion)) {
        matches++;
      }
    }

    return (matches / Math.max(list1.length, list2.length)) * 50; // Max 50 points per team
  }

  // Modal actions
  confirmDetectedMatch(): void {
    if (!this.detectedLCUMatch || !this.matchComparisonResult) return;

    const lcuMatch = this.detectedLCUMatch;    // Extract winner from LCU match
    let winner: 'blue' | 'red' | null = null;
    if (lcuMatch.teams && lcuMatch.teams.length === 2) {
      // LCU teams use string values: "Win" or "Fail"
      const winningTeam = lcuMatch.teams.find((team: any) => team.win === "Win" || team.win === true);
      if (winningTeam) {
        winner = winningTeam.teamId === 100 ? 'blue' : 'red';
      }
    }

    console.log('🔍 Detecção de vencedor:', {
      teams: lcuMatch.teams?.map((t: any) => ({ teamId: t.teamId, win: t.win })),
      detectedWinner: winner
    });

    console.log('✅ Partida confirmada automaticamente');
    console.log('🎮 Dados da partida LCU:', lcuMatch.gameId);

    // Fechar modal imediatamente
    this.showMatchConfirmation = false;

    // Atualizar gameData com informações da partida real
    if (this.gameData) {
      this.gameData.originalMatchId = lcuMatch.gameId;
      this.gameData.riotId = lcuMatch.platformId ? `${lcuMatch.platformId}_${lcuMatch.gameId}` : `BR1_${lcuMatch.gameId}`;
      this.gameData.originalMatchData = lcuMatch;
    }

    if (winner) {
      console.log('🏆 Vencedor detectado automaticamente via LCU:', winner);
      this.selectedWinner = winner;

      // Completar jogo automaticamente com dados reais - APENAS uma vez via evento onGameComplete
      this.autoCompleteGameWithRealData(winner, true, lcuMatch);    } else {
      console.log('⚠️ Partida confirmada mas sem vencedor detectado - completando partida como inconclusiva');

      // Mesmo sem vencedor detectado, completar a partida automaticamente
      // Marca como null (inconclusivo) mas salva no histórico
      this.autoCompleteGameWithRealData(null, true, lcuMatch);

      // Mostrar notificação de que a partida foi salva mas sem vencedor definido
      this.showSuccessNotification(
        'Partida salva!',
        'A partida foi detectada e salva no histórico, mas o vencedor não pôde ser determinado automaticamente.'
      );
    }
  }

  rejectDetectedMatch(): void {
    console.log('❌ Partida detectada rejeitada pelo usuário');
    this.closeMatchConfirmation();
  }

  closeMatchConfirmation(): void {
    this.showMatchConfirmation = false;
    this.detectedLCUMatch = null;
    this.matchComparisonResult = null;
  }

  // Get champion name by ID (helper method)
  getChampionNameById(championId: number): string | null {
    // O backend agora resolve os nomes dos campeões usando DataDragonService
    // Este método é mantido apenas para compatibilidade com dados antigos
    return `Champion${championId}`;
  }

  // Helper methods for modal template
  formatLCUMatchDate(gameCreation: number): string {
    if (!gameCreation) return 'Data não disponível';
    return new Date(gameCreation).toLocaleString('pt-BR');
  }

  formatGameDuration(gameDuration: number): string {
    if (!gameDuration) return 'Duração não disponível';
    const minutes = Math.floor(gameDuration / 60);
    const seconds = gameDuration % 60;
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  }
  getLCUMatchWinner(lcuMatch: any): 'blue' | 'red' | null {
    if (!lcuMatch || !lcuMatch.teams || lcuMatch.teams.length !== 2) return null;

    // LCU teams use string values: "Win" or "Fail"
    const winningTeam = lcuMatch.teams.find((team: any) => team.win === "Win" || team.win === true);
    if (!winningTeam) return null;

    return winningTeam.teamId === 100 ? 'blue' : 'red';
  }

  getLCUTeamParticipants(lcuMatch: any, teamId: number): any[] {
    if (!lcuMatch || !lcuMatch.participants) return [];

    return lcuMatch.participants.filter((participant: any) => participant.teamId === teamId);
  }
  // Missing utility methods
  private stopTimers(): void {
    if (this.gameTimer) {
      this.gameTimer.unsubscribe();
      this.gameTimer = null;
    }
    if (this.lcuDetectionTimer) {
      this.lcuDetectionTimer.unsubscribe();
      this.lcuDetectionTimer = null;
    }

    // Reset linking state
    this.currentLiveMatchId = null;
    this.matchLinkingEnabled = false;
  }

  private generateGameId(): string {
    return 'game_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
  }

  // Try to get winner from current LCU game
  private async tryGetWinnerFromLCU(): Promise<'blue' | 'red' | null> {
    try {
      const gameState = await this.apiService.getCurrentGame().toPromise();

      if (!gameState || !gameState.success || !gameState.data) {
        console.log('📡 Nenhum jogo ativo no LCU');
        return null;
      }

      const currentGame = gameState.data;      // Check if game has ended and get winner
      if (currentGame.gamePhase === 'EndOfGame' || currentGame.gamePhase === 'PostGame') {
        if (currentGame.teams) {
          const winningTeam = currentGame.teams.find((team: any) => team.win === "Win" || team.win === true);
          if (winningTeam) {
            return winningTeam.teamId === 100 ? 'blue' : 'red';
          }
        }
      }

      return null;
    } catch (error) {
      console.log('❌ Erro ao verificar LCU:', error);
      return null;
    }
  }

  // Try to get winner by comparing picks with last custom match
  private async tryGetWinnerFromHistory(): Promise<'blue' | 'red' | null> {
    try {
      if (!this.currentPlayer?.id) {
        console.log('❌ ID do jogador atual não encontrado');
        return null;
      }

      console.log('🔍 Buscando histórico para player ID:', this.currentPlayer.id);

      // Para o sistema buscar corretamente, vamos usar múltiplos identificadores
      let playerIdentifiers = [this.currentPlayer.id.toString()];

      if (this.currentPlayer?.summonerName) {
        playerIdentifiers.push(this.currentPlayer.summonerName);
      }

      // Para usuário especial, adicionar IDs conhecidos
      if (this.currentPlayer?.summonerName === 'popcorn seller' && this.currentPlayer?.tagLine === 'coup') {
        playerIdentifiers.push('1'); // ID numérico
        playerIdentifiers.push('popcorn seller'); // Nome do summoner
        console.log('🎯 Usando múltiplos identificadores para busca:', playerIdentifiers);
      }

      // Tentar buscar com cada identificador até encontrar partidas
      let history: any = null;
      for (const identifier of playerIdentifiers) {
        console.log(`🔍 Tentando buscar com identificador: ${identifier}`);
        history = await this.apiService.getCustomMatches(identifier, 0, 30).toPromise();

        if (history && history.success && history.matches && history.matches.length > 0) {
          console.log(`✅ Encontrado histórico com identificador: ${identifier}`);
          break;
        }
      }

      console.log('📋 Resposta do histórico de partidas:', history);

      if (!history || !history.success || !history.matches || history.matches.length === 0) {
        console.log('📝 Nenhum histórico de partidas customizadas encontrado');
        return null;
      }

      // Compare with the last custom match to find potential winner
      const lastMatch = history.matches[0];
      console.log('🔍 Última partida customizada:', lastMatch);

      // This is a simplified comparison - you might want to enhance this
      if (this.compareGameWithMatch(lastMatch)) {
        // Try to extract winner from match data
        const winner = this.extractWinnerFromMatch(lastMatch);
        if (winner) {
          console.log('🏆 Vencedor encontrado via histórico:', winner);
          return winner;
        }
      }

      return null;
    } catch (error) {
      console.log('❌ Erro ao buscar histórico:', error);
      return null;
    }
  }

  private compareGameWithMatch(match: any): boolean {
    // Simplified comparison logic
    // You can enhance this based on your match data structure
    return true; // For now, assume all matches are comparable
  }

  private extractWinnerFromMatch(match: any): 'blue' | 'red' | null {
    if (!match.winner_team) return null;
    return match.winner_team === 1 ? 'blue' : 'red';
  }
  // Toggle LCU detection
  toggleLCUDetection(): void {
    console.log('🔄 LCU Detection toggled:', this.lcuDetectionEnabled);

    if (this.lcuDetectionEnabled) {
      // Start LCU detection if enabled
      this.startLCUDetection();
    } else {
      // Stop LCU detection if disabled
      this.stopLCUDetection();
    }
  }
  private stopLCUDetection(): void {
    if (this.lcuDetectionTimer) {
      this.lcuDetectionTimer.unsubscribe();
      this.lcuDetectionTimer = null;
    }
    this.lcuGameDetected = false;
  }

  // Simulate last match method (if needed)
  simulateLastMatch(): void {
    console.log('🎭 Simulando última partida...');
    alert('Funcionalidade de simular última partida. Esta funcionalidade pode ser implementada para carregar dados da última partida jogada.');
  }

  // Template helper methods
  getGameStatusIcon(): string {
    switch (this.gameStatus) {
      case 'waiting': return '⏳';
      case 'in-progress': return '🎮';
      case 'ended': return '🏁';
      default: return '❓';
    }
  }

  getGameStatusText(): string {
    switch (this.gameStatus) {
      case 'waiting': return 'Aguardando início';
      case 'in-progress': return 'Jogo em andamento';
      case 'ended': return 'Jogo finalizado';
      default: return 'Status desconhecido';
    }
  }

  getGameDurationFormatted(): string {
    const minutes = Math.floor(this.gameDuration / 60);
    const seconds = this.gameDuration % 60;
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  }

  getTeamColor(team: 'blue' | 'red'): string {
    return team === 'blue' ? '#4FC3F7' : '#F44336';
  }

  getTeamName(team: 'blue' | 'red'): string {
    return team === 'blue' ? 'Time Azul' : 'Time Vermelho';
  }

  getTeamPlayers(team: 'blue' | 'red'): any[] {
    if (!this.gameData) {
      console.warn('⚠️ [GameInProgress] gameData não disponível');
      return [];
    }

    const players = team === 'blue' ? this.gameData.team1 : this.gameData.team2;

    console.log(`🔍 [GameInProgress] Buscando jogadores do time ${team}:`, {
      gameDataKeys: Object.keys(this.gameData),
      hasTeam1: !!this.gameData.team1,
      hasTeam2: !!this.gameData.team2,
      team1Length: this.gameData.team1?.length || 0,
      team2Length: this.gameData.team2?.length || 0,
      requestedTeam: team,
      playersFound: players?.length || 0,
      players: players?.map((p: any) => ({
        name: p.summonerName || p.name,
        id: p.id,
        champion: p.champion?.name
      })) || []
    });

    return players || [];
  }

  getMyTeam(): 'blue' | 'red' | null {
    if (!this.gameData || !this.currentPlayer) return null;

    const isInTeam1 = this.gameData.team1.some(player =>
      player.id === this.currentPlayer?.id ||
      player.summonerName === this.currentPlayer?.summonerName
    );

    if (isInTeam1) return 'blue';

    const isInTeam2 = this.gameData.team2.some(player =>
      player.id === this.currentPlayer?.id ||
      player.summonerName === this.currentPlayer?.summonerName
    );

    if (isInTeam2) return 'red';

    return null;
  }
  isMyTeamWinner(): boolean {
    const myTeam = this.getMyTeam();
    return myTeam === this.selectedWinner;
  }

  // Métodos de notificação simplificados (podem ser integrados com um serviço de notificações mais complexo)
  private showSuccessNotification(title: string, message: string): void {
    // Por enquanto usar alert, mas pode ser substituído por um toast/notification service
    alert(`✅ ${title}\n${message}`);
  }

  private showErrorNotification(title: string, message: string): void {
    // Por enquanto usar alert, mas pode ser substituído por um toast/notification service
    alert(`❌ ${title}\n${message}`);
  }

  // ✅ NOVO: Métodos para obter bans dos times
  getTeamBans(team: 'blue' | 'red'): any[] {
    if (!this.gameData?.pickBanData) {
      console.warn('⚠️ [GameInProgress] pickBanData não disponível para bans');
      return [];
    }

    try {
      const pickBanData = this.gameData.pickBanData;
      console.log(`🔍 [GameInProgress] Buscando bans do time ${team}:`, {
        hasPickBanData: !!pickBanData,
        hasPhases: !!pickBanData.phases,
        phasesLength: pickBanData.phases?.length || 0,
        pickBanDataStructure: Object.keys(pickBanData)
      });

      // ✅ CORREÇÃO: Extrair bans das phases (estrutura correta)
      if (pickBanData.phases && Array.isArray(pickBanData.phases)) {
        const teamBans = pickBanData.phases
          .filter((phase: any) =>
            phase.action === 'ban' &&
            phase.team === team &&
            phase.champion &&
            phase.locked
          )
          .map((phase: any) => ({
            champion: phase.champion,
            championName: phase.champion?.name,
            championId: phase.champion?.id
          }));

        console.log(`✅ [GameInProgress] Bans encontrados para time ${team}:`, teamBans);
        return teamBans;
      }

      // ✅ FALLBACK: Verificar estrutura alternativa
      if (team === 'blue' && pickBanData.team1Bans) {
        return pickBanData.team1Bans || [];
      } else if (team === 'red' && pickBanData.team2Bans) {
        return pickBanData.team2Bans || [];
      }

      console.log(`⚠️ [GameInProgress] Nenhum ban encontrado para time ${team}`);
      return [];
    } catch (error) {
      console.error('❌ [GameInProgress] Erro ao obter bans do time:', error);
      return [];
    }
  }

  // ✅ NOVO: Método para obter ícone da lane
  getLaneIcon(lane: string): string {
    const laneIcons: { [key: string]: string } = {
      'top': '⚔️',
      'jungle': '🌲',
      'mid': '🔮',
      'adc': '🏹',
      'support': '🛡️',
      'fill': '❓'
    };

    return laneIcons[lane?.toLowerCase()] || '❓';
  }

  // ✅ NOVO: Método para formatar nome da lane
  getLaneName(lane: string): string {
    const laneNames: { [key: string]: string } = {
      'top': 'Top',
      'jungle': 'Jungle',
      'mid': 'Mid',
      'adc': 'ADC',
      'support': 'Support',
      'fill': 'Fill'
    };

    return laneNames[lane?.toLowerCase()] || lane || 'Fill';
  }
}
