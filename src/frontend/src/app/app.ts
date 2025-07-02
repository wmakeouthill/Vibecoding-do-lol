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
import { DraftPickBanComponent } from './components/draft/draft-pick-ban';
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
    DraftPickBanComponent,
    GameInProgressComponent
  ],
  templateUrl: './app-simple.html',
  styleUrl: './app.scss'
})
export class App implements OnInit, OnDestroy {
  protected title = 'LoL Matchmaking';
  
  // ✅ MANTIDO: Estado da aplicação (interface)
  currentView: 'dashboard' | 'queue' | 'history' | 'leaderboard' | 'settings' = 'dashboard';
  isElectron = false;
  isConnected = false;
  isInQueue: boolean = false;

  // ✅ MANTIDO: Dados do jogador
  currentPlayer: Player | null = null;

  // ✅ MANTIDO: Status da fila e do LCU (para exibição)
  queueStatus: QueueStatus = {
    playersInQueue: 0,
    averageWaitTime: 0,
    estimatedMatchTime: 0,
    isActive: true
  };
  lcuStatus: LCUStatus = { isConnected: false };

  // ✅ MANTIDO: Estados das fases (interface)
  matchFoundData: MatchFoundData | null = null;
  showMatchFound = false;
  inDraftPhase = false;
  draftData: any = null;
  inGamePhase = false;
  gameData: any = null;
  gameResult: any = null;

  // ✅ MANTIDO: Interface (sem lógica)
  notifications: Notification[] = [];
  settingsForm = {
    summonerName: '',
    region: 'br1',
    riotApiKey: '',
    discordBotToken: '',
    discordChannel: ''
  };
  discordStatus = {
    isConnected: false,
    botUsername: '',
    queueSize: 0,
    activeMatches: 0,
    inChannel: false
  };

  private destroy$ = new Subject<void>();

  constructor(
    private apiService: ApiService,
    private queueStateService: QueueStateService,
    private discordService: DiscordIntegrationService
  ) {
    this.isElectron = !!(window as any).electronAPI;
  }

  ngOnInit(): void {
    console.log('🚀 [App] Inicializando frontend como interface para backend...');
    
    // ✅ MANTIDO: Configurações básicas
    this.loadPlayerData();
    this.setupDiscordStatusListener();
    this.startLCUStatusCheck();
    this.startQueueStatusCheck();
    this.checkBackendConnection();
    this.loadConfigFromDatabase();
    
    // ✅ NOVO: Configurar comunicação com backend
    this.setupBackendCommunication();
  }

  // ✅ NOVO: Configurar comunicação centralizada com backend
  private setupBackendCommunication(): void {
    console.log('🔌 [App] Configurando comunicação com backend via WebSocket...');
    
    // Escutar estado da fila via MySQL
    this.queueStateService.getQueueState().subscribe(queueState => {
      console.log('📊 [App] Estado da fila atualizado via backend:', queueState);
      this.isInQueue = queueState.isInQueue;
      
      // Buscar dados completos da fila
      this.refreshQueueStatus();
    });

    // Escutar mensagens WebSocket do backend
    this.apiService.onWebSocketMessage().subscribe({
      next: (message) => {
        console.log('📡 [App] Mensagem do backend recebida:', message);
        this.handleBackendMessage(message);
      },
      error: (error) => {
        console.error('❌ [App] Erro na comunicação com backend:', error);
      }
    });

    // Configurar listener para mensagens do componente queue
    this.setupQueueComponentListener();
  }

