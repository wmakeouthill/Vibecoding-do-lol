import { Component, Input, Output, EventEmitter, OnInit, OnDestroy } from '@angular/core';
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
export class GameInProgressComponent implements OnInit, OnDestroy {
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

  // Timers
  private gameTimer: Subscription | null = null;
  private lcuDetectionTimer: Subscription | null = null;

  // Game tracking
  private currentGameSession: any = null;

  constructor(private apiService: ApiService) {}  ngOnInit() {
    this.initializeGame();
    // Removed automatic LCU detection and auto-resolve
    // These will only happen when user manually clicks buttons
  }

  ngOnDestroy() {
    this.stopTimers();
  }

  private initializeGame() {
    if (!this.gameData) return;

    this.gameStartTime = new Date();
    this.gameStatus = 'waiting';

    console.log('🎮 Partida iniciada:', {
      sessionId: this.gameData.sessionId,
      team1: this.gameData.team1.length,
      team2: this.gameData.team2.length,
      isCustom: this.gameData.isCustomGame
    });

    // Start game timer
    this.startGameTimer();
  }

  private startGameTimer() {
    this.gameTimer = interval(1000).subscribe(() => {
      if (this.gameStartTime) {
        this.gameDuration = Math.floor((Date.now() - this.gameStartTime.getTime()) / 1000);
      }
    });
  }

  private startLCUDetection() {
    if (!this.lcuDetectionEnabled) return;

    // Check LCU every 5 seconds for game state
    this.lcuDetectionTimer = interval(5000).subscribe(() => {
      this.checkLCUGameState();
    });
  }

