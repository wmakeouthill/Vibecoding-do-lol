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

  // Tab system
  activeTab: string = 'riot'; // Aceita apenas 'riot' ou 'custom' para evitar erro de lint

  // Match arrays
  matches: Match[] = []; // Legacy - será mantido para compatibilidade
  riotMatches: Match[] = []; // Partidas da Riot API
  customMatches: Match[] = []; // Partidas customizadas

  // Expanded matches tracking
  expandedMatches: Set<string> = new Set();

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

  // ========== LOADING METHODS ==========
  loadCurrentTabMatches(): void {
    if (this.activeTab === 'riot') {
      this.loadRiotMatches();
    } else {
      this.loadCustomMatches();
    }
  }

  loadRiotMatches(): void {
    if (!this.player) return;

    this.loading = true;
    this.error = null;

    try {      if (this.player.puuid) {
        // Para histórico da Riot API, sempre usar 'americas' como região
        this.apiService.getPlayerMatchHistoryFromRiot(this.player.puuid, 'americas', 20).subscribe({
          next: (response: any) => {
            if (response && response.success && response.matches) {
              this.processRiotMatches(response.matches);
              this.loading = false;
              return;
            } else {
              this.riotMatches = this.generateMockRiotMatches();
              this.loading = false;
            }
          },
          error: (error: any) => {
            console.log('Failed to load Riot API matches:', error);
            this.riotMatches = this.generateMockRiotMatches();
            this.loading = false;
          }
        });
      } else {
        this.riotMatches = this.generateMockRiotMatches();
        this.loading = false;
      }
    } catch (error: any) {
      this.error = error.message || 'Erro ao carregar histórico da Riot API';
      this.loading = false;
      console.error('Error loading Riot match history:', error);
    }
  }

  loadCustomMatches(): void {
    if (!this.player) return;

    this.loading = true;
    this.error = null;

    try {
      this.apiService.getCustomMatches(this.player.id.toString(), this.currentPage * this.matchesPerPage, this.matchesPerPage).subscribe({
        next: (response) => {
          if (response && response.success && response.matches) {
            this.customMatches = this.mapApiMatchesToModel(response.matches);
            this.totalMatches = response.pagination.total;
          } else {
            this.customMatches = this.generateMockCustomMatches();
            this.totalMatches = this.customMatches.length;
          }
          this.loading = false;
        },
        error: (error) => {
          this.error = error.message || 'Erro ao carregar partidas customizadas';
          this.loading = false;
          console.error('Error loading custom match history:', error);

          // Fallback to mock data
          setTimeout(() => {
            this.error = null;
            this.customMatches = this.generateMockCustomMatches();
            this.totalMatches = this.customMatches.length;
            this.loading = false;
          }, 1000);
        }
      });
    } catch (error: any) {
      this.error = error.message || 'Erro ao carregar partidas customizadas';
      this.loading = false;
      console.error('Error loading custom match history:', error);
    }
  }
  // ========== TAB SYSTEM ==========
  setActiveTab(tab: string): void {
    this.activeTab = tab;
    this.currentPage = 0;
    this.loadCurrentTabMatches();
  }

  // Helper function para evitar erro de lint no template
  isCustomTab(): boolean {
    return this.activeTab === 'custom';
  }

  isRiotTab(): boolean {
    return this.activeTab === 'riot';
  }

  getCurrentMatches(): Match[] {
    return this.activeTab === 'riot' ? this.riotMatches : this.customMatches;
  }

  getWinRate(): string {
    const matches = this.getCurrentMatches();
    if (matches.length === 0) return '0.0';
    const wins = matches.filter(m => m.playerStats?.isWin).length;
    return ((wins / matches.length) * 100).toFixed(1);
  }
  ngOnInit() {
    // Always load mock data to demonstrate the interface
    this.riotMatches = this.generateMockRiotMatches();
    this.customMatches = this.generateMockCustomMatches();

    // If there's a player, try to load real data
    if (this.player) {
      this.loadCurrentTabMatches();
    }

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
      next: (response: any) => { // Adicionar tipagem explícita
        if (response && response.success && response.currentGame) {
          this.currentGame = response.currentGame;
          this.isInGame = response.currentGame.isInGame;
          this.gamePhase = response.currentGame.phase;
        } else {
          this.isInGame = false;
          this.currentGame = null;
        }
      },
      error: (err: any) => { // Adicionar tipagem explícita
        console.error('Failed to get current game:', err);
        this.isInGame = false;
        this.currentGame = null;
      }
    });
  }  // Legacy method for compatibility
  async loadMatches() {
    return this.loadCurrentTabMatches();
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
  }  private processRiotMatches(matchIds: string[]): void {
    if (!matchIds || matchIds.length === 0) {
      this.riotMatches = this.generateMockRiotMatches();
      this.totalMatches = this.riotMatches.length;
      this.loading = false;
      return;
    }

    console.log('🔄 Processando', matchIds.length, 'partidas da Riot API');

    // Fetch detailed match data for all match IDs
    const matchPromises = matchIds.map(matchId =>
      this.apiService.getMatchDetails(matchId).toPromise()
    );

    Promise.allSettled(matchPromises).then(results => {
      const validMatches: any[] = [];

      results.forEach((result, index) => {
        if (result.status === 'fulfilled' && result.value?.success) {
          const matchData = result.value.match;
          console.log(`✅ Partida ${matchIds[index]} carregada:`, {
            gameMode: matchData.info.gameMode,
            duration: matchData.info.gameDuration,
            participants: matchData.info.participants.length,
            playerFound: !!matchData.info.participants.find((p: any) => p.puuid === this.player?.puuid)
          });
          validMatches.push(matchData);
        } else {
          console.warn(`❌ Falha ao carregar partida ${matchIds[index]}:`, result);
        }
      });

      if (validMatches.length > 0) {
        console.log('📊 Mapeando', validMatches.length, 'partidas válidas');
        this.riotMatches = this.mapRiotMatchesToModel(validMatches);
        this.totalMatches = this.riotMatches.length;
          // Debug: Log do primeiro match processado
        if (this.riotMatches.length > 0) {
          const firstMatch = this.riotMatches[0];
          console.log('🎮 Primeira partida processada:', {
            id: firstMatch.id,
            mode: firstMatch.gameMode,
            playerChampion: firstMatch.playerStats?.champion,
            team1Size: firstMatch.team1?.length || 0,
            team2Size: firstMatch.team2?.length || 0,
            winner: firstMatch.winner
          });
        }
      } else {
        console.warn('⚠️ Nenhuma partida válida encontrada, usando dados mock');
        this.riotMatches = this.generateMockRiotMatches();
        this.totalMatches = this.riotMatches.length;
      }

      this.loading = false;
    }).catch(error => {
      console.error('💥 Erro ao processar partidas:', error);
      this.fallbackToLocalMatches();
    });
  }  private mapRiotMatchesToModel(riotMatches: any[]): Match[] {
    return riotMatches.map(matchData => {
      // Validar estrutura dos dados
      if (!matchData?.info?.participants || !Array.isArray(matchData.info.participants)) {
        console.warn('⚠️ Dados de partida inválidos:', matchData);
        return this.createDefaultMatch();
      }

      const playerData = matchData.info.participants.find(
        (p: any) => p.puuid === this.player?.puuid
      );

      if (!playerData) {
        console.warn('⚠️ Jogador não encontrado na partida:', matchData.metadata?.matchId);
        return this.createDefaultMatch();
      }

      console.log('🔍 Dados do jogador na partida:', {
        champion: playerData.championName,
        kda: `${playerData.kills}/${playerData.deaths}/${playerData.assists}`,
        win: playerData.win,
        items: [playerData.item0, playerData.item1, playerData.item2, playerData.item3, playerData.item4, playerData.item5]
      });

      // Mapear participantes com dados completos para exibição
      const enhancedParticipants = matchData.info.participants.map((p: any) => ({
        ...p,
        // Adicionar summonerName se não existir - usar riotIdGameName + riotIdTagline
        summonerName: p.summonerName || (p.riotIdGameName ? `${p.riotIdGameName}#${p.riotIdTagline}` : 'Unknown')
      }));

      // Separar participantes em times com dados completos
      const team1 = enhancedParticipants.filter((p: any) => p.teamId === 100);
      const team2 = enhancedParticipants.filter((p: any) => p.teamId === 200);      console.log('👥 Times organizados:', {
        team1: team1.map((p: any) => ({ champion: p.championName, summoner: p.summonerName })),
        team2: team2.map((p: any) => ({ champion: p.championName, summoner: p.summonerName }))
      });

      // Determinar vencedor baseado nos dados dos times
      const team1Won = matchData.info.teams?.find((t: any) => t.teamId === 100)?.win || false;
      const team2Won = matchData.info.teams?.find((t: any) => t.teamId === 200)?.win || false;
      const matchWinner = team1Won ? 1 : (team2Won ? 2 : 0);

      return {
        id: matchData.metadata.matchId,
        createdAt: new Date(matchData.info.gameCreation),
        duration: matchData.info.gameDuration,
        gameMode: matchData.info.gameMode,
        gameVersion: matchData.info.gameVersion,
        mapId: matchData.info.mapId,
        participants: enhancedParticipants,
        teams: matchData.info.teams,
        team1: team1,
        team2: team2,
        winner: matchWinner,
        playerStats: {
          champion: playerData.championName,
          kills: playerData.kills,
          deaths: playerData.deaths,
          assists: playerData.assists,
          mmrChange: playerData.win ? 15 : -12, // Mock MMR - API não fornece
          isWin: playerData.win,
          championLevel: playerData.champLevel,
          doubleKills: playerData.doubleKills || 0,
          tripleKills: playerData.tripleKills || 0,
          quadraKills: playerData.quadraKills || 0,
          pentaKills: playerData.pentaKills || 0,
          items: [
            playerData.item0 || 0, playerData.item1 || 0, playerData.item2 || 0,
            playerData.item3 || 0, playerData.item4 || 0, playerData.item5 || 0
          ],
          lpChange: playerData.win ? Math.floor(Math.random() * 25) + 10 : -(Math.floor(Math.random() * 20) + 10), // Mock LP
          // Dados expandidos
          goldEarned: playerData.goldEarned || 0,
          totalDamageDealt: playerData.totalDamageDealt || 0,
          totalDamageDealtToChampions: playerData.totalDamageDealtToChampions || 0,
          totalDamageTaken: playerData.totalDamageTaken || 0,
          totalMinionsKilled: playerData.totalMinionsKilled || 0,
          neutralMinionsKilled: playerData.neutralMinionsKilled || 0,
          wardsPlaced: playerData.wardsPlaced || 0,
          wardsKilled: playerData.wardsKilled || 0,
          visionScore: playerData.visionScore || 0,
          summoner1Id: playerData.summoner1Id || 0,
          summoner2Id: playerData.summoner2Id || 0,
          perks: playerData.perks
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

  // ========== MOCK DATA GENERATORS ==========
  private generateMockRiotMatches(): Match[] {
    const mockMatches: Match[] = [];
    const champions = ['Jinx', 'Ashe', 'Caitlyn', 'Vayne', 'Ezreal', 'Kai\'Sa', 'Sivir', 'Tristana', 'Jhin', 'Lucian'];
    const gameModes = ['RANKED_SOLO_5x5', 'RANKED_FLEX_SR', 'ARAM', 'NORMAL'];

    for (let i = 0; i < 15; i++) {
      const isWin = Math.random() > 0.4; // 60% win rate for demo
      const kills = Math.floor(Math.random() * 18) + 2;
      const deaths = Math.floor(Math.random() * 8) + 1;
      const assists = Math.floor(Math.random() * 25) + 3;
      const lpChange = isWin ? Math.floor(Math.random() * 25) + 15 : -(Math.floor(Math.random() * 20) + 10);

      mockMatches.push({
        id: `riot_match_${i}`,
        createdAt: new Date(Date.now() - (i * 3 * 60 * 60 * 1000)), // 3 hours between matches
        duration: Math.floor(Math.random() * 1200) + 1200, // 20-40 minutes
        gameMode: gameModes[Math.floor(Math.random() * gameModes.length)],
        team1: [],
        team2: [],
        winner: isWin ? 1 : 2,
        playerStats: {
          champion: champions[Math.floor(Math.random() * champions.length)],
          kills,
          deaths,
          assists,
          mmrChange: lpChange, // Will be used as LP change for Riot matches
          isWin,
          championLevel: Math.floor(Math.random() * 8) + 13,
          doubleKills: Math.random() > 0.7 ? Math.floor(Math.random() * 3) + 1 : 0,
          tripleKills: Math.random() > 0.9 ? 1 : 0,
          quadraKills: Math.random() > 0.98 ? 1 : 0,
          pentaKills: Math.random() > 0.995 ? 1 : 0,
          items: this.generateRandomItems(),
          lpChange
        }
      });
    }

    return mockMatches;
  }

  private generateMockCustomMatches(): Match[] {
    const mockMatches: Match[] = [];
    const champions = ['Azir', 'Orianna', 'Syndra', 'Yasuo', 'Zed', 'LeBlanc', 'Ahri', 'Viktor'];

    for (let i = 0; i < 8; i++) {
      const isWin = Math.random() > 0.5;
      const kills = Math.floor(Math.random() * 15) + 1;
      const deaths = Math.floor(Math.random() * 8) + 1;
      const assists = Math.floor(Math.random() * 20) + 2;
      const mmrChange = isWin ? Math.floor(Math.random() * 25) + 10 : -(Math.floor(Math.random() * 20) + 5);

      mockMatches.push({
        id: `custom_match_${i}`,
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

  private generateRandomItems(): number[] {
    const items = [3031, 3006, 3046, 3153, 3072, 3026, 3094]; // Sample item IDs
    const playerItems = [];
    for (let i = 0; i < 6; i++) {
      if (Math.random() > 0.2) { // 80% chance of having an item in each slot
        playerItems.push(items[Math.floor(Math.random() * items.length)]);
      } else {
        playerItems.push(0); // Empty slot
      }
    }
    return playerItems;
  }

  // ========== STATS METHODS ==========
  getRiotStats() {
    const stats = {
      totalKills: 0,
      totalDeaths: 0,
      totalAssists: 0,
      totalWins: 0,
      totalMMRGained: 0
    };

    this.riotMatches.forEach(match => {
      if (match.playerStats) {
        stats.totalKills += match.playerStats.kills;
        stats.totalDeaths += match.playerStats.deaths;
        stats.totalAssists += match.playerStats.assists;
        if (match.playerStats.isWin) stats.totalWins++;
        stats.totalMMRGained += match.playerStats.lpChange || match.playerStats.mmrChange;
      }
    });

    return stats;
  }

  getCustomStats() {
    const stats = {
      totalKills: 0,
      totalDeaths: 0,
      totalAssists: 0,
      totalWins: 0,
      totalMMRGained: 0
    };

    this.customMatches.forEach(match => {
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

  getRiotWinStreakInfo(): { current: number; longest: number } {
    return this.calculateWinStreak(this.riotMatches);
  }

  getCustomWinStreakInfo(): { current: number; longest: number } {
    return this.calculateWinStreak(this.customMatches);
  }

  private calculateWinStreak(matches: Match[]): { current: number; longest: number } {
    let current = 0;
    let longest = 0;
    let temp = 0;

    for (let i = 0; i < matches.length; i++) {
      const match = matches[i];
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

  // ========== UI HELPER METHODS ==========
  getGameModeDisplay(gameMode?: string): string {
    const modes: { [key: string]: string } = {
      'RANKED_SOLO_5x5': 'Solo/Duo',
      'RANKED_FLEX_SR': 'Flex',
      'ARAM': 'ARAM',
      'NORMAL': 'Normal',
      'CLASSIC': 'Clássica'
    };
    return modes[gameMode || ''] || 'Desconhecido';
  }  getChampionImageUrl(championName?: string): string {
    if (!championName) return '';
    // Normalize champion name for Data Dragon URL using proper mapping
    const normalizedName = this.normalizeChampionName(championName);
    return `https://ddragon.leagueoflegends.com/cdn/15.12.1/img/champion/${normalizedName}.png`;
  }

  private normalizeChampionName(championName: string): string {
    // Mapeamento de nomes especiais
    const nameMap: { [key: string]: string } = {
      'KaiSa': 'Kaisa',
      'Kai\'Sa': 'Kaisa',
      'Cho\'Gath': 'Chogath',
      'Kha\'Zix': 'Khazix',
      'LeBlanc': 'Leblanc',
      'Vel\'Koz': 'Velkoz',
      'Kog\'Maw': 'Kogmaw',
      'Rek\'Sai': 'Reksai',
      'Nunu & Willump': 'Nunu',
      'Wukong': 'MonkeyKing',
      'Renata Glasc': 'Renata',
      'Dr. Mundo': 'DrMundo',
      'Tahm Kench': 'TahmKench',
      'Twisted Fate': 'TwistedFate',
      'Master Yi': 'MasterYi',
      'Miss Fortune': 'MissFortune',
      'Jarvan IV': 'JarvanIV',
      'Lee Sin': 'LeeSin',
      'Xin Zhao': 'XinZhao',
      'Aurelion Sol': 'AurelionSol'
    };

    // Verifica se existe um mapeamento específico
    if (nameMap[championName]) {
      return nameMap[championName];
    }

    // Para outros casos, remove caracteres especiais e espaços
    return championName.replace(/[^a-zA-Z]/g, '');
  }
  getItemImageUrl(itemId: number): string {
    if (!itemId || itemId === 0) return '';
    // Data Dragon item image URL
    return `https://ddragon.leagueoflegends.com/cdn/15.12.1/img/item/${itemId}.png`;
  }

  getPlayerItems(match: Match): number[] {
    return match.playerStats?.items || [0, 0, 0, 0, 0, 0];
  }

  getAverageKDA(): string {
    const matches = this.getCurrentMatches();
    if (matches.length === 0) return '0.0 / 0.0 / 0.0';

    const totalKills = matches.reduce((sum, m) => sum + (m.playerStats?.kills || 0), 0);
    const totalDeaths = matches.reduce((sum, m) => sum + (m.playerStats?.deaths || 0), 0);
    const totalAssists = matches.reduce((sum, m) => sum + (m.playerStats?.assists || 0), 0);

    const avgKills = (totalKills / matches.length).toFixed(1);
    const avgDeaths = (totalDeaths / matches.length).toFixed(1);
    const avgAssists = (totalAssists / matches.length).toFixed(1);

    return `${avgKills} / ${avgDeaths} / ${avgAssists}`;
  }

  getAverageGain(): number {
    const matches = this.getCurrentMatches();
    if (matches.length === 0) return 0;

    const totalGain = matches.reduce((sum, m) => {
      if (this.activeTab === 'riot') {
        return sum + (m.playerStats?.lpChange || m.playerStats?.mmrChange || 0);
      } else {
        return sum + (m.playerStats?.mmrChange || 0);
      }
    }, 0);

    return totalGain / matches.length;
  }

  // ========== UTILITY METHODS (from original component) ==========
  getMatchDuration(match: Match): string {
    const minutes = Math.floor(match.duration / 60);
    const seconds = match.duration % 60;
    return `${minutes}m ${seconds}s`;
  }

  getKDA(match: Match): string {
    if (!match.playerStats) return '0/0/0';
    return `${match.playerStats.kills}/${match.playerStats.deaths}/${match.playerStats.assists}`;
  }

  getKDARatio(match: Match): number {
    if (!match.playerStats || match.playerStats.deaths === 0) return 0;
    return ((match.playerStats.kills + match.playerStats.assists) / match.playerStats.deaths);
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

  trackMatch(index: number, match: Match): string {
    return match.id.toString();
  }
  toggleMatchDetails(matchId: string): void {
    if (this.expandedMatches.has(matchId)) {
      this.expandedMatches.delete(matchId);
    } else {
      this.expandedMatches.add(matchId);
    }
  }

  isMatchExpanded(matchId: string): boolean {
    return this.expandedMatches.has(matchId);
  }

  hasMoreMatches(): boolean {
    const currentMatches = this.getCurrentMatches();
    return (this.currentPage + 1) * this.matchesPerPage < this.totalMatches;
  }

  async loadMoreMatches() {
    this.currentPage++;
    await this.loadCurrentTabMatches();
  }

  getMostPlayedChampion(): string {
    const matches = this.getCurrentMatches();
    if (matches.length === 0) return 'N/A';

    const championCounts: { [key: string]: number } = {};

    matches.forEach(match => {
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

  // ========== EXPANDED MATCH METHODS ==========

  getParticipantKDARatio(participant: any): number {
    if (!participant || participant.deaths === 0) {
      return (participant?.kills || 0) + (participant?.assists || 0);
    }
    return ((participant.kills || 0) + (participant.assists || 0)) / participant.deaths;
  }
  getParticipantItems(participant: any): number[] {
    if (!participant) return [0, 0, 0, 0, 0, 0];
    return [
      participant.item0 || 0,
      participant.item1 || 0,
      participant.item2 || 0,
      participant.item3 || 0,
      participant.item4 || 0,
      participant.item5 || 0
    ];
  }

  // ========== LANE DETECTION AND ORGANIZATION ==========
  getParticipantLane(participant: any): string {
    // Para ARAM, não há lanes específicas - organizar por papel/champion
    if (participant.lane === 'BOTTOM' && participant.gameMode === 'ARAM') {
      return this.detectARAMRole(participant);
    }

    // Determinar lane baseado em teamPosition ou lane
    const lane = participant.teamPosition || participant.lane || 'UNKNOWN';
    const role = participant.role || 'UNKNOWN';

    // Mapear para lanes do LoL
    switch (lane) {
      case 'TOP':
        return 'TOP';
      case 'JUNGLE':
        return 'JUNGLE';
      case 'MIDDLE':
      case 'MID':
        return 'MIDDLE';
      case 'BOTTOM':
        if (role === 'DUO_CARRY' || participant.individualPosition === 'Bottom') {
          return 'ADC';
        } else if (role === 'DUO_SUPPORT' || participant.individualPosition === 'Utility') {
          return 'SUPPORT';
        }
        // Fallback: determinar por champion ou items
        return this.detectBotLaneRole(participant);
      case 'UTILITY':
        return 'SUPPORT';
      default:
        // Fallback para detecção baseada em posição individual
        return this.detectLaneByPosition(participant);
    }
  }

  private detectARAMRole(participant: any): string {
    // Para ARAM, organizar por tipo de champion
    const championName = participant.championName;

    // Tanks/Supports
    const tanks = ['Leona', 'Braum', 'Alistar', 'Thresh', 'Blitzcrank', 'Nautilus', 'Malphite', 'Rammus', 'Shen'];
    const supports = ['Nami', 'Soraka', 'Janna', 'Lulu', 'Sona', 'Karma', 'Yuumi', 'Seraphine'];

    // ADC/Marksmen
    const adcs = ['Jinx', 'Caitlyn', 'Ashe', 'Vayne', 'Ezreal', 'Kai\'Sa', 'Jhin', 'Xayah', 'Tristana', 'Sivir'];

    // AP Carries/Mages
    const mages = ['Lux', 'Orianna', 'Syndra', 'Azir', 'Veigar', 'Brand', 'Vel\'Koz', 'Xerath', 'Ziggs'];

    // Assassins/AD
    const assassins = ['Zed', 'Yasuo', 'Katarina', 'Akali', 'Talon', 'Qiyana'];

    if (tanks.includes(championName)) return 'SUPPORT';
    if (supports.includes(championName)) return 'SUPPORT';
    if (adcs.includes(championName)) return 'ADC';
    if (mages.includes(championName)) return 'MIDDLE';
    if (assassins.includes(championName)) return 'JUNGLE';

    // Fallback baseado em items
    return this.detectBotLaneRole(participant);
  }

  private detectBotLaneRole(participant: any): string {    // Lista de campeões tradicionalmente ADC
    const adcChampions = [
      'Jinx', 'Caitlyn', 'Ashe', 'Vayne', 'Ezreal', 'Kai\'Sa', 'Jhin', 'Xayah',
      'Tristana', 'Sivir', 'Miss Fortune', 'Lucian', 'Draven', 'Twitch', 'Kog\'Maw',
      'Varus', 'Kalista', 'Aphelios', 'Samira', 'Zeri', 'Nilah'
    ];

    // Lista de campeões tradicionalmente Support
    const supportChampions = [
      'Thresh', 'Blitzcrank', 'Leona', 'Braum', 'Alistar', 'Nautilus', 'Pyke',
      'Lulu', 'Janna', 'Soraka', 'Nami', 'Sona', 'Yuumi', 'Seraphine', 'Karma',
      'Morgana', 'Zyra', 'Brand', 'Vel\'Koz', 'Xerath', 'Swain', 'Pantheon',
      'Rakan', 'Taric', 'Bard', 'Zilean', 'Senna', 'Milio', 'Renata Glasc'
    ];

    const championName = participant.championName;

    if (adcChampions.includes(championName)) {
      return 'ADC';
    } else if (supportChampions.includes(championName)) {
      return 'SUPPORT';
    }

    // Verificar itens de suporte
    const items = [
      participant.item0, participant.item1, participant.item2,
      participant.item3, participant.item4, participant.item5
    ];

    // IDs de itens de suporte comuns
    const supportItems = [3850, 3851, 3853, 3854, 3855, 3857, 3858, 3859, 3860, 3862, 3863, 3864];
    const hasSupportItem = items.some(item => supportItems.includes(item));

    if (hasSupportItem) {
      return 'SUPPORT';
    }

    // Se não conseguiu determinar, usar farm como critério
    const totalFarm = (participant.totalMinionsKilled || 0) + (participant.neutralMinionsKilled || 0);
    return totalFarm > 100 ? 'ADC' : 'SUPPORT';
  }

  private detectLaneByPosition(participant: any): string {
    const position = participant.individualPosition || participant.teamPosition || 'UNKNOWN';

    switch (position) {
      case 'Top':
        return 'TOP';
      case 'Jungle':
        return 'JUNGLE';
      case 'Middle':
        return 'MIDDLE';
      case 'Bottom':
        return 'ADC';
      case 'Utility':
        return 'SUPPORT';
      default:
        return 'UNKNOWN';
    }
  }  organizeTeamByLanes(team: any[] | undefined): { [lane: string]: any } {
    const organizedTeam: { [lane: string]: any } = {
      'TOP': null,
      'JUNGLE': null,
      'MIDDLE': null,
      'ADC': null,
      'SUPPORT': null
    };

    if (!team || !Array.isArray(team)) {
      return organizedTeam;
    }

    // First pass: assign players to their primary lanes
    team.forEach(participant => {
      const lane = this.getParticipantLane(participant);
      if (organizedTeam[lane] === null) {
        organizedTeam[lane] = participant;
      }
    });

    // Second pass: fill empty lanes with remaining players
    const unassignedPlayers = team.filter(participant => {
      const lane = this.getParticipantLane(participant);
      return organizedTeam[lane] !== participant;
    });

    const emptyLanes = Object.keys(organizedTeam).filter(lane => organizedTeam[lane] === null);

    unassignedPlayers.forEach((participant, index) => {
      if (index < emptyLanes.length) {
        organizedTeam[emptyLanes[index]] = participant;
      }
    });

    // Final pass: if still empty lanes, create placeholders or duplicate players
    Object.keys(organizedTeam).forEach((lane, index) => {
      if (organizedTeam[lane] === null && team.length > index) {
        organizedTeam[lane] = team[index];
      }
    });

    return organizedTeam;
  }

  getLaneIcon(lane: string): string {
    switch (lane) {
      case 'TOP': return '⚔️';
      case 'JUNGLE': return '🌲';
      case 'MIDDLE': return '🏰';
      case 'ADC': return '🏹';
      case 'SUPPORT': return '🛡️';
      default: return '❓';
    }
  }

  getLaneName(lane: string): string {
    switch (lane) {
      case 'TOP': return 'Top';
      case 'JUNGLE': return 'Jungle';
      case 'MIDDLE': return 'Mid';
      case 'ADC': return 'ADC';
      case 'SUPPORT': return 'Support';
      default: return 'Unknown';
    }
  }

  // ========== DEBUG HELPER ==========

  debugParticipant(participant: any, label: string): void {
    console.log(`${label}:`, participant);
    console.log('Items:', [
      participant?.item0,
      participant?.item1,
      participant?.item2,
      participant?.item3,
      participant?.item4,
      participant?.item5
    ]);
    console.log('Champion:', participant?.championName);
    console.log('Summoner:', participant?.summonerName);
  }
}
