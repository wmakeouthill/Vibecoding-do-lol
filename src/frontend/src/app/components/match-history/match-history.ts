import { Component, Input, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ApiService } from '../../services/api';
import { Player, Match } from '../../interfaces';
import { interval, Subject, Subscription, takeUntil } from 'rxjs';

@Component({
  selector: 'app-match-history',
  imports: [CommonModule],
  templateUrl: './match-history.html',
  styleUrl: './match-history.scss'
})
export class MatchHistoryComponent implements OnInit, OnDestroy {
  @Input() player: Player | null = null;

  matches: Match[] = [];
  loading = false;
  error: string | null = null;
  currentPage = 0;
  totalMatches = 0;
  matchesPerPage = 10;

  currentGame: any = null;
  isInGame = false;
  gamePhase = '';

  private refreshInterval: Subscription | null = null;
  private destroy$ = new Subject<void>();

  constructor(private apiService: ApiService) {}

  ngOnInit() {
    this.loadMatches();
    this.startCurrentGameMonitoring();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    if (this.refreshInterval) {
      this.refreshInterval.unsubscribe();
    }
  }

  private startCurrentGameMonitoring(): void {
    // Check current game every 30 seconds
    this.refreshInterval = interval(30000)
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => {
        this.checkCurrentGame();
      });

