import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subject, takeUntil } from 'rxjs';
import { HttpErrorResponse } from '@angular/common/http';

import { DashboardComponent } from './components/dashboard/dashboard';
import { QueueComponent } from './components/queue/queue';
import { MatchHistoryComponent } from './components/match-history/match-history';
import { LeaderboardComponent } from './components/leaderboard/leaderboard';
import { MatchFoundComponent, MatchFoundData } from './components/match-found/match-found';
import { CustomPickBanComponent } from './components/custom-pick-ban/custom-pick-ban';
import { GameInProgressComponent } from './components/game-in-progress/game-in-progress';
import { ApiService } from './services/api';
import { QueueStateService } from './services/queue-state';
import { DiscordIntegrationService } from './services/discord-integration.service';
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
    LeaderboardComponent,
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
  currentView: 'dashboard' | 'queue' | 'history' | 'leaderboard' | 'settings' = 'dashboard';
  isElectron = false;
  isConnected = false;
  isInQueue = false;
  currentQueueType: 'centralized' | 'discord' | null = null;

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
    riotApiKey: '',
    discordBotToken: ''
  };

  // Status do Discord
  discordStatus = {
    isConnected: false,
    botUsername: '',
    queueSize: 0,
    activeMatches: 0,
    inChannel: false
  };

  private destroy$ = new Subject<void>(); constructor(
    private apiService: ApiService,
    private queueStateService: QueueStateService,
    private discordService: DiscordIntegrationService
  ) {
    this.isElectron = !!(window as any).electronAPI;
  }
  ngOnInit(): void {
    this.isElectron = !!(window as any).electronAPI;

    console.log('🚀 [APP] Iniciando aplicação...');

    // Carregar configurações do banco de dados primeiro
    this.loadConfigFromDatabase();

    // Iniciar verificações de status primeiro
    this.startLCUStatusCheck();
    this.startQueueStatusCheck();

    // Configurar listener do status do Discord
    this.setupDiscordStatusListener();

    // Assinar eventos de partida encontrada (match_found)
    this.discordService.onMatchFound().pipe(takeUntil(this.destroy$)).subscribe((matchData) => {
      if (matchData) {
        console.log('[WebSocket] Mensagem recebida:', matchData);

        // Verificar se é um cancelamento de partida
        if (matchData.type === 'match_cancelled') {
          console.log('[WebSocket] Partida cancelada:', matchData);
          this.showMatchFound = false;
          this.matchFoundData = null;
          this.inDraftPhase = false;
          this.draftData = null;

          const reason = matchData.reason || 'Partida cancelada';
          const declinedPlayer = matchData.declinedPlayer;
          const message = declinedPlayer
            ? `${reason} por ${declinedPlayer}`
            : reason;

          this.addNotification('info', 'Partida Cancelada', message);
          return;
        }

        // Verificar se é cancelamento de draft
        if (matchData.type === 'draft_cancelled') {
          console.log('[WebSocket] Draft cancelado:', matchData);
          this.showMatchFound = false;
          this.matchFoundData = null;
          this.inDraftPhase = false;
          this.draftData = null;

          const reason = matchData.reason || 'Draft cancelado';
          this.addNotification('info', 'Draft Cancelado', reason);
          return;
        }

        // Verificar se é cancelamento de partida em andamento
        if (matchData.type === 'game_cancelled') {
          console.log('[WebSocket] Partida em andamento cancelada:', matchData);
          this.showMatchFound = false;
          this.matchFoundData = null;
          this.inDraftPhase = false;
          this.draftData = null;
          this.inGamePhase = false;
          this.gameData = null;

          const reason = matchData.reason || 'Partida em andamento cancelada';
          this.addNotification('info', 'Partida Cancelada', reason);
          return;
        }

        // Verificar se é início do draft
        if (matchData.phase === 'draft_started') {
          console.log('[WebSocket] Fase de draft iniciada:', matchData);
          this.showMatchFound = false;
          this.matchFoundData = null;
          this.inDraftPhase = true;
          this.draftData = matchData;
          this.draftPhase = 'preview';
          this.addNotification('success', 'Draft Iniciado', 'A fase de draft começou!');
          return;
        }

        // Partida encontrada normal
        this.matchFoundData = matchData;
        this.showMatchFound = true;
        this.inDraftPhase = false;
        this.inGamePhase = false;
        console.log('[WebSocket] Partida encontrada:', matchData);
      }
    });

    // Aguardar um pouco para o LCU conectar e então carregar dados
    setTimeout(() => {
      this.loadPlayerData();
      this.recoverGameState();
      this.tryLoadRealPlayerData();
    }, 2000); // Aguardar 2 segundos para o LCU conectar
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  setCurrentView(view: 'dashboard' | 'queue' | 'history' | 'leaderboard' | 'settings'): void {
    this.currentView = view;
    console.log('View changed to:', view);
  }

  exitDraft(): void {
    console.log('🚪 Saindo do draft...');
    console.log('🔍 Draft data:', this.draftData);

    // Enviar mensagem de cancelamento de draft para o backend
    if (this.draftData?.matchId) {
      console.log('📤 Enviando cancelamento de draft para matchId:', this.draftData.matchId);
      this.discordService.sendWebSocketMessage({
        type: 'cancel_draft',
        data: {
          matchId: this.draftData.matchId,
          reason: 'Usuário saiu do draft'
        }
      });
    } else {
      console.warn('⚠️ Draft data não tem matchId:', this.draftData);
    }

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

    // Enviar mensagem de cancelamento de draft para o backend
    if (this.draftData?.matchId) {
      this.discordService.sendWebSocketMessage({
        type: 'cancel_draft',
        data: {
          matchId: this.draftData.matchId,
          reason: 'Draft cancelado pelo usuário'
        }
      });
    }

    this.inDraftPhase = false;
    this.draftData = null;
    this.draftPhase = 'preview';
    this.currentView = 'dashboard';
    this.addNotification('info', 'Draft Cancelado', 'O draft foi cancelado.');
  }

  startGamePhase(pickBanResult: any): void {
    console.log('🎮 Iniciando fase de jogo:', pickBanResult);
    console.log('🔍 Draft data antes de criar gameData:', this.draftData);
    console.log('🔍 Draft data matchId:', this.draftData?.matchId);

    this.inDraftPhase = false;
    this.draftPhase = 'preview';

    this.gameData = {
      sessionId: pickBanResult.sessionId || 'game_' + Date.now(),
      gameId: 'custom_' + Date.now(),
      team1: this.draftData?.team1 || this.draftData?.blueTeam || [],
      team2: this.draftData?.team2 || this.draftData?.redTeam || [],
      startTime: new Date(),
      pickBanData: pickBanResult,
      isCustomGame: true,
      originalMatchId: this.draftData?.matchId // Adicionar matchId do draft para cancelamento
    };

    console.log('🔍 Game data criado com originalMatchId:', this.gameData.originalMatchId);
    console.log('🔍 Tipo do originalMatchId:', typeof this.gameData.originalMatchId);

    this.updatePlayersWithChampions(pickBanResult);
    this.inGamePhase = true;
    this.persistGameState();

    console.log('✅ Dados do jogo preparados:', this.gameData);
  }

  private updatePlayersWithChampions(pickBanResult: any): void {
    if (!this.gameData || !pickBanResult.picks) return;

    console.log('🎯 [updatePlayersWithChampions] Iniciando mapeamento de campeões aos jogadores');
    console.log('📊 Pick/Ban result:', pickBanResult);

    // CORREÇÃO: Mapear campeões aos jogadores específicos que os escolheram
    // Buscar os picks com informações do jogador que escolheu
    const picksWithPlayerInfo = pickBanResult.picks || [];
    
    console.log('👥 Picks com informações de jogador:', picksWithPlayerInfo);

    // Mapear campeões aos jogadores do time azul (team1)
    this.gameData.team1.forEach((player: any, index: number) => {
      // Buscar o pick correspondente a este jogador
      const playerPick = picksWithPlayerInfo.find((pick: any) => {
        // Verificar se o pick é do time azul e corresponde ao jogador
        if (pick.team === 'blue') {
          // Se temos informação do jogador que escolheu
          if (pick.playerId && pick.playerId === player.id) {
            return true;
          }
          if (pick.playerName && pick.playerName === player.summonerName) {
            return true;
          }
          // Se não temos informação específica, usar ordem de index
          if (!pick.playerId && !pick.playerName) {
            return true; // Será filtrado por ordem
          }
        }
        return false;
      });

      if (playerPick && playerPick.champion) {
        player.champion = playerPick.champion;
        console.log(`✅ [Team1] ${player.summonerName} mapeado para ${playerPick.champion.name}`);
      } else {
        console.log(`⚠️ [Team1] ${player.summonerName} não encontrou pick correspondente`);
      }
    });

    // Mapear campeões aos jogadores do time vermelho (team2)
    this.gameData.team2.forEach((player: any, index: number) => {
      // Buscar o pick correspondente a este jogador
      const playerPick = picksWithPlayerInfo.find((pick: any) => {
        // Verificar se o pick é do time vermelho e corresponde ao jogador
        if (pick.team === 'red') {
          // Se temos informação do jogador que escolheu
          if (pick.playerId && pick.playerId === player.id) {
            return true;
          }
          if (pick.playerName && pick.playerName === player.summonerName) {
            return true;
          }
          // Se não temos informação específica, usar ordem de index
          if (!pick.playerId && !pick.playerName) {
            return true; // Será filtrado por ordem
          }
        }
        return false;
      });

      if (playerPick && playerPick.champion) {
        player.champion = playerPick.champion;
        console.log(`✅ [Team2] ${player.summonerName} mapeado para ${playerPick.champion.name}`);
      } else {
        console.log(`⚠️ [Team2] ${player.summonerName} não encontrou pick correspondente`);
      }
    });

    // Fallback: Se não conseguimos mapear por jogador específico, usar ordem sequencial
    const bluePicks = pickBanResult.blueTeamPicks || pickBanResult.picks.filter((p: any) => p.team === 'blue');
    const redPicks = pickBanResult.redTeamPicks || pickBanResult.picks.filter((p: any) => p.team === 'red');

    // Aplicar fallback para time azul
    this.gameData.team1.forEach((player: any, index: number) => {
      if (!player.champion && bluePicks[index] && bluePicks[index].champion) {
        player.champion = bluePicks[index].champion;
        console.log(`🔄 [Fallback Team1] ${player.summonerName} mapeado para ${bluePicks[index].champion.name} (por ordem)`);
      }
    });

    // Aplicar fallback para time vermelho
    this.gameData.team2.forEach((player: any, index: number) => {
      if (!player.champion && redPicks[index] && redPicks[index].champion) {
        player.champion = redPicks[index].champion;
        console.log(`🔄 [Fallback Team2] ${player.summonerName} mapeado para ${redPicks[index].champion.name} (por ordem)`);
      }
    });

    console.log('✅ [updatePlayersWithChampions] Mapeamento concluído');
    console.log('📊 Team1 com campeões:', this.gameData.team1.map((p: any) => ({ name: p.summonerName, champion: p.champion?.name })));
    console.log('📊 Team2 com campeões:', this.gameData.team2.map((p: any) => ({ name: p.summonerName, champion: p.champion?.name })));
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
    console.log('🔍 Game data completo:', this.gameData);
    console.log('🔍 Draft data:', this.draftData);
    
    // Enviar mensagem de cancelamento de partida em andamento para o backend
    if (this.gameData?.originalMatchId) {
      console.log('📤 Enviando cancelamento de partida em andamento para matchId:', this.gameData.originalMatchId);
      console.log('📤 Tipo do originalMatchId:', typeof this.gameData.originalMatchId);
      this.discordService.sendWebSocketMessage({
        type: 'cancel_game_in_progress',
        data: {
          matchId: this.gameData.originalMatchId,
          reason: 'Partida cancelada pelo usuário'
        }
      });
    } else {
      console.warn('⚠️ Game data não tem originalMatchId:', this.gameData);
      console.warn('⚠️ Draft data tem matchId?', this.draftData?.matchId);
    }
    
    // CORREÇÃO: Seguir a mesma estrutura do onPickBanCancel
    this.inGamePhase = false;
    this.gameData = null;
    this.currentView = 'dashboard';
    this.clearGameState();
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
      // Corrigir: sempre usar o nome completo do invocador (Riot ID)
      const playerIdentifier = this.currentPlayer?.summonerName && this.currentPlayer?.tagLine
        ? `${this.currentPlayer.summonerName}#${this.currentPlayer.tagLine}`
        : this.currentPlayer?.summonerName || '';

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
          // Se for o usuário logado, usar Riot ID completo
          if (this.currentPlayer &&
            (player.summonerName === this.currentPlayer.summonerName ||
              player.id === this.currentPlayer.id)) {
            const currentPlayerName = this.currentPlayer.summonerName;
            const currentPlayerTagLine = this.currentPlayer.tagLine;
            return currentPlayerTagLine ? `${currentPlayerName}#${currentPlayerTagLine}` : currentPlayerName;
          }
          return player.id?.toString() || player.summonerName || player.toString();
        }),
        team2Players: gameResult.team2.map((player: any) => {
          // Garantir que temos um identificador válido
          // Se for o usuário logado, usar Riot ID completo
          if (this.currentPlayer &&
            (player.summonerName === this.currentPlayer.summonerName ||
              player.id === this.currentPlayer.id)) {
            const currentPlayerName = this.currentPlayer.summonerName;
            const currentPlayerTagLine = this.currentPlayer.tagLine;
            return currentPlayerTagLine ? `${currentPlayerName}#${currentPlayerTagLine}` : currentPlayerName;
          }
          return player.id?.toString() || player.summonerName || player.toString();
        }),
        createdBy: (() => {
          if (this.currentPlayer) {
            const currentPlayerName = this.currentPlayer.summonerName;
            const currentPlayerTagLine = this.currentPlayer.tagLine;
            return currentPlayerTagLine ? `${currentPlayerName}#${currentPlayerTagLine}` : currentPlayerName;
          }
          return '1';
        })(),
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
      let winner: 'blue' | 'red' | null = null;      // Try to extract winner from LCU data
      if (lcuGameData.details && lcuGameData.details.teams) {
        // LCU teams use string values: "Win" or "Fail"
        const winningTeam = lcuGameData.details.teams.find((team: any) => team.win === "Win" || team.win === true);
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
    // Método removido - não é mais necessário
  }

  private loadPlayerData(): void {
    const savedPlayer = localStorage.getItem('currentPlayer');
    if (savedPlayer) {
      try {
        this.currentPlayer = JSON.parse(savedPlayer);
      } catch (error) {
        console.log('Erro ao carregar dados do jogador do localStorage');
      }
    }
  }

  // Métodos de fila
  async joinQueue(preferences?: QueuePreferences): Promise<void> {
    if (!this.currentPlayer) {
      this.addNotification('error', 'Erro', 'Nenhum jogador carregado');
      return;
    }

    try {
      console.log('🎯 Entrando na fila com preferências:', preferences);
      this.isInQueue = true;
      this.currentQueueType = 'centralized';

      // PRIMEIRO: Entrar na fila centralizada via API HTTP
      const playerData = {
        summonerName: this.currentPlayer.summonerName,
        summonerId: this.currentPlayer.summonerId,
        puuid: this.currentPlayer.puuid,
        region: this.currentPlayer.region || 'br1',
        gameName: this.currentPlayer.gameName,
        tagLine: this.currentPlayer.tagLine
      };

      console.log('📡 Enviando dados para API HTTP:', playerData);

      const response = await this.apiService.joinQueue(playerData, preferences).toPromise();
      console.log('✅ Resposta da API HTTP:', response);

      if (response && response.success) {
        this.addNotification('success', 'Na Fila', 'Você entrou na fila centralizada!');

        // Atualizar status da fila
        this.queueStatus = response.queueStatus || this.queueStatus;

        // SEGUNDO: Se Discord estiver disponível, entrar também na fila Discord
        if (this.discordService.isConnected() && this.discordService.isInChannel()) {
          const primaryLane = preferences?.primaryLane || 'fill';
          const secondaryLane = preferences?.secondaryLane || 'fill';
          const discordSuccess = this.discordService.joinDiscordQueue(
            primaryLane,
            secondaryLane,
            this.currentPlayer.summonerName || 'Unknown',
            {
              gameName: this.currentPlayer.gameName || '',
              tagLine: this.currentPlayer.tagLine || ''
            }
          );

          if (discordSuccess) {
            this.addNotification('info', 'Discord', 'Também conectado à fila Discord!');
            this.currentQueueType = 'discord';
          }
        }
      } else {
        this.addNotification('error', 'Erro', 'Falha ao entrar na fila centralizada');
        this.isInQueue = false;
      }
    } catch (error) {
      console.error('❌ Erro ao entrar na fila:', error);
      this.addNotification('error', 'Erro', 'Falha ao entrar na fila');
      this.isInQueue = false;
    }
  }

  async joinDiscordQueueWithFullData(data: { player: Player | null, preferences: QueuePreferences }): Promise<void> {
    if (!data.player) {
      this.addNotification('error', 'Erro', 'Dados do jogador não encontrados');
      return;
    }

    try {
      console.log('🎮 Entrando na fila Discord com dados completos:', data);
      this.isInQueue = true;
      this.currentQueueType = 'discord';

      // Usar o DiscordService para entrar na fila Discord
      const primaryLane = data.preferences?.primaryLane || 'fill';
      const secondaryLane = data.preferences?.secondaryLane || 'fill';
      const success = this.discordService.joinDiscordQueue(
        primaryLane,
        secondaryLane,
        data.player.summonerName || 'Unknown',
        {
          gameName: data.player.gameName || '',
          tagLine: data.player.tagLine || ''
        }
      );

      if (success) {
        this.addNotification('success', 'Na Fila Discord', 'Você entrou na fila Discord!');
      } else {
        this.addNotification('error', 'Erro', 'Falha ao entrar na fila Discord');
        this.isInQueue = false;
      }
    } catch (error) {
      console.error('❌ Erro ao entrar na fila Discord:', error);
      this.addNotification('error', 'Erro', 'Falha ao entrar na fila Discord');
      this.isInQueue = false;
    }
  }

  async leaveQueue(): Promise<void> {
    try {
      console.log('👋 Saindo da fila');

      // PRIMEIRO: Tentar sair via WebSocket (tempo real)
      if (this.discordService.isConnected() && this.discordService.isInChannel()) {
        console.log('📡 Enviando saída via WebSocket (tempo real)...');
        this.discordService.leaveDiscordQueue();
      }

      // SEGUNDO: Sair da fila centralizada via API HTTP (fallback)
      let httpSuccess = false;

      // Construir o nome completo (gameName#tagLine)
      const fullSummonerName = this.currentPlayer?.gameName && this.currentPlayer?.tagLine
        ? `${this.currentPlayer.gameName}#${this.currentPlayer.tagLine}`
        : this.currentPlayer?.summonerName;

      console.log('🔍 [App] Nome completo para sair da fila:', fullSummonerName);

      if (this.currentPlayer?.id) {
        console.log('📡 Enviando saída para API HTTP por ID...');
        try {
          const response = await this.apiService.leaveQueue(this.currentPlayer.id).toPromise();
          console.log('✅ Resposta da saída da API por ID:', response);

          if (response && response.success) {
            this.queueStatus = response.queueStatus || this.queueStatus;
            httpSuccess = true;
          }
        } catch (error) {
          console.log('⚠️ Erro ao sair por ID, tentando por nome completo...');
        }
      }

      // TERCEIRO: Fallback por nome completo (gameName#tagLine) se ID falhou ou não existe
      if (!httpSuccess && fullSummonerName) {
        console.log('📡 Enviando saída por nome completo (gameName#tagLine)...');
        try {
          const response = await this.apiService.leaveQueue(undefined, fullSummonerName).toPromise();
          console.log('✅ Resposta da saída da API por nome completo:', response);

          if (response && response.success) {
            this.queueStatus = response.queueStatus || this.queueStatus;
            httpSuccess = true;
          }
        } catch (error) {
          console.log('⚠️ Erro ao sair por nome completo também:', error);
        }
      }

      // QUARTO: Limpar estado local (sempre)
      this.isInQueue = false;
      this.currentQueueType = null;

      if (httpSuccess) {
        this.addNotification('success', 'Saiu da Fila', 'Você saiu da fila com sucesso');
      } else {
        this.addNotification('info', 'Saiu da Fila', 'Você saiu da fila (estado local limpo)');
      }
    } catch (error) {
      console.error('❌ Erro ao sair da fila:', error);
      this.addNotification('error', 'Erro', 'Falha ao sair da fila');

      // Mesmo com erro, limpar estado local
      this.isInQueue = false;
      this.currentQueueType = null;
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
    const confirmed = confirm('⚠️ ATENÇÃO: Esta ação irá DELETAR TODAS as partidas da tabela custom_matches.\n\nIsso inclui:\n- TODAS as partidas customizadas\n- Partidas reais e de teste\n- Histórico completo de partidas\n\nEsta ação NÃO PODE ser desfeita.\n\nDeseja continuar?');

    if (!confirmed) {
      return;
    }

    try {
      this.addNotification('info', 'Limpando Banco', 'Removendo TODAS as partidas da tabela custom_matches...');
      console.log('🧹 Iniciando limpeza COMPLETA da tabela custom_matches');

      const response = await this.apiService.cleanupTestMatches().toPromise();
      console.log('✅ Resposta da limpeza:', response);

      if (response && response.success) {
        this.addNotification('success', 'Limpeza Concluída',
          `✅ ${response.deletedCount} partidas removidas! Tabela custom_matches completamente limpa.`);

        console.log(`📊 Limpeza completa concluída: ${response.deletedCount} deletadas, ${response.remainingMatches} restantes`);

        if (response.deletedMatches && response.deletedMatches.length > 0) {
          console.log('🗑️ Exemplos de partidas deletadas:');
          response.deletedMatches.slice(0, 5).forEach((match: any, i: number) => {
            console.log(`${i + 1}. ID ${match.id}: ${match.title || 'Sem título'} - ${match.reasons?.join(', ')}`);
          });
        }
      } else {
        this.addNotification('warning', 'Limpeza Sem Resultado', 'Nenhuma partida foi encontrada para remoção.');
      }

    } catch (error) {
      console.error('❌ Erro ao limpar partidas:', error);
      this.addNotification('error', 'Erro na Limpeza', 'Erro ao limpar partidas do banco de dados');
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
    } try {
      this.addNotification('info', 'Buscando Partida', 'Procurando sua última partida customizada REAL do LCU...');

      console.log('Player ID para simulação:', this.currentPlayer.id);
      console.log('Player data completo:', this.currentPlayer);

      // PRIMEIRA TENTATIVA: Buscar partidas customizadas REAIS do LCU
      const lcuMatches = await this.apiService.getLCUMatchHistoryAll(0, 30, true).toPromise();
      console.log('🎮 Partidas customizadas do LCU:', lcuMatches);

      if (lcuMatches && lcuMatches.success && lcuMatches.matches && lcuMatches.matches.length > 0) {
        // Encontrou partidas customizadas reais no LCU
        const lastLCUMatch = lcuMatches.matches[0];
        console.log('✅ Partida customizada REAL encontrada no LCU:', lastLCUMatch);

        this.addNotification('success', 'Partida LCU Encontrada', 'Usando partida customizada real do seu histórico do LoL!');
        this.simulateMatchFromLCUData(lastLCUMatch);
        return;
      }      // SEGUNDA TENTATIVA: Buscar no banco interno - PRIMEIRO tentar método mais direto
      console.log('⚠️ Nenhuma partida customizada encontrada no LCU, buscando no banco interno...');

      // Para o usuário especial "popcorn seller#coup", usar ID numérico 1
      let playerIdForSearch = this.currentPlayer.id.toString();
      if (this.currentPlayer?.summonerName === 'popcorn seller' && this.currentPlayer?.tagLine === 'coup') {
        playerIdForSearch = '1'; // Usar ID numérico conhecido
        console.log('🎯 Usando ID numérico especial para popcorn seller:', playerIdForSearch);
      }      // TENTATIVA 2A: Usar método direto getCustomMatches (mais eficiente)
      try {
        console.log('🎯 Tentando buscar última partida customizada diretamente...');
        const lastMatchResponse = await this.apiService.getCustomMatches(playerIdForSearch, 0, 1).toPromise();

        if (lastMatchResponse && lastMatchResponse.matches && lastMatchResponse.matches.length > 0) {
          const lastMatch = lastMatchResponse.matches[0];

          // Verificar se é uma partida REAL (não de teste)
          const isRealMatch = this.isRealCustomMatch(lastMatch);

          if (isRealMatch) {
            console.log('✅ Última partida customizada REAL encontrada diretamente:', lastMatch);
            this.addNotification('success', 'Partida Encontrada', 'Usando sua última partida customizada real!');
            this.simulateMatchFromData(lastMatch);
            return;
          } else {
            console.log('⚠️ Última partida encontrada é de teste, buscando mais partidas...');
          }
        }
      } catch (error) {
        console.log('❌ Erro ao buscar última partida diretamente:', error);
      }

      // TENTATIVA 2B: Buscar mais partidas para filtrar (fallback)
      const response = await this.apiService.getCustomMatches(playerIdForSearch, 0, 20).toPromise();
      console.log('🔍 Resposta da busca no banco interno (fallback):', response); if (!response || !response.matches || response.matches.length === 0) {
        this.addNotification('warning', 'Sem Histórico', 'Você ainda não jogou nenhuma partida customizada real. Para testar a detecção de vencedor, jogue uma partida customizada no LoL primeiro.');
        console.log('❌ Nenhuma partida encontrada no banco interno.');
        return;
      }      // Filtrar partidas REAIS (não partidas de exemplo/teste)      // Filtrar partidas REAIS (não partidas de exemplo/teste) usando método helper
      const realMatches = response.matches.filter((match: any) => this.isRealCustomMatch(match));

      console.log(`📊 Partidas filtradas: ${realMatches.length} reais de ${response.matches.length} totais`); if (realMatches.length === 0) {
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

    const sampleResponse = await this.apiService.getCustomMatches(playerIdForSearch, 0, 1).toPromise();
    console.log('✨ Resposta da criação de partida de exemplo:', sampleResponse);

    if (!sampleResponse || !sampleResponse.success) {
      this.addNotification('error', 'Erro', 'Erro ao criar partida de exemplo');
      return;
    }

    // Buscar novamente após criar a partida
    const newResponse = await this.apiService.getCustomMatches(playerIdForSearch, 0, 1).toPromise();
    console.log('🔍 Resposta da segunda busca após criação:', newResponse);

    if (!newResponse || !newResponse.matches || newResponse.matches.length === 0) {
      this.addNotification('error', 'Erro', 'Falha ao buscar partida após criação');
      console.error('❌ Falha na segunda busca. NewResponse:', newResponse);
      return;
    }

    this.simulateMatchFromData(newResponse.matches[0]);
  } private simulateMatchFromData(matchData: any): void {
    console.log('🎮 Simulando partida com dados REAIS:', matchData);  // Processar dados dos teams corretamente (podem ser strings ou números)

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
  } private convertLCUMatchToInternalFormat(lcuMatch: any): any {
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

      console.log(`✅ Nome final do jogador ${index + 1}: "${playerName}"`); const playerId = participant.summonerId || participant.participantId || playerName;
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
      } if (participant.teamId === 100) {
        team1Players.push(playerName); // Usar nome real ao invés de ID genérico
        team1Picks.push({
          champion: championName,
          player: playerName, // Usar nome real
          lane: friendlyLane,
          championId: championId
        });
      } else if (participant.teamId === 200) {
        team2Players.push(playerName); // Usar nome real ao invés de ID genérico
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
    // LCU teams use string values: "Win" or "Fail"
    const winningTeam = teams.find(team => team.win === "Win" || team.win === true);
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
  } async onDeclineMatch(matchId: number): Promise<void> {
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
            this.addNotification('success', 'LoL Cliente', 'Conectado ao cliente do League of Legends'); if (status.summoner) {
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
  } private async tryAutoLoadCurrentPlayer(): Promise<void> {
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
  } private async tryLoadRealPlayerData(): Promise<void> {
    console.log('🚀 Starting intelligent player data loading...');

    // Strategy 1: Always try LCU first (primary data source)
    if (this.lcuStatus.isConnected) {
      console.log('🎮 LCU connected, loading from League Client...');

      try {
        // Use the LCU-focused endpoint
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
    } else {
      // Strategy 2: LCU not available, try fallback options
      console.log('📱 LCU not available, trying fallback options...');

      // Tentar novamente em 5 segundos se o LCU não estiver conectado
      setTimeout(() => {
        if (!this.currentPlayer) {
          console.log('🔄 Tentando carregar dados novamente...');
          this.tryLoadRealPlayerData();
        }
      }, 5000);

      this.handleLCUDataFailure(new Error('LCU not connected'));
    }
  }

  private handleLCUDataFailure(error: Error): void {
    // Check for specific error types and provide appropriate feedback
    if (error.message.includes('Cliente do LoL não conectado') || error.message.includes('LCU')) {
      this.addNotification('info', 'LoL Cliente Offline', 'Conecte-se ao League of Legends para dados automáticos');
    } else if (error.message.includes('Jogador não encontrado') || error.message.includes('não encontrado')) {
      this.addNotification('info', 'Dados Não Encontrados', 'Configure manualmente nas configurações');
    }

    // Try fallback options
    this.tryLoadFromLocalStorage();
  }

  private fallbackToStorageOrMock(): void {
    // If no real data available and no stored data, create mock data for testing
    if (!this.currentPlayer) {
      this.createMockPlayer();
    }
  } private mapRealDataToPlayer(realData: any): Player {
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
    }    // Verificar se temos gameName e tagLine para formar o Riot ID
    if (!this.currentPlayer.summonerName || !this.currentPlayer.tagLine || !this.currentPlayer.region) {
      this.addNotification('error', 'Dados Incompletos', 'Nome de invocador, tag ou região não encontrados para atualização via Riot ID.');

      // Log detalhado para debug
      console.log('🔍 Debug - Detecção do ambiente:', {
        isElectron: this.apiService.isElectron(),
        userAgent: navigator.userAgent,
        hasElectronAPI: !!(window as any).electronAPI,
        hasRequire: !!(window as any).require,
        hasProcess: !!(window as any).process?.type,
        currentPlayer: this.currentPlayer
      });

      // SEMPRE usar LCU quando possível (tanto Electron quanto web com LCU disponível)
      if (this.lcuStatus.isConnected) {
        this.addNotification('info', 'Modo LCU', 'Usando apenas dados do LCU (sem necessidade de Riot API).');
        this.refreshPlayerFromLCUOnly();
      } else {
        // Só tentar Riot API se realmente não temos LCU E não estamos no Electron
        if (this.apiService.isElectron()) {
          this.addNotification('error', 'LCU Necessário', 'No Electron, é necessário estar conectado ao LCU. Abra o League of Legends.');
        } else if (this.currentPlayer.puuid && this.currentPlayer.region) {
          this.addNotification('info', 'Tentativa Alternativa', 'Tentando atualizar via PUUID...');
          this.refreshPlayerByPuuidFallback(); // Só em modo web sem LCU
        } else {
          this.addNotification('error', 'Falha na Atualização', 'Não foi possível atualizar os dados do jogador.');
        }
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

    // Se está no Electron ou LCU disponível, usar apenas LCU
    if (this.apiService.isElectron() || this.lcuStatus.isConnected) {
      console.log('🎮 Fallback PUUID redirecionado para LCU (Electron ou LCU disponível)');
      this.refreshPlayerFromLCUOnly();
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

  // Método para atualizar dados usando apenas LCU (sem Riot API)
  private async refreshPlayerFromLCUOnly(): Promise<void> {
    try {
      this.apiService.getPlayerFromLCU().subscribe({
        next: (lcuPlayer: Player) => {
          this.currentPlayer = lcuPlayer;
          localStorage.setItem('currentPlayer', JSON.stringify(this.currentPlayer));
          this.addNotification('success', 'Dados Atualizados (LCU)', 'Informações do jogador atualizadas usando apenas dados do LCU.');
          console.log('Player data refreshed from LCU only:', this.currentPlayer);
        },
        error: (error) => {
          console.error('Error refreshing player data from LCU only:', error);
          this.addNotification('error', 'Erro LCU', error.message || 'Falha ao atualizar dados do jogador via LCU.');
        }
      });
    } catch (error: any) {
      console.error('Unexpected error in refreshPlayerFromLCUOnly:', error);
      this.addNotification('error', 'Erro Inesperado (LCU)', error.message || 'Ocorreu um erro inesperado ao tentar via LCU.');
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
    console.log('🔄 Iniciando verificação de status do LCU...');

    // Verificar status inicial
    this.checkLCUStatus();

    // Verificar a cada 60 segundos (reduzido de 30 para 60)
    setInterval(() => {
      this.checkLCUStatus();
    }, 60000);
  }

  private checkLCUStatus(): void {
    this.apiService.getLCUStatus().subscribe({
      next: (status) => {
        const wasConnected = this.lcuStatus.isConnected;
        this.lcuStatus = status;

        if (status.isConnected) {
          console.log('✅ LCU conectado:', status.isConnected);

          // Se acabou de conectar e não temos dados do jogador, carregar
          if (!wasConnected && !this.currentPlayer) {
            console.log('🎯 LCU acabou de conectar, carregando dados do jogador...');
            setTimeout(() => {
              this.tryLoadRealPlayerData();
            }, 1000); // Aguardar 1 segundo para estabilizar
          }
        } else {
          console.warn('❌ LCU desconectado');
        }
      },
      error: (error) => {
        this.lcuStatus = { isConnected: false };
        console.warn('❌ LCU desconectado:', error.message);
      }
    });
  }

  private startQueueStatusCheck(): void {
    console.log('🔄 Iniciando verificação de status da fila via WebSocket...');

    // Verificar apenas conexão inicial do backend (sem polling)
    this.checkBackendConnection();

    // NÃO fazer polling de status da fila - WebSocket já fornece atualizações em tempo real
    // Removido setInterval que fazia requisições HTTP desnecessárias
    console.log('✅ Status da fila será atualizado via WebSocket em tempo real');
  }

  private checkBackendConnection(): void {
    this.apiService.checkHealth().subscribe({
      next: (response) => {
        this.isConnected = true;
        console.log('✅ Backend conectado');
      },
      error: (error) => {
        this.isConnected = false;
        console.warn('❌ Backend desconectado:', error.message);
      }
    });
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
  updateDiscordBotToken(): void {
    const token = this.settingsForm.discordBotToken?.trim();

    if (!token) {
      this.addNotification('error', 'Token Vazio', 'Por favor, insira um token do Discord Bot');
      return;
    }

    // Validar formato do token do Discord Bot
    const tokenRegex = /^[A-Za-z0-9_-]{23,28}\.[A-Za-z0-9_-]{6,7}\.[A-Za-z0-9_-]{27,}$/;
    if (!tokenRegex.test(token)) {
      this.addNotification('error', 'Token Inválido',
        'Formato de token incorreto. Verifique se você copiou o token correto do Discord Developer Portal.');
      return;
    }

    console.log('🤖 Salvando token do Discord Bot...');

    this.apiService.setDiscordBotToken(token).subscribe({
      next: (response) => {
        console.log('✅ Token do Discord salvo:', response);

        if (response.success) {
          this.addNotification('success', 'Token Salvo', 'Token do Discord Bot salvo com sucesso!');

          // Atualizar status do Discord
          this.checkDiscordStatus();

          // Limpar campo após salvar
          this.settingsForm.discordBotToken = '';
        } else {
          this.addNotification('error', 'Erro', response.error || 'Falha ao salvar token');
        }
      },
      error: (error) => {
        console.error('❌ Erro ao salvar token do Discord:', error);

        let errorMessage = 'Erro ao salvar token';
        if (error.message?.includes('TokenInvalid')) {
          errorMessage = 'Token inválido. Verifique se você copiou o token correto do Discord Developer Portal.';
        } else if (error.message?.includes('DisallowedIntents')) {
          errorMessage = 'Bot sem permissões. Ative "Server Members Intent" no Discord Developer Portal.';
        }

        this.addNotification('error', 'Erro do Discord', errorMessage);
      }
    });
  }

  checkDiscordStatus(): void {
    console.log('🔍 [App] Verificando status do Discord via API HTTP...');

    this.apiService.getDiscordStatus().subscribe({
      next: (response) => {
        console.log('📡 [App] Status do Discord recebido via API:', response);

        const newStatus = {
          isConnected: response.isConnected || false,
          botUsername: response.botUsername || 'Não conectado',
          queueSize: response.queueSize || 0,
          activeMatches: response.activeMatches || 0,
          inChannel: response.inChannel || false
        };

        // Verificar se houve mudança significativa
        const statusChanged =
          this.discordStatus.isConnected !== newStatus.isConnected ||
          this.discordStatus.botUsername !== newStatus.botUsername;

        if (statusChanged) {
          console.log('🔄 [App] Status Discord mudou:', {
            old: this.discordStatus,
            new: newStatus
          });
        }

        this.discordStatus = newStatus;
        console.log('✅ [App] Status Discord atualizado:', this.discordStatus);

        // Dar feedback específico baseado no status
        if (this.discordStatus.isConnected) {
          console.log('✅ [App] Discord conectado:', this.discordStatus.botUsername);

          if (this.discordStatus.inChannel) {
            this.addNotification('success', 'Discord Pronto',
              `Bot conectado como ${this.discordStatus.botUsername}. Entre no canal #lol-matchmaking para usar a fila!`);
          } else {
            this.addNotification('info', 'Discord Conectado',
              `Bot conectado como ${this.discordStatus.botUsername}. Entre no canal #lol-matchmaking para ativar a funcionalidade.`);
          }
        } else {
          console.log('❌ [App] Discord não conectado');

          // Verificar se há token salvo
          this.apiService.getConfigSettings().subscribe({
            next: (config) => {
              if (config.discordBotToken) {
                this.addNotification('warning', 'Discord Desconectado',
                  'Bot configurado mas não conectado. Verifique se o token está correto e se o bot tem as permissões necessárias.');
              } else {
                this.addNotification('info', 'Discord Não Configurado',
                  'Configure o token do Discord Bot nas configurações para usar a funcionalidade Discord.');
              }
            },
            error: () => {
              this.addNotification('info', 'Discord Não Configurado',
                'Configure o token do Discord Bot nas configurações para usar a funcionalidade Discord.');
            }
          });
        }
      },
      error: (error) => {
        console.error('❌ [App] Erro ao verificar status do Discord:', error);

        this.discordStatus = {
          isConnected: false,
          botUsername: 'Erro de conexão',
          queueSize: 0,
          activeMatches: 0,
          inChannel: false
        };

        let errorMessage = 'Erro ao verificar status do Discord';
        if (error.message?.includes('TokenInvalid')) {
          errorMessage = 'Token do Discord inválido. Configure um token válido nas configurações.';
        } else if (error.message?.includes('DisallowedIntents')) {
          errorMessage = 'Bot sem permissões. Ative "Server Members Intent" no Discord Developer Portal.';
        }

        this.addNotification('error', 'Erro do Discord', errorMessage);
      }
    });
  }

  // Adicionar listener para atualizações automáticas do Discord
  private setupDiscordStatusListener(): void {
    console.log('🔧 [APP] Configurando listener do Discord...');

    // Verificação inicial do status do Discord via API HTTP (apenas uma vez)
    this.checkDiscordStatus();

    // Verificação periódica do status (a cada 120 segundos) via API HTTP (reduzido para evitar conflitos)
    setInterval(() => {
      console.log('🔄 [App] Verificação periódica do status do Discord...');
      this.checkDiscordStatus();
    }, 120000); // 2 minutos em vez de 1 minuto

    // Listener para mudanças via WebSocket (principal fonte de atualizações)
    this.discordService.onConnectionChange().subscribe(isConnected => {
      console.log('🔗 [App] Status Discord alterado via WebSocket:', isConnected);

      // Atualizar status local baseado no WebSocket (mais confiável para mudanças em tempo real)
      this.discordStatus.isConnected = isConnected;

      // Só fazer verificação HTTP se houver mudança significativa
      if (this.discordStatus.isConnected !== isConnected) {
        console.log('🔄 [App] Mudança detectada via WebSocket, verificando via API HTTP...');
        // Fazer uma verificação rápida via API HTTP para confirmar
        setTimeout(() => {
          this.checkDiscordStatus();
        }, 5000); // Aguardar 5 segundos para evitar spam
      }
    });

    // NOVO: Listener para atualizações da fila em tempo real
    this.discordService.onQueueUpdate().subscribe(queueData => {
      console.log('🎯 [App] Fila atualizada via WebSocket:', queueData?.playersInQueue || 0, 'jogadores');

      if (queueData) {
        // Atualizar estado da fila em tempo real
        this.queueStatus = {
          ...this.queueStatus,
          ...queueData,
          playersInQueue: queueData.playersInQueue || 0,
          playersInQueueList: queueData.playersInQueueList || [],
          recentActivities: queueData.recentActivities || [],
          averageWaitTime: queueData.averageWaitTime || 0,
          estimatedMatchTime: queueData.estimatedMatchTime || 0,
          isActive: queueData.isActive !== undefined ? queueData.isActive : this.queueStatus.isActive
        };

        console.log('✅ [App] Estado da fila atualizado em tempo real:', {
          playersInQueue: this.queueStatus.playersInQueue,
          playersList: this.queueStatus.playersInQueueList?.map(p => p.summonerName),
          timestamp: new Date().toISOString()
        });
      }
    });

    // Verificação inicial após 5 segundos (reduzido para evitar conflitos)
    setTimeout(() => {
      console.log('🔍 [App] Verificação inicial do Discord após delay...');
      this.checkDiscordStatus();
    }, 5000);
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

    console.log('🔍 [currentMatchData] draftData disponível:', this.draftData);
    console.log('🔍 [currentMatchData] Propriedades:', Object.keys(this.draftData));

    return {
      id: this.draftData.matchId,
      team1: this.draftData.team1 || this.draftData.blueTeam || [],
      team2: this.draftData.team2 || this.draftData.redTeam || []
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

  // Método helper para verificar se uma partida customizada é real (não de teste)
  private isRealCustomMatch(match: any): boolean {
    if (!match) return false;

    try {
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
      const isExampleMatch = hasTestMatchId || allNegativeIds || (isIncomplete && isVeryRecent);

      console.log(`🔍 Verificando se partida ${match.id} é real:`, {
        matchId: matchId,
        team1Count: team1Players.length,
        team2Count: team2Players.length,
        allNegativeIds,
        hasTestMatchId,
        isVeryRecent,
        isIncomplete,
        isExampleMatch: isExampleMatch,
        winnerTeam: match.winner_team,
        isReal: !isExampleMatch
      });

      return !isExampleMatch; // Retornar true se NÃO for partida de exemplo
    } catch (error) {
      console.warn('⚠️ Erro ao analisar partida:', error);
      return false; // Em caso de erro, considerar como não-real para segurança
    }
  }

  // Novo método para carregar configurações do banco de dados
  private loadConfigFromDatabase(): void {
    console.log('🔍 Carregando configurações do banco de dados...');

    this.apiService.getConfigSettings().subscribe({
      next: (response) => {
        if (response.success && response.settings) {
          console.log('✅ Configurações carregadas do banco de dados');

          // Configurar Riot API Key se existir no banco
          if (response.settings.riotApiKey && response.settings.riotApiKey.trim() !== '') {
            this.settingsForm.riotApiKey = response.settings.riotApiKey;
            this.apiService.setRiotApiKey(response.settings.riotApiKey).subscribe({
              next: () => {
                console.log('✅ Riot API Key configurada do banco de dados');
                // Atualizar localStorage como backup
                localStorage.setItem('riotApiKey', response.settings.riotApiKey);
              },
              error: (error: HttpErrorResponse) => {
                console.warn('⚠️ Falha ao configurar Riot API Key do banco:', error.message);
                // Fallback para localStorage
                this.loadRiotApiKeyFromLocalStorage();
              }
            });
          } else {
            // Fallback para localStorage se não existir no banco
            this.loadRiotApiKeyFromLocalStorage();
          }

          // Configurar Discord Bot Token se existir no banco
          if (response.settings.discordBotToken && response.settings.discordBotToken.trim() !== '') {
            this.settingsForm.discordBotToken = response.settings.discordBotToken;
            this.apiService.setDiscordBotToken(response.settings.discordBotToken).subscribe({
              next: () => {
                console.log('✅ Discord Bot Token configurado do banco de dados');
                // Atualizar localStorage como backup
                localStorage.setItem('discordBotToken', response.settings.discordBotToken);
                this.checkDiscordStatus();
              },
              error: (error: HttpErrorResponse) => {
                console.warn('⚠️ Falha ao configurar Discord Bot Token do banco:', error.message);
                // Fallback para localStorage
                this.loadDiscordTokenFromLocalStorage();
              }
            });
          } else {
            // Fallback para localStorage se não existir no banco
            this.loadDiscordTokenFromLocalStorage();
          }
        } else {
          console.warn('⚠️ Falha ao carregar configurações do banco, usando fallbacks');
          this.loadConfigFromFallbacks();
        }
      },
      error: (error: HttpErrorResponse) => {
        console.warn('⚠️ Erro ao carregar configurações do banco:', error.message);
        // Fallback para localStorage e .env
        this.loadConfigFromFallbacks();
      }
    });
  }

  // Método para carregar configurações dos fallbacks (localStorage + .env)
  private loadConfigFromFallbacks(): void {
    console.log('🔄 Carregando configurações dos fallbacks...');
    this.loadRiotApiKeyFromLocalStorage();
    this.loadDiscordTokenFromLocalStorage();
  }

  // Método para carregar Riot API Key do localStorage
  private loadRiotApiKeyFromLocalStorage(): void {
    const storedApiKey = localStorage.getItem('riotApiKey');
    if (storedApiKey) {
      this.settingsForm.riotApiKey = storedApiKey;
      this.apiService.setRiotApiKey(storedApiKey).subscribe({
        next: () => {
          console.log('✅ Riot API Key configurada do localStorage');
        },
        error: (error: HttpErrorResponse) => {
          console.warn('⚠️ Falha ao configurar Riot API Key do localStorage:', error.message);
          localStorage.removeItem('riotApiKey');
          this.settingsForm.riotApiKey = '';
        }
      });
    } else {
      console.log('ℹ️ Nenhuma Riot API Key encontrada nos fallbacks');
    }
  }

  // Método para carregar Discord Bot Token do localStorage
  private loadDiscordTokenFromLocalStorage(): void {
    const token = localStorage.getItem('discordBotToken');
    if (token) {
      this.settingsForm.discordBotToken = token;
      console.log('🔑 [APP] Discord Bot Token carregado do localStorage');
    }
  }

  // Função para verificar se é usuário especial (desenvolvedor, admin, etc.)
  isSpecialUser(): boolean {
    // Verificar se é usuário especial (desenvolvedor, admin, etc.)
    const specialUsers = ['wcaco', 'admin', 'dev', 'popcorn seller'];
    return specialUsers.includes(this.currentPlayer?.gameName?.toLowerCase() || '') ||
      specialUsers.includes(this.currentPlayer?.summonerName?.toLowerCase() || '');
  }
}
