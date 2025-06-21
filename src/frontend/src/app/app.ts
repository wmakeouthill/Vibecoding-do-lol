import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subject, takeUntil } from 'rxjs';
import { HttpErrorResponse } from '@angular/common/http';

import { DashboardComponent } from './components/dashboard/dashboard';
import { QueueComponent } from './components/queue/queue';
import { MatchHistoryComponent } from './components/match-history/match-history';
import { P2PStatusComponent } from './components/p2p-status/p2p-status';
import { MatchFoundComponent, MatchFoundData } from './components/match-found/match-found';
import { CustomPickBanComponent } from './components/custom-pick-ban/custom-pick-ban';
import { GameInProgressComponent } from './components/game-in-progress/game-in-progress';
import { WebsocketService } from './services/websocket';
import { ApiService } from './services/api';
import { QueueStateService } from './services/queue-state';
import { Player, QueueStatus, LCUStatus, MatchFound, QueuePreferences, RefreshPlayerResponse } from './interfaces';
import type { Notification } from './interfaces';

@Component({
  selector: 'app-root',
  imports: [
    CommonModule,
    FormsModule,
    DashboardComponent,
    QueueComponent,
    MatchHistoryComponent,
    P2PStatusComponent,
    MatchFoundComponent,
    CustomPickBanComponent,
    GameInProgressComponent
  ],
  templateUrl: './app-simple.html',
  styleUrl: './app.scss'
})
export class App implements OnInit, OnDestroy {
  protected title = 'LoL Matchmaking';

  // Estado da aplicação
  currentView: 'dashboard' | 'queue' | 'history' | 'settings' | 'p2p' = 'dashboard';
  isElectron = false;
  isConnected = false;
  isInQueue = false;

  // Dados do jogador
  currentPlayer: Player | null = null;

  // Status da fila e do LCU
  queueStatus: QueueStatus = {
    playersInQueue: 0,
    averageWaitTime: 0,
    estimatedMatchTime: 0,
    isActive: true
  };
  lcuStatus: LCUStatus = { isConnected: false };

  // Modal de partida encontrada
  matchFound: MatchFound | null = null;

  // Dados da partida encontrada (novo sistema)
  matchFoundData: MatchFoundData | null = null;
  showMatchFound = false;

  // Estado do draft
  inDraftPhase = false;
  draftData: any = null;
  draftPhase: 'preview' | 'pickban' = 'preview';
  isMatchLeader = false;

  // Estado do jogo em andamento
  inGamePhase = false;
  gameData: any = null;
  gameResult: any = null;

  // Propriedades do Pick & Ban
  draftTimer = 30;
  selectedChampion: any = null;
  champions: any[] = [];

  // Notificações
  notifications: Notification[] = [];

  // Formulário de configurações
  settingsForm = {
    summonerName: '',
    region: 'br1',
    riotApiKey: ''
  };

  private destroy$ = new Subject<void>();

  constructor(
    private websocketService: WebsocketService,
    private apiService: ApiService,
    private queueStateService: QueueStateService
  ) {
    this.isElectron = !!(window as any).electronAPI;
  }

