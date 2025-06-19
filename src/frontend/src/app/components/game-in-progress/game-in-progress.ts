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

  constructor(private apiService: ApiService) {}

  ngOnInit() {
    this.initializeGame();
    this.startLCUDetection();
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
      isCustomGame: true
    };

    console.log('✅ Partida concluída automaticamente:', result);
    this.onGameComplete.emit(result);
  }

  // Manual winner declaration
  declareWinner(winner: 'blue' | 'red') {
    this.selectedWinner = winner;
  }

  confirmWinner() {
    if (!this.selectedWinner || !this.gameData) return;

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
      isCustomGame: true
    };

    console.log('✅ Partida concluída manualmente:', result);
    this.onGameComplete.emit(result);
  }

  // Cancel game
  cancelGame() {
    console.log('❌ Partida cancelada');
    this.onGameCancel.emit();
  }

  // Toggle LCU detection
  toggleLCUDetection() {
    this.lcuDetectionEnabled = !this.lcuDetectionEnabled;

    if (this.lcuDetectionEnabled) {
      this.startLCUDetection();
    } else {
      if (this.lcuDetectionTimer) {
        this.lcuDetectionTimer.unsubscribe();
        this.lcuDetectionTimer = null;
      }
    }
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
