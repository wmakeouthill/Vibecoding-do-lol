import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subject, takeUntil } from 'rxjs';
import { HttpErrorResponse } from '@angular/common/http'; // Import HttpErrorResponse

import { DashboardComponent } from './components/dashboard/dashboard';
import { QueueComponent } from './components/queue/queue';
import { MatchHistoryComponent } from './components/match-history/match-history';
import { P2PStatusComponent } from './components/p2p-status/p2p-status';
import { MatchFoundComponent, MatchFoundData } from './components/match-found/match-found';
import { CustomPickBanComponent } from './components/custom-pick-ban/custom-pick-ban';
import { WebsocketService } from './services/websocket';
import { ApiService } from './services/api';
import { QueueStateService } from './services/queue-state';
import { Player, QueueStatus, LCUStatus, MatchFound, QueuePreferences, RefreshPlayerResponse } from './interfaces'; // Adicionar RefreshPlayerResponse
import type { Notification } from './interfaces';

@Component({
  selector: 'app-root',  imports: [
    CommonModule,
    FormsModule,
    DashboardComponent,
    QueueComponent,
    MatchHistoryComponent,
    P2PStatusComponent,
    MatchFoundComponent,
    CustomPickBanComponent
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

  // Propriedades do Pick & Ban
  draftTimer = 30;
  selectedChampion: any = null;
  champions: any[] = []; // Lista de campeões disponíveis

  // Notificações
  notifications: Notification[] = [];
  // Formulário de configurações
  settingsForm = {
    summonerName: '',
    region: 'br1',
    riotApiKey: '' // Initialize with an empty string or load from a secure place
  };

  private destroy$ = new Subject<void>();
  constructor(
    private websocketService: WebsocketService,
    private apiService: ApiService,
    private queueStateService: QueueStateService
  ) {
    this.isElectron = !!(window as any).electronAPI;
  }

  ngOnInit(): void {    this.isElectron = !!(window as any).electronAPI;

    // Try to load API key from local storage or a secure configuration
    const storedApiKey = localStorage.getItem('riotApiKey');
    if (storedApiKey) {
      this.settingsForm.riotApiKey = storedApiKey;
      // Send stored API key to backend for configuration
      this.apiService.setRiotApiKey(storedApiKey).subscribe({
        next: () => {
          console.log('API Key configurada automaticamente no backend');
          // this.apiService.setApiKey(storedApiKey); // Não é mais necessário chamar setApiKey aqui, pois o backend gerencia a chave.
        },
        error: (error: HttpErrorResponse) => { // Adicionar tipagem explícita para o erro
          console.warn('Falha ao configurar API Key automaticamente:', error.message);
          // Remove invalid key from storage
          localStorage.removeItem('riotApiKey');
          this.settingsForm.riotApiKey = '';
        }
      });
    }

    // Connect to WebSocket for real-time updates
    this.websocketService.connect();
    this.websocketService.onMessage().pipe(
      takeUntil(this.destroy$)
    ).subscribe(message => this.handleWebSocketMessage(message));    // Check connection status
    this.websocketService.onConnectionChange().pipe(
      takeUntil(this.destroy$)
    ).subscribe((connected: boolean) => {
      this.isConnected = connected;
      if (connected) {
        this.tryAutoLoadCurrentPlayer();
        // Solicitar status da fila quando conectar
        this.websocketService.requestQueueStatus();
      }
    });

    // Load player data from local storage initially
    this.loadPlayerData();

    // Try to fetch real player data from LCU first
    this.tryLoadRealPlayerData();

    // Start checking LCU status regularly
    this.startLCUStatusCheck();

    // Carregar status da fila a cada 10s
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

  // Handle Pick & Ban completion
  onPickBanComplete(result: any) {
    console.log('🎯 Pick & Ban completed:', result);

    // Exit draft phase
    this.exitDraft();

    // Show completion notification
    this.addNotification('success', 'Pick & Ban Completo', 'A seleção de campeões foi finalizada!');

    // Could transition to game start here
  }

  onPickBanCancel(): void {
    console.log('❌ Pick & Ban cancelado');
    this.inDraftPhase = false;
    this.draftData = null;
    this.draftPhase = 'preview';
    this.currentView = 'dashboard';
    this.addNotification('info', 'Draft Cancelado', 'O draft foi cancelado.');
  }

  // Método para determinar se o jogador atual é líder
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
      this.isMatchLeader = false;
    }
  }

  // Método para transferir liderança
  transferLeadership(targetPlayer: any): void {
    if (!this.isMatchLeader) {
      this.addNotification('error', 'Acesso Negado', 'Apenas o líder pode transferir a liderança.');
      return;
    }

    if (targetPlayer.summonerName.startsWith('Bot') || targetPlayer.summonerName.includes('bot')) {
      this.addNotification('error', 'Transferência Inválida', 'Não é possível transferir liderança para um bot.');
      return;
    }

    // Aqui você pode implementar a lógica do backend para transferir liderança
    // Por enquanto, vou simular localmente
    console.log(`👑 Transferindo liderança para: ${targetPlayer.summonerName}`);
    this.isMatchLeader = false;
    this.addNotification('success', 'Liderança Transferida', `${targetPlayer.summonerName} agora é o líder da partida.`);
  }

  // Método para obter jogadores humanos elegíveis para liderança
  getEligibleLeaders(): any[] {
    if (!this.draftData) return [];

    const allPlayers = [...(this.draftData.blueTeam || []), ...(this.draftData.redTeam || [])];
    return allPlayers.filter((player: any) =>
      !player.summonerName.startsWith('Bot') &&
      !player.summonerName.includes('bot') &&
      player.summonerName !== this.currentPlayer?.summonerName
    );
  }

  // Métodos para Pick & Ban
  getCurrentActionText(): string {
    if (!this.draftData) return '';

    const { phase, currentTurn, currentAction } = this.draftData;
    const actionType = currentAction?.type || 'ban';
    const team = currentTurn === 'blue' ? 'Azul' : 'Vermelho';

    if (actionType === 'ban') {
      return `Time ${team} está banindo...`;
    } else {
      return `Time ${team} está escolhendo...`;
    }
  }

  getBansForTeam(team: 'blue' | 'red'): any[] {
    if (!this.draftData?.bans) return [];
    const bans = this.draftData.bans[team] || [];
    // Criar array de 5 slots para bans (3 na primeira fase, 2 na segunda)
    const banSlots = new Array(5).fill(null);
    bans.forEach((ban: any, index: number) => {
      if (index < banSlots.length) {
        banSlots[index] = ban;
      }
    });
    return banSlots;
  }

  isCurrentPicker(player: any, team: 'blue' | 'red'): boolean {
    if (!this.draftData) return false;

    const { currentTurn, currentAction } = this.draftData;
    return currentTurn === team && this.isMyTurn() &&
           this.currentPlayer?.summonerName === player.summonerName;
  }

  isMyTurn(): boolean {
    if (!this.draftData || !this.currentPlayer) return false;

    const { currentTurn, currentAction } = this.draftData;
    const myTeam = this.getMyTeam();

    return currentTurn === myTeam;
  }

  isCurrentlyBanning(): boolean {
    return this.draftData?.currentAction?.type === 'ban';
  }

  getMyTeam(): 'blue' | 'red' | null {
    if (!this.draftData || !this.currentPlayer) return null;

    const isInBlueTeam = this.draftData.blueTeam?.some((p: any) =>
      p.summonerName === this.currentPlayer?.summonerName
    );

    return isInBlueTeam ? 'blue' : 'red';
  }

  getAvailableChampions(): any[] {
    // Lista simplificada de campeões para demonstração
    const allChampions = [
      { id: 1, name: 'Garen', imageUrl: '/assets/images/champion-placeholder.svg' },
      { id: 2, name: 'Lux', imageUrl: '/assets/images/champion-placeholder.svg' },
      { id: 3, name: 'Jinx', imageUrl: '/assets/images/champion-placeholder.svg' },
      { id: 4, name: 'Thresh', imageUrl: '/assets/images/champion-placeholder.svg' },
      { id: 5, name: 'Lee Sin', imageUrl: '/assets/images/champion-placeholder.svg' },
      { id: 6, name: 'Ahri', imageUrl: '/assets/images/champion-placeholder.svg' },
      { id: 7, name: 'Ashe', imageUrl: '/assets/images/champion-placeholder.svg' },
      { id: 8, name: 'Braum', imageUrl: '/assets/images/champion-placeholder.svg' },
      { id: 9, name: 'Yasuo', imageUrl: '/assets/images/champion-placeholder.svg' },
      { id: 10, name: 'Zed', imageUrl: '/assets/images/champion-placeholder.svg' }
    ];

    // Filtrar campeões já banidos ou escolhidos
    const bannedChampions = [
      ...(this.draftData?.bans?.blue || []),
      ...(this.draftData?.bans?.red || [])
    ];

    const pickedChampions = [
      ...(this.draftData?.blueTeam?.filter((p: any) => p.champion) || []).map((p: any) => p.champion),
      ...(this.draftData?.redTeam?.filter((p: any) => p.champion) || []).map((p: any) => p.champion)
    ];

    const unavailableIds = [
      ...bannedChampions.map((c: any) => c.id),
      ...pickedChampions.map((c: any) => c.id)
    ];

    return allChampions.filter(champion => !unavailableIds.includes(champion.id));
  }

  selectChampion(champion: any): void {
    this.selectedChampion = champion;
    console.log('🎯 Campeão selecionado:', champion.name);
  }

  confirmSelection(): void {
    if (!this.selectedChampion) return;

    const actionType = this.isCurrentlyBanning() ? 'ban' : 'pick';
    console.log(`✅ ${actionType === 'ban' ? 'Banindo' : 'Escolhendo'} campeão:`, this.selectedChampion.name);

    // Aqui você implementaria a chamada para o backend
    // this.apiService.submitDraftAction(this.draftData.matchId, actionType, this.selectedChampion.id)

    // Por enquanto, simular a ação localmente
    this.simulateDraftAction(actionType, this.selectedChampion);

    this.selectedChampion = null;
  }

  private simulateDraftAction(actionType: 'ban' | 'pick', champion: any): void {
    if (!this.draftData) return;

    const myTeam = this.getMyTeam();
    if (!myTeam) return;

    if (actionType === 'ban') {
      if (!this.draftData.bans[myTeam]) {
        this.draftData.bans[myTeam] = [];
      }
      this.draftData.bans[myTeam].push(champion);
    } else {
      // Encontrar o jogador atual e atribuir o campeão
      const currentPlayer = myTeam === 'blue'
        ? this.draftData.blueTeam?.find((p: any) => p.summonerName === this.currentPlayer?.summonerName)
        : this.draftData.redTeam?.find((p: any) => p.summonerName === this.currentPlayer?.summonerName);

      if (currentPlayer) {
        currentPlayer.champion = champion;
      }
    }

    // Simular mudança de turno (em um sistema real, isso viria do backend)
    this.simulateNextTurn();
  }

  private simulateNextTurn(): void {
    // Alternar o turno (implementação simplificada)
    this.draftData.currentTurn = this.draftData.currentTurn === 'blue' ? 'red' : 'blue';

    // Em um sistema real, isso seria gerenciado pelo backend
    this.addNotification('info', 'Turno Alterado', `Agora é a vez do time ${this.draftData.currentTurn === 'blue' ? 'Azul' : 'Vermelho'}`);
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
    // Use the direct endpoint that combines LCU + Riot API data
    if (this.lcuStatus.isConnected) {
      try {
        this.apiService.getPlayerFromLCU().subscribe({
          next: (player: Player) => {
            this.currentPlayer = player;
            localStorage.setItem('currentPlayer', JSON.stringify(this.currentPlayer));
            this.addNotification('success', 'Auto Load', 'Dados carregados do League of Legends automaticamente');
          },
          error: (error) => {
            console.error('Erro ao obter dados do LCU via endpoint direto:', error);
            this.tryLoadFromAPI();
          }
        });
      } catch (error) {
        this.tryLoadFromAPI();
      }
    } else {
      this.tryLoadFromAPI();
    }
  }

  private tryLoadFromAPI(): void {
    // Try to get current player info from the League Client
    this.apiService.getCurrentPlayer().subscribe({
      next: (response) => {
        if (response && response.success && response.player) {
          // Auto-load player data from the League client
          this.currentPlayer = response.player;
          this.addNotification('success', 'Auto Registro', 'Dados do jogador carregados automaticamente');
        }
      },
      error: (err) => {
        console.log('Não foi possível carregar dados do jogador atual:', err);
        // Silently fail - will use manual registration instead
      }
    });
  }  private async tryLoadRealPlayerData(): Promise<void> {
    try {
      // Detect if running in Electron or browser and use appropriate method
      const isInElectron = !!(window as any).electronAPI;
      const apiCall = isInElectron ?
        this.apiService.getCurrentPlayerDetails() : // Electron mode
        this.apiService.getCurrentPlayerDebug(); // Browser mode

      console.log(`🌐 Loading player data via ${isInElectron ? 'Electron' : 'Browser'} mode...`);

      apiCall.subscribe({
        next: (response) => {
          console.log('Dados recebidos:', JSON.stringify(response, null, 2));

          if (response && response.success && response.data) {
            this.currentPlayer = this.mapRealDataToPlayer(response.data);
            localStorage.setItem('currentPlayer', JSON.stringify(this.currentPlayer));
            this.addNotification('success', 'Dados Carregados', `Bem-vindo, ${this.currentPlayer.summonerName}!`);
            console.log('Real player data loaded:', this.currentPlayer);
          } else {
            console.log('Response received but no valid data found');
            this.fallbackToStorageOrMock();
          }
        },
        error: (error) => {
          console.log('Failed to load real player data:', error);

          // Fornecer feedback específico baseado no tipo de erro
          if (error.message.includes('Cliente do LoL não conectado')) {
            this.addNotification('warning', 'LoL Cliente Offline', 'Conecte-se ao League of Legends para carregar dados automaticamente');
          } else if (error.message.includes('Jogador não encontrado')) {
            this.addNotification('info', 'Dados não Encontrados', 'Configure seus dados manualmente nas configurações');
          } else if (error.message.includes('PUUID')) {
            this.addNotification('warning', 'Dados Corrompidos', 'Há um problema com os dados salvos. Reconfigure nas configurações.');
          } else {
            this.addNotification('info', 'Carregamento Manual', 'Configure seus dados nas configurações');
          }

          this.fallbackToStorageOrMock();
        }
      });
    } catch (error: any) {
      console.log('Error loading real player data:', error);
      this.addNotification('warning', 'Erro de Conexão', 'Não foi possível conectar ao serviço. Verifique sua conexão.');
      this.fallbackToStorageOrMock();
    }
  }

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
            console.log('Player data refreshed by Riot ID:', this.currentPlayer);
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
      console.error('Unexpected error in refreshPlayerData by Riot ID:', error);
      this.addNotification('error', 'Erro Inesperado', error.message || 'Ocorreu um erro inesperado.');
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