  ngOnInit(): void {
    this.isElectron = !!(window as any).electronAPI;

    // Try to load API key from local storage
    const storedApiKey = localStorage.getItem('riotApiKey');
    if (storedApiKey) {
      this.settingsForm.riotApiKey = storedApiKey;
      this.apiService.setRiotApiKey(storedApiKey).subscribe({
        next: () => {
          console.log('API Key configurada automaticamente no backend');
        },
        error: (error: HttpErrorResponse) => {
          console.warn('Falha ao configurar API Key automaticamente:', error.message);
          localStorage.removeItem('riotApiKey');
          this.settingsForm.riotApiKey = '';
        }
      });
    }

    // Connect to WebSocket
    this.websocketService.connect();
    this.websocketService.onMessage().pipe(
      takeUntil(this.destroy$)
    ).subscribe(message => this.handleWebSocketMessage(message));

    // Check connection status
    this.websocketService.onConnectionChange().pipe(
      takeUntil(this.destroy$)
    ).subscribe((connected: boolean) => {
      this.isConnected = connected;
      if (connected) {
        this.tryAutoLoadCurrentPlayer();
        this.websocketService.requestQueueStatus();
      }
    });

    // Load initial data
    this.loadPlayerData();
    this.recoverGameState();
    this.tryLoadRealPlayerData();
    this.startLCUStatusCheck();
    this.startQueueStatusCheck();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  setCurrentView(view: 'dashboard' | 'queue' | 'history' | 'settings' | 'p2p'): void {
    this.currentView = view;
    console.log('View changed to:', view);
  }

  exitDraft(): void {
    console.log('🚪 Saindo do draft...');
    this.inDraftPhase = false;
    this.draftData = null;
    this.currentView = 'dashboard';
    this.addNotification('info', 'Draft Cancelado', 'Você saiu da fase de draft.');
  }

  startPickBan(): void {
    console.log('🎯 Iniciando fase de Pick & Ban...');
    this.draftPhase = 'pickban';
  }

  onPickBanComplete(result: any): void {
    console.log('🎯 Pick & Ban completed:', result);
    this.startGamePhase(result);
    this.addNotification('success', 'Pick & Ban Completo', 'A partida está iniciando!');
  }

  onPickBanCancel(): void {
    console.log('❌ Pick & Ban cancelado');
    this.inDraftPhase = false;
    this.draftData = null;
    this.draftPhase = 'preview';
    this.currentView = 'dashboard';
    this.addNotification('info', 'Draft Cancelado', 'O draft foi cancelado.');
  }

  startGamePhase(pickBanResult: any): void {
    console.log('🎮 Iniciando fase de jogo:', pickBanResult);

    this.inDraftPhase = false;
    this.draftPhase = 'preview';

    this.gameData = {
      sessionId: pickBanResult.sessionId || 'game_' + Date.now(),
      gameId: 'custom_' + Date.now(),
      team1: this.draftData?.team1 || this.draftData?.blueTeam || [],
      team2: this.draftData?.team2 || this.draftData?.redTeam || [],
      startTime: new Date(),
      pickBanData: pickBanResult,
      isCustomGame: true
    };

    this.updatePlayersWithChampions(pickBanResult);
    this.inGamePhase = true;
    this.persistGameState();

    console.log('✅ Dados do jogo preparados:', this.gameData);
  }

  private updatePlayersWithChampions(pickBanResult: any): void {
    if (!this.gameData || !pickBanResult.picks) return;

    const bluePicks = pickBanResult.blueTeamPicks || pickBanResult.picks.filter((p: any) => p.team === 'blue');
    const redPicks = pickBanResult.redTeamPicks || pickBanResult.picks.filter((p: any) => p.team === 'red');

    this.gameData.team1.forEach((player: any, index: number) => {
      if (bluePicks[index] && bluePicks[index].champion) {
        player.champion = bluePicks[index].champion;
      }
    });

    this.gameData.team2.forEach((player: any, index: number) => {
      if (redPicks[index] && redPicks[index].champion) {
        player.champion = redPicks[index].champion;
      }
    });
  }

  onGameComplete(gameResult: any): void {
    console.log('🏁 Jogo completado:', gameResult);
    this.gameResult = gameResult;
    this.saveCustomMatch(gameResult);
    this.exitGame();

    const winnerText = gameResult.winner === 'blue' ? 'Time Azul' : 'Time Vermelho';
    const detectionText = gameResult.detectedByLCU ? ' (detectado automaticamente)' : ' (declarado manualmente)';

    this.addNotification('success', 'Partida Finalizada', `${winnerText} venceu!${detectionText}`);
  }

  onGameCancel(): void {
    console.log('❌ Jogo cancelado');
    this.exitGame();
    this.addNotification('info', 'Partida Cancelada', 'A partida foi cancelada.');
  }

  exitGame(): void {
    this.inGamePhase = false;
    this.gameData = null;
    this.currentView = 'dashboard';
    this.clearGameState();
  }

  private async saveCustomMatch(gameResult: any): Promise<void> {
    try {
      console.log('💾 Salvando partida customizada no banco de dados');
      console.log('🔍 Game Result:', gameResult);
      console.log('🔍 Game Data:', this.gameData);

      if (gameResult.originalMatchData && gameResult.detectedByLCU) {
        console.log('🎯 Salvando com dados reais do LCU detectados');
        await this.saveCustomMatchWithRealData(gameResult);
      } else {
        console.log('📝 Salvando partida customizada padrão');
        await this.saveCustomMatchStandard(gameResult);
      }
    } catch (error) {
      console.error('❌ Erro ao salvar partida customizada:', error);
      this.addNotification('error', 'Erro', 'Erro ao salvar a partida no banco de dados.');
    }
  }

  private async saveCustomMatchWithRealData(gameResult: any): Promise<void> {
    try {
      const lcuMatchData = gameResult.originalMatchData;
      const playerIdentifier = this.currentPlayer?.id?.toString() || this.currentPlayer?.summonerName || '1';

      console.log('🎮 Criando partida com dados reais do LCU:', lcuMatchData.gameId);

      const response = await this.apiService.createLCUBasedMatch({
        lcuMatchData: lcuMatchData,
        playerIdentifier: playerIdentifier
      }).toPromise();

      if (response && response.success) {
        console.log('✅ Partida com dados reais salva com sucesso');
        console.log('🆔 Partida criada com ID:', response.matchId);
        console.log('🔍 Dados reais incluídos:', response.hasRealData);

        this.addNotification('success', 'Partida Real Salva',
          'A partida foi salva com todos os dados reais (KDA, itens, etc.)!');
      } else {
        console.warn('⚠️ Falha ao salvar partida com dados reais');
        this.addNotification('warning', 'Erro ao Salvar', 'Não foi possível salvar a partida com dados reais.');
      }
    } catch (error) {
      console.error('❌ Erro ao salvar partida com dados reais:', error);
      // Fallback para salvamento padrão
      await this.saveCustomMatchStandard(gameResult);
    }
  }

  // Save custom match (standard method)
  private async saveCustomMatchStandard(gameResult: any): Promise<void> {
    try {
      // Criar dados no formato correto para a tabela custom_matches
      const matchData = {
        title: this.gameData?.originalMatchId
          ? `Simulação - Partida ${this.gameData.originalMatchId}`
          : `Partida Customizada ${new Date().toLocaleDateString()}`,
        description: this.gameData?.originalMatchId
          ? `Simulação baseada na partida real ${this.gameData.originalMatchId}`
          : `Partida entre ${gameResult.team1.length}v${gameResult.team2.length}`,
        team1Players: gameResult.team1.map((player: any) => {
          // Garantir que temos um identificador válido
          return player.id?.toString() || player.summonerName || player.toString();
        }),
        team2Players: gameResult.team2.map((player: any) => {
          // Garantir que temos um identificador válido
          return player.id?.toString() || player.summonerName || player.toString();
        }),
        createdBy: this.currentPlayer?.id?.toString() || this.currentPlayer?.summonerName || '1',
        gameMode: 'CLASSIC',
        winnerTeam: gameResult.winner === 'blue' ? 1 : 2,
        duration: Math.floor(gameResult.duration / 60), // Converter segundos para minutos
        pickBanData: gameResult.pickBanData ? JSON.stringify(gameResult.pickBanData) : null,
        riotGameId: gameResult.riotId || this.gameData?.riotId || null,
        detectedByLCU: gameResult.detectedByLCU ? 1 : 0,
        status: 'completed'
      };

      console.log('📝 Dados de criação enviados:', matchData);

      const response = await this.apiService.saveCustomMatch(matchData).toPromise();

      if (response && response.success) {
        console.log('✅ Partida customizada salva com sucesso');
        console.log('🆔 Nova partida criada com ID:', response.matchId);

        if (this.gameData?.originalMatchId) {
          this.addNotification('success', 'Simulação Salva', 'A simulação da partida foi salva no histórico!');
        } else {
          this.addNotification('success', 'Dados Salvos', 'A partida foi salva no histórico!');
        }
      } else {
        console.warn('⚠️ Falha ao salvar partida customizada');
        this.addNotification('warning', 'Erro ao Salvar', 'Não foi possível salvar a partida no histórico.');
      }
    } catch (error) {
      console.error('❌ Erro ao salvar partida customizada padrão:', error);
      this.addNotification('error', 'Erro', 'Erro ao salvar a partida no banco de dados.');
    }
  }

  // Calculate team average MMR
  private calculateTeamMMR(team: any[]): number {
    if (!team || team.length === 0) return 1200;

    const totalMMR = team.reduce((sum, player) => {
      return sum + (player.mmr || player.currentMMR || 1200);
    }, 0);

    return Math.round(totalMMR / team.length);
  }

  // Persist game state for recovery after app restart
  private persistGameState(): void {
    if (!this.gameData) return;

    const gameState = {
      inGamePhase: this.inGamePhase,
      gameData: this.gameData,
      currentPlayer: this.currentPlayer,
      timestamp: Date.now()
    };

    localStorage.setItem('currentGameState', JSON.stringify(gameState));
    console.log('💾 Estado da partida salvo para recuperação');
  }

  // Clear persisted game state
  private clearGameState(): void {
    localStorage.removeItem('currentGameState');
    console.log('🗑️ Estado da partida removido');
  }

  // Recover game state after app restart
  private async recoverGameState(): Promise<void> {
    try {
      const savedState = localStorage.getItem('currentGameState');
      if (!savedState) return;

      const gameState = JSON.parse(savedState);

      // Check if state is not too old (max 6 hours)
      const maxAge = 6 * 60 * 60 * 1000; // 6 hours in ms
      if (Date.now() - gameState.timestamp > maxAge) {
        console.log('⏰ Estado da partida muito antigo, ignorando');
        this.clearGameState();
        return;
      }

      console.log('🔄 Recuperando estado da partida:', gameState);

      // Restore game state
      this.gameData = gameState.gameData;
      this.inGamePhase = gameState.inGamePhase;

      if (gameState.currentPlayer && !this.currentPlayer) {
        this.currentPlayer = gameState.currentPlayer;
      }

      // Try to detect current LCU match and compare picks
      await this.tryAutoResolveFromLCU();

      this.addNotification('info', 'Partida Recuperada',
        'Estado da partida anterior foi recuperado. Verificando resultado via LCU...');

    } catch (error) {
      console.error('❌ Erro ao recuperar estado da partida:', error);
      this.clearGameState();
    }
  }

  // Try to automatically resolve game result from LCU
  private async tryAutoResolveFromLCU(): Promise<void> {
    try {
      // Get current LCU match details
      const currentGame = await this.apiService.getCurrentGame().toPromise();

      if (!currentGame || !currentGame.success || !currentGame.data) {
        console.log('📡 Nenhum jogo ativo detectado no LCU');
        return;
      }

      const lcuGameData = currentGame.data;

      // Check if this is the match we're looking for by comparing picks
      if (await this.isMatchingGame(lcuGameData)) {
        console.log('🎯 Partida correspondente encontrada no LCU!');

        // Check if game has ended
        if (lcuGameData.phase === 'EndOfGame' || lcuGameData.phase === 'PostGame') {
          await this.resolveWinnerFromLCU(lcuGameData);
        } else {
          console.log('🎮 Partida ainda em andamento, continuando monitoramento...');
        }
      } else {
        console.log('🔍 Partida atual do LCU não corresponde à partida customizada');
      }

    } catch (error) {
      console.error('❌ Erro ao verificar LCU para auto-resolução:', error);
    }
  }

  // Check if current LCU game matches our custom game by comparing picks
  private async isMatchingGame(lcuGameData: any): Promise<boolean> {
    if (!this.gameData || !this.gameData.pickBanData) return false;

    try {
      // Get our custom game picks
      const ourBluePicks = this.gameData.pickBanData.blueTeamPicks || [];
      const ourRedPicks = this.gameData.pickBanData.redTeamPicks || [];

      // Extract champion names from our picks
      const ourBlueChampions = ourBluePicks.map((pick: any) =>
        pick.champion?.name || '').filter((name: string) => name);
      const ourRedChampions = ourRedPicks.map((pick: any) =>
        pick.champion?.name || '').filter((name: string) => name);

      console.log('🔍 Comparando picks:', {
        ourBlue: ourBlueChampions,
        ourRed: ourRedChampions,
        lcuData: lcuGameData
      });

      // Try to extract champion data from LCU
      // This would need to be adapted based on the actual LCU data structure
      // For now, we'll use a simpler approach - check if we have matching team compositions

      // If we can't get detailed champion data, fall back to team size matching
      const expectedTeamSize = this.gameData.team1.length;

      // At minimum, check if the game has the expected number of players
      if (lcuGameData.details && lcuGameData.details.participants) {
        const participants = lcuGameData.details.participants;
        return participants.length === expectedTeamSize * 2;
      }

      return false;

    } catch (error) {
      console.error('❌ Erro ao comparar jogos:', error);
      return false;
    }
  }

  // Resolve winner from LCU game data
  private async resolveWinnerFromLCU(lcuGameData: any): Promise<void> {
    try {
      let winner: 'blue' | 'red' | null = null;

      // Try to extract winner from LCU data
      if (lcuGameData.details && lcuGameData.details.teams) {
        const winningTeam = lcuGameData.details.teams.find((team: any) => team.win === true);
        if (winningTeam) {
          winner = winningTeam.teamId === 100 ? 'blue' : 'red';
        }
      }

      if (winner) {
        console.log(`🏆 Vencedor detectado automaticamente via LCU: ${winner === 'blue' ? 'Time Azul' : 'Time Vermelho'}`);

        // Auto-complete the game with detected winner
        const gameResult = {
          sessionId: this.gameData!.sessionId,
          gameId: this.gameData!.gameId,
          winner: winner,
          duration: Math.floor((Date.now() - new Date(this.gameData!.startTime).getTime()) / 1000),
          endTime: new Date(),
          team1: this.gameData!.team1,
          team2: this.gameData!.team2,
          pickBanData: this.gameData!.pickBanData,
          detectedByLCU: true,
          isCustomGame: true
        };

        // Save and complete
        await this.saveCustomMatch(gameResult);
        this.exitGame();

        const winnerText = winner === 'blue' ? 'Time Azul' : 'Time Vermelho';
        this.addNotification('success', 'Partida Auto-Resolvida',
          `${winnerText} venceu! Resultado detectado automaticamente via LCU.`);

      } else {
        console.log('⚠️ Não foi possível detectar o vencedor automaticamente');
        this.addNotification('warning', 'Auto-Resolução Falhou',
          'Não foi possível detectar o vencedor automaticamente. Declare manualmente.');
      }

    } catch (error) {
      console.error('❌ Erro ao resolver vencedor via LCU:', error);
      this.addNotification('error', 'Erro na Auto-Resolução',
        'Erro ao detectar vencedor automaticamente. Use declaração manual.');
    }
  }
  // Método para determinar se o jogador atual é líder da partida
  private determineMatchLeader(): void {
    if (!this.draftData || !this.currentPlayer) {
      this.isMatchLeader = false;
      return;
    }

    // Encontrar o primeiro jogador humano (não-bot) do time azul
    const humanPlayersBlue = this.draftData.blueTeam?.filter((player: any) =>
      !player.summonerName.startsWith('Bot') &&
      !player.summonerName.includes('bot')
    ) || [];

    if (humanPlayersBlue.length > 0) {
      // O líder é o primeiro jogador humano do time azul
      const leader = humanPlayersBlue[0];
      this.isMatchLeader = leader.summonerName === this.currentPlayer.summonerName;

      console.log(`👑 Líder da partida: ${leader.summonerName}`);
      console.log(`🎮 Você é o líder: ${this.isMatchLeader}`);
    } else {
      // Se não há jogadores humanos no time azul, verificar o time vermelho
      const humanPlayersRed = this.draftData.redTeam?.filter((player: any) =>
        !player.summonerName.startsWith('Bot') &&
        !player.summonerName.includes('bot')
      ) || [];

      if (humanPlayersRed.length > 0) {
        const leader = humanPlayersRed[0];
        this.isMatchLeader = leader.summonerName === this.currentPlayer.summonerName;
      } else {
        this.isMatchLeader = true; // Se só há bots, todos são líderes
      }
    }
  }

  private handleWebSocketMessage(message: any): void {
    switch (message.type) {
      case 'queue_joined':
        this.isInQueue = true;
        // Atualizar estado compartilhado
        this.queueStateService.updateCentralizedQueue({
          isInQueue: true,
          position: message.data.position
        });
        this.addNotification('success', 'Fila', `Entrou na fila (posição ${message.data.position})`);
        break;
      case 'queue_update':
        console.log('🔄 Recebido queue_update:', message.data);
        this.queueStatus = message.data;
        // Atualizar estado compartilhado com dados da fila
        this.queueStateService.updateCentralizedQueue({
          isInQueue: this.isInQueue,
          playersInQueue: message.data.playersInQueue,
          averageWaitTime: message.data.averageWaitTime,
          estimatedTime: message.data.estimatedMatchTime
        });
        console.log('🔄 queueStatus atualizado para:', this.queueStatus);
        break;
      case 'match_found':
        console.log('🎮 Partida encontrada!', message.data);
        this.matchFoundData = message.data;
        this.showMatchFound = true;
        this.addNotification('success', 'Partida Encontrada', 'Uma partida foi encontrada! Aceite para continuar.');
        break;
      case 'match_timeout':
        console.log('⏰ Timeout da partida:', message.data);
        this.showMatchFound = false;
        this.matchFoundData = null;
        this.addNotification('warning', 'Timeout', 'A partida foi cancelada por timeout. Alguns jogadores não aceitaram.');
        break;
      case 'match_cancelled':
        console.log('❌ Partida cancelada:', message.data);
        this.showMatchFound = false;
        this.matchFoundData = null;
        this.addNotification('info', 'Partida Cancelada', 'A partida foi cancelada.');
        break;      case 'draft_phase':
        console.log('🎯 Fase de draft iniciada!', message.data);
        console.log('🔍 Debug: matchFoundData antes:', this.matchFoundData);
        console.log('🔍 Debug: inDraftPhase antes:', this.inDraftPhase);

        // Esconder modal de aceitação
        this.showMatchFound = false;
        this.matchFoundData = null;
        // Sair da fila
        this.isInQueue = false;
        // Entrar na fase de draft
        this.inDraftPhase = true;
        this.draftData = message.data;
        this.draftPhase = 'preview'; // Sempre começar na preview

        console.log('🔍 Debug: inDraftPhase depois:', this.inDraftPhase);
        console.log('🔍 Debug: draftData definido:', this.draftData);

        // Determinar se é líder (primeiro jogador humano do time azul)
        this.determineMatchLeader();
        // Atualizar estado compartilhado
        this.queueStateService.updateCentralizedQueue({
          isInQueue: false,
          playersInQueue: 0,
          averageWaitTime: 0,
          estimatedTime: 0
        });
        this.addNotification('success', 'Draft Iniciado', 'Todos aceitaram! A fase de draft começou.');
        break;
      case 'queue_error':
        this.addNotification('error', 'Erro na Fila', message.message);
        break;
      case 'queue_status':
        this.queueStatus = message.data;
        // Atualizar estado compartilhado
        this.queueStateService.updateCentralizedQueue({
          isInQueue: this.isInQueue,
          playersInQueue: message.data.playersInQueue,
          averageWaitTime: message.data.averageWaitTime,
          estimatedTime: message.data.estimatedMatchTime
        });
        break;
    }
  }

  private loadPlayerData(): void {
    const savedPlayer = localStorage.getItem('currentPlayer');
    if (savedPlayer) {
      try {
        this.currentPlayer = JSON.parse(savedPlayer);
      } catch (error) {
        console.log('Erro ao carregar dados do jogador do localStorage');      }
    }
  }

  // Métodos de fila
  async joinQueue(preferences?: QueuePreferences): Promise<void> {
    if (!this.currentPlayer) {
      this.addNotification('warning', 'Configuração Necessária', 'Configure seu nome de invocador primeiro');
      this.setCurrentView('settings');
      return;
    }

    if (!this.currentPlayer.summonerName) {
      this.addNotification('error', 'Erro', 'Nome do invocador não encontrado');
      return;
    }

    try {
      await this.websocketService.joinQueue(this.currentPlayer, preferences);
      this.isInQueue = true;
      // Atualizar estado compartilhado
      this.queueStateService.updateCentralizedQueue({
        isInQueue: true
      });
      this.addNotification('success', 'Fila', `Entrou na fila como ${preferences?.primaryLane || 'qualquer lane'}`);
    } catch (error) {
      this.addNotification('error', 'Erro', 'Não foi possível entrar na fila');
    }
  }  async leaveQueue(): Promise<void> {
    try {
      await this.websocketService.leaveQueue();
      this.isInQueue = false;
      // Atualizar estado compartilhado
      this.queueStateService.updateCentralizedQueue({
        isInQueue: false
      });
      this.addNotification('info', 'Fila', 'Você saiu da fila');
    } catch (error) {
      console.error('Erro ao sair da fila:', error);
      this.addNotification('error', 'Erro', 'Erro ao sair da fila');
    }
  }

  // Método para adicionar bot na fila (apenas para popcorn seller#coup)
  async addBotToQueue(): Promise<void> {
    // Verificar se o usuário atual é autorizado
    if (!this.isAuthorizedForBots()) {
      this.addNotification('error', 'Não Autorizado', 'Você não tem permissão para adicionar bots');
      return;
    }

    try {
      // Chamar API para adicionar bot
      await this.apiService.addBotToQueue().toPromise();
      this.addNotification('success', 'Bot Adicionado', 'Um bot foi adicionado à fila com lane aleatória');
    } catch (error) {
      console.error('Erro ao adicionar bot:', error);
      this.addNotification('error', 'Erro', 'Erro ao adicionar bot na fila');
    }
  }

  // Verificar se o usuário atual pode adicionar bots
  private isAuthorizedForBots(): boolean {
    return this.currentPlayer?.summonerName === 'popcorn seller' &&
           this.currentPlayer?.tagLine === 'coup';
  }  // Método para limpar partidas de teste (apenas para usuário autorizado)
  async cleanupTestMatches(): Promise<void> {
    // Verificar se o usuário atual é autorizado
    if (!this.isAuthorizedForBots()) {
      this.addNotification('error', 'Não Autorizado', 'Você não tem permissão para limpar partidas');
      return;
    }

    // Confirmação do usuário
    const confirmed = confirm('⚠️ ATENÇÃO: Esta ação irá deletar TODAS as partidas de teste/simulação do banco de dados.\n\nIsso inclui:\n- Partidas sem Riot ID real\n- Partidas com IDs fictícios\n- Partidas canceladas/incompletas\n\nEsta ação NÃO PODE ser desfeita.\n\nDeseja continuar?');

    if (!confirmed) {
      return;
    }

    try {
      this.addNotification('info', 'Limpando Banco', 'Removendo partidas de teste do banco de dados...');
      console.log('🧹 Iniciando limpeza de partidas de teste');

      const response = await this.apiService.cleanupTestMatches().toPromise();
      console.log('✅ Resposta da limpeza:', response);

      if (response && response.success) {
        this.addNotification('success', 'Limpeza Concluída',
          `✅ ${response.deletedCount} partidas de teste removidas! Restaram ${response.remainingMatches} partidas reais.`);

        console.log(`📊 Limpeza concluída: ${response.deletedCount} deletadas, ${response.remainingMatches} restantes`);

        if (response.deletedMatches && response.deletedMatches.length > 0) {
          console.log('🗑️ Exemplos de partidas deletadas:');
          response.deletedMatches.forEach((match: any, i: number) => {
            console.log(`${i + 1}. ID ${match.id} (${match.match_id}): ${match.reasons?.join(', ')}`);
          });
        }
      } else {
        this.addNotification('warning', 'Limpeza Sem Resultado', 'Nenhuma partida de teste foi encontrada para remoção.');
      }

    } catch (error) {
      console.error('❌ Erro ao limpar partidas de teste:', error);
      this.addNotification('error', 'Erro na Limpeza', 'Erro ao limpar partidas de teste do banco de dados');
    }
  }

  // Método para simular última partida customizada (apenas para usuário autorizado)
  async simulateLastCustomMatch(): Promise<void> {
    // Verificar se o usuário atual é autorizado
    if (!this.isAuthorizedForBots()) {
      this.addNotification('error', 'Não Autorizado', 'Você não tem permissão para simular partidas');
      return;
    }

    if (!this.currentPlayer?.id) {
      this.addNotification('error', 'Erro', 'Dados do jogador não disponíveis');
      return;
    }    try {
      this.addNotification('info', 'Buscando Partida', 'Procurando sua última partida customizada REAL do LCU...');

      console.log('Player ID para simulação:', this.currentPlayer.id);
      console.log('Player data completo:', this.currentPlayer);

      // PRIMEIRA TENTATIVA: Buscar partidas customizadas REAIS do LCU
      const lcuMatches = await this.apiService.getLCUMatchHistoryAll(0, 10, true).toPromise();
      console.log('🎮 Partidas customizadas do LCU:', lcuMatches);

      if (lcuMatches && lcuMatches.success && lcuMatches.matches && lcuMatches.matches.length > 0) {
        // Encontrou partidas customizadas reais no LCU
        const lastLCUMatch = lcuMatches.matches[0];
        console.log('✅ Partida customizada REAL encontrada no LCU:', lastLCUMatch);

        this.addNotification('success', 'Partida LCU Encontrada', 'Usando partida customizada real do seu histórico do LoL!');
        this.simulateMatchFromLCUData(lastLCUMatch);
        return;
      }

      // SEGUNDA TENTATIVA: Buscar no banco interno (com filtros melhorados)
      console.log('⚠️ Nenhuma partida customizada encontrada no LCU, buscando no banco interno...');

      // Para o usuário especial "popcorn seller#coup", usar ID numérico 1
      let playerIdForSearch = this.currentPlayer.id.toString();
      if (this.currentPlayer?.summonerName === 'popcorn seller' && this.currentPlayer?.tagLine === 'coup') {
        playerIdForSearch = '1'; // Usar ID numérico conhecido
        console.log('🎯 Usando ID numérico especial para popcorn seller:', playerIdForSearch);
      }

      // Buscar partidas customizadas do jogador (buscar mais para filtrar exemplos)
      const response = await this.apiService.getCustomMatches(playerIdForSearch, 0, 20).toPromise();
      console.log('🔍 Resposta da busca no banco interno:', response);      if (!response || !response.matches || response.matches.length === 0) {
        this.addNotification('warning', 'Sem Histórico', 'Você ainda não jogou nenhuma partida customizada real. Para testar a detecção de vencedor, jogue uma partida customizada no LoL primeiro.');
        console.log('❌ Nenhuma partida encontrada no banco interno.');
        return;
      }      // Filtrar partidas REAIS (não partidas de exemplo/teste)
      const realMatches = response.matches.filter((match: any) => {
        // Detectar partidas de exemplo pelos critérios mais específicos:
        // 1. Match ID contém "sample", "test" ou "example"
        // 2. Partidas sem vencedor definido (incompletas)
        // 3. Partidas muito recentes (últimos 5 minutos) que podem ser de teste rápido
        // 4. Times com APENAS IDs negativos (claramente de teste)

        const team1Players = JSON.parse(match.team1_players || '[]');
        const team2Players = JSON.parse(match.team2_players || '[]');
        const allPlayerIds = [...team1Players, ...team2Players];

        const matchId = match.match_id || '';
        const hasTestMatchId = matchId.includes('sample') || matchId.includes('test') || matchId.includes('example');

        // Verificar se TODOS os IDs são negativos (claramente de teste)
        const allNegativeIds = allPlayerIds.length > 0 && allPlayerIds.every((id: number) => id < 0);

        // Partida sem vencedor (incompleta)
        const isIncomplete = !match.winner_team;

        // Data muito recente (últimos 5 minutos) - pode ser teste
        const isVeryRecent = Date.now() - new Date(match.created_at).getTime() < 300000; // 5 minutos

        // Considerar como teste apenas se:
        // - Tem ID de teste OU
        // - Todos os IDs são negativos OU
        // - É incompleta E muito recente (provavelmente cancelada/teste)
        const isExampleMatch = hasTestMatchId || allNegativeIds || (isIncomplete && isVeryRecent);        console.log(`🔍 Analisando partida ${match.id}:`, {
          matchId: matchId,
          team1Players: team1Players,
          team2Players: team2Players,
          allNegativeIds,
          hasTestMatchId,
          isVeryRecent,
          isIncomplete,
          isExampleMatch: isExampleMatch,
          winnerTeam: match.winner_team
        });

        return !isExampleMatch; // Manter apenas partidas reais
      });

      console.log(`📊 Partidas filtradas: ${realMatches.length} reais de ${response.matches.length} totais`);      if (realMatches.length === 0) {
        this.addNotification('warning', 'Apenas Partidas de Teste',
          `Não foram encontradas partidas customizadas reais. Todas as ${response.matches.length} partidas encontradas são de teste/exemplo. Para testar a detecção de vencedor, jogue uma partida customizada real no LoL primeiro.`);
        console.log('❌ Nenhuma partida customizada REAL encontrada. Todas são de teste/exemplo.');
        return;
      }

      // Usar a última partida REAL
      const lastRealMatch = realMatches[0]; // Já ordenadas por data
      console.log('✅ Partida REAL encontrada:', lastRealMatch);

      this.addNotification('success', 'Partida Encontrada', 'Usando sua última partida customizada real!');
      this.simulateMatchFromData(lastRealMatch);

    } catch (error) {
      console.error('Erro ao simular última partida:', error);
      this.addNotification('error', 'Erro', 'Erro ao buscar/criar partida customizada');
    }
  }

  private async createSampleMatchAndSimulate(playerIdForSearch: string): Promise<void> {
    // Se não há partidas reais, criar uma de exemplo
    this.addNotification('info', 'Criando Partida', 'Criando partida de exemplo para simulação...');

    const sampleResponse = await this.apiService.createSampleMatch(playerIdForSearch).toPromise();
    console.log('✨ Resposta da criação de partida de exemplo:', sampleResponse);

    if (!sampleResponse || !sampleResponse.success) {
      this.addNotification('error', 'Erro', 'Erro ao criar partida de exemplo');
      return;
    }

    // Buscar novamente após criar a partida
    const newResponse = await this.apiService.getLastCustomMatch(playerIdForSearch).toPromise();
    console.log('🔍 Resposta da segunda busca após criação:', newResponse);

    if (!newResponse || !newResponse.matches || newResponse.matches.length === 0) {
      this.addNotification('error', 'Erro', 'Falha ao buscar partida após criação');
      console.error('❌ Falha na segunda busca. NewResponse:', newResponse);
      return;
    }

    this.simulateMatchFromData(newResponse.matches[0]);
  }  private simulateMatchFromData(matchData: any): void {
    console.log('🎮 Simulando partida com dados REAIS:', matchData);    // Processar dados dos teams corretamente (podem ser strings ou números)
    let team1Players: any[] = [];
    let team2Players: any[] = [];

    try {
      const rawTeam1 = JSON.parse(matchData.team1_players || '[]');
      const rawTeam2 = JSON.parse(matchData.team2_players || '[]');

      // Garantir que temos arrays válidos
      team1Players = Array.isArray(rawTeam1) ? rawTeam1 : [rawTeam1];
      team2Players = Array.isArray(rawTeam2) ? rawTeam2 : [rawTeam2];

    } catch (error) {
      console.error('Erro ao processar dados dos times:', error);
      team1Players = [1]; // Fallback
      team2Players = [999, 998, 997, 996, 995]; // Fallback
    }

    console.log('👥 Team 1 players processados:', team1Players);
    console.log('👥 Team 2 players processados:', team2Players);

    // Usar dados REAIS de pick/ban da partida histórica se disponível
    let realPickBanData = null;
    try {
      if (matchData.pick_ban_data && typeof matchData.pick_ban_data === 'string') {
        realPickBanData = JSON.parse(matchData.pick_ban_data);
        console.log('🎯 Usando pick/ban REAIS da partida (string parsed):', realPickBanData);
      } else if (matchData.pick_ban_data && typeof matchData.pick_ban_data === 'object') {
        realPickBanData = matchData.pick_ban_data;
        console.log('🎯 Usando pick/ban REAIS da partida (objeto direto):', realPickBanData);
      }

      // Verificar se temos dados reais válidos
      if (realPickBanData && (realPickBanData.team1Picks?.length > 0 || realPickBanData.team2Picks?.length > 0)) {
        console.log('✅ Pick/ban REAIS confirmados:', {
          team1Picks: realPickBanData.team1Picks?.length || 0,
          team2Picks: realPickBanData.team2Picks?.length || 0,
          source: realPickBanData.source || 'UNKNOWN'
        });
      } else {
        console.log('⚠️ Dados de pick/ban inválidos ou vazios, usando fallback');
        realPickBanData = null;
      }
    } catch (error) {
      console.error('Erro ao processar pick/ban data:', error);
      realPickBanData = null;
    }

    // Se não temos dados reais de pick/ban, usar dados simulados básicos
    if (!realPickBanData) {
      console.log('⚠️ Criando pick/ban simulados porque dados reais não estão disponíveis');
      realPickBanData = {
        team1Bans: ['Yasuo', 'Zed', 'Azir'],
        team2Bans: ['Jinx', 'Thresh', 'Lee Sin'],
        team1Picks: team1Players.map((playerId, index) => ({
          champion: ['Garen', 'Ahri', 'Graves', 'Thresh', 'Jinx'][index] || 'Garen',
          player: playerId,
          lane: ['top', 'mid', 'jungle', 'bot', 'support'][index] || 'top'
        })),
        team2Picks: team2Players.map((playerId, index) => ({
          champion: ['Darius', 'Zed', 'Lee Sin', 'Lucian', 'Leona'][index] || 'Darius',
          player: playerId,
          lane: ['top', 'mid', 'jungle', 'bot', 'support'][index] || 'top'
        })),
        isReal: false,
        source: 'SIMULATED_FALLBACK'
      };
      console.log('🔄 Pick/ban simulados criados:', realPickBanData);
    }

    // Converter players para objetos adequados para o template
    const processedTeam1Players = team1Players.map((playerData, index) => {
      // Se já é um objeto, usar como está
      if (typeof playerData === 'object' && playerData !== null) {
        return playerData;
      }

      // Se é string (nome do player), criar objeto com dados dos picks
      const playerName = playerData.toString();
      const playerPick = realPickBanData?.team1Picks?.[index];

      return {
        id: playerName,
        name: playerName,
        summonerName: playerName,
        champion: playerPick ? {
          name: playerPick.champion,
          id: playerPick.championId
        } : null,
        role: playerPick?.lane || 'UNKNOWN'
      };
    });

    const processedTeam2Players = team2Players.map((playerData, index) => {
      // Se já é um objeto, usar como está
      if (typeof playerData === 'object' && playerData !== null) {
        return playerData;
      }

      // Se é string (nome do player), criar objeto com dados dos picks
      const playerName = playerData.toString();
      const playerPick = realPickBanData?.team2Picks?.[index];

      return {
        id: playerName,
        name: playerName,
        summonerName: playerName,
        champion: playerPick ? {
          name: playerPick.champion,
          id: playerPick.championId
        } : null,
        role: playerPick?.lane || 'UNKNOWN'
      };
    });

    console.log('🎯 Team 1 players com objetos completos:', processedTeam1Players);
    console.log('🎯 Team 2 players com objetos completos:', processedTeam2Players);

    // Criar dados do jogo baseados na partida REAL
    this.gameData = {
      sessionId: 'simulate_real_' + Date.now(),
      gameId: 'simulate_real_' + matchData.id,
      team1: processedTeam1Players,
      team2: processedTeam2Players,
      startTime: new Date(),
      pickBanData: realPickBanData,
      isCustomGame: true,
      // Adicionar referência à partida original para correlação
      originalMatchId: matchData.id,
      originalMatchData: matchData,
      riotId: matchData.riotId || null
    };

    console.log('✨ GameData REAL criado com picks REAIS:', this.gameData);

    // Transicionar para tela de jogo em andamento
    this.inGamePhase = true;
    this.currentView = 'dashboard'; // O componente de jogo será exibido automaticamente

    const sourceMessage = realPickBanData?.isReal ? 'com PICKS/CHAMPIONS REAIS' : 'com picks simulados (dados reais não disponíveis)';
    this.addNotification('success', 'Partida Simulada', `Jogo em andamento baseado na sua ÚLTIMA partida customizada real ${sourceMessage}. O sistema detectará automaticamente o resultado.`);
  }

  private simulateMatchFromLCUData(lcuMatchData: any): void {
    console.log('🎮 Simulando partida com dados REAIS do LCU:', lcuMatchData);

    // Converter dados do LCU para formato compatível
    const convertedMatch = this.convertLCUMatchToInternalFormat(lcuMatchData);

    // Usar o método de simulação existente
    this.simulateMatchFromData(convertedMatch);
  }  private convertLCUMatchToInternalFormat(lcuMatch: any): any {
    // Converter estrutura do LCU para formato interno
    console.log('🔄 Convertendo dados do LCU para formato interno:', lcuMatch);    // Extrair informações dos participantes - usar AMBOS participants E participantIdentities
    const participants = lcuMatch.participants || [];
    const participantIdentities = lcuMatch.participantIdentities || [];
    const team1Players: string[] = [];
    const team2Players: string[] = [];
    const team1Picks: any[] = [];
    const team2Picks: any[] = [];

    // Identificar o player atual na partida
    const currentPlayerSummonerName = this.currentPlayer?.summonerName;
    let currentPlayerTeam = null;
    let currentPlayerInMatch = false;

    // Combinar dados de participants (champion info) com participantIdentities (player info)
    participants.forEach((participant: any, index: number) => {
      // Buscar dados do jogador correspondente em participantIdentities
      const participantIdentity = participantIdentities.find(
        (identity: any) => identity.participantId === participant.participantId
      );

      let playerName = '';

      if (participantIdentity && participantIdentity.player) {
        const player = participantIdentity.player;        // Log detalhado da estrutura do participante para debug
        console.log(`🔍 Participante ${index + 1}:`, {
          participant: {
            participantId: participant.participantId,
            teamId: participant.teamId,
            championId: participant.championId,
            lane: participant.lane,
            teamPosition: participant.teamPosition,
            individualPosition: participant.individualPosition,
            timeline: participant.timeline,
            allFields: Object.keys(participant)
          },
          player: {
            gameName: player.gameName,
            tagLine: player.tagLine,
            summonerName: player.summonerName,
            allFields: Object.keys(player)
          }
        });

        // Formar nome real usando dados do participantIdentities
        if (player.gameName && player.tagLine) {
          playerName = `${player.gameName}#${player.tagLine}`;
        } else if (player.summonerName) {
          playerName = player.summonerName;
        } else if (player.gameName) {
          playerName = player.gameName;
        }
      }

      // Se ainda não tem nome, usar fallback genérico
      if (!playerName) {
        playerName = `Player${index + 1}`;
      }

      console.log(`✅ Nome final do jogador ${index + 1}: "${playerName}"`);      const playerId = participant.summonerId || participant.participantId || playerName;
      const championId = participant.championId || participant.champion || 0;
      const championName = participant.championName || this.getChampionNameById(championId) || `Champion${championId}`;

      // Melhorar extração da lane/posição
      let lane = 'UNKNOWN';
      if (participant.timeline && participant.timeline.lane) {
        lane = participant.timeline.lane;
      } else if (participant.timeline && participant.timeline.role) {
        lane = participant.timeline.role;
      } else if (participant.lane) {
        lane = participant.lane;
      } else if (participant.teamPosition) {
        lane = participant.teamPosition;
      } else if (participant.individualPosition) {
        lane = participant.individualPosition;
      }

      // Converter códigos de lane para nomes mais amigáveis
      const laneMap: { [key: string]: string } = {
        'TOP': 'Top',
        'JUNGLE': 'Jungle',
        'MIDDLE': 'Mid',
        'MID': 'Mid',
        'BOTTOM': 'ADC',
        'BOT': 'ADC',
        'UTILITY': 'Support',
        'SUPPORT': 'Support',
        'DUO_CARRY': 'ADC',
        'DUO_SUPPORT': 'Support'
      };

      const friendlyLane = laneMap[lane.toUpperCase()] || lane;

      console.log(`🎯 Lane/Posição do jogador ${playerName}: "${lane}" -> "${friendlyLane}"`);

      // Verificar se este é o player atual
      if (currentPlayerSummonerName && playerName.includes(currentPlayerSummonerName)) {
        currentPlayerInMatch = true;
        currentPlayerTeam = participant.teamId;
        console.log(`🎯 Player atual encontrado na partida: ${playerName} (Team ${participant.teamId})`);
      }      if (participant.teamId === 100) {
        team1Players.push(playerName); // Usar nome real ao invés de ID genérico
        team1Picks.push({
          champion: championName,
          player: playerName, // Usar nome real
          lane: friendlyLane,
          championId: championId
        });
      } else if (participant.teamId === 200) {        team2Players.push(playerName); // Usar nome real ao invés de ID genérico
        team2Picks.push({
          champion: championName,
          player: playerName, // Usar nome real
          lane: friendlyLane,
          championId: championId
        });
      }
    });

    // REMOVIDO: Lógica que adicionava IDs genéricos do player atual
    // Agora os nomes reais já estão nos arrays e não precisamos sobrescrever

    console.log('🎯 Champions extraídos - Team 1 picks:', team1Picks);
    console.log('🎯 Champions extraídos - Team 2 picks:', team2Picks);

    // Criar dados de pick/ban reais baseados nos participants - FORMATO CORRETO
    const pickBanData = {
      team1Picks: team1Picks,
      team2Picks: team2Picks,
      team1Bans: [], // LCU geralmente não tem dados de ban em match history
      team2Bans: [],
      isReal: true, // Marcar como dados reais
      source: 'LCU_MATCH_HISTORY'
    };

    const convertedMatch = {
      id: lcuMatch.gameId || Date.now(),
      match_id: `lcu_${lcuMatch.gameId || Date.now()}`,
      team1_players: JSON.stringify(team1Players),
      team2_players: JSON.stringify(team2Players),
      winner_team: lcuMatch.teams ? this.extractWinnerFromLCU(lcuMatch.teams) : null,
      created_at: new Date(lcuMatch.gameCreation || Date.now()).toISOString(),
      pick_ban_data: JSON.stringify(pickBanData),
      isLCUSource: true, // Marcar como originário do LCU
      riotId: lcuMatch.platformId ? `${lcuMatch.platformId}_${lcuMatch.gameId}` : null
    };

    console.log('✅ Dados convertidos do LCU com picks REAIS:', convertedMatch);
    return convertedMatch;
  }

  private getChampionNameById(championId: number): string | null {
    // Lista básica de champions mais comuns (pode ser expandida)
    const championMap: { [key: number]: string } = {
      1: 'Annie', 2: 'Olaf', 3: 'Galio', 4: 'Twisted Fate', 5: 'Xin Zhao',
      6: 'Urgot', 7: 'LeBlanc', 8: 'Vladimir', 9: 'Fiddlesticks', 10: 'Kayle',
      11: 'Master Yi', 12: 'Alistar', 13: 'Ryze', 14: 'Sion', 15: 'Sivir',
      16: 'Soraka', 17: 'Teemo', 18: 'Tristana', 19: 'Warwick', 20: 'Nunu',
      21: 'Miss Fortune', 22: 'Ashe', 23: 'Tryndamere', 24: 'Jax', 25: 'Morgana',
      26: 'Zilean', 27: 'Singed', 28: 'Evelynn', 29: 'Twitch', 30: 'Karthus',
      31: 'Cho\'Gath', 32: 'Amumu', 33: 'Rammus', 34: 'Anivia', 35: 'Shaco',
      36: 'Dr. Mundo', 37: 'Sona', 38: 'Kassadin', 39: 'Irelia', 40: 'Janna',
      41: 'Gangplank', 42: 'Corki', 43: 'Karma', 44: 'Taric', 45: 'Veigar',
      48: 'Trundle', 50: 'Swain', 51: 'Caitlyn', 53: 'Blitzcrank', 54: 'Malphite',
      55: 'Katarina', 56: 'Nocturne', 57: 'Maokai', 58: 'Renekton', 59: 'Jarvan IV',
      60: 'Elise', 61: 'Orianna', 62: 'Wukong', 63: 'Brand', 64: 'Lee Sin',
      67: 'Vayne', 68: 'Rumble', 69: 'Cassiopeia', 72: 'Skarner', 74: 'Heimerdinger',
      75: 'Nasus', 76: 'Nidalee', 77: 'Udyr', 78: 'Poppy', 79: 'Gragas',
      80: 'Pantheon', 81: 'Ezreal', 82: 'Mordekaiser', 83: 'Yorick', 84: 'Akali',
      85: 'Kennen', 86: 'Garen', 89: 'Leona', 90: 'Malzahar', 91: 'Talon',
      92: 'Riven', 96: 'Kog\'Maw', 98: 'Shen', 99: 'Lux', 101: 'Xerath',
      102: 'Shyvana', 103: 'Ahri', 104: 'Graves', 105: 'Fizz', 106: 'Volibear',
      107: 'Rengar', 110: 'Varus', 111: 'Nautilus', 112: 'Viktor', 113: 'Sejuani',
      114: 'Fiora', 115: 'Ziggs', 117: 'Lulu', 119: 'Draven', 120: 'Hecarim',
      121: 'Kha\'Zix', 122: 'Darius', 126: 'Jayce', 127: 'Lissandra', 131: 'Diana',
      133: 'Quinn', 134: 'Syndra', 136: 'Aurelion Sol', 141: 'Kayn', 142: 'Zoe',
      143: 'Zyra', 145: 'Kai\'Sa', 147: 'Seraphine', 150: 'Gnar', 154: 'Zac',
      157: 'Yasuo', 161: 'Vel\'Koz', 163: 'Taliyah', 164: 'Camille', 166: 'Akshan',
      200: 'Bel\'Veth', 201: 'Braum', 202: 'Jhin', 203: 'Kindred', 221: 'Zeri',
      222: 'Jinx', 223: 'Tahm Kench', 234: 'Viego', 235: 'Senna', 236: 'Lucian',
      238: 'Zed', 240: 'Kled', 245: 'Ekko', 246: 'Qiyana', 254: 'Vi',
      266: 'Aatrox', 267: 'Nami', 268: 'Azir', 350: 'Yuumi', 360: 'Samira',
      412: 'Thresh', 420: 'Illaoi', 421: 'Rek\'Sai', 427: 'Ivern', 429: 'Kalista',
      432: 'Bard', 516: 'Ornn', 517: 'Sylas', 518: 'Neeko', 523: 'Aphelios',
      526: 'Rell', 555: 'Pyke', 777: 'Yone', 875: 'Sett', 876: 'Lillia',
      887: 'Gwen', 888: 'Renata Glasc', 895: 'Nilah', 897: 'K\'Sante', 901: 'Smolder',
      902: 'Milio', 910: 'Hwei', 950: 'Naafiri'
    };
    return championMap[championId] || null;
  }

  private extractWinnerFromLCU(teams: any[]): number | null {
    const winningTeam = teams.find(team => team.win === true);
    if (winningTeam) {
      return winningTeam.teamId === 100 ? 1 : 2; // 1 = blue/team1, 2 = red/team2
    }
    return null;
  }

  private extractPickBanFromLCU(championSelections: any[]): any {
    const team1Picks: any[] = [];
    const team2Picks: any[] = [];
    const team1Bans: string[] = [];
    const team2Bans: string[] = [];

    championSelections.forEach((selection: any) => {
      const champion = selection.championName || selection.champion || 'Unknown';

      if (selection.spell1Id && selection.spell2Id) {
        // É um pick
        const pick = {
          champion: champion,
          player: selection.summonerId || selection.participantId,
          lane: selection.lane || 'unknown'
        };

        if (selection.teamId === 100) {
          team1Picks.push(pick);
        } else if (selection.teamId === 200) {
          team2Picks.push(pick);
        }
      } else if (selection.isBan) {
        // É um ban
        if (selection.teamId === 100) {
          team1Bans.push(champion);
        } else if (selection.teamId === 200) {
          team2Bans.push(champion);
        }
      }
    });

    return {
      team1Picks,
      team2Picks,
      team1Bans,
      team2Bans
    };
  }

  // Métodos para partida encontrada
  async onAcceptMatch(matchId: number): Promise<void> {
    try {
      await this.apiService.acceptMatch(
        matchId,
        this.currentPlayer?.id,
        this.currentPlayer?.summonerName
      ).toPromise();
      this.addNotification('success', 'Partida Aceita', 'Você aceitou a partida! Aguarde outros jogadores.');
    } catch (error) {
      console.error('Erro ao aceitar partida:', error);
      this.addNotification('error', 'Erro', 'Erro ao aceitar partida');
      this.showMatchFound = false;
      this.matchFoundData = null;
    }
  }  async onDeclineMatch(matchId: number): Promise<void> {
    try {
      await this.apiService.declineMatch(
        matchId,
        this.currentPlayer?.id,
        this.currentPlayer?.summonerName
      ).toPromise();

      this.showMatchFound = false;
      this.matchFoundData = null;
      this.addNotification('info', 'Partida Recusada', 'Você recusou a partida');
    } catch (error) {
      console.error('Erro ao recusar partida:', error);
      this.showMatchFound = false;
      this.matchFoundData = null;
      this.addNotification('info', 'Partida Recusada', 'Você recusou a partida');
    }
  }

  // Métodos de partida
  async acceptMatch(): Promise<void> {
    if (!this.matchFound) return;

    try {
      this.apiService.createLobby().subscribe({
        next: () => {
          this.addNotification('success', 'Partida Aceita', 'Lobby criado no League of Legends');
          this.matchFound = null;
        },
        error: (error) => {
          this.addNotification('error', 'Erro', 'Não foi possível criar o lobby');
        }
      });
    } catch (error) {
      this.addNotification('error', 'Erro', 'Não foi possível criar o lobby');
    }
  }

  declineMatch(): void {
    this.matchFound = null;
    this.addNotification('info', 'Partida Recusada', 'Você recusou a partida');
  }

  // Métodos de configurações
  async savePlayerSettings(): Promise<void> {
    if (!this.settingsForm.summonerName || !this.settingsForm.region) {
      this.addNotification('warning', 'Campos Obrigatórios', 'Preencha nome do invocador e região');
      return;
    }

    try {
      this.apiService.registerPlayer(
        this.settingsForm.summonerName,
        this.settingsForm.region
      ).subscribe({
        next: (player) => {
          this.currentPlayer = player;
          localStorage.setItem('currentPlayer', JSON.stringify(player));
          this.addNotification('success', 'Configurações Salvas', 'Dados do jogador atualizados');
        },
        error: (error) => {
          this.addNotification('error', 'Erro', error.message || 'Erro ao salvar configurações');
        }
      });
    } catch (error: any) {
      this.addNotification('error', 'Erro', error.message || 'Erro ao salvar configurações');
    }
  }

  clearPlayerData(): void {
    this.currentPlayer = null;
    localStorage.removeItem('currentPlayer');
    this.addNotification('info', 'Dados Limpos', 'Informações do jogador foram removidas');
  }

  async refreshLCUConnection(): Promise<void> {
    try {
      this.apiService.getLCUStatus().subscribe({
        next: (status) => {
          this.lcuStatus = status;
          if (status.isConnected) {
            this.addNotification('success', 'LoL Cliente', 'Conectado ao cliente do League of Legends');            if (status.summoner) {
              // Auto-load player data from LCU
              this.currentPlayer = {
                id: 0,
                summonerName: status.summoner.gameName || status.summoner.displayName || 'Unknown',
                summonerId: status.summoner.summonerId?.toString(),
                puuid: status.summoner.puuid,
                profileIconId: status.summoner.profileIconId,
                summonerLevel: status.summoner.summonerLevel,
                currentMMR: 1200,
                region: this.settingsForm.region || 'br1'
              };
              localStorage.setItem('currentPlayer', JSON.stringify(this.currentPlayer));
            }
          }
        },
        error: (error) => {
          this.lcuStatus = { isConnected: false };
        }
      });
    } catch (error) {
      this.lcuStatus = { isConnected: false };
    }
  }  private async tryAutoLoadCurrentPlayer(): Promise<void> {
    // Priority 1: Try LCU first (League Client is the primary source)
    if (this.lcuStatus.isConnected) {
      try {
        this.apiService.getPlayerFromLCU().subscribe({
          next: (player: Player) => {
            this.currentPlayer = player;
            localStorage.setItem('currentPlayer', JSON.stringify(this.currentPlayer));
            this.addNotification('success', 'Auto Load', 'Dados carregados do League of Legends automaticamente');
            console.log('✅ Player data loaded from LCU successfully');
          },
          error: (error) => {
            console.warn('⚠️ LCU data unavailable, trying fallback options:', error.message);
            this.tryLoadFromLocalStorage();
          }
        });
      } catch (error) {
        console.warn('⚠️ LCU connection failed, trying fallback options');
        this.tryLoadFromLocalStorage();
      }
    } else {
      console.log('📱 LCU not connected, trying fallback options');
      this.tryLoadFromLocalStorage();
    }
  }
  private tryLoadFromLocalStorage(): void {
    // Priority 2: Try loading from local storage
    const savedPlayer = localStorage.getItem('currentPlayer');
    if (savedPlayer) {
      try {
        this.currentPlayer = JSON.parse(savedPlayer);
        console.log('📦 Player data loaded from local storage');
        this.addNotification('info', 'Dados Locais', 'Usando dados salvos localmente');
        return; // Exit early if we have valid local data
      } catch (error) {
        console.warn('⚠️ Invalid local storage data, clearing and trying Riot API');
        localStorage.removeItem('currentPlayer');
      }
    }

    // Priority 3: Only try Riot API as last resort (and only if it's likely to work)
    this.tryLoadFromRiotAPI();
  }

  private tryLoadFromRiotAPI(): void {
    // Only attempt Riot API if we have no other options
    // This reduces the spam of errors when Riot API is down
    console.log('🌐 Attempting to load from Riot API as last resort...');

    this.apiService.getCurrentPlayer().subscribe({
      next: (response) => {
        if (response && response.success && response.player) {
          this.currentPlayer = response.player;
          localStorage.setItem('currentPlayer', JSON.stringify(this.currentPlayer));
          this.addNotification('success', 'Riot API', 'Dados carregados da API da Riot');
          console.log('✅ Player data loaded from Riot API');
        } else {
          console.log('📝 No player data available, manual registration needed');
          this.addNotification('info', 'Registro Manual', 'Configure seus dados nas configurações');
        }
      },
      error: (err) => {
        // Suppress verbose error logging for Riot API failures
        if (err.message?.includes('Riot API') || err.message?.includes('503')) {
          console.log('🚫 Riot API unavailable - this is expected if the service is down');
          this.addNotification('info', 'API Indisponível', 'Configure seus dados manualmente nas configurações');
        } else {
          console.warn('⚠️ Could not load player data:', err.message);
          this.addNotification('info', 'Dados Não Encontrados', 'Configure seus dados nas configurações');
        }
      }
    });
  }  private async tryLoadRealPlayerData(): Promise<void> {
    console.log('🚀 Starting intelligent player data loading...');

    // Strategy 1: Always try LCU first (primary data source)
    if (this.lcuStatus.isConnected) {
      console.log('� LCU connected, loading from League Client...');

      try {        // Use the LCU-focused endpoint
        this.apiService.getPlayerFromLCU().subscribe({
          next: (player: Player) => {
            this.currentPlayer = player;
            localStorage.setItem('currentPlayer', JSON.stringify(this.currentPlayer));

            // Check if this is partial data and provide appropriate notification
            const isPartialData = (player as any)._isPartialData;
            const dataSource = (player as any)._dataSource || 'Desconhecido';

            if (isPartialData) {
              this.addNotification('info', 'Dados Parciais', `Conectado como ${this.currentPlayer.summonerName} (dados apenas do LCU - Riot API indisponível)`);
              console.log('📡 LCU data loaded (partial):', this.currentPlayer.summonerName);
            } else {
              this.addNotification('success', 'LCU Conectado', `Bem-vindo, ${this.currentPlayer.summonerName}! (dados completos)`);
              console.log('✅ LCU data loaded (complete):', this.currentPlayer.summonerName);
            }
          },
          error: (error) => {
            console.warn('⚠️ LCU data loading failed:', error.message);
            this.handleLCUDataFailure(error);
          }
        });
        return; // Exit early if LCU is available
      } catch (error) {
        console.warn('⚠️ LCU connection error:', error);
        this.handleLCUDataFailure(error as Error);
      }
    }

    // Strategy 2: LCU not available, try fallback options
    console.log('📱 LCU not available, trying fallback options...');
    this.handleLCUDataFailure(new Error('LCU not connected'));
  }

  private handleLCUDataFailure(error: Error): void {
    // Check for specific error types and provide appropriate feedback
    if (error.message.includes('Cliente do LoL não conectado') || error.message.includes('LCU')) {
      this.addNotification('info', 'LoL Cliente Offline', 'Conecte-se ao League of Legends para dados automáticos');
    } else if (error.message.includes('Jogador não encontrado') || error.message.includes('não encontrado')) {
      this.addNotification('info', 'Dados Não Encontrados', 'Configure manualmente nas configurações');
    }

    // Try fallback options
    this.tryLoadFromLocalStorage();  }

  private fallbackToStorageOrMock(): void {
    // If no real data available and no stored data, create mock data for testing
    if (!this.currentPlayer) {
      this.createMockPlayer();
    }
  }  private mapRealDataToPlayer(realData: any): Player {
    // Handle the new data structure from current-details endpoint
    const lcuData = realData.lcuData || realData.lcu || realData;
    const riotData = realData.riotData || realData.riotApi || {};

    console.log('[DEBUG] Mapping data - LCU:', lcuData);
    console.log('[DEBUG] Mapping data - Riot:', riotData);

    // Extract ranked data
    const soloQueueData = riotData?.soloQueue || riotData?.rankedData?.soloQueue;

    let playerRankObject: Player['rank'] = undefined;
    if (soloQueueData && soloQueueData.tier) {
      playerRankObject = {
        tier: soloQueueData.tier.toUpperCase(),
        rank: (soloQueueData.rank || soloQueueData.division || 'IV').toUpperCase(),
        lp: soloQueueData.leaguePoints || 0,
        display: `${soloQueueData.tier.toUpperCase()} ${(soloQueueData.rank || soloQueueData.division || 'IV').toUpperCase()}`
      };
    }

    const mappedPlayer: Player = {
      id: lcuData?.summonerId || riotData?.id || 0,
      summonerName: lcuData?.gameName || lcuData?.displayName || riotData?.name || 'Unknown',
      summonerId: (lcuData?.summonerId || riotData?.id || '0').toString(),
      puuid: lcuData?.puuid || riotData?.puuid || '',
      profileIconId: lcuData?.profileIconId || riotData?.profileIconId || 29,
      summonerLevel: lcuData?.summonerLevel || riotData?.summonerLevel || 30,
      currentMMR: this.calculateMMRFromRankedData(soloQueueData),
      region: realData?.region || 'br1',
      tagLine: lcuData?.tagLine || riotData?.tagLine || null,
      rank: playerRankObject,
      wins: soloQueueData?.wins,
      losses: soloQueueData?.losses,
      lastMatchDate: riotData?.lastMatchDate ? new Date(riotData.lastMatchDate) : undefined,
      rankedData: {
        soloQueue: soloQueueData,
        flexQueue: riotData?.flexQueue || riotData?.rankedData?.flexQueue
      }
    };

    console.log('[DEBUG] Mapped player:', mappedPlayer);
    return mappedPlayer;
  }
  private calculateMMRFromRankedData(soloQueueData: any): number {
    if (!soloQueueData) return 1200; // Default MMR for unranked

    // Handle different data structures (LCU vs Riot API)
    const tier = soloQueueData.tier || soloQueueData.highestRankedEntry?.tier;
    const division = soloQueueData.division || soloQueueData.rank || soloQueueData.highestRankedEntry?.division;
    const leaguePoints = soloQueueData.leaguePoints || soloQueueData.highestRankedEntry?.leaguePoints || 0;

    const tierValues: { [key: string]: number } = {
      'IRON': 800,
      'BRONZE': 1000,
      'SILVER': 1200,
      'GOLD': 1400,
      'PLATINUM': 1700,
      'EMERALD': 2000,
      'DIAMOND': 2300,
      'MASTER': 2600,
      'GRANDMASTER': 2800,
      'CHALLENGER': 3000
    };

    const rankValues: { [key: string]: number } = {
      'IV': 0, 'III': 50, 'II': 100, 'I': 150
    };

    const baseMMR = tierValues[tier] || 1200;
    const rankBonus = rankValues[division] || 0;
    const lpBonus = leaguePoints * 0.8;

    return Math.round(baseMMR + rankBonus + lpBonus);
  }

  // Method to refresh player data manually
  async refreshPlayerData(): Promise<void> {
    if (!this.currentPlayer) {
      this.addNotification('warning', 'Nenhum Jogador', 'Nenhum dado de jogador para atualizar.');
      return;
    }

    // Verificar se temos gameName e tagLine para formar o Riot ID
    if (!this.currentPlayer.summonerName || !this.currentPlayer.tagLine || !this.currentPlayer.region) {
      this.addNotification('error', 'Dados Incompletos', 'Nome de invocador, tag ou região não encontrados para atualização via Riot ID.');
      // Tentar fallback para PUUID se disponível, ou informar o usuário
      if (this.currentPlayer.puuid && this.currentPlayer.region) {
        this.addNotification('info', 'Tentativa Alternativa', 'Tentando atualizar via PUUID...');
        this.refreshPlayerByPuuidFallback(); // Chama um método de fallback
      } else {
        this.addNotification('error', 'Falha na Atualização', 'Não foi possível atualizar os dados do jogador.');
      }
      return;
    }

    try {
      const riotId = `${this.currentPlayer.summonerName}#${this.currentPlayer.tagLine}`;
      this.addNotification('info', 'Atualizando Dados', `Atualizando dados para ${riotId}...`);

      this.apiService.refreshPlayerByRiotId(riotId, this.currentPlayer.region).subscribe({
        next: (response: RefreshPlayerResponse) => { // Usar a tipagem correta para a resposta
          if (response.success && response.player) {
            const updatedPlayer = response.player as Player;
            // Create a new object for the current player to ensure proper change detection
            // and to avoid modifying the existing object before all processing is done.
            let processedPlayer: Player = {
              ...(this.currentPlayer || {}), // Spread existing data as a base
              ...updatedPlayer // Override with new data from API
            };

            // Recalcular MMR e outros campos derivados se necessário, ou confiar nos dados do backend
            // Exemplo: Se o backend já retorna o MMR calculado e rank formatado, não precisa reprocessar aqui.
            // Se o backend retorna dados brutos, o mapeamento pode ser necessário.
            // Para este endpoint, o backend PlayerService.refreshPlayerByRiotId já deve retornar dados processados.

            this.currentPlayer = processedPlayer;
            localStorage.setItem('currentPlayer', JSON.stringify(this.currentPlayer));
            this.addNotification('success', 'Dados Atualizados', 'Informações do jogador atualizadas com sucesso!');
          } else {
            this.addNotification('error', 'Erro na Atualização', response.error || 'Falha ao processar a resposta do servidor.');
          }
        },
        error: (error) => {
          console.error('Error refreshing player data by Riot ID:', error);
          this.addNotification('error', 'Erro na API', error.message || 'Falha ao atualizar dados do jogador.');
        }
      });
    } catch (error: any) {
      this.addNotification('error', 'Erro', error.message || 'Erro ao salvar configurações');
    }
  }

  // Fallback para atualizar via PUUID caso Riot ID não esteja completo
  private async refreshPlayerByPuuidFallback(): Promise<void> {
    if (!this.currentPlayer || !this.currentPlayer.puuid || !this.currentPlayer.region) {
      // Este log é mais para debug, o usuário já foi notificado antes de chamar este método.
      console.warn('Tentativa de fallback para PUUID sem dados suficientes.');
      return;
    }
    try {
      this.apiService.getPlayerByPuuid(this.currentPlayer.puuid, this.currentPlayer.region).subscribe({
        next: (updatedPlayer: Player) => {
          let processedPlayer: Player = {
            ...(this.currentPlayer || {}),
            ...updatedPlayer
          };
          this.currentPlayer = processedPlayer;
          localStorage.setItem('currentPlayer', JSON.stringify(this.currentPlayer));
          this.addNotification('success', 'Dados Atualizados (PUUID)', 'Informações do jogador atualizadas com sucesso via PUUID.');
          console.log('Player data refreshed by PUUID (fallback):', this.currentPlayer);
        },
        error: (error) => {
          console.error('Error refreshing player data by PUUID (fallback):', error);
          this.addNotification('error', 'Erro na API (PUUID)', error.message || 'Falha ao atualizar dados do jogador via PUUID.');
        }
      });
    } catch (error: any) {
      console.error('Unexpected error in refreshPlayerByPuuidFallback:', error);
      this.addNotification('error', 'Erro Inesperado (PUUID)', error.message || 'Ocorreu um erro inesperado ao tentar via PUUID.');
    }
  }

  // Adicionar notificação à lista
  addNotification(type: 'success' | 'info' | 'warning' | 'error', title: string, message: string): void {
    const newNotification: Notification = {
      id: Math.random().toString(36).substring(2, 9),
      type,
      title,
      message,
      timestamp: new Date()
    };
    this.notifications.push(newNotification);

    // Remover notificação após um tempo (ex: 5 segundos)
    setTimeout(() => {
      this.notifications = this.notifications.filter(n => n.id !== newNotification.id);
    }, 5000);
  }

  dismissNotification(id: string): void {
    this.notifications = this.notifications.filter(n => n.id !== id);
  }

  trackNotification(index: number, notification: Notification): string {
    return notification.id; // Ou qualquer outra propriedade única
  }

  // Placeholder Implementations for missing methods

  private startLCUStatusCheck(): void {
    console.log('Placeholder: startLCUStatusCheck called');
    // TODO: Implement LCU status checking logic
    // Ex: setInterval(() => this.refreshLCUConnection(), 30000); // Check every 30 seconds
    this.refreshLCUConnection(); // Initial check
  }

  private startQueueStatusCheck(): void {
    console.log('Placeholder: startQueueStatusCheck called');
    // TODO: Implement queue status checking logic
    // Ex: setInterval(() => {
    //   if (this.isConnected && this.currentPlayer) {
    //     this.apiService.getQueueStatus().subscribe(status => this.queueStatus = status);
    //   }
    // }, 10000); // Check every 10 seconds
  }
  private createMockPlayer(): void {
    // Criar dados básicos quando não há dados reais disponíveis
    this.currentPlayer = {
      id: 1,
      summonerName: 'Usuario',
      puuid: '',
      tagLine: 'BR1',
      currentMMR: 1200,
      region: 'br1',
      profileIconId: 29,
      summonerLevel: 30,
      rank: {
        tier: 'SILVER',
        rank: 'III',
        lp: 45,
        display: 'SILVER III'
      }
    };
    localStorage.setItem('currentPlayer', JSON.stringify(this.currentPlayer));
    this.addNotification('info', 'Dados Temporários', 'Configure seus dados reais nas configurações');
    console.log('Using basic player data - configure real data in settings');
  }

  // Methods missing from template
  onProfileIconError(event: Event): void {
    console.warn('Error loading profile icon, using default.');
    // Optionally, set a default icon path
    // (event.target as HTMLImageElement).src = 'path/to/default/icon.png';
  }

  updateRiotApiKey(): void {
    if (this.settingsForm.riotApiKey) {
      this.apiService.setRiotApiKey(this.settingsForm.riotApiKey).subscribe({
        next: () => {
          localStorage.setItem('riotApiKey', this.settingsForm.riotApiKey);
          this.addNotification('success', 'API Key Salva', 'Chave da API da Riot foi configurada com sucesso.');
        },
        error: (error: HttpErrorResponse) => {
          this.addNotification('error', 'Erro ao Salvar Chave', `Não foi possível configurar a chave da API: ${error.message}`);
        }
      });
    } else {
      this.addNotification('warning', 'Chave da API Ausente', 'Por favor, insira uma chave da API da Riot.');
    }
  }

  // Electron window controls
  minimizeWindow(): void {
    if (this.isElectron) {
      (window as any).electronAPI?.minimizeWindow();
    }
  }

  maximizeWindow(): void {
    if (this.isElectron) {
      (window as any).electronAPI?.maximizeWindow();
    }
  }

  closeWindow(): void {
    if (this.isElectron) {
      (window as any).electronAPI?.closeWindow();
    }
  }

  // Gameflow display text
  getGameflowDisplayText(phase: string): string {
    const phases: { [key: string]: string } = {
      'None': 'Fora do jogo',
      'Lobby': 'No lobby',
      'Matchmaking': 'Procurando partida',
      'ReadyCheck': 'Verificação de prontidão',
      'ChampSelect': 'Seleção de campeões',
      'GameStart': 'Iniciando jogo',
      'InProgress': 'Em jogo',
      'Reconnect': 'Reconectando',
      'WaitingForStats': 'Aguardando estatísticas',
      'PreEndOfGame': 'Fim de jogo',
      'EndOfGame': 'Jogo finalizado'
    };
    return phases[phase] || phase;
  }

  // Add getter for currentMatchData to be compatible with CustomPickBanComponent
  get currentMatchData() {
    if (!this.draftData) return null;

    return {
      id: this.draftData.matchId,
      team1: this.draftData.blueTeam || [],
      team2: this.draftData.redTeam || []
    };
  }

  // Método de teste para simular draft phase
  testDraftPhase() {
    console.log('🧪 Testando fase de draft...');

    // Simular dados de uma partida
    this.draftData = {
      matchId: 'test_match_' + Date.now(),
      blueTeam: [
        { id: 1, summonerName: 'TestPlayer', name: 'TestPlayer' },
        { id: -1, summonerName: 'Bot1', name: 'Bot1' },
        { id: -2, summonerName: 'Bot2', name: 'Bot2' },
        { id: -3, summonerName: 'Bot3', name: 'Bot3' },
        { id: -4, summonerName: 'Bot4', name: 'Bot4' }
      ],
      redTeam: [
        { id: -5, summonerName: 'Bot5', name: 'Bot5' },
        { id: -6, summonerName: 'Bot6', name: 'Bot6' },
        { id: -7, summonerName: 'Bot7', name: 'Bot7' },
        { id: -8, summonerName: 'Bot8', name: 'Bot8' },
        { id: -9, summonerName: 'Bot9', name: 'Bot9' }
      ]
    };    // Definir player atual
    if (!this.currentPlayer) {
      this.currentPlayer = {
        id: 1,
        summonerName: 'TestPlayer',
        region: 'br1',
        summonerLevel: 30,
        currentMMR: 1200
      };
    }

    this.inDraftPhase = true;
    this.draftPhase = 'pickban';

    console.log('✅ Draft phase simulado ativado');
    this.addNotification('info', 'Teste', 'Draft phase ativado para teste');
  }
}