    // Initial check
    this.checkCurrentGame();
  }

  private checkCurrentGame(): void {
    if (!this.player) return;

    this.apiService.getCurrentGame().subscribe({
      next: (response) => {
        if (response && response.success && response.currentGame) {
          this.currentGame = response.currentGame;
          this.isInGame = response.currentGame.isInGame;
          this.gamePhase = response.currentGame.phase;
        } else {
          this.isInGame = false;
          this.currentGame = null;
        }
      },
      error: (err) => {
        console.error('Failed to get current game:', err);
        this.isInGame = false;
        this.currentGame = null;
      }
    });
  }  async loadMatches() {
    if (!this.player) return;

    this.loading = true;
    this.error = null;

    try {
      // First try to load real match history from Riot API if player has PUUID
      if (this.player.puuid) {
        this.apiService.getPlayerMatchHistoryFromRiot(this.player.puuid, 20).subscribe({
          next: (response) => {
            if (response && response.success && response.matches) {
              // Process real match data from Riot API
              this.processRiotMatches(response.matches);
              this.loading = false;
              return;
            } else {
              this.fallbackToLocalMatches();
            }
          },
          error: (error) => {
            console.log('Failed to load Riot API matches, trying local:', error);
            this.fallbackToLocalMatches();
          }
        });
      } else {
        this.fallbackToLocalMatches();
      }
    } catch (error: any) {
      this.error = error.message || 'Erro ao carregar histórico de partidas';
      this.loading = false;
      console.error('Error loading match history:', error);
    }
  }

  private fallbackToLocalMatches(): void {
    // Try local database match history
    this.apiService.getMatchHistory(this.player!.id.toString(), this.currentPage * this.matchesPerPage, this.matchesPerPage).subscribe({
      next: (response) => {
        if (response && response.success && response.matches) {
          // Map the API response to our Match interface
          this.matches = this.mapApiMatchesToModel(response.matches);
          this.totalMatches = response.pagination.total;
        } else {
          // Final fallback to mock data if no real data available
          this.matches = this.generateMockMatches();
          this.totalMatches = this.matches.length;
        }
        this.loading = false;
      },
      error: (error) => {
        this.error = error.message || 'Erro ao carregar histórico de partidas';
        this.loading = false;
        console.error('Error loading match history:', error);

        // Fallback to mock data in case of error
        setTimeout(() => {
          this.error = null;
          this.matches = this.generateMockMatches();
          this.totalMatches = this.matches.length;
          this.loading = false;
        }, 1000);
      }
    });
  }

  private processRiotMatches(matchIds: string[]): void {
    if (!matchIds || matchIds.length === 0) {
      this.matches = this.generateMockMatches();
      this.totalMatches = this.matches.length;
      this.loading = false;
      return;
    }

    // Fetch detailed match data for each match ID
    const matchPromises = matchIds.slice(0, 10).map(matchId =>
      this.apiService.getMatchDetails(matchId).toPromise()
    );

    Promise.allSettled(matchPromises).then(results => {
      const validMatches: any[] = [];

      results.forEach(result => {
        if (result.status === 'fulfilled' && result.value?.success) {
          validMatches.push(result.value.match);
        }
      });

      if (validMatches.length > 0) {
        this.matches = this.mapRiotMatchesToModel(validMatches);
        this.totalMatches = this.matches.length;
      } else {
        this.matches = this.generateMockMatches();
        this.totalMatches = this.matches.length;
      }

      this.loading = false;
    }).catch(() => {
      this.fallbackToLocalMatches();
    });
  }

  private mapRiotMatchesToModel(riotMatches: any[]): Match[] {
    return riotMatches.map(matchData => {
      const playerData = matchData.info.participants.find(
        (p: any) => p.puuid === this.player?.puuid
      );

      if (!playerData) {
        return this.createDefaultMatch();
      }

      return {
        id: matchData.metadata.matchId,
        createdAt: new Date(matchData.info.gameCreation),
        duration: matchData.info.gameDuration,
        team1: [], // Could be populated with team data
        team2: [], // Could be populated with team data
        winner: playerData.win ? 1 : 2,
        averageMMR1: 1400, // Could be calculated from team data
        averageMMR2: 1400, // Could be calculated from team data
        playerStats: {
          champion: playerData.championName,
          kills: playerData.kills,
          deaths: playerData.deaths,
          assists: playerData.assists,
          mmrChange: playerData.win ? 15 : -12, // Mock MMR change
          isWin: playerData.win
        }
      };
    });
  }

  private createDefaultMatch(): Match {
    return {
      id: 'unknown_' + Date.now(),
      createdAt: new Date(),
      duration: 1200,
      team1: [],
      team2: [],
      winner: 1,
      averageMMR1: 1200,
      averageMMR2: 1200,
      playerStats: {
        champion: 'Unknown',
        kills: 0,
        deaths: 0,
        assists: 0,
        mmrChange: 0,
        isWin: false
      }
    };
  }

  private mapApiMatchesToModel(apiMatches: any[]): Match[] {
    return apiMatches.map(match => {
      // Convert database match to our frontend Match interface
      return {
        id: match.id || match.match_id,
        createdAt: new Date(match.created_at),
        duration: match.duration || 1200, // Default to 20 minutes if unavailable
        team1: JSON.parse(match.team1_players || '[]'),
        team2: JSON.parse(match.team2_players || '[]'),
        winner: match.winner_team || 0,
        averageMMR1: match.average_mmr_team1 || 0,
        averageMMR2: match.average_mmr_team2 || 0,
        playerStats: {
          champion: match.champion || 'Unknown', // This would come from match details
          kills: match.kills || 0,
          deaths: match.deaths || 0,
          assists: match.assists || 0,
          mmrChange: match.player_mmr_change || 0,
          isWin: match.player_won || false
        }
      };
    });
  }

  private generateMockMatches(): Match[] {
    // Generate some mock match data for demonstration
    const mockMatches: Match[] = [];
    const champions = ['Jinx', 'Ashe', 'Caitlyn', 'Vayne', 'Ezreal', 'Kai\'Sa', 'Sivir', 'Tristana'];

    for (let i = 0; i < 15; i++) {
      const isWin = Math.random() > 0.5;
      const kills = Math.floor(Math.random() * 15) + 1;
      const deaths = Math.floor(Math.random() * 8) + 1;
      const assists = Math.floor(Math.random() * 20) + 2;
      const mmrChange = isWin ? Math.floor(Math.random() * 25) + 10 : -(Math.floor(Math.random() * 20) + 5);

      mockMatches.push({
        id: `match_${i}`,
        createdAt: new Date(Date.now() - (i * 24 * 60 * 60 * 1000)),
        duration: Math.floor(Math.random() * 1800) + 1200, // 20-50 minutes
        team1: [],
        team2: [],
        winner: isWin ? 1 : 2,
        averageMMR1: 1200 + Math.floor(Math.random() * 400),
        averageMMR2: 1200 + Math.floor(Math.random() * 400),
        playerStats: {
          champion: champions[Math.floor(Math.random() * champions.length)],
          kills,
          deaths,
          assists,
          mmrChange,
          isWin
        }
      });
    }

    return mockMatches;
  }

  async loadMoreMatches() {
    this.currentPage++;
    await this.loadMatches();
  }

  getKDA(match: Match): string {
    if (!match.playerStats) return '0/0/0';
    return `${match.playerStats.kills}/${match.playerStats.deaths}/${match.playerStats.assists}`;
  }

  getKDARatio(match: Match): number {
    if (!match.playerStats || match.playerStats.deaths === 0) return 0;
    return ((match.playerStats.kills + match.playerStats.assists) / match.playerStats.deaths);
  }

  getMatchDuration(match: Match): string {
    const minutes = Math.floor(match.duration / 60);
    const seconds = match.duration % 60;
    return `${minutes}m ${seconds}s`;
  }

  getTimeAgo(date: Date): string {
    const now = new Date();
    const diffMs = now.getTime() - new Date(date).getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffMinutes = Math.floor(diffMs / (1000 * 60));

    if (diffDays > 0) return `${diffDays} dia${diffDays > 1 ? 's' : ''} atrás`;
    if (diffHours > 0) return `${diffHours} hora${diffHours > 1 ? 's' : ''} atrás`;
    if (diffMinutes > 0) return `${diffMinutes} minuto${diffMinutes > 1 ? 's' : ''} atrás`;
    return 'Agora mesmo';
  }

  getWinStreakInfo(): { current: number; longest: number } {
    let current = 0;
    let longest = 0;
    let temp = 0;

    for (let i = 0; i < this.matches.length; i++) {
      const match = this.matches[i];
      if (match.playerStats?.isWin) {
        temp++;
        if (i === 0) current = temp;
      } else {
        longest = Math.max(longest, temp);
        temp = 0;
        if (i === 0) current = 0;
      }
    }

    longest = Math.max(longest, temp);
    return { current, longest };
  }

  getTotalStats() {
    const stats = {
      totalKills: 0,
      totalDeaths: 0,
      totalAssists: 0,
      totalWins: 0,
      totalMMRGained: 0
    };

    this.matches.forEach(match => {
      if (match.playerStats) {
        stats.totalKills += match.playerStats.kills;
        stats.totalDeaths += match.playerStats.deaths;
        stats.totalAssists += match.playerStats.assists;
        if (match.playerStats.isWin) stats.totalWins++;
        stats.totalMMRGained += match.playerStats.mmrChange;
      }
    });

    return stats;
  }
  hasMoreMatches(): boolean {
    return (this.currentPage + 1) * this.matchesPerPage < this.totalMatches;
  }
  trackMatch(index: number, match: Match): string {
    return match.id.toString();
  }

  toggleMatchDetails(matchId: string): void {
    // TODO: Implement match details expansion
    console.log('Toggle details for match:', matchId);
  }

  getMostPlayedChampion(): string {
    if (this.matches.length === 0) return 'N/A';

    const championCounts: { [key: string]: number } = {};

    this.matches.forEach(match => {
      if (match.playerStats?.champion) {
        championCounts[match.playerStats.champion] = (championCounts[match.playerStats.champion] || 0) + 1;
      }
    });

    let mostPlayed = '';
    let maxCount = 0;

    for (const [champion, count] of Object.entries(championCounts)) {
      if (count > maxCount) {
        maxCount = count;
        mostPlayed = champion;
      }
    }

    return mostPlayed || 'N/A';
  }
}