  // ✅ NOVO: Processar mensagens do backend
  private handleBackendMessage(message: any): void {
    switch (message.type) {
      case 'match_found':
        console.log('🎮 [App] Partida encontrada pelo backend');
        this.handleMatchFound(message.data);
        break;
        
      case 'match_acceptance_progress':
        console.log('📊 [App] Progresso de aceitação');
        this.handleAcceptanceProgress(message.data);
        break;
        
      case 'match_fully_accepted':
        console.log('✅ [App] Partida totalmente aceita');
        this.handleMatchFullyAccepted(message.data);
        break;
        
      case 'draft_started':
        console.log('🎯 [App] Draft iniciado pelo backend');
        this.handleDraftStarted(message.data);
        break;
        
      case 'draft_action':
        console.log('🎯 [App] Ação de draft');
        this.handleDraftAction(message.data);
        break;
        
      case 'game_starting':
        console.log('🎮 [App] Jogo iniciando');
        this.handleGameStarting(message.data);
        break;
        
      case 'match_cancelled':
        console.log('❌ [App] Partida cancelada pelo backend');
        this.handleMatchCancelled(message.data);
        break;
        
      case 'queue_update':
        console.log('🔄 [App] Atualização da fila');
        this.handleQueueUpdate(message.data);
        break;
        
      default:
        console.log('📡 [App] Mensagem não reconhecida:', message.type);
    }
  }

  // ✅ NOVO: Configurar listener do componente queue
  private setupQueueComponentListener(): void {
    document.addEventListener('matchFound', (event: any) => {
      console.log('🎮 [App] Match found do componente queue:', event.detail);
      this.handleMatchFound(event.detail.data);
    });
  }

  // ✅ SIMPLIFICADO: Handlers apenas atualizam interface
  private handleMatchFound(data: any): void {
    console.log('🎮 [App] Exibindo match found:', data);
    
    this.matchFoundData = data;
    this.showMatchFound = true;
    this.isInQueue = false;
    
    this.addNotification('success', 'Partida Encontrada!', 'Você tem 30 segundos para aceitar.');
    
    // Som de notificação
    try {
      const audio = new Audio('assets/sounds/match-found.mp3');
      audio.play().catch(() => {});
    } catch (error) {}
  }

  private handleAcceptanceProgress(data: any): void {
    console.log('📊 [App] Progresso de aceitação:', data);
    // Atualizar UI de progresso se necessário
  }

  private handleMatchFullyAccepted(data: any): void {
    console.log('✅ [App] Partida totalmente aceita:', data);
    this.addNotification('success', 'Partida Aceita!', 'Todos os jogadores aceitaram. Preparando draft...');
  }

  private handleDraftStarted(data: any): void {
    console.log('🎯 [App] Iniciando draft:', data);
    
    this.showMatchFound = false;
    this.matchFoundData = null;
    this.inDraftPhase = true;
    this.draftData = data;
    
    this.addNotification('success', 'Draft Iniciado!', 'A fase de draft começou.');
  }

  private handleDraftAction(data: any): void {
    console.log('🎯 [App] Ação de draft:', data);
    // Atualizar estado do draft
    if (this.draftData) {
      this.draftData = { ...this.draftData, ...data };
    }
  }

  private handleGameStarting(data: any): void {
    console.log('🎮 [App] Jogo iniciando:', data);
    
    this.inDraftPhase = false;
    this.draftData = null;
    this.inGamePhase = true;
    this.gameData = data;
    
    this.addNotification('success', 'Jogo Iniciado!', 'A partida começou.');
  }

  private handleMatchCancelled(data: any): void {
    console.log('❌ [App] Partida cancelada:', data);
    
    this.showMatchFound = false;
    this.matchFoundData = null;
    this.inDraftPhase = false;
    this.draftData = null;
    this.isInQueue = true; // Voltar para fila
    
    this.addNotification('info', 'Partida Cancelada', data.message || 'A partida foi cancelada.');
  }

