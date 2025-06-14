import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subject, takeUntil } from 'rxjs';
import { HttpErrorResponse } from '@angular/common/http'; // Import HttpErrorResponse

import { DashboardComponent } from './components/dashboard/dashboard';
import { QueueComponent } from './components/queue/queue';
import { MatchHistoryComponent } from './components/match-history/match-history';
import { WebsocketService } from './services/websocket';
import { ApiService } from './services/api';
import { Player, QueueStatus, LCUStatus, MatchFound, QueuePreferences } from './interfaces';
import type { Notification } from './interfaces';

@Component({
  selector: 'app-root',
  imports: [
    CommonModule,
    FormsModule,
    DashboardComponent,
    QueueComponent
  ],
  templateUrl: './app-simple.html',
  styleUrl: './app.scss'
})
export class App implements OnInit, OnDestroy {
  protected title = 'LoL Matchmaking';

  // Estado da aplicação
  currentView: 'dashboard' | 'queue' | 'history' | 'settings' = 'dashboard';
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
    private apiService: ApiService
  ) {
    this.isElectron = !!(window as any).electronAPI;
  }

  ngOnInit(): void {    this.isElectron = !!(window as any).electronAPI;

    // Try to load API key from local storage or a secure configuration
    const storedApiKey = localStorage.getItem('riotApiKey');
    if (storedApiKey) {
      this.settingsForm.riotApiKey = storedApiKey;
      // Send stored API key to backend for configuration
      this.apiService.updateRiotApiKey(storedApiKey).subscribe({
        next: () => {
          console.log('API Key configurada automaticamente no backend');
          this.apiService.setApiKey(storedApiKey);
        },
        error: (error) => {
          console.warn('Falha ao configurar API Key automaticamente:', error);
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
    ).subscribe(message => this.handleWebSocketMessage(message));

    // Check connection status
    this.websocketService.onConnectionChange().pipe(
      takeUntil(this.destroy$)
    ).subscribe((connected: boolean) => {
      this.isConnected = connected;
      if (connected) {
        this.tryAutoLoadCurrentPlayer();
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

  setCurrentView(view: 'dashboard' | 'queue' | 'history' | 'settings'): void {
    this.currentView = view;
    console.log('View changed to:', view);
  }

  private handleWebSocketMessage(message: any): void {
    switch (message.type) {
      case 'queue_joined':
        this.isInQueue = true;
        this.addNotification('success', 'Fila', `Entrou na fila (posição ${message.data.position})`);
        break;
      case 'match_found':
        this.matchFound = message.data;
        this.addNotification('success', 'Partida Encontrada!', 'Uma partida foi encontrada para você');
        break;
      case 'queue_error':
        this.addNotification('error', 'Erro na Fila', message.message);
        break;
      case 'queue_status':
        this.queueStatus = message.data;
        break;
    }
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
      this.addNotification('warning', 'Configuração Necessária', 'Configure seu nome de invocador primeiro');
      this.setCurrentView('settings');
      return;
    }

    try {
      await this.websocketService.joinQueue(this.currentPlayer, preferences);
      this.isInQueue = true;
      this.addNotification('success', 'Fila', `Entrou na fila como ${preferences?.primaryLane || 'qualquer lane'}`);
    } catch (error) {
      this.addNotification('error', 'Erro', 'Não foi possível entrar na fila');
    }
  }

  async leaveQueue(): Promise<void> {
    try {
      await this.websocketService.leaveQueue();
      this.isInQueue = false;
      this.addNotification('info', 'Fila', 'Saiu da fila');
    } catch (error) {
      this.addNotification('error', 'Erro', 'Não foi possível sair da fila');
    }
  }

  // Auto-join queue function
  async autoJoinQueue(): Promise<void> {
    if (!this.lcuStatus.isConnected) {
      this.addNotification('warning', 'LoL Cliente Offline', 'Conecte-se ao League of Legends primeiro');
      return;
    }

    try {
      this.apiService.autoJoinQueue().subscribe({
        next: (response) => {
          if (response && response.success) {
            this.isInQueue = true;
            // Atualizar informações do jogador automaticamente
            if (response.player) {
              this.currentPlayer = response.player;
              localStorage.setItem('currentPlayer', JSON.stringify(response.player));
            }
            this.addNotification('success', 'Auto Fila', 'Entrou na fila automaticamente');
          }
        },
        error: (err) => {
          this.addNotification('error', 'Erro', 'Não foi possível entrar na fila automaticamente');
        }
      });
    } catch (error) {
      this.addNotification('error', 'Erro', 'Não foi possível entrar na fila');
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
  }

  private async tryAutoLoadCurrentPlayer(): Promise<void> {
    // Primeiro tenta carregar do LCU se conectado
    if (this.lcuStatus.isConnected) {
      try {
        this.apiService.getCurrentSummonerFromLCU().subscribe({
          next: (summonerData) => {
            if (summonerData && summonerData.displayName) {
              // Criar ou atualizar player com dados do LCU
              const playerData = {
                summonerName: summonerData.displayName,
                summonerId: summonerData.summonerId?.toString(),
                puuid: summonerData.puuid,
                profileIconId: summonerData.profileIconId,
                summonerLevel: summonerData.summonerLevel,
                region: 'br1' // Detectar região automaticamente se possível
              };

              // Registrar ou atualizar jogador
              this.apiService.registerPlayer(playerData.summonerName, playerData.region).subscribe({
                next: (player) => {
                  this.currentPlayer = { ...player, ...playerData };
                  localStorage.setItem('currentPlayer', JSON.stringify(this.currentPlayer));
                  this.addNotification('success', 'Auto Registro', 'Dados carregados do League of Legends');
                },
                error: (error) => {
                  console.error('Erro ao registrar jogador:', error);
                }
              });
            }
          },
          error: (error) => {
            console.log('Erro ao obter dados do LCU, tentando método alternativo');
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
  }
  private async tryLoadRealPlayerData(): Promise<void> {
    try {      // Detect if running in Electron or browser and use appropriate method
      const isInElectron = !!(window as any).electronAPI;
      const apiCall = isInElectron ?
        this.apiService.getCurrentPlayerComprehensive() :
        this.apiService.getCurrentPlayerDebug();

      console.log(`🌐 Loading player data via ${isInElectron ? 'Electron' : 'Browser'} mode...`);

      apiCall.subscribe({
        next: (response) => {
          // ADICIONE ESTE LOG PARA VER OS DADOS BRUTOS:
          console.log('Dados recebidos de getCurrentPlayerComprehensive/Debug:', JSON.stringify(response.data, null, 2));

          if (response && response.success && response.data) {
            this.currentPlayer = this.mapRealDataToPlayer(response.data);
            localStorage.setItem('currentPlayer', JSON.stringify(this.currentPlayer));
            this.addNotification('success', 'Dados Carregados', `Bem-vindo, ${this.currentPlayer.summonerName}!`);
            console.log('Real player data loaded:', this.currentPlayer);
          } else {
            this.fallbackToStorageOrMock();
          }
        },
        error: (error) => {
          console.log('Failed to load real player data:', error);
          this.fallbackToStorageOrMock();
        }
      });
    } catch (error) {
      console.log('Error loading real player data:', error);
      this.fallbackToStorageOrMock();
    }
  }

  private fallbackToStorageOrMock(): void {
    // If no real data available and no stored data, create mock data for testing
    if (!this.currentPlayer) {
      this.createMockPlayer();
    }
  }  private mapRealDataToPlayer(realData: any): Player {
    // Handle different data structures from different endpoints
    const lcuData = realData.lcuData || realData; // Debug endpoint returns data directly
    const riotData = realData.riotData || realData.riotApiData;

    // Extract ranked data
    const soloQueueData = lcuData?.rankedStats?.highestRankedEntry || riotData?.soloQueue;
    const flexQueueData = lcuData?.rankedStats?.flexSrEntry || riotData?.flexQueue; // For flex queue data

    let playerRankObject: Player['rank'] = undefined;
    if (soloQueueData && soloQueueData.tier && (soloQueueData.rank || soloQueueData.division)) {
      const division = soloQueueData.rank || soloQueueData.division; // Riot uses 'rank', LCU might use 'division'
      playerRankObject = {
        tier: soloQueueData.tier.toUpperCase(),
        rank: division.toUpperCase(), // This is the division (I, II, III, IV)
        lp: soloQueueData.leaguePoints,
        display: `${soloQueueData.tier.toUpperCase()} ${division.toUpperCase()}`
      };
    }

    return {
      id: lcuData?.summonerId || riotData?.id || realData?.id || 0,
      summonerName: lcuData?.gameName || lcuData?.displayName || riotData?.name || realData?.summonerName || 'Unknown',
      summonerId: lcuData?.summonerId?.toString() || riotData?.id || realData?.summonerId?.toString() || '0',
      puuid: lcuData?.puuid || riotData?.puuid || realData?.puuid || '',
      profileIconId: lcuData?.profileIconId || riotData?.profileIconId || realData?.profileIconId || 1,
      summonerLevel: lcuData?.summonerLevel || riotData?.summonerLevel || realData?.summonerLevel || 30,
      currentMMR: this.calculateMMRFromRankedData(soloQueueData),
      region: realData?.region || (lcuData?.region && typeof lcuData.region === 'string' ? lcuData.region.toLowerCase() : 'br1'),
      tagLine: lcuData?.tagLine || riotData?.tagLine || realData?.tagLine || null,
      rank: playerRankObject, // Assign the constructed rank object
      wins: soloQueueData?.wins ?? realData?.wins,
      losses: soloQueueData?.losses ?? realData?.losses,
      lastMatchDate: realData?.lastMatchDate ? new Date(realData.lastMatchDate) : undefined,
      rankedData: {
        soloQueue: soloQueueData,
        flexQueue: flexQueueData
      }
    };
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
    try {
      if (!this.currentPlayer.puuid || !this.currentPlayer.region) {
        this.addNotification('error', 'Dados Incompletos', 'PUUID ou região do jogador não encontrados para atualização.');
        return;
      }
      this.apiService.getPlayerByPuuid(this.currentPlayer.puuid, this.currentPlayer.region).subscribe({
        next: (updatedPlayer: Player) => {
          // Create a new object for the current player to ensure proper change detection
          // and to avoid modifying the existing object before all processing is done.
          let processedPlayer: Player = {
            ...(this.currentPlayer || {}), // Spread existing data as a base
            ...updatedPlayer // Override with new data from API
          };

          if (updatedPlayer.rank) {
            const rankData = updatedPlayer.rank as any; // Use 'any' for flexibility
            const tier = rankData.tier ? String(rankData.tier).toUpperCase() : undefined;
            const divisionSource = rankData.rank || rankData.division; // Riot API uses 'rank', LCU might use 'division'
            const division = divisionSource ? String(divisionSource).toUpperCase() : undefined;
            let lpValue: number | undefined = undefined;

            if (rankData.lp !== undefined) {
              lpValue = rankData.lp;
            } else if (rankData.leaguePoints !== undefined) {
              lpValue = rankData.leaguePoints;
            }

            if (tier && division) {
              processedPlayer.rank = {
                tier: tier,
                rank: division, // This is the Roman numeral (I, II, III, IV)
                lp: lpValue,
                display: `${tier} ${division}`
              };
            } else {
              console.warn('Dados de rank incompletos recebidos da API após atualização. Tier ou Divisão ausentes. Rank será indefinido.', rankData);
              processedPlayer.rank = undefined; // Clear rank if essential parts are missing
            }
          } else {
            // If updatedPlayer comes without a rank object at all
            console.warn('Nenhum dado de rank recebido da API após atualização. Rank atual será indefinido.');
            processedPlayer.rank = undefined;
          }

          // Ensure all top-level properties from updatedPlayer are on processedPlayer
          // This handles cases where updatedPlayer might have more fields than the initial currentPlayer
          this.currentPlayer = processedPlayer;
          localStorage.setItem('currentPlayer', JSON.stringify(this.currentPlayer));
          this.addNotification('success', 'Dados Atualizados', 'Informações do jogador atualizadas com sucesso.');
        },
        error: (err: HttpErrorResponse) => {
          this.addNotification('error', 'Erro ao Atualizar', 'Não foi possível buscar os dados mais recentes do jogador.');
          console.error('Error refreshing player data:', err); // Detailed error in console
        }
      });
    } catch (error) {
      this.addNotification('error', 'Erro', 'Ocorreu um erro ao tentar atualizar os dados do jogador.');
      console.error('Catch block error refreshing player data:', error);
    }
  }
  async updateRiotApiKey(): Promise<void> {
    if (!this.settingsForm.riotApiKey) {
      this.addNotification('warning', 'API Key Inválida', 'Por favor, insira uma Riot API Key válida.');
      return;
    }

    try {
      // Send API key to backend for validation and configuration
      await this.apiService.updateRiotApiKey(this.settingsForm.riotApiKey).toPromise();

      // Save the API key to local storage for persistence
      localStorage.setItem('riotApiKey', this.settingsForm.riotApiKey);
      this.apiService.setApiKey(this.settingsForm.riotApiKey);
      this.addNotification('success', 'API Key Configurada', 'Riot API Key foi configurada e validada com sucesso.');

      // Optionally, refresh player data if a player is already loaded
      if (this.currentPlayer) {
        this.refreshPlayerData();
      }
    } catch (error: any) {
      console.error('Erro ao configurar API Key:', error);
      this.addNotification('error', 'Erro na API Key', 'Falha ao configurar a Riot API Key. Verifique se a chave está válida.');
    }
  }

  // Error handler for profile icons
  onProfileIconError(event: Event): void {
    const target = event.target as HTMLImageElement;
    if (!target) return;    // Attempt to load a default icon or a series of fallbacks
    const iconId = this.currentPlayer?.profileIconId || 29; // Use current player's icon ID or default
    const fallbackUrls = [
      // More recent versions first
      `https://ddragon.leagueoflegends.com/cdn/15.12.1/img/profileicon/${iconId}.png`,
      `https://ddragon.leagueoflegends.com/cdn/15.11.1/img/profileicon/${iconId}.png`,
      `https://ddragon.leagueoflegends.com/cdn/14.24.1/img/profileicon/${iconId}.png`,
      `https://ddragon.leagueoflegends.com/cdn/14.23.1/img/profileicon/${iconId}.png`,
      `https://ddragon.leagueoflegends.com/cdn/14.22.1/img/profileicon/${iconId}.png`,
      // Generic fallback from a reliable community source if Data Dragon fails
      `https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/v1/profile-icons/${iconId}.jpg`,
      // Absolute default icon if all else fails
      'https://ddragon.leagueoflegends.com/cdn/15.12.1/img/profileicon/29.png',
      // You could add a local SVG or a base64 encoded image as a final resort here
      'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iODAiIGhlaWdodD0iODAiIHZpZXdCb3g9IjAgMCA4MCA4MCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48Y2lyY2xlIGN4PSI0MCIgY3k9IjQwIiByPSI0MCIgZmlsbD0iIzQ2NzQ4MSIvPjxzdmcgeD0iMTYiIHk9IjE2IiB3aWR0aD0iNDgiIGhlaWdodD0iNDgiIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0iI0ZGRkZGRiI+PHBhdGggZD0iTTEyIDJDNi40OCAyIDIgNi40OCAyIDEyczQuNDggMTAgMTAgMTAgMTAtNC40OCAxMC0xMFMxNy41MiAyIDEyIDJ6bTAgM2MxLjY2IDAgMyAxLjM0IDMgM3MtMS4zNCAzLTMgMy0zLTEuMzQtMy0zIDEuMzQtMyAzLTN6bTAgMTRjLTIuNzYgMC01LTEuNzktNS00aDEwYy0xLjIyIDIuMjEtNSAzLjIzLTUgNHoiLz48L3N2Zz48L3N2Zz4=' // Example generic SVG
    ];

    const currentSrc = target.src;
    let fallbackAttempt = parseInt(target.dataset['fallbackAttempt'] || '0');

    if (fallbackAttempt < fallbackUrls.length) {
      target.src = fallbackUrls[fallbackAttempt];
      target.dataset['fallbackAttempt'] = (fallbackAttempt + 1).toString();
    } else {
      // All fallbacks attempted, prevent further error loops
      target.onerror = null;
    }
  }

  private startLCUStatusCheck(): void {
    // Check LCU status initially, then every 10 seconds
    this.checkLCUStatus();
    setInterval(() => this.checkLCUStatus(), 10000);
  }

  private startQueueStatusCheck(): void {
    setInterval(() => this.checkQueueStatus(), 10000);
  }

  private checkLCUStatus(): void {
    this.apiService.getLCUStatus().subscribe({
      next: (status) => {
        this.lcuStatus = status;
        if (status.isConnected && !this.currentPlayer) {
          this.tryAutoLoadCurrentPlayer();
        }
      },
      error: (err) => {
        this.lcuStatus = { isConnected: false };
      }
    });
  }

  private checkQueueStatus(): void {
    this.apiService.getQueueStatus().subscribe({
      next: (status) => {
        this.queueStatus = status;
      },
      error: (err) => {
        console.log('Erro ao verificar status da fila:', err);
      }
    });
  }

  // Método para criar dados de exemplo para teste
  private createMockPlayer(): void {
    this.currentPlayer = {
      id: 1,
      summonerName: 'TesteInvocador',
      tagLine: 'BR1',
      profileIconId: 4623, // Ícone popular do LoL
      summonerLevel: 157,
      currentMMR: 1456,
      region: 'br1',
      rank: {
        tier: 'GOLD',
        rank: 'II',
        display: 'Gold II',
        lp: 64
      },
      wins: 127,
      losses: 89
    };

    // Simular alguns dados da fila
    this.queueStatus = {
      playersInQueue: 8,
      averageWaitTime: 45,
      estimatedMatchTime: 120,
      isActive: true
    };
  }

  // ADICIONAR ESTE MÉTODO
  addNotification(type: 'success' | 'error' | 'warning' | 'info', title: string, message: string): void {
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
}
