import { Component, Input, Output, EventEmitter, OnInit, OnDestroy, OnChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Player, QueueStatus, Match } from '../../interfaces';
import { ApiService } from '../../services/api';
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

  // Dados de partidas - agora preenchidos com dados reais
  recentMatches: Match[] = [];
  isLoadingMatches: boolean = false;
  matchHistoryError: string | null = null;

  constructor(private apiService: ApiService) {}

  // Detectar mudanças no player
  ngOnChanges(): void {
    if (this.player) {
      this.loadRecentMatches();
      this.leaderboardPosition = this.getLeaderboardPosition();
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
  }  // Método para buscar dados reais de partidas
  loadRecentMatches(): void {
    if (!this.player?.puuid) {
      this.generateMockData();
      return;
    }

    this.isLoadingMatches = true;
    this.matchHistoryError = null;    // Tentar buscar do LCU primeiro (mais confiável para dados detalhados)
    this.loadFromLCU();
  }
  private loadFromLCU(): void {
    const lcuHistorySub = this.apiService.getLCUMatchHistory(0, 5)
      .subscribe({
        next: (response) => {
          this.processLCUMatches(response);
          this.isLoadingMatches = false;
        },
        error: (error) => {
          console.warn('Falha ao buscar histórico do LCU:', error);
          // Fallback para Riot API
          this.loadFromRiotAPI();
        }
      });

    this.subscriptions.push(lcuHistorySub);
  }

  private loadFromRiotAPI(): void {
    const riotHistorySub = this.apiService.getPlayerMatchHistoryFromRiot(this.player!.puuid!, this.player!.region || 'br1', 5)
      .subscribe({
        next: (response) => {
          this.processRiotApiMatches(response);
          this.isLoadingMatches = false;
        },
        error: (error) => {
          console.warn('Falha ao buscar histórico da Riot API:', error);
          this.matchHistoryError = 'Não foi possível carregar o histórico de partidas';
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
    if (response && response.games && Array.isArray(response.games.games)) {
      this.recentMatches = response.games.games.slice(0, 5).map((match: any, index: number) => {
        const stats = match.stats || {};

        return {
          id: index + 1,
          timestamp: match.gameCreation || Date.now(),
          isVictory: stats.win || false,
          duration: match.gameDuration || 1800,
          mmrChange: this.calculateMMRChange(stats.win || false),
          gameMode: this.formatGameMode(match.gameMode),
          champion: match.championName || 'Unknown',
          kda: `${stats.kills || 0}/${stats.deaths || 0}/${stats.assists || 0}`
        };
      });
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
      'DRAFT': 'Draft Pick'
    };

    return gameModes[gameMode] || 'Custom';
  }

  getTodayWins(): number {
    if (!this.recentMatches) return 0;

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayTimestamp = today.getTime();

    return this.recentMatches.filter(match =>
      match.timestamp && match.timestamp >= todayTimestamp && match.isVictory
    ).length;
  }

  getLeaderboardPosition(): number {
    // Calcular posição baseada no MMR do jogador se disponível
    if (this.player?.currentMMR) {
      // Simulação: quanto maior o MMR, melhor a posição
      const mmr = this.player.currentMMR;
      if (mmr >= 2500) return Math.floor(Math.random() * 10) + 1; // Top 10
      if (mmr >= 2000) return Math.floor(Math.random() * 50) + 1; // Top 50
      if (mmr >= 1500) return Math.floor(Math.random() * 100) + 1; // Top 100
      return Math.floor(Math.random() * 500) + 100; // Abaixo de top 100
    }

    return Math.floor(Math.random() * 100) + 1; // Fallback
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

  // Método para gerar dados de exemplo quando não há dados reais
  generateMockData(): void {
    if (!this.player && !this.recentMatches.length) {
      // Adicionar algumas partidas de exemplo
      this.recentMatches = [
        {
          id: 1,
          timestamp: Date.now() - 1000 * 60 * 30, // 30 minutes ago
          isVictory: true,
          duration: 1800, // 30 minutes
          mmrChange: 15,
          gameMode: 'Ranked Solo'
        },
        {
          id: 2,
          timestamp: Date.now() - 1000 * 60 * 60 * 2, // 2 hours ago
          isVictory: false,
          duration: 1500, // 25 minutes
          mmrChange: -12,
          gameMode: 'Ranked Solo'
        },
        {
          id: 3,
          timestamp: Date.now() - 1000 * 60 * 60 * 5, // 5 hours ago
          isVictory: true,
          duration: 2100, // 35 minutes
          mmrChange: 18,
          gameMode: 'Ranked Solo'
        }
      ];
    }
  }
  ngOnInit(): void {
    this.loadRecentMatches();
    this.leaderboardPosition = this.getLeaderboardPosition();
  }

  ngOnDestroy(): void {
    // Limpar todas as subscriptions
    this.subscriptions.forEach(sub => sub.unsubscribe());
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
  }  onProfileIconError(event: any): void {
    // Fallback para ícone padrão se falhar o carregamento
    console.log('Erro ao carregar ícone de perfil, tentando fallback');

    const iconId = this.player?.profileIconId || 29;    const fallbackUrls = [
      `https://ddragon.leagueoflegends.com/cdn/15.12.1/img/profileicon/${iconId}.png`,
      `https://ddragon.leagueoflegends.com/cdn/14.24.1/img/profileicon/${iconId}.png`,
      `https://ddragon.leagueoflegends.com/cdn/14.23.1/img/profileicon/${iconId}.png`,
      `https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/v1/profile-icons/${iconId}.jpg`,
      'https://ddragon.leagueoflegends.com/cdn/15.12.1/img/profileicon/29.png', // Default icon
      'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iODAiIGhlaWdodD0iODAiIHZpZXdCb3g9IjAgMCA4MCA4MCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPGNpcmNsZSBjeD0iNDAiIGN5PSI0MCIgcj0iNDAiIGZpbGw9IiM0Njc0ODEiLz4KPHN2ZyB4PSIxNiIgeT0iMTYiIHdpZHRoPSI0OCIgaGVpZ2h0PSI0OCIgdmlld0JveD0iMCAwIDI0IDI0IiBmaWxsPSJub25lIj4KPHA+PHBhdGggZD0iTTEyIDEyYzIuMjEgMCA0LTEuNzkgNC00cy0xLjc5LTQtNC00LTQgMS43OS00IDQgMS43OSA0IDQgNHptMCA2Yy0yLjY3IDAtOCAxLjM0LTggNHYyaDE2di0yYzAtMi42Ni01LjMzLTQtOC00eiIgZmlsbD0iI0ZGRiIvPgo8L3N2Zz4KPC9zdmc+'
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
  }  getProfileIconUrl(): string {
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
}