  private handleQueueUpdate(data: any): void {
    console.log('🔄 [App] Atualização da fila:', data);
    this.queueStatus = data;
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  // ✅ MANTIDO: Métodos de interface
  setCurrentView(view: 'dashboard' | 'queue' | 'history' | 'leaderboard' | 'settings'): void {
    this.currentView = view;
  }

  // ✅ SIMPLIFICADO: Apenas comunicar com backend
  async joinQueue(preferences?: QueuePreferences): Promise<void> {
    console.log('📞 [App] Solicitando entrada na fila ao backend...');
    
    if (!this.currentPlayer) {
      this.addNotification('error', 'Erro', 'Dados do jogador não disponíveis');
      return;
    }

    try {
      await this.apiService.joinQueue(this.currentPlayer, preferences).toPromise();
      console.log('✅ [App] Solicitação de entrada na fila enviada');
    } catch (error) {
      console.error('❌ [App] Erro ao entrar na fila:', error);
      this.addNotification('error', 'Erro', 'Falha ao entrar na fila');
    }
  }

  async joinDiscordQueueWithFullData(data: { player: Player | null, preferences: QueuePreferences }): Promise<void> {
    console.log('📞 [App] Solicitando entrada na fila Discord ao backend...', data);
    
    try {
      await this.apiService.joinQueue(data.player, data.preferences).toPromise();
      console.log('✅ [App] Solicitação de entrada na fila Discord enviada');
    } catch (error) {
      console.error('❌ [App] Erro ao entrar na fila Discord:', error);
      this.addNotification('error', 'Erro', 'Falha ao entrar na fila Discord');
    }
  }

  async leaveQueue(): Promise<void> {
    console.log('📞 [App] Solicitando saída da fila ao backend...');
    
    try {
      await this.apiService.leaveQueue(this.currentPlayer?.id, this.currentPlayer?.summonerName).toPromise();
      console.log('✅ [App] Solicitação de saída da fila enviada');
      this.isInQueue = false;
    } catch (error) {
      console.error('❌ [App] Erro ao sair da fila:', error);
      this.addNotification('error', 'Erro', 'Falha ao sair da fila');
    }
  }

  async acceptMatch(): Promise<void> {
    console.log('📞 [App] Enviando aceitação ao backend...');
    
    if (!this.matchFoundData?.matchId || !this.currentPlayer?.summonerName) {
      this.addNotification('error', 'Erro', 'Dados da partida não disponíveis');
      return;
    }

    try {
      await this.apiService.acceptMatch(
        this.matchFoundData.matchId, 
        this.currentPlayer.id, 
        this.currentPlayer.summonerName
      ).toPromise();
      
      console.log('✅ [App] Aceitação enviada ao backend');
      this.addNotification('success', 'Partida Aceita!', 'Aguardando outros jogadores...');
    } catch (error) {
      console.error('❌ [App] Erro ao aceitar partida:', error);
      this.addNotification('error', 'Erro', 'Falha ao aceitar partida');
    }
  }

  async declineMatch(): Promise<void> {
    console.log('📞 [App] Enviando recusa ao backend...');
    
    if (!this.matchFoundData?.matchId || !this.currentPlayer?.summonerName) {
      this.addNotification('error', 'Erro', 'Dados da partida não disponíveis');
      return;
    }

    try {
      await this.apiService.declineMatch(
        this.matchFoundData.matchId, 
        this.currentPlayer.id, 
        this.currentPlayer.summonerName
      ).toPromise();
      
      console.log('✅ [App] Recusa enviada ao backend');
      this.showMatchFound = false;
      this.matchFoundData = null;
      this.isInQueue = true;
      this.addNotification('info', 'Partida Recusada', 'Você voltou para a fila.');
    } catch (error) {
      console.error('❌ [App] Erro ao recusar partida:', error);
      this.addNotification('error', 'Erro', 'Falha ao recusar partida');
    }
  }

  // ✅ MANTIDO: Métodos de interface simples
  addNotification(type: 'success' | 'info' | 'warning' | 'error', title: string, message: string): void {
    const notification: Notification = {
      id: Date.now().toString() + Math.random().toString(36).substr(2, 5),
      type,
      title,
      message,
      timestamp: new Date(),
      isRead: false
    };

    this.notifications.unshift(notification);
    
    // Auto-remover após 5 segundos para notificações de sucesso/info
    if (type === 'success' || type === 'info') {
      setTimeout(() => {
        this.dismissNotification(notification.id);
      }, 5000);
    }
  }

  dismissNotification(id: string): void {
    this.notifications = this.notifications.filter(n => n.id !== id);
  }

  trackNotification(index: number, notification: Notification): string {
    return notification.id;
  }

  // ✅ CORRIGIDO: Métodos necessários para carregamento de dados
  private loadPlayerData(): void {
    console.log('🔄 [App] Carregando dados do jogador via LCU...');
    
    this.apiService.getPlayerFromLCU().subscribe({
      next: (player) => {
        console.log('✅ [App] Dados do jogador carregados via LCU:', player);
        
        // ✅ CORRIGIDO: Formar nome completo no formato gameName#tagLine SEMPRE
        if (player.gameName && player.tagLine) {
          player.summonerName = `${player.gameName}#${player.tagLine}`;
          console.log('✅ [App] Nome formatado:', player.summonerName);
        } else {
          console.warn('⚠️ [App] Dados incompletos do jogador:', {
            gameName: player.gameName,
            tagLine: player.tagLine,
            summonerName: player.summonerName
          });
          // Se não conseguir formar o nome completo, mostrar erro
          if (!player.summonerName || !player.summonerName.includes('#')) {
            this.addNotification('warning', 'Dados Incompletos', 'Não foi possível obter gameName#tagLine do LCU');
            return;
          }
        }
        
        this.currentPlayer = player;
        
        // Adicionar propriedade customLp se não existir
        if (this.currentPlayer && !this.currentPlayer.customLp) {
          this.currentPlayer.customLp = this.currentPlayer.currentMMR || 1200;
        }
        
        // Salvar no localStorage para backup
        localStorage.setItem('currentPlayer', JSON.stringify(this.currentPlayer));
        
        // ✅ ADICIONADO: Atualizar formulário de configurações com dados do jogador
        this.updateSettingsForm();
        
        console.log('✅ [App] Jogador carregado:', this.currentPlayer.summonerName);
        this.addNotification('success', 'Jogador Detectado', `Logado como: ${this.currentPlayer.summonerName}`);
      },
      error: (error) => {
        console.warn('⚠️ [App] Falha ao carregar dados do jogador via LCU:', error);
        this.addNotification('error', 'Erro LCU', 'Não foi possível conectar ao cliente do LoL. Verifique se o jogo está aberto.');
        this.tryLoadFromLocalStorage();
        
        // Se ainda não há dados, tentar getCurrentPlayerDetails como fallback
        if (!this.currentPlayer) {
          this.tryGetCurrentPlayerDetails();
        }
      }
    });
  }

  private tryGetCurrentPlayerDetails(): void {
    console.log('🔄 [App] Tentando carregar dados via getCurrentPlayerDetails...');
    
    this.apiService.getCurrentPlayerDetails().subscribe({
      next: (response) => {
        console.log('✅ [App] Resposta getCurrentPlayerDetails:', response);
        
        if (response.success && response.data) {
          const data = response.data;
          
          // Mapear dados do LCU para Player
          const lcuData = data.lcu || {};
          const riotAccount = data.riotAccount || {};
          
          const gameName = riotAccount.gameName || lcuData.gameName;
          const tagLine = riotAccount.tagLine || lcuData.tagLine;
          
          // ✅ CORRIGIDO: Formar nome completo no formato gameName#tagLine
          let summonerName = 'Unknown';
          if (gameName && tagLine) {
            summonerName = `${gameName}#${tagLine}`;
          } else {
            console.warn('⚠️ [App] Dados incompletos via getCurrentPlayerDetails:', {
              gameName, tagLine
            });
            this.addNotification('warning', 'Dados Incompletos', 'Não foi possível obter gameName#tagLine');
            return;
          }
          
          const player: Player = {
            id: lcuData.summonerId || 0,
            summonerName: summonerName,
            gameName: gameName,
            tagLine: tagLine,
            summonerId: (lcuData.summonerId || 0).toString(),
            puuid: riotAccount.puuid || lcuData.puuid || '',
            profileIconId: lcuData.profileIconId || 29,
            summonerLevel: lcuData.summonerLevel || 30,
            region: 'br1',
            currentMMR: 1200,
            customLp: 1200
          };
          
          this.currentPlayer = player;
          localStorage.setItem('currentPlayer', JSON.stringify(player));
          
          // ✅ ADICIONADO: Atualizar formulário de configurações
          this.updateSettingsForm();
          
          console.log('✅ [App] Dados do jogador mapeados com sucesso:', player.summonerName);
          this.addNotification('success', 'Jogador Detectado', `Logado como: ${player.summonerName}`);
        }
      },
      error: (error) => {
        console.error('❌ [App] Erro ao carregar getCurrentPlayerDetails:', error);
        this.addNotification('error', 'Erro API', 'Falha ao carregar dados do jogador');
        this.tryLoadFromLocalStorage();
      }
    });
  }

  private tryLoadFromLocalStorage(): void {
    const stored = localStorage.getItem('currentPlayer');
    if (stored) {
      try {
        this.currentPlayer = JSON.parse(stored);
        console.log('✅ [App] Dados do jogador carregados do localStorage');
      } catch (error) {
        console.warn('⚠️ [App] Erro ao carregar do localStorage');
      }
    }
  }

  private refreshQueueStatus(): void {
    this.apiService.getQueueStatus().subscribe({
      next: (status) => {
        console.log('📊 [App] Status da fila atualizado:', status);
        this.queueStatus = status;
      },
      error: (error) => {
        console.warn('⚠️ [App] Erro ao atualizar status da fila:', error);
      }
    });
  }

  private setupDiscordStatusListener(): void {
    // Implementação simplificada
    this.discordService.checkConnection();
  }

  private startLCUStatusCheck(): void {
    setInterval(() => {
      this.apiService.getLCUStatus().subscribe({
        next: (status) => this.lcuStatus = status,
        error: () => this.lcuStatus = { isConnected: false }
      });
    }, 5000);
  }

  private startQueueStatusCheck(): void {
    setInterval(() => {
      this.refreshQueueStatus();
    }, 3000);
  }

  private checkBackendConnection(): void {
    this.apiService.checkHealth().subscribe({
      next: () => {
        this.isConnected = true;
        console.log('✅ [App] Conectado ao backend');
      },
      error: () => {
        this.isConnected = false;
        console.warn('❌ [App] Backend desconectado');
      }
    });
  }

  private loadConfigFromDatabase(): void {
    this.apiService.getConfigSettings().subscribe({
      next: (config) => {
        console.log('⚙️ [App] Configurações carregadas:', config);
        if (config) {
          this.settingsForm = { ...this.settingsForm, ...config };
        }
      },
      error: (error) => {
        console.warn('⚠️ [App] Erro ao carregar configurações:', error);
      }
    });
  }

  // ✅ MANTIDO: Métodos básicos de interface
  onRefreshData(): void {
    console.log('🔄 [App] Refresh solicitado');
    this.refreshQueueStatus();
    this.loadPlayerData();
  }

  // ✅ MANTIDO: Métodos auxiliares para bots (admin)
  async addBotToQueue(): Promise<void> {
    try {
      await this.apiService.addBotToQueue().toPromise();
      this.addNotification('success', 'Bot Adicionado', 'Bot adicionado à fila com sucesso');
    } catch (error) {
      this.addNotification('error', 'Erro', 'Falha ao adicionar bot');
    }
  }

  // ✅ MANTIDO: Métodos do Electron
  minimizeWindow(): void {
    if (this.isElectron && (window as any).electronAPI) {
      (window as any).electronAPI.minimizeWindow();
    }
  }

  maximizeWindow(): void {
    if (this.isElectron && (window as any).electronAPI) {
      (window as any).electronAPI.maximizeWindow();
    }
  }

  closeWindow(): void {
    if (this.isElectron && (window as any).electronAPI) {
      (window as any).electronAPI.closeWindow();
    }
  }

  // ✅ ADICIONADO: Métodos faltantes para o template
  onAcceptMatch(event: any): void {
    this.acceptMatch();
  }

  onDeclineMatch(event: any): void {
    this.declineMatch();
  }

  onPickBanComplete(event: any): void {
    console.log('🎯 [App] Draft completado:', event);
    this.draftData = event;
    this.inDraftPhase = false;
    this.inGamePhase = true;
  }

  exitDraft(): void {
    console.log('🚪 [App] Saindo do draft');
    this.inDraftPhase = false;
    this.draftData = null;
    this.currentView = 'dashboard';
  }

  onGameComplete(event: any): void {
    console.log('🏁 [App] Jogo completado:', event);
    this.gameResult = event;
    this.inGamePhase = false;
    this.currentView = 'dashboard';
    this.addNotification('success', 'Jogo Concluído!', 'Resultado salvo com sucesso');
  }

  onGameCancel(): void {
    console.log('🚪 [App] Jogo cancelado');
    this.inGamePhase = false;
    this.gameData = null;
    this.currentView = 'dashboard';
  }

  refreshLCUConnection(): void {
    console.log('🔄 [App] Atualizando conexão LCU');
    this.startLCUStatusCheck();
  }

  savePlayerSettings(): void {
    console.log('💾 [App] Salvando configurações do jogador:', this.settingsForm);
    
    if (!this.currentPlayer) {
      this.addNotification('warning', 'Nenhum Jogador', 'Carregue os dados do jogador primeiro');
      return;
    }
    
    // Atualizar dados do jogador atual
    if (this.settingsForm.summonerName) {
      // Se o nome foi editado manualmente, usar como está
      this.currentPlayer.summonerName = this.settingsForm.summonerName;
    }
    
    if (this.settingsForm.region) {
      this.currentPlayer.region = this.settingsForm.region;
    }
    
    // Salvar configurações no backend
    this.apiService.saveSettings({
      summonerName: this.currentPlayer.summonerName,
      region: this.currentPlayer.region,
      gameName: this.currentPlayer.gameName,
      tagLine: this.currentPlayer.tagLine
    }).subscribe({
      next: () => {
        // Salvar no localStorage também
        localStorage.setItem('currentPlayer', JSON.stringify(this.currentPlayer));
        this.addNotification('success', 'Configurações Salvas', 'Suas preferências foram atualizadas no backend');
      },
      error: (error) => {
        console.error('❌ [App] Erro ao salvar configurações:', error);
        this.addNotification('error', 'Erro ao Salvar', 'Não foi possível salvar as configurações');
      }
    });
  }

  onProfileIconError(event: any): void {
    console.warn('⚠️ [App] Erro ao carregar ícone de perfil:', event);
  }

  refreshPlayerData(): void {
    console.log('🔄 [App] Atualizando dados do jogador');
    this.currentPlayer = null; // Limpar dados antigos
    this.loadPlayerData();
    this.addNotification('info', 'Dados Atualizados', 'Dados do jogador foram recarregados do LCU');
  }

  clearPlayerData(): void {
    console.log('🗑️ [App] Limpando dados do jogador');
    this.currentPlayer = null;
    localStorage.removeItem('currentPlayer');
    this.addNotification('info', 'Dados Limpos', 'Dados do jogador foram removidos');
  }

  updateRiotApiKey(): void {
    console.log('🔑 [App] Atualizando Riot API Key:', this.settingsForm.riotApiKey);
    
    if (!this.settingsForm.riotApiKey || this.settingsForm.riotApiKey.trim() === '') {
      this.addNotification('warning', 'API Key Vazia', 'Digite uma API Key válida');
      return;
    }
    
    this.apiService.setRiotApiKey(this.settingsForm.riotApiKey).subscribe({
      next: (response) => {
        console.log('✅ [App] Riot API Key atualizada:', response);
        this.addNotification('success', 'API Key Configurada', 'Riot API Key foi salva no backend');
      },
      error: (error) => {
        console.error('❌ [App] Erro ao configurar API Key:', error);
        this.addNotification('error', 'Erro API Key', 'Não foi possível salvar a API Key');
      }
    });
  }

  updateDiscordBotToken(): void {
    console.log('🤖 [App] Atualizando Discord Bot Token:', this.settingsForm.discordBotToken);
    
    if (!this.settingsForm.discordBotToken || this.settingsForm.discordBotToken.trim() === '') {
      this.addNotification('warning', 'Token Vazio', 'Digite um token do Discord Bot válido');
      return;
    }
    
    this.apiService.setDiscordBotToken(this.settingsForm.discordBotToken).subscribe({
      next: (response) => {
        console.log('✅ [App] Discord Bot Token atualizado:', response);
        this.addNotification('success', 'Bot Configurado', 'Discord Bot Token foi salvo e o bot está sendo reiniciado');
        
        // Atualizar status do Discord após um delay
        setTimeout(() => {
          this.setupDiscordStatusListener();
        }, 3000);
      },
      error: (error) => {
        console.error('❌ [App] Erro ao configurar Discord Bot:', error);
        this.addNotification('error', 'Erro Discord Bot', 'Não foi possível salvar o token do bot');
      }
    });
  }

  updateDiscordChannel(): void {
    console.log('📢 [App] Atualizando canal do Discord:', this.settingsForm.discordChannel);
    
    if (!this.settingsForm.discordChannel || this.settingsForm.discordChannel.trim() === '') {
      this.addNotification('warning', 'Canal Vazio', 'Digite o nome de um canal válido');
      return;
    }
    
    this.apiService.setDiscordChannel(this.settingsForm.discordChannel).subscribe({
      next: (response) => {
        console.log('✅ [App] Canal do Discord atualizado:', response);
        this.addNotification('success', 'Canal Configurado', `Canal '${this.settingsForm.discordChannel}' foi configurado para matchmaking`);
      },
      error: (error) => {
        console.error('❌ [App] Erro ao configurar canal:', error);
        this.addNotification('error', 'Erro Canal', 'Não foi possível configurar o canal');
      }
    });
  }

  isSpecialUser(): boolean {
    // Usuários especiais que têm acesso às ferramentas de desenvolvimento
    const specialUsers = ['Admin', 'wcaco#BR1', 'developer#DEV', 'test#TEST'];
    return this.currentPlayer && specialUsers.includes(this.currentPlayer.summonerName) || false;
  }

  simulateLastCustomMatch(): void {
    console.log('🎮 [App] Simulando última partida customizada');
    
    if (!this.currentPlayer) {
      this.addNotification('warning', 'Nenhum Jogador', 'Carregue os dados do jogador primeiro');
      return;
    }
    
    // Chamará endpoint do backend para simular partida
    this.apiService.getCustomMatches(this.currentPlayer.summonerName, 0, 1).subscribe({
      next: (matches) => {
        if (matches && matches.length > 0) {
          const lastMatch = matches[0];
          console.log('🎮 [App] Simulando partida:', lastMatch);
          this.addNotification('success', 'Simulação Iniciada', `Simulando partida ${lastMatch.id}...`);
          
          // Simular que a partida está sendo executada
          setTimeout(() => {
            this.addNotification('info', 'Simulação Completa', 'Partida simulada com sucesso');
          }, 3000);
        } else {
          this.addNotification('warning', 'Nenhuma Partida', 'Não há partidas customizadas para simular');
        }
      },
      error: (error) => {
        console.error('❌ [App] Erro ao buscar partidas para simulação:', error);
        this.addNotification('error', 'Erro Simulação', 'Não foi possível carregar partidas para simular');
      }
    });
  }

  cleanupTestMatches(): void {
    console.log('🧹 [App] Limpando partidas de teste');
    
    this.apiService.cleanupTestMatches().subscribe({
      next: (response) => {
        console.log('✅ [App] Partidas de teste limpas:', response);
        this.addNotification('success', 'Limpeza Completa', `${response.deletedCount || 0} partidas de teste removidas`);
      },
      error: (error) => {
        console.error('❌ [App] Erro ao limpar partidas de teste:', error);
        this.addNotification('error', 'Erro Limpeza', 'Não foi possível limpar as partidas de teste');
      }
    });
  }

  // ✅ ADICIONADO: Atualizar formulário com dados do jogador atual
  private updateSettingsForm(): void {
    if (this.currentPlayer) {
      this.settingsForm.summonerName = this.currentPlayer.summonerName;
      this.settingsForm.region = this.currentPlayer.region;
      console.log('✅ [App] Formulário de configurações atualizado:', this.settingsForm);
    }
  }

  // ✅ ADICIONADO: Propriedades faltantes para o template
  get currentMatchData(): any {
    return this.draftData || this.gameData || null;
  }
}
