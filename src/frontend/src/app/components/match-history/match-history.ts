import { Component, Input, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ApiService } from '../../services/api';
import { Player, Match } from '../../interfaces';
import { ChampionService } from '../../services/champion.service';
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
  }  loadRiotMatches(): void {
    if (!this.player) {
      // console.warn('⚠️ Nenhum player disponível para carregar partidas');
      return;
    }this.loading = true;
    this.error = null;
    this.apiService.getLCUMatchHistoryAll(0, 20, false).subscribe({      next: (lcuResponse: any) => {
        if (lcuResponse && lcuResponse.success && lcuResponse.matches && lcuResponse.matches.length > 0) {
          this.processLCUMatches(lcuResponse.matches);
        } else {
          this.riotMatches = [];
          this.error = 'Nenhuma partida encontrada no histórico do League of Legends. Certifique-se de que o LoL está aberto e você jogou partidas recentemente.';
        }
        this.loading = false;
      },      error: (error: any) => {
        this.riotMatches = [];

        // Mensagem mais específica baseada no tipo de erro
        if (error.message && error.message.includes('404')) {
          this.error = 'League of Legends não está aberto ou não há partidas ativas. Abra o cliente do LoL para ver o histórico.';
        } else if (error.message && error.message.includes('current-match-details')) {
          this.error = 'Nenhuma partida ativa encontrada. Para ver o histórico, certifique-se de que o LoL está aberto.';
        } else {
          this.error = 'Não foi possível conectar ao League of Legends. Verifique se o cliente está aberto e funcionando.';
        }

        this.loading = false;
      }
    });
  }  loadCustomMatches(): void {
    if (!this.player) {
      console.warn('⚠️ [DEBUG] Nenhum player disponível para carregar partidas customizadas');
      return;
    }

    console.log('🔍 [DEBUG] Carregando partidas customizadas para player:', this.player);

    this.loading = true;
    this.error = null;

    try {
      // Primeiro tentar com o nome do summoner, depois com o ID
      const playerIdentifier = this.player.summonerName || this.player.id.toString();

      console.log('🎯 [DEBUG] Usando playerIdentifier:', playerIdentifier);

      this.apiService.getCustomMatches(playerIdentifier, this.currentPage * this.matchesPerPage, this.matchesPerPage).subscribe({
        next: (response) => {
          console.log('📋 [DEBUG] Resposta do backend:', response);          if (response && response.success && response.matches && response.matches.length > 0) {
            console.log('✅ [DEBUG] Mapeando', response.matches.length, 'partidas customizadas');
            console.log('🔍 [DEBUG] Dados das partidas recebidas:', response.matches);
            this.customMatches = this.mapApiMatchesToModel(response.matches);
            this.totalMatches = response.pagination.total;
            console.log('📊 [DEBUG] Partidas mapeadas:', this.customMatches.length);
            console.log('🎯 [DEBUG] Conteúdo das partidas mapeadas:', this.customMatches);
          } else {
            console.log('⚠️ [DEBUG] Nenhuma partida encontrada na resposta');
            this.customMatches = [];
            this.totalMatches = 0;
            this.error = 'Você ainda não jogou nenhuma partida customizada. Complete uma partida personalizada para vê-la aparecer aqui.';
          }
          this.loading = false;
        },        error: (error) => {
          this.error = error.message || 'Erro ao carregar partidas customizadas';
          this.loading = false;
          // console.error('Error loading custom match history:', error);

          // No more fallback to mock data - keep empty if no real data
          this.customMatches = [];
          this.totalMatches = 0;
        }
      });    } catch (error: any) {
      this.error = error.message || 'Erro ao carregar partidas customizadas';
      this.loading = false;
      // console.error('Error loading custom match history:', error);
      this.customMatches = [];
      this.totalMatches = 0;
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
  }  getCurrentMatches(): Match[] {
    return this.activeTab === 'riot' ? this.riotMatches : this.customMatches;
  }

  getWinRate(): string {
    const matches = this.getCurrentMatches();
    if (matches.length === 0) return '0.0';
    const wins = matches.filter(m => m.playerStats?.isWin).length;
    return ((wins / matches.length) * 100).toFixed(1);
  }
  ngOnInit() {
    // NO MORE MOCK DATA BY DEFAULT - only load real data
    // Only show mock data if explicitly needed for demo purposes

    // If there's a player, load real data
    if (this.player) {
      this.loadCurrentTabMatches();
    } else {
      // No player, clear arrays
      this.riotMatches = [];
      this.customMatches = [];
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
  }  private checkCurrentGame(): void {
    if (!this.player) return;

    // Use LCU status check instead of current-match-details to avoid 404s
    this.apiService.getLCUStatus().subscribe({
      next: (response: any) => {
        if (response && response.isConnected) {
          // LCU is connected, but we don't need to check for active games here
          // This was causing the 404 errors. We'll just update the connection status.
          this.isInGame = false;
          this.currentGame = null;
          this.gamePhase = '';
        } else {
          this.isInGame = false;
          this.currentGame = null;
          this.gamePhase = '';
        }
      },      error: (err: any) => {
        // console.error('Failed to get LCU status:', err);
        this.isInGame = false;
        this.currentGame = null;
        this.gamePhase = '';
      }
    });
  }// Legacy method for compatibility
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
      },      error: (error) => {
        this.error = error.message || 'Erro ao carregar histórico de partidas';
        this.loading = false;
        // console.error('Error loading match history:', error);

        // Fallback to mock data in case of error
        setTimeout(() => {
          this.error = null;
          this.matches = this.generateMockMatches();
          this.totalMatches = this.matches.length;
          this.loading = false;
        }, 1000);
      }
    });  }

  // MÉTODO REMOVIDO: processRiotMatches
  // Agora usamos apenas LCU via processLCUMatches
  // A aba "Riot API" usa exclusivamente dados do League of Legends Client (LCU)

  private mapRiotMatchesToModel(riotMatches: any[]): Match[] {
    return riotMatches.map(matchData => {      // Validar estrutura dos dados
      if (!matchData?.info?.participants || !Array.isArray(matchData.info.participants)) {
        // console.warn('⚠️ Dados de partida inválidos:', matchData);
        return this.createDefaultMatch();
      }

      const playerData = matchData.info.participants.find(
        (p: any) => p.puuid === this.player?.puuid
      );      if (!playerData) {
        // console.warn('⚠️ Jogador não encontrado na partida:', matchData.metadata?.matchId);
        return this.createDefaultMatch();
      }

      // Mapear participantes com dados completos para exibição
      const enhancedParticipants = matchData.info.participants.map((p: any) => ({
        ...p,
        // Adicionar summonerName se não existir - usar riotIdGameName + riotIdTagline
        summonerName: p.summonerName || (p.riotIdGameName ? `${p.riotIdGameName}#${p.riotIdTagline}` : 'Unknown')
      }));      // Separar participantes em times com dados completos
      const team1 = enhancedParticipants.filter((p: any) => p.teamId === 100);
      const team2 = enhancedParticipants.filter((p: any) => p.teamId === 200);

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
  }  private mapApiMatchesToModel(apiMatches: any[]): Match[] {
    return apiMatches.map(match => {

      // Parse JSON fields safely
      let team1Players = [];
      let team2Players = [];
      let pickBanData = null;

      try {
        team1Players = typeof match.team1_players === 'string' ? JSON.parse(match.team1_players) : (match.team1_players || []);
        team2Players = typeof match.team2_players === 'string' ? JSON.parse(match.team2_players) : (match.team2_players || []);

        if (match.pick_ban_data) {
          pickBanData = typeof match.pick_ban_data === 'string' ? JSON.parse(match.pick_ban_data) : match.pick_ban_data;
        }      } catch (e) {
        // console.warn('⚠️ Erro ao fazer parse dos dados da partida:', e);
        team1Players = [];
        team2Players = [];
        pickBanData = null;
      }

      // Determinar o campeão do jogador a partir dos dados de pick/ban
      let playerChampion = 'Unknown';
      try {
        if (pickBanData && pickBanData.team1Picks) {
          const playerTeam = match.player_team || (match.player_won && match.winner_team === 1 ? 1 : 2);
          const picks = playerTeam === 1 ? pickBanData.team1Picks : pickBanData.team2Picks;

          if (picks && picks.length > 0) {
            // Tentar encontrar o pick do jogador atual
            const currentPlayerName = this.player?.summonerName?.toLowerCase();
            let playerPick = picks.find((pick: any) =>
              pick.player && pick.player.toString().toLowerCase().includes(currentPlayerName || '')
            );

            if (!playerPick && picks.length > 0) {
              // Se não encontrou por nome, usar o primeiro pick como fallback
              playerPick = picks[0];
            }

            if (playerPick && playerPick.champion) {
              playerChampion = playerPick.champion;
            }
          }
        }      } catch (e) {
        // console.warn('⚠️ Erro ao extrair campeão do jogador:', e);
      }

      // Convert database match to our frontend Match interface
      const mappedMatch = {
        id: match.id || match.match_id,
        createdAt: new Date(match.created_at),
        duration: match.duration ? (match.duration * 60) : 1500, // Converter minutos para segundos
        gameMode: match.game_mode || 'CUSTOM',
        team1: team1Players.map((playerId: any, index: number) => {
          let championName = 'Unknown';
          try {
            if (pickBanData && pickBanData.team1Picks && pickBanData.team1Picks[index]) {
              championName = pickBanData.team1Picks[index].champion || 'Unknown';
            }          } catch (e) {
            // console.warn('⚠️ Erro ao obter campeão do time 1:', e);
          }

          return {
            name: playerId.toString(),
            champion: championName,
            teamId: 100
          };
        }),
        team2: team2Players.map((playerId: any, index: number) => {
          let championName = 'Unknown';
          try {
            if (pickBanData && pickBanData.team2Picks && pickBanData.team2Picks[index]) {
              championName = pickBanData.team2Picks[index].champion || 'Unknown';
            }          } catch (e) {
            // console.warn('⚠️ Erro ao obter campeão do time 2:', e);
          }

          return {
            name: playerId.toString(),
            champion: championName,
            teamId: 200
          };
        }),
        winner: match.winner_team || 0,
        averageMMR1: 1200, // Mock value for custom matches
        averageMMR2: 1200, // Mock value for custom matches
        // Determine if current player won
        playerStats: {
          champion: playerChampion,
          kills: 0, // Not stored yet for custom matches
          deaths: 0, // Not stored yet for custom matches
          assists: 0, // Not stored yet for custom matches
          mmrChange: match.player_won ? 15 : -10, // Mock MMR change
          isWin: match.player_won || false,
          championLevel: 18,          items: [0, 0, 0, 0, 0, 0] // Not stored yet for custom matches
        }
      };

      return mappedMatch;
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
  private getParticipantLane(participant: any): string {
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
      default:        // Fallback para detecção baseada em posição individual
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
        // Fallback: detect by participant order and champion role
        return this.detectLaneByChampionAndOrder(participant);
    }
  }

  private detectLaneByChampionAndOrder(participant: any): string {
    const championName = participant.championName;
    const participantId = participant.participantId;

    // Common role detection based on champion types
    const junglers = ['Graves', 'Nidalee', 'Kindred', 'KhaZix', 'Rengar', 'Ekko', 'Diana', 'Kayn', 'Viego', 'Belveth'];
    const supports = ['Thresh', 'Leona', 'Braum', 'Nautilus', 'Alistar', 'Lulu', 'Nami', 'Soraka', 'Janna', 'Sona', 'Yuumi'];
    const adcs = ['Jinx', 'Caitlyn', 'Ashe', 'Vayne', 'Ezreal', 'Kaisa', 'Jhin', 'Xayah', 'Tristana', 'Sivir', 'Draven'];

    if (junglers.includes(championName)) return 'JUNGLE';
    if (supports.includes(championName)) return 'SUPPORT';
    if (adcs.includes(championName)) return 'ADC';

    // Fallback by participant order (common in LCU data)
    // Usually: 1-TOP, 2-JUNGLE, 3-MID, 4-ADC, 5-SUPPORT per team
    const order = (participantId - 1) % 5;
    switch (order) {
      case 0: return 'TOP';
      case 1: return 'JUNGLE';
      case 2: return 'MIDDLE';
      case 3: return 'ADC';
      case 4: return 'SUPPORT';
      default: return 'UNKNOWN';
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
    }    // First pass: assign players to their detected lanes
    team.forEach((participant, index) => {
      const lane = this.getParticipantLane(participant);

      if (organizedTeam[lane] === null) {
        organizedTeam[lane] = participant;
      }
    });

    // Second pass: fill empty lanes with remaining players
    const unassignedPlayers = team.filter(participant => {
      const lane = this.getParticipantLane(participant);
      return organizedTeam[lane] !== participant;
    });    const emptyLanes = Object.keys(organizedTeam).filter(lane => organizedTeam[lane] === null);

    unassignedPlayers.forEach((participant, index) => {
      if (index < emptyLanes.length) {
        organizedTeam[emptyLanes[index]] = participant;
      }
    });    // Final pass: ensure all players are assigned (force assignment if needed)
    const lanes = ['TOP', 'JUNGLE', 'MIDDLE', 'ADC', 'SUPPORT'];
    lanes.forEach((lane, index) => {
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
      case 'ADC': return 'ADC';      case 'SUPPORT': return 'Support';
      default: return 'Unknown';
    }
  }

  // New method to process LCU match data
  private processLCUMatches(lcuMatches: any[]): void {
    const mappedMatches = lcuMatches.map(match => {
      return this.mapLCUMatchToModel(match);
    }).filter(match => match !== null) as Match[];

    this.riotMatches = mappedMatches;
    this.totalMatches = this.riotMatches.length;    if (this.riotMatches.length === 0) {
      // console.warn('⚠️ Nenhuma partida foi mapeada com sucesso');
    }
  }
  // New method to map LCU match data to our Match model
  private mapLCUMatchToModel(lcuMatch: any): Match | null {
    try {
      // Try to find player data
      let playerData = null;
      const currentPlayerPuuid = this.player?.puuid;
      const currentPlayerName = this.player?.summonerName?.toLowerCase();

      // Strategy 1: Match by PUUID in participants directly
      if (currentPlayerPuuid) {
        playerData = lcuMatch.participants?.find((p: any) => p.puuid === currentPlayerPuuid);
      }

      // Strategy 2: Match by participantIdentities
      if (!playerData && lcuMatch.participantIdentities) {
        if (currentPlayerPuuid) {
          const identity = lcuMatch.participantIdentities.find((id: any) =>
            id.player?.puuid === currentPlayerPuuid
          );
          if (identity) {
            playerData = lcuMatch.participants?.find((p: any) =>
              p.participantId === identity.participantId
            );
          }
        }

        if (!playerData && currentPlayerName) {
          const identity = lcuMatch.participantIdentities.find((id: any) => {
            const playerSummonerName = id.player?.summonerName?.toLowerCase();
            const playerGameName = id.player?.gameName?.toLowerCase();
            return playerSummonerName === currentPlayerName || playerGameName === currentPlayerName;
          });
          if (identity) {
            playerData = lcuMatch.participants?.find((p: any) =>
              p.participantId === identity.participantId
            );
          }
        }
      }

      if (!playerData) {
        return null;
      }      // Convert championId to championName using centralized service
      const getChampionName = (championId: number): string => {
        return ChampionService.getChampionNameById(championId);
      };

      // Map participants with complete information
      const enhancedParticipants = lcuMatch.participants?.map((p: any) => {
        const identity = lcuMatch.participantIdentities?.find((id: any) =>
          id.participantId === p.participantId
        );

        const isCurrentPlayerByPuuid = identity?.player?.puuid === currentPlayerPuuid;
        const isCurrentPlayerByName = currentPlayerName &&
          (identity?.player?.summonerName?.toLowerCase() === currentPlayerName ||
           identity?.player?.gameName?.toLowerCase() === currentPlayerName);        const isCurrentPlayer = isCurrentPlayerByPuuid || isCurrentPlayerByName;

        // Create a proper display name combining gameName and tagLine
        let displayName = `Player ${p.participantId}`;
        if (identity?.player) {
          const player = identity.player;
          if (player.gameName && player.tagLine) {
            displayName = `${player.gameName}#${player.tagLine}`;
          } else if (player.summonerName) {
            displayName = player.summonerName;
          } else if (player.gameName) {
            displayName = player.gameName;
          }
        }

        return {
          ...p,
          championName: getChampionName(p.championId),
          summonerName: displayName,
          puuid: identity?.player?.puuid || '',
          kills: p.stats?.kills || 0,
          deaths: p.stats?.deaths || 0,
          assists: p.stats?.assists || 0,
          champLevel: p.stats?.champLevel || 1,
          goldEarned: p.stats?.goldEarned || 0,
          totalDamageDealt: p.stats?.totalDamageDealt || 0,
          totalDamageDealtToChampions: p.stats?.totalDamageDealtToChampions || 0,
          totalDamageTaken: p.stats?.totalDamageTaken || 0,
          totalMinionsKilled: p.stats?.totalMinionsKilled || 0,
          neutralMinionsKilled: p.stats?.neutralMinionsKilled || 0,
          wardsPlaced: p.stats?.wardsPlaced || 0,
          wardsKilled: p.stats?.wardsKilled || 0,
          visionScore: p.stats?.visionScore || 0,
          item0: p.stats?.item0 || 0,
          item1: p.stats?.item1 || 0,
          item2: p.stats?.item2 || 0,
          item3: p.stats?.item3 || 0,
          item4: p.stats?.item4 || 0,
          item5: p.stats?.item5 || 0,
          isCurrentPlayer: isCurrentPlayer
        };
      }) || [];      // Separate into teams
      const team1 = enhancedParticipants.filter((p: any) => p.teamId === 100);
      const team2 = enhancedParticipants.filter((p: any) => p.teamId === 200);

      // Find current player data
      const currentPlayerData = enhancedParticipants.find((p: any) => p.isCurrentPlayer) || playerData;

      return {
        id: lcuMatch.gameId || lcuMatch.gameCreation,
        createdAt: new Date(lcuMatch.gameCreation || lcuMatch.gameCreationDate),
        duration: lcuMatch.gameDuration || (lcuMatch.gameLength / 1000),
        gameMode: lcuMatch.gameMode,
        gameVersion: lcuMatch.gameVersion,
        mapId: lcuMatch.mapId,
        participants: enhancedParticipants,
        teams: lcuMatch.teams,
        team1: team1,
        team2: team2,
        winner: lcuMatch.teams?.find((t: any) => t.win)?.teamId === 100 ? 1 : 2,
        playerStats: {
          champion: getChampionName(currentPlayerData.championId) || 'Aatrox',
          kills: currentPlayerData.stats?.kills || currentPlayerData.kills || 0,
          deaths: currentPlayerData.stats?.deaths || currentPlayerData.deaths || 0,
          assists: currentPlayerData.stats?.assists || currentPlayerData.assists || 0,
          mmrChange: 0,
          isWin: currentPlayerData.stats?.win || false,
          championLevel: currentPlayerData.stats?.champLevel || currentPlayerData.champLevel || 1,
          items: [
            currentPlayerData.stats?.item0 || currentPlayerData.item0 || 0,
            currentPlayerData.stats?.item1 || currentPlayerData.item1 || 0,
            currentPlayerData.stats?.item2 || currentPlayerData.item2 || 0,
            currentPlayerData.stats?.item3 || currentPlayerData.item3 || 0,
            currentPlayerData.stats?.item4 || currentPlayerData.item4 || 0,
            currentPlayerData.stats?.item5 || currentPlayerData.item5 || 0
          ],
          lpChange: 0,
          goldEarned: currentPlayerData.stats?.goldEarned || currentPlayerData.goldEarned || 0,
          totalDamageDealt: currentPlayerData.stats?.totalDamageDealt || currentPlayerData.totalDamageDealt || 0,
          totalDamageDealtToChampions: currentPlayerData.stats?.totalDamageDealtToChampions || currentPlayerData.totalDamageDealtToChampions || 0,
          totalDamageTaken: currentPlayerData.stats?.totalDamageTaken || currentPlayerData.totalDamageTaken || 0,
          totalMinionsKilled: currentPlayerData.stats?.totalMinionsKilled || currentPlayerData.totalMinionsKilled || 0,
          neutralMinionsKilled: currentPlayerData.stats?.neutralMinionsKilled || currentPlayerData.neutralMinionsKilled || 0,
          wardsPlaced: currentPlayerData.stats?.wardsPlaced || currentPlayerData.wardsPlaced || 0,
          wardsKilled: currentPlayerData.stats?.wardsKilled || currentPlayerData.wardsKilled || 0,
          visionScore: currentPlayerData.stats?.visionScore || currentPlayerData.visionScore || 0,
          summoner1Id: currentPlayerData.spell1Id || 0,
          summoner2Id: currentPlayerData.spell2Id || 0
        }      };    } catch (error: any) {
      console.error('❌ Erro ao mapear partida LCU:', error);
      return null;
    }
  }
}
