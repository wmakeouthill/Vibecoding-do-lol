import { Component, Input, Output, EventEmitter, OnInit, OnDestroy, OnChanges, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Player, QueueStatus, Match } from '../../interfaces';
import { ApiService } from '../../services/api';
import { ChampionService } from '../../services/champion.service';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-dashboard',
  imports: [CommonModule],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.scss'
})
export class DashboardComponent implements OnInit, OnDestroy, OnChanges {
  @Input() player: Player | null = null;
  @Input() queueStatus: QueueStatus = {
    playersInQueue: 0,
    averageWaitTime: 0,
    estimatedMatchTime: 0,
    isActive: true
  };

  @Output() joinQueue = new EventEmitter<void>();
  @Output() viewHistory = new EventEmitter<void>();
  @Output() openSettings = new EventEmitter<void>();

  leaderboardPosition: number = 0;
  private subscriptions: Subscription[] = [];
  private dataLoaded = false; // Flag para controlar se os dados já foram carregados

  // Dados de partidas - agora preenchidos com dados reais
  recentMatches: Match[] = [];
  isLoadingMatches: boolean = false;
  matchHistoryError: string | null = null;

  // Contagem de partidas customizadas
  customMatchesCount: number = 0;
  isLoadingCustomCount: boolean = false;

  constructor(private apiService: ApiService, private cdr: ChangeDetectorRef, private http: HttpClient) {}

  // Detectar mudanças no player - APENAS quando o player muda pela primeira vez
  ngOnChanges(): void {
    if (this.player && !this.dataLoaded) {
      console.log('🎮 [DASHBOARD] Player data received:', {
        summonerName: this.player.summonerName,
        gameName: this.player.gameName,
        tagLine: this.player.tagLine,
        rank: this.player.rank,
        rankedData: this.player.rankedData
      });
      
      // Carregar dados apenas uma vez
      this.loadAllData();
      this.dataLoaded = true;
    }
  }

  // Tips array
  private tips = [
    {
      title: "Mantenha a calma",
      description: "Jogadores com mentalidade positiva ganham 23% mais partidas. Foque no próximo play, não no último erro!"
    },
    {
      title: "Ward é vida",
      description: "Colocar wards nos momentos certos pode decidir uma partida. Visão é controle de mapa!"
    },
    {
      title: "CS é fundamental",
      description: "10 CS equivalem a 1 kill em gold. Foque em farm consistente para dominar o mid game."
    },
    {
      title: "Jogue com seu time",
      description: "League é um jogo de equipe. Coordenação vale mais que individual skill na maioria das situações."
    }
  ];
  getWinRate(): number {
    // Try to get win rate from ranked data first
    if (this.player?.rankedData?.soloQueue) {
      const soloQueue = this.player.rankedData.soloQueue;
      const totalGames = soloQueue.wins + soloQueue.losses;
      if (totalGames > 0) {
        return Math.round((soloQueue.wins / totalGames) * 100);
      }
    }

    // Fallback to basic wins/losses
    if (!this.player || !this.player.wins || !this.player.losses || (this.player.wins + this.player.losses) === 0) return 0;
    return Math.round((this.player.wins / (this.player.wins + this.player.losses)) * 100);
  }

  getTotalGames(): number {
    // Try to get total games from ranked data first
    if (this.player?.rankedData?.soloQueue) {
      const soloQueue = this.player.rankedData.soloQueue;
      return soloQueue.wins + soloQueue.losses;
    }

    // Fallback to basic wins/losses
    if (!this.player || !this.player.wins || !this.player.losses) return 0;
    return this.player.wins + this.player.losses;
  }

  getRankDisplay(): string {
    if (this.player?.rankedData?.soloQueue) {
      const soloQueue = this.player.rankedData.soloQueue;
      return `${soloQueue.tier} ${soloQueue.rank}`;
    }

    if (this.player?.rank) {
      return this.player.rank.display;
    }

    return 'Unranked';
  }