  private async checkLCUGameState() {
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
      }
    } catch (error) {
      console.log('🔍 LCU não disponível para detecção automática');
    }
  }

  private onLCUGameDetected(gameData: any) {
    console.log('🎮 Jogo detectado pelo LCU:', gameData);
    this.lcuGameDetected = true;
    this.gameStatus = 'in-progress';
    this.currentGameSession = gameData;
  }

  private onLCUGameEnded(endGameData: any) {
    console.log('🏁 Fim de jogo detectado pelo LCU:', endGameData);

    if (endGameData && endGameData.teams) {
      // Try to detect winner from LCU data
      const winningTeam = endGameData.teams.find((team: any) => team.win === true);
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
    };

    console.log('✅ Partida concluída automaticamente:', result);
    this.onGameComplete.emit(result);
  }

  // Manual winner declaration
  declareWinner(winner: 'blue' | 'red') {
    this.selectedWinner = winner;
  }

  confirmWinner() {
    if (!this.selectedWinner || !this.gameData) return;    const result: GameResult = {
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

    console.log('✅ Partida concluída manualmente:', result);
    this.onGameComplete.emit(result);
  }
  // Cancel game
  cancelGame() {
    console.log('❌ Partida cancelada');
    this.onGameCancel.emit();
  }

  // Try to auto-resolve winner on component load (useful after app restart)
  private async tryAutoResolveWinner() {
    console.log('🔄 Tentando auto-resolver vencedor...');

    // First, try to get winner from LCU
    const lcuWinner = await this.tryGetWinnerFromLCU();
    if (lcuWinner) {
      console.log('🏆 Vencedor detectado via LCU:', lcuWinner);
      this.autoCompleteGame(lcuWinner, true);
      return;
    }

    // If LCU fails, try to compare with last custom match
    const historyWinner = await this.tryGetWinnerFromHistory();
    if (historyWinner) {
      console.log('🏆 Vencedor detectado via histórico:', historyWinner);
      this.autoCompleteGame(historyWinner, false);
      return;
    }

    console.log('⚠️ Não foi possível auto-resolver o vencedor');  }

  // Manual method to retry detection when user clicks button
  async retryAutoDetection() {
    console.log('🔄 [MANUAL] Tentando detectar vencedor via histórico do LCU...');

    try {      // Get the last match from LCU history instead of current game
      const historyResponse = await this.apiService.getLCUMatchHistoryAll(0, 1, false).toPromise();

      if (!historyResponse || !historyResponse.success || !historyResponse.matches || historyResponse.matches.length === 0) {
        console.log('⚠️ [MANUAL] Nenhuma partida encontrada no histórico do LCU');
        alert('Nenhuma partida encontrada no histórico do LCU. Certifique-se de que o League of Legends está aberto e você jogou pelo menos uma partida.');
        return;
      }

      const lastMatch = historyResponse.matches[0];
      console.log('🔍 [MANUAL] Última partida do LCU:', lastMatch);

      // Check if this match has teams and winner information
      if (lastMatch.teams && lastMatch.teams.length === 2) {
        const winningTeam = lastMatch.teams.find((team: any) => team.win === true);
        if (winningTeam) {
          const winner = winningTeam.teamId === 100 ? 'blue' : 'red';
          console.log('🏆 [MANUAL] Vencedor detectado via histórico do LCU:', winner);
          this.selectedWinner = winner;

          // Show confirmation to user
          const teamName = winner === 'blue' ? 'Azul' : 'Vermelho';
          const confirmed = confirm(`🏆 Vencedor detectado!\n\nTime ${teamName} venceu a última partida.\n\nConfirmar este resultado?`);

          if (confirmed) {
            this.autoCompleteGame(winner, true);
          }
          return;
        }
      }

      console.log('⚠️ [MANUAL] Última partida não tem informação de vencedor');
      alert('A última partida no histórico do LCU não contém informação de vencedor. Tente novamente após completar uma partida.');

    } catch (error) {
      console.log('❌ [MANUAL] Erro ao detectar via histórico do LCU:', error);
      alert('Erro ao acessar o histórico do LCU. Certifique-se de que o League of Legends está aberto.');
    }
  }

  // Try to get winner from current LCU game
  private async tryGetWinnerFromLCU(): Promise<'blue' | 'red' | null> {
    try {
      const gameState = await this.apiService.getCurrentGame().toPromise();

      if (!gameState || !gameState.success || !gameState.data) {
        console.log('📡 Nenhum jogo ativo no LCU');
        return null;
      }

      const currentGame = gameState.data;

      // Check if game has ended and get winner
      if (currentGame.gamePhase === 'EndOfGame' || currentGame.gamePhase === 'PostGame') {
        if (currentGame.teams) {
          const winningTeam = currentGame.teams.find((team: any) => team.win === true);
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
  }  // Try to get winner by comparing picks with last custom match
  private async tryGetWinnerFromHistory(): Promise<'blue' | 'red' | null> {    try {
      if (!this.currentPlayer?.id) {
        console.log('❌ ID do jogador atual não encontrado');
        return null;
      }      console.log('🔍 Buscando histórico para player ID:', this.currentPlayer.id);

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
        history = await this.apiService.getCustomMatches(identifier, 0, 10).toPromise();

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

      console.log(`📊 Encontradas ${history.matches.length} partidas no histórico`);

      // Para simulações baseadas em partidas reais, verificar se temos o originalMatchId
      const gameData = this.gameData as any;
      if (gameData?.originalMatchId) {
        console.log('🎯 Simulação baseada em partida real - ID:', gameData.originalMatchId);

        // Procurar a partida específica no histórico
        const matchingMatch = history.matches.find((match: any) => match.id === gameData.originalMatchId);

        if (matchingMatch) {
          console.log('✅ Partida correspondente encontrada no histórico:', matchingMatch);

          // Se a partida já tem um vencedor definido, usar esse resultado
          if (matchingMatch.winner_team) {
            const winner = matchingMatch.winner_team === 1 ? 'blue' : 'red';
            console.log('🏆 Vencedor já conhecido da partida histórica:', winner);
            return winner;
          }
        }
      }

      // Tentar comparar picks com a última partida (método original)
      const lastCustomMatch = history.matches[0];
      console.log('🔍 Última partida customizada encontrada:', lastCustomMatch);

      // Compare picks between current game and last custom match
      const picksMatch = this.comparePicksWithHistoryMatch(lastCustomMatch);

      if (picksMatch) {
        console.log('🎯 Picks correspondem à última partida do histórico!');

        // Se a partida já foi completada, usar o resultado
        if (lastCustomMatch.winner_team) {
          return lastCustomMatch.winner_team === 1 ? 'blue' : 'red';
        }
      } else {
        console.log('🔍 Picks não correspondem à última partida do histórico');
      }

      return null;

    } catch (error) {
      console.log('❌ Erro ao verificar histórico:', error);
      return null;
    }
  }

  // Compare current game picks with a history match
  private comparePicksWithHistoryMatch(historyMatch: any): boolean {
    if (!this.gameData || !this.gameData.pickBanData) {
      console.log('⚠️ Dados de pick/ban não disponíveis no jogo atual');
      return false;
    }

    try {
      // Parse pick/ban data from history if it's a string
      let historyPickBanData = historyMatch.pick_ban_data;
      if (typeof historyPickBanData === 'string') {
        historyPickBanData = JSON.parse(historyPickBanData);
      }

      if (!historyPickBanData) {
        console.log('⚠️ Dados de pick/ban não disponíveis no histórico');
        return false;
      }

      // Support different data formats
      const currentPickBanData = this.gameData.pickBanData;

      // Extract picks from both formats
      const currentTeam1Picks = this.extractPicksFromTeam(currentPickBanData.team1Picks || currentPickBanData.blueTeamPicks || []);
      const currentTeam2Picks = this.extractPicksFromTeam(currentPickBanData.team2Picks || currentPickBanData.redTeamPicks || []);

      const historyTeam1Picks = this.extractPicksFromTeam(historyPickBanData.team1Picks || historyPickBanData.blueTeamPicks || []);
      const historyTeam2Picks = this.extractPicksFromTeam(historyPickBanData.team2Picks || historyPickBanData.redTeamPicks || []);

      console.log('🔍 Comparação de picks detalhada:', {
        currentTeam1: currentTeam1Picks,
        currentTeam2: currentTeam2Picks,
        historyTeam1: historyTeam1Picks,
        historyTeam2: historyTeam2Picks
      });

      // Compare team compositions
      const team1Matches = this.compareTeamPicks(currentTeam1Picks, historyTeam1Picks);
      const team2Matches = this.compareTeamPicks(currentTeam2Picks, historyTeam2Picks);

      console.log('🎯 Resultado da comparação:', { team1Matches, team2Matches });

      // Considera uma correspondência se pelo menos 60% dos picks coincidem em cada time
      return team1Matches >= 0.6 && team2Matches >= 0.6;

    } catch (error) {
      console.log('❌ Erro ao comparar picks:', error);
      return false;
    }
  }

  // Extract champion names from picks
  private extractPicksFromTeam(picks: any[]): string[] {
    if (!Array.isArray(picks)) return [];

    return picks
      .map((pick: any) => {
        if (typeof pick === 'string') return pick;
        return pick.champion || pick.championName || pick.name || '';
      })
      .filter((name: string) => name && name.length > 0)
      .map((name: string) => name.toLowerCase().trim());
  }

  // Compare two teams' picks and return similarity ratio
  private compareTeamPicks(currentPicks: string[], historyPicks: string[]): number {
    if (currentPicks.length === 0 && historyPicks.length === 0) return 1;
    if (currentPicks.length === 0 || historyPicks.length === 0) return 0;

    const maxLength = Math.max(currentPicks.length, historyPicks.length);
    let matches = 0;

    // Count how many picks are common
    for (const currentPick of currentPicks) {
      if (historyPicks.includes(currentPick)) {
        matches++;
      }
    }

    return matches / maxLength;
  }  // Toggle LCU detection
  toggleLCUDetection() {
    this.lcuDetectionEnabled = !this.lcuDetectionEnabled;
    // Removed automatic detection - LCU is now only used for manual detection via buttons
    console.log(`🔧 LCU Detection ${this.lcuDetectionEnabled ? 'habilitada' : 'desabilitada'} (apenas para detecção manual)`);
  }
  // Simulate a game based on the last custom match for testing
  async simulateLastMatch() {
    console.log('🎭 Simulando jogo baseado na última partida customizada...');

    try {
      if (!this.currentPlayer?.id) {
        console.log('❌ ID do jogador atual não encontrado');
        return;
      }      console.log('🔍 Buscando partidas customizadas para o jogador:', this.currentPlayer.id);

      // Get the last custom match from history
      const history = await this.apiService.getCustomMatches(this.currentPlayer.id.toString(), 0, 1).toPromise();

      console.log('📊 Resposta completa da API getCustomMatches:', history);if (!history || !history.success || !history.data || history.data.length === 0) {
        console.log('📝 Nenhuma partida customizada encontrada no histórico');
        console.log('🔍 Resposta da API completa:', history);

        // Offer to create a sample match
        const createSample = confirm(`📝 Nenhuma partida customizada encontrada no histórico.

Deseja criar uma partida de exemplo para testar?

Isso criará uma partida simulada com picks de exemplo que você pode usar para testar o sistema.`);

        if (createSample) {
          this.createSampleMatch();
        }
        return;
      }

      const lastMatch = history.matches[0];
      console.log('🎯 Última partida encontrada:', lastMatch);

      // Create a new game data based on the last match
      if (this.gameData && lastMatch.pickBanData) {
        // Update current game data with the picks from the last match
        this.gameData.pickBanData = {
          ...lastMatch.pickBanData
        };

        // Also update team data if available
        if (lastMatch.team1 && lastMatch.team2) {
          this.gameData.team1 = lastMatch.team1;
          this.gameData.team2 = lastMatch.team2;
        }

        console.log('✅ Dados do jogo atualizados com os picks da última partida');
        console.log('🎮 Partida simulada! Agora você pode testar a detecção automática');

        alert(`Partida simulada com sucesso!

Picks copiados da última partida customizada.
Agora você pode usar "Tentar Detectar Vencedor" para testar o sistema de comparação.

Última partida: ${lastMatch.winner === 'blue' ? 'Time Azul' : 'Time Vermelho'} venceu`);

      } else {
        console.log('❌ Dados insuficientes para simular a partida');
        alert('Dados insuficientes na última partida para simular.');
      }    } catch (error) {
      console.error('❌ Erro ao simular última partida:', error);
      alert('Erro ao buscar a última partida para simular.');
    }
  }

  // Create a sample match for testing purposes
  private createSampleMatch() {
    console.log('🏗️ Criando partida de exemplo para testes...');

    if (!this.gameData) {
      console.log('❌ Dados do jogo atual não encontrados');
      return;
    }

    // Sample pick/ban data with popular champions
    const samplePickBanData = {
      blueTeamPicks: [
        { champion: { name: 'Jinx', id: 222 }, player: { summonerName: 'Player1' } },
        { champion: { name: 'Thresh', id: 412 }, player: { summonerName: 'Player2' } },
        { champion: { name: 'Yasuo', id: 157 }, player: { summonerName: 'Player3' } },
        { champion: { name: 'Graves', id: 104 }, player: { summonerName: 'Player4' } },
        { champion: { name: 'Garen', id: 86 }, player: { summonerName: 'Player5' } }
      ],
      redTeamPicks: [
        { champion: { name: 'Caitlyn', id: 51 }, player: { summonerName: 'Enemy1' } },
        { champion: { name: 'Leona', id: 89 }, player: { summonerName: 'Enemy2' } },
        { champion: { name: 'Zed', id: 238 }, player: { summonerName: 'Enemy3' } },
        { champion: { name: 'Kindred', id: 203 }, player: { summonerName: 'Enemy4' } },
        { champion: { name: 'Darius', id: 122 }, player: { summonerName: 'Enemy5' } }
      ],
      blueTeamBans: [],
      redTeamBans: []
    };

    // Update current game with sample data
    this.gameData.pickBanData = samplePickBanData;

    console.log('✅ Partida de exemplo criada com picks populares');

    alert(`🏗️ Partida de exemplo criada!

Time Azul: Jinx, Thresh, Yasuo, Graves, Garen
Time Vermelho: Caitlyn, Leona, Zed, Kindred, Darius

Agora você pode:
1. Jogar uma partida real e salvar o resultado
2. Ou declarar um vencedor manualmente para criar um histórico

Para que o sistema funcione completamente, você precisará ter pelo menos uma partida salva no histórico.`);
  }

  private stopTimers() {
    if (this.gameTimer) {
      this.gameTimer.unsubscribe();
      this.gameTimer = null;
    }

    if (this.lcuDetectionTimer) {
      this.lcuDetectionTimer.unsubscribe();
      this.lcuDetectionTimer = null;
    }
  }

  private generateGameId(): string {
    return `custom_${this.gameData?.sessionId}_${Date.now()}`;
  }

  // Helper methods for UI
  getGameDurationFormatted(): string {
    const minutes = Math.floor(this.gameDuration / 60);
    const seconds = this.gameDuration % 60;
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  }

  getPlayerTeam(player: any): 'blue' | 'red' {
    if (!this.gameData) return 'blue';

    const isInTeam1 = this.gameData.team1.some(p =>
      p.id === player.id || p.summonerName === player.summonerName
    );

    return isInTeam1 ? 'blue' : 'red';
  }

  getMyTeam(): 'blue' | 'red' | null {
    if (!this.currentPlayer || !this.gameData) return null;
    return this.getPlayerTeam(this.currentPlayer);
  }

  isMyTeamWinner(): boolean | null {
    if (!this.selectedWinner || !this.currentPlayer) return null;
    const myTeam = this.getMyTeam();
    return myTeam === this.selectedWinner;
  }

  getGameStatusText(): string {
    switch (this.gameStatus) {
      case 'waiting':
        return 'Aguardando início da partida...';
      case 'in-progress':
        return this.lcuGameDetected ? 'Partida detectada no League of Legends' : 'Partida em andamento';
      case 'ended':
        return 'Partida finalizada - Declare o vencedor';
      default:
        return 'Status desconhecido';
    }
  }

  getGameStatusIcon(): string {
    switch (this.gameStatus) {
      case 'waiting':
        return '⏳';
      case 'in-progress':
        return '🎮';
      case 'ended':
        return '🏁';
      default:
        return '❓';
    }
  }

  getTeamPlayers(team: 'blue' | 'red'): any[] {
    if (!this.gameData) return [];
    return team === 'blue' ? this.gameData.team1 : this.gameData.team2;
  }

  getTeamName(team: 'blue' | 'red'): string {
    return team === 'blue' ? 'Time Azul' : 'Time Vermelho';
  }

  getTeamColor(team: 'blue' | 'red'): string {
    return team === 'blue' ? '#4a90e2' : '#e74c3c';
  }
}