  getRankLP(): number {
    if (this.player?.rankedData?.soloQueue) {
      return this.player.rankedData.soloQueue.leaguePoints || 0;
    }

    if (this.player?.rank?.lp) {
      return this.player.rank.lp;
    }

    return 0;
  }

  formatWaitTime(seconds: number): string {
    if (seconds === 0) return 'N/A';

    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;

    if (minutes > 0) {
      return `${minutes}m ${remainingSeconds}s`;
    }
    return `${remainingSeconds}s`;
  }

  formatMatchDuration(seconds: number): string {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  }

  formatRelativeTime(timestamp: number): string {
    const now = Date.now();
    const diff = now - timestamp;
    const minutes = Math.floor(diff / (1000 * 60));
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));

    if (days > 0) {
      return `${days} dia${days > 1 ? 's' : ''} atrás`;
    } else if (hours > 0) {
      return `${hours} hora${hours > 1 ? 's' : ''} atrás`;
    } else if (minutes > 0) {
      return `${minutes} minuto${minutes > 1 ? 's' : ''} atrás`;
    } else {
      return 'Agora mesmo';
    }
  }

  getCurrentStreak(): number {
    if (!this.recentMatches || this.recentMatches.length === 0) return 0;

    let streak = 0;
    const lastResult = this.recentMatches[0].isVictory;

    for (const match of this.recentMatches) {
      if (match.isVictory === lastResult) {
        streak++;
      } else {
        break;
      }
    }

    return streak;
  }

  getStreakType(): string {
    if (!this.recentMatches || this.recentMatches.length === 0) return 'sem dados';

    const isWinStreak = this.recentMatches[0].isVictory;
    const streak = this.getCurrentStreak();

    if (streak === 0) return 'sem sequência';

    return isWinStreak ?
      `vitória${streak > 1 ? 's' : ''} seguida${streak > 1 ? 's' : ''}` :
      `derrota${streak > 1 ? 's' : ''} seguida${streak > 1 ? 's' : ''}`;
  }

  getHighestMMR(): number {
    return this.player?.currentMMR ? this.player.currentMMR + 50 : 1200; // Mock highest MMR
  }
  // Método para buscar dados reais de partidas
  loadRecentMatches(): void {
    if (!this.player) {
      this.generateMockData();
      return;
    }

    // Evitar chamadas duplicadas
    if (this.isLoadingMatches) {
      console.log('🔄 [DASHBOARD] Already loading matches, skipping...');
      return;
    }

    this.isLoadingMatches = true;
    this.matchHistoryError = null;

    // Priorizar partidas customizadas do banco de dados primeiro
    this.loadCustomMatchesFromDatabase();
  }

  private loadFromLCU(): void {
    console.log('🎮 Loading match history from LCU (primary source)...');

    // First try to load custom matches from database
    this.loadCustomMatchesFromDatabase();

    const lcuHistorySub = this.apiService.getLCUMatchHistoryAll(0, 3, true) // customOnly = true
      .subscribe({
        next: (response) => {
          this.processLCUMatches(response);
          this.isLoadingMatches = false;
          console.log('✅ Match history loaded from LCU successfully');
        },
        error: (error) => {
          console.warn('⚠️ Primary LCU method failed, trying alternative LCU endpoint:', error.message);
          // Fallback para método original
          this.loadFromLCUOriginal();
        }
      });

    this.subscriptions.push(lcuHistorySub);
  }

  private loadFromLCUOriginal(): void {
    console.log('🔄 Trying alternative LCU endpoint...');

    const lcuHistorySub = this.apiService.getLCUMatchHistoryAll(0, 3, false) // customOnly = false para tentar pegar mais dados
      .subscribe({
        next: (response) => {
          this.processLCUMatches(response);
          this.isLoadingMatches = false;
          console.log('✅ Match history loaded from alternative LCU method');
        },
        error: (error) => {
          console.warn('⚠️ All LCU methods failed, trying Riot API as last resort:', error.message);
          // Fallback para Riot API apenas como último recurso
          this.loadFromRiotAPI();
        }
      });

    this.subscriptions.push(lcuHistorySub);
  }
  private loadFromRiotAPI(): void {
    // Only attempt Riot API if absolutely necessary and show minimal error feedback
    console.log('📡 Attempting to load match history from Riot API as fallback...');

    const riotHistorySub = this.apiService.getPlayerMatchHistoryFromRiot(this.player!.puuid!, this.player!.region || 'br1', 5)
      .subscribe({
        next: (response) => {
          this.processRiotApiMatches(response);
          this.isLoadingMatches = false;
          console.log('✅ Match history loaded from Riot API successfully');
        },
        error: (error) => {
          // Suppress verbose error logging for Riot API failures when service is down
          if (error.message?.includes('Riot API') || error.message?.includes('503') || error.message?.includes('API')) {
            console.log('🚫 Riot API unavailable for match history - using fallback data');
          } else {
            console.warn('⚠️ Failed to load match history from Riot API:', error.message);
          }

          // Set a more user-friendly error message instead of technical details
          this.matchHistoryError = 'Histórico indisponível - dados do LCU serão usados quando possível';
          this.generateMockData(); // Fallback para dados mock
          this.isLoadingMatches = false;
        }
      });

    this.subscriptions.push(riotHistorySub);
  }

  private processRiotApiMatches(response: any): void {
    if (response && response.matches && Array.isArray(response.matches)) {
      // A API retorna apenas IDs, então vamos usar dados básicos mockados por enquanto
      // Em uma implementação completa, faria chamadas para cada matchId para obter detalhes
      this.recentMatches = response.matches.slice(0, 5).map((matchId: string, index: number) => {
        return {
          id: index + 1,
          timestamp: Date.now() - (index * 60 * 60 * 1000), // Simular timestamps
          isVictory: Math.random() > 0.5, // Temporário até obter dados reais
          duration: 1500 + Math.floor(Math.random() * 1200), // 25-45 min
          mmrChange: this.calculateMMRChange(Math.random() > 0.5),
          gameMode: 'Ranked Solo',
          champion: 'Unknown', // Temporário
          kda: '0/0/0' // Temporário
        };
      });
    } else {
      // Fallback para LCU se não conseguir dados da Riot API
      this.loadFromLCU();
    }
  }

  private processLCUMatches(response: any): void {
    // A estrutura do LCU agora retorna { success: true, matches: [...] }
    let games = null;

    if (response && response.success && Array.isArray(response.matches)) {
      games = response.matches;
    } else if (response && Array.isArray(response.games)) {
      games = response.games;
    } else if (response && Array.isArray(response)) {
      games = response;
    }

    if (games && games.length > 0) {
      // Pegar só as 3 primeiras para o dashboard
      const selectedGames = games.slice(0, 3);

      this.recentMatches = selectedGames.map((match: any, index: number) => {
        // Encontrar o jogador atual para determinar vitória
        const currentPlayerPuuid = this.player?.puuid;
        let isVictory = false;
        let playerStats = null;
        let currentPlayerIdentity = null;
        let currentParticipant = null;

        if (currentPlayerPuuid && match.participants) {
          // Encontrar o participante atual
          currentParticipant = match.participants.find((p: any) =>
            match.participantIdentities?.find((pi: any) =>
              pi.participantId === p.participantId &&
              pi.player?.puuid === currentPlayerPuuid
            )
          );

          // Encontrar a identidade do jogador atual
          currentPlayerIdentity = match.participantIdentities?.find((pi: any) =>
            pi.player?.puuid === currentPlayerPuuid
          );

          if (currentParticipant) {
            isVictory = currentParticipant.stats?.win || false;
            playerStats = currentParticipant.stats;
          }
        }

        // Determinar o modo de jogo (para partidas personalizadas usar gameType)
        let gameMode = match.gameMode || 'CLASSIC';
        if (match.gameType === 'CUSTOM_GAME') {
          gameMode = 'CUSTOM';
        }

        // Tentar pegar o championId do participante principal
        const championId = currentParticipant?.championId || playerStats?.championId;
        const championName = ChampionService.getChampionNameById(championId);

        // Buscar o nome do jogador
        const playerName = currentPlayerIdentity?.player?.gameName ||
                          this.player?.summonerName ||
                          'Unknown';

        const processedMatch = {
          id: index + 1,
          timestamp: match.gameCreation || match.gameStartTime || Date.now(),
          isVictory: isVictory,
          duration: match.gameDuration || match.gameLength || 1800,
          mmrChange: this.calculateMMRChange(isVictory),
          gameMode: this.formatGameMode(gameMode),
          champion: championName || 'Unknown',
          playerName: playerName,
          kda: `${playerStats?.kills || 0}/${playerStats?.deaths || 0}/${playerStats?.assists || 0}`
        };

        return processedMatch;
      });

      // Força a detecção de mudanças
      this.cdr.detectChanges();
    } else {
      this.generateMockData();
    }
  }

  private calculateMMRChange(isWin: boolean): number {
    const baseChange = Math.floor(Math.random() * 10) + 10; // 10-20 pontos
    return isWin ? baseChange : -baseChange;
  }

  private formatGameMode(gameMode: string): string {
    const gameModes: { [key: string]: string } = {
      'CLASSIC': 'Ranked Solo',
      'RANKED_SOLO_5x5': 'Ranked Solo',
      'RANKED_FLEX_SR': 'Ranked Flex',
      'ARAM': 'ARAM',
      'NORMAL': 'Normal',
      'DRAFT': 'Draft Pick',
      'CUSTOM': 'Personalizada',
      'PRACTICETOOL': 'Ferramenta de Treino',
      'TUTORIAL': 'Tutorial',
      'ONEFORALL': 'Um para Todos',
      'ASCENSION': 'Ascensão',
      'FIRSTBLOOD': 'Snowdown Showdown',
      'KINGPORO': 'Rei Poro',
      'SIEGE': 'Nexus Siege',
      'ASSASSINATE': 'Blood Hunt Assassin',
      'ARSR': 'All Random Summoner\'s Rift',
      'DARKSTAR': 'Dark Star: Singularity',
      'STARGUARDIAN': 'Star Guardian',
      'PROJECT': 'PROJECT: Hunters',
      'GAMEMODEX': 'Nexus Blitz',
      'ODYSSEY': 'Odyssey: Extraction',
      'NEXUSBLITZ': 'Nexus Blitz',
      'ULTBOOK': 'Ultimate Spellbook',
      'CHERRY': 'Arena',
      'URF': 'URF',
      'ARURF': 'ARURF'
    };

    return gameModes[gameMode] || gameMode || 'Personalizada';
  }

  getTodayWins(): number {
    if (!this.recentMatches) return 0;

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayTimestamp = today.getTime();

    return this.recentMatches.filter(match =>
      match.timestamp && match.timestamp >= todayTimestamp && match.isVictory
    ).length;
  }  loadLeaderboardPosition(): void {
    if (!this.player?.summonerName) {
      this.leaderboardPosition = 0;
      return;
    }

    // Buscar posição real do leaderboard usando o mesmo endpoint do leaderboard
    const leaderboardSub = this.http.get<any>('http://localhost:3000/api/stats/participants-leaderboard?limit=50').subscribe({
      next: (response: any) => {
        if (response && response.success && response.data) {
          // Procurar o jogador atual no leaderboard
          const playerIndex = response.data.findIndex((p: any) =>
            p.summoner_name?.toLowerCase() === this.player?.summonerName?.toLowerCase() ||
            p.riot_id_game_name?.toLowerCase() === this.player?.gameName?.toLowerCase()
          );

          if (playerIndex !== -1) {
            this.leaderboardPosition = playerIndex + 1;
            console.log(`🏆 Posição encontrada no leaderboard: #${this.leaderboardPosition}`);
          } else {
            // Se não encontrar no top 50, buscar na lista completa
            this.searchFullLeaderboard();
          }
        } else {
          this.leaderboardPosition = 0;
        }
        this.cdr.detectChanges();
      },
      error: (error: any) => {
        console.warn('⚠️ Erro ao buscar posição no leaderboard:', error);
        this.leaderboardPosition = 0;
        this.cdr.detectChanges();
      }
    });

    this.subscriptions.push(leaderboardSub);
  }

  private searchFullLeaderboard(): void {
    // Buscar com limite maior para encontrar jogadores fora do top 50
    const fullLeaderboardSub = this.http.get<any>('http://localhost:3000/api/stats/participants-leaderboard?limit=200').subscribe({
      next: (response: any) => {
        if (response && response.success && response.data) {
          const playerIndex = response.data.findIndex((p: any) =>
            p.summoner_name?.toLowerCase() === this.player?.summonerName?.toLowerCase() ||
            p.riot_id_game_name?.toLowerCase() === this.player?.gameName?.toLowerCase()
          );

          if (playerIndex !== -1) {
            this.leaderboardPosition = playerIndex + 1;
            console.log(`🏆 Posição encontrada no leaderboard completo: #${this.leaderboardPosition}`);
          } else {
            this.leaderboardPosition = 0; // Não ranqueado
            console.log('📊 Jogador não encontrado no leaderboard');
          }
        } else {
          this.leaderboardPosition = 0;
        }
        this.cdr.detectChanges();
      },
      error: (error: any) => {
        console.warn('⚠️ Erro ao buscar leaderboard completo:', error);
        this.leaderboardPosition = 0;
        this.cdr.detectChanges();
      }
    });

    this.subscriptions.push(fullLeaderboardSub);
  }

  getCurrentTip() {
    const today = new Date().getDate();
    return this.tips[today % this.tips.length];
  }

  getRankColor(): string {
    if (!this.player?.rank) return '#8a8a8a';

    const tier = this.player.rank.tier.toLowerCase();
    const colors: { [key: string]: string } = {
      'iron': '#4a4a4a',
      'bronze': '#cd7f32',
      'silver': '#c0c0c0',
      'gold': '#ffd700',
      'platinum': '#00ff9f',
      'diamond': '#b9f2ff',
      'master': '#9933ff',
      'grandmaster': '#ff3333',
      'challenger': '#f0e68c'
    };

    return colors[tier] || '#8a8a8a';
  }

  getWaitTimeText(): string {
    if (!this.queueStatus.averageWaitTime || this.queueStatus.averageWaitTime === 0) {
      return 'Calculando...';
    }
    return this.formatWaitTime(this.queueStatus.averageWaitTime);
  }

  // ========== MÉTODOS DE RANK MELHORADOS ==========

  hasSoloQueueRank(): boolean {
    return !!(this.player?.rankedData?.soloQueue?.tier || this.player?.rank?.tier);
  }

  hasFlexRank(): boolean {
    return !!(this.player?.rankedData?.flexQueue?.tier);
  }

  getSoloQueueRank(): string {
    if (this.player?.rankedData?.soloQueue) {
      const soloQueue = this.player.rankedData.soloQueue;
      return `${soloQueue.tier} ${soloQueue.rank || soloQueue.division || 'IV'}`;
    }

    if (this.player?.rank) {
      return this.player.rank.display || `${this.player.rank.tier} ${this.player.rank.rank}`;
    }

    return 'Unranked';
  }

  getSoloQueueLP(): number {
    if (this.player?.rankedData?.soloQueue) {
      return this.player.rankedData.soloQueue.leaguePoints || 0;
    }

    if (this.player?.rank?.lp) {
      return this.player.rank.lp;
    }

    return 0;
  }

  getFlexRank(): string {
    if (this.player?.rankedData?.flexQueue) {
      const flexQueue = this.player.rankedData.flexQueue;
      return `${flexQueue.tier} ${flexQueue.rank || flexQueue.division || 'IV'}`;
    }

    return 'Unranked';
  }

  getFlexLP(): number {
    if (this.player?.rankedData?.flexQueue) {
      return this.player.rankedData.flexQueue.leaguePoints || 0;
    }

    return 0;
  }

  getRankStatus(): string {
    // Check if we have partial data (LCU only)
    const isPartialData = (this.player as any)?._isPartialData;
    const dataSource = (this.player as any)?._dataSource;

    if (isPartialData) {
      return 'Dados incompletos';
    }

    if (!this.hasSoloQueueRank() && !this.hasFlexRank()) {
      return 'Unranked';
    }

    return 'Sem dados';
  }

  // ========== FIM DOS MÉTODOS DE RANK MELHORADOS ==========

  // Método para gerar dados de exemplo quando não há dados reais
  generateMockData(): void {
    this.recentMatches = [
      {
        id: 1,
        timestamp: Date.now() - 1000 * 60 * 30, // 30 minutes ago
        isVictory: true,
        duration: 1800, // 30 minutes
        mmrChange: 15,
        gameMode: 'Personalizada',
        champion: 'Jinx',
        kda: '12/3/8'
      },
      {
        id: 2,
        timestamp: Date.now() - 1000 * 60 * 60 * 2, // 2 hours ago
        isVictory: false,
        duration: 1500, // 25 minutes
        mmrChange: -12,
        gameMode: 'ARAM',
        champion: 'Yasuo',
        kda: '8/7/5'
      },
      {
        id: 3,
        timestamp: Date.now() - 1000 * 60 * 60 * 5, // 5 hours ago
        isVictory: true,
        duration: 2100, // 35 minutes
        mmrChange: 18,
        gameMode: 'Personalizada',
        champion: 'Thresh',
        kda: '2/2/18'
      }
    ];

    // Remover o erro se houver dados mockados
    this.matchHistoryError = null;
  }
  ngOnInit(): void {
    // Se já temos dados do player, carregar imediatamente
    if (this.player && !this.dataLoaded) {
      this.loadAllData();
      this.dataLoaded = true;
    }
  }

  ngOnDestroy(): void {
    // Limpar todas as subscriptions
    this.subscriptions.forEach(sub => sub.unsubscribe());
  }

  // Método centralizado para carregar todos os dados
  private loadAllData(): void {
    this.loadRecentMatches();
    this.loadCustomMatchesCount();
    this.loadLeaderboardPosition();
  }

  // Public method to refresh all dashboard data (para uso manual)
  public refreshAllData(): void {
    console.log('🔄 Atualizando todos os dados do dashboard');
    this.dataLoaded = false; // Reset flag para permitir recarregamento
    this.loadAllData();
    this.dataLoaded = true;
  }

  // Método para carregar contagem de partidas customizadas
  public loadCustomMatchesCount(): void {
    if (!this.player) return;

    // Usar o formato correto do Riot ID (gameName#tagLine) se disponível
    let playerIdentifier = this.player.summonerName || this.player.id.toString();
    
    // Se temos gameName e tagLine, usar o formato Riot ID
    if (this.player.gameName && this.player.tagLine) {
      playerIdentifier = `${this.player.gameName}#${this.player.tagLine}`;
    } else if (this.player.summonerName && this.player.tagLine) {
      playerIdentifier = `${this.player.summonerName}#${this.player.tagLine}`;
    }

    console.log('🔢 Carregando contagem de partidas customizadas para:', playerIdentifier);

    const countSub = this.apiService.getCustomMatchesCount(playerIdentifier)
      .subscribe({
        next: (response) => {
          if (response && response.success) {
            this.customMatchesCount = response.count || 0;
            console.log('✅ Contagem de partidas customizadas carregada:', this.customMatchesCount);
          } else {
            console.warn('⚠️ Resposta inválida ao carregar contagem:', response);
            this.customMatchesCount = 0;
          }
          this.isLoadingCustomCount = false;
        },
        error: (error) => {
          console.warn('⚠️ Erro ao carregar contagem de partidas customizadas:', error);
          this.customMatchesCount = 0;
          this.isLoadingCustomCount = false;
        }
      });

    this.subscriptions.push(countSub);
  }

  // Event handlers
  onJoinQueue(): void {
    this.joinQueue.emit();
  }

  onViewHistory(): void {
    this.viewHistory.emit();
  }

  onOpenSettings(): void {
    this.openSettings.emit();
  }

  onProfileIconError(event: any): void {
    // Fallback para ícone padrão se falhar o carregamento
    const iconId = this.player?.profileIconId || 29;

    const fallbackUrls = [
      `https://ddragon.leagueoflegends.com/cdn/15.13.1/img/profileicon/${iconId}.png`,
      `https://ddragon.leagueoflegends.com/cdn/14.24.1/img/profileicon/${iconId}.png`,
      `https://ddragon.leagueoflegends.com/cdn/14.23.1/img/profileicon/${iconId}.png`,
      'https://ddragon.leagueoflegends.com/cdn/15.13.1/img/profileicon/29.png', // Default icon
      'https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/v1/profile-icons/29.jpg'
    ];

    // Se já tentou todos os fallbacks, usar um ícone SVG genérico
    const currentAttempt = parseInt(event.target.dataset.fallbackAttempt || '0');
    if (currentAttempt >= fallbackUrls.length - 1) {
      return;
    }

    const attemptIndex = currentAttempt + 1;
    event.target.dataset.fallbackAttempt = attemptIndex.toString();
    event.target.src = fallbackUrls[attemptIndex];
  }

  getPlayerTag(): string {
    if (this.player?.tagLine) {
      return ` #${this.player.tagLine}`;
    }
    return '';
  }

  getProfileIconUrl(): string {
    const iconId = this.player?.profileIconId || 29;
    // Usar Community Dragon como primeira opção (mais confiável)
    return `https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/v1/profile-icons/${iconId}.jpg`;
  }

  // Método para mostrar feedback visual quando botões são clicados
  showButtonFeedback(event: Event): void {
    const button = event.currentTarget as HTMLElement;
    button.style.transform = 'scale(0.95)';
    setTimeout(() => {
      button.style.transform = '';
    }, 150);
  }
  public loadCustomMatchesFromDatabase(): void {
    if (!this.player) return;

    // Evitar chamadas duplicadas
    if (this.isLoadingMatches && this.recentMatches.length > 0) {
      console.log('🔄 [DASHBOARD] Already have recent matches, skipping database load...');
      return;
    }

    console.log('💾 Loading custom matches from database...');

    // Usar o formato correto do Riot ID (gameName#tagLine) se disponível
    let playerIdentifier = this.player.summonerName || this.player.id.toString();
    
    // Se temos gameName e tagLine, usar o formato Riot ID
    if (this.player.gameName && this.player.tagLine) {
      playerIdentifier = `${this.player.gameName}#${this.player.tagLine}`;
    } else if (this.player.summonerName && this.player.tagLine) {
      playerIdentifier = `${this.player.summonerName}#${this.player.tagLine}`;
    }

    console.log('🔍 [DASHBOARD] Player data received:', {
      summonerName: this.player.summonerName,
      gameName: this.player.gameName,
      tagLine: this.player.tagLine,
      rank: this.player.rank,
      rankedData: this.player.rankedData
    });

    console.log('🎯 [DASHBOARD] Using player identifier for search:', playerIdentifier);

    const customMatchesSub = this.apiService.getCustomMatches(playerIdentifier, 0, 3)
      .subscribe({
        next: (response) => {
          if (response && response.success && response.matches && response.matches.length > 0) {
            console.log('✅ Custom matches loaded from database:', response.matches.length);

            // Convert custom matches to dashboard format
            const customMatchesForDashboard = this.convertCustomMatchesToDashboard(response.matches);

            // Use ONLY custom matches for recent activity - prioritize database data
            this.recentMatches = customMatchesForDashboard.slice(0, 3);

            console.log('🎯 Recent matches from database:', this.recentMatches.length);
            this.isLoadingMatches = false;
            this.matchHistoryError = null;
          } else {
            console.log('📝 No custom matches found in database, falling back to LCU data');
            // Only fallback to LCU if no custom matches exist
            this.loadFromLCU();
          }
        },
        error: (error) => {
          console.warn('⚠️ Failed to load custom matches from database:', error);
          // Fallback to LCU on error
          this.loadFromLCU();
        }
      });

    this.subscriptions.push(customMatchesSub);
  }
  private convertCustomMatchesToDashboard(customMatches: any[]): any[] {
    return customMatches.map((match: any) => {
      // Parse JSON fields safely
      let team1Players = [];
      let team2Players = [];
      let pickBanData = null;
      let participantsData = [];

      try {
        team1Players = typeof match.team1_players === 'string' ? JSON.parse(match.team1_players) : (match.team1_players || []);
        team2Players = typeof match.team2_players === 'string' ? JSON.parse(match.team2_players) : (match.team2_players || []);
        participantsData = typeof match.participants_data === 'string' ? JSON.parse(match.participants_data) : (match.participants_data || []);

        if (match.pick_ban_data) {
          pickBanData = typeof match.pick_ban_data === 'string' ? JSON.parse(match.pick_ban_data) : match.pick_ban_data;
        }
      } catch (e) {
        console.warn('⚠️ Error parsing custom match data:', e);
      }

      // Determine player's champion and KDA from participants data
      let playerChampion = 'Unknown';
      let playerKDA = '0/0/0';
      let playerStats = null;

      // Try to find player in participants data first (more accurate)
      if (participantsData && participantsData.length > 0) {
        const currentPlayerName = this.player?.summonerName?.toLowerCase();
        playerStats = participantsData.find((participant: any) => {
          const participantName = participant.riotIdGameName || participant.gameName || participant.summonerName || '';
          return participantName.toLowerCase() === currentPlayerName;
        });        if (playerStats) {
          // Use championId if available, otherwise fallback to championName
          const championId = playerStats.championId;
          playerChampion = championId ?
            ChampionService.getChampionNameById(championId) :
            (playerStats.championName || playerStats.champion || 'Unknown');
          playerKDA = `${playerStats.kills || 0}/${playerStats.deaths || 0}/${playerStats.assists || 0}`;
        }
      }

      // Fallback: Determine player's champion from pick/ban data
      if (playerChampion === 'Unknown' && pickBanData) {
        try {
          if (pickBanData && pickBanData.team1Picks) {
            const playerTeam = match.player_team || (match.player_won && match.winner_team === 1 ? 1 : 2);
            const picks = playerTeam === 1 ? pickBanData.team1Picks : pickBanData.team2Picks;

            if (picks && picks.length > 0) {
              const currentPlayerName = this.player?.summonerName?.toLowerCase();
              let playerPick = picks.find((pick: any) =>
                pick.player && pick.player.toString().toLowerCase().includes(currentPlayerName || '')
              );

              if (!playerPick && picks.length > 0) {
                playerPick = picks[0]; // Fallback to first pick
              }              if (playerPick && playerPick.champion) {
                // Try to get championId first, then fallback to champion name
                if (playerPick.championId) {
                  playerChampion = ChampionService.getChampionNameById(playerPick.championId);
                } else {
                  playerChampion = playerPick.champion;
                  // If it's a number string, try to convert and map it
                  const championIdNum = parseInt(playerChampion);
                  if (!isNaN(championIdNum)) {
                    playerChampion = ChampionService.getChampionNameById(championIdNum);
                  }
                }
              }
            }
          }
        } catch (e) {
          console.warn('⚠️ Error extracting player champion:', e);
        }
      }

      // Use the MMR change from database if available, otherwise calculate a default
      const mmrChange = match.player_mmr_change || match.player_lp_change || (match.player_won ? 15 : -10);

      return {
        id: match.id || match.match_id,
        timestamp: new Date(match.created_at).getTime(),
        isVictory: match.player_won || false,
        duration: (match.duration || 25) * 60, // Convert minutes to seconds
        mmrChange: mmrChange, // Use actual MMR change from database
        gameMode: 'Personalizada',
        champion: playerChampion,
        kda: playerKDA,
        isCustomMatch: true // Flag to identify custom matches
      };
    });
  }
}
