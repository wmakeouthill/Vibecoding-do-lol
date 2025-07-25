import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { interval, Subscription, debounceTime, distinctUntilChanged, Observable } from 'rxjs';
import { ChampionService } from '../../services/champion.service';
import { ProfileIconService } from '../../services/profile-icon.service';
import { ApiService } from '../../services/api';

interface LeaderboardPlayer {
  rank: number;
  summoner_name: string;
  riot_id_game_name?: string;
  riot_id_tagline?: string;
  profileIconId?: number;
  games_played: number;
  wins: number;
  win_rate: number;
  avg_kills: number;
  avg_deaths: number;
  avg_assists: number;
  kda_ratio: number;
  avg_gold: number;
  avg_damage: number;
  avg_cs: number;
  avg_vision: number;
  max_kills: number;
  max_damage: number;
  calculated_mmr: number;
  lp: number;
  favorite_champion: {
    name: string;
    id: number;
    games: number;
  } | null;
  profileIconUrl$?: Observable<string>;
}

interface CacheData {
  data: LeaderboardPlayer[];
  timestamp: number;
  version: string;
}

@Component({
  selector: 'app-leaderboard',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './leaderboard.html',
  styleUrl: './leaderboard.scss'
})
export class LeaderboardComponent implements OnInit, OnDestroy {
  leaderboardData: LeaderboardPlayer[] = [];
  isLoading = true;
  error: string | null = null;
  lastUpdated: Date = new Date();
  private refreshSubscription?: Subscription;
  private playerTotalMMRCache: Map<string, number> = new Map();
  private localStorageKey = 'leaderboard_cache';
  private cacheVersion = '1.0.0';
  private cacheExpiryTime = 5 * 60 * 1000; // 5 minutos

  // Estados de carregamento detalhados
  isLoadingProfileIcons = false;
  isLoadingMMR = false;
  profileIconsProgress = { current: 0, total: 0 };
  mmrProgress = { current: 0, total: 0 };

  retryCount = 0;
  maxRetries = 3;
  private baseUrl: string;

  constructor(
    private http: HttpClient,
    private championService: ChampionService,
    private profileIconService: ProfileIconService,
    private apiService: ApiService
  ) {
    this.baseUrl = this.apiService.getBaseUrl();
  }

  ngOnInit() {
    // Primeiro tentar carregar do cache
    const cacheLoaded = this.loadCacheFromStorage();

    if (cacheLoaded) {
      // Se carregou do cache, apenas carregar ícones se necessário
      this.isLoading = false;
      this.loadProfileIconsOptimized(); // Carregar ícones em background
    } else {
      // Se não conseguiu carregar do cache, carregar do servidor
      this.loadLeaderboard();
    }
  }

  ngOnDestroy() {
    if (this.refreshSubscription) {
      this.refreshSubscription.unsubscribe();
    }
  }

  private loadCacheFromStorage(): boolean {
    try {
      const cached = localStorage.getItem(this.localStorageKey);
      if (cached) {
        const cacheData: CacheData = JSON.parse(cached);

        // Verificar se o cache ainda é válido
        if (cacheData.version === this.cacheVersion &&
          Date.now() - cacheData.timestamp < this.cacheExpiryTime) {
          this.leaderboardData = cacheData.data;
          this.lastUpdated = new Date(cacheData.timestamp);
          console.log('📦 Cache carregado do localStorage');

          return true;
        } else {
          console.log('⏰ Cache expirado ou versão incompatível');
        }
      }
    } catch (error) {
      console.warn('Erro ao carregar cache do localStorage:', error);
    }
    return false;
  }

  private saveCacheToStorage(): void {
    try {
      const cacheData: CacheData = {
        data: this.leaderboardData,
        timestamp: Date.now(),
        version: this.cacheVersion
      };
      localStorage.setItem(this.localStorageKey, JSON.stringify(cacheData));
      console.log('💾 Cache salvo no localStorage');
    } catch (error) {
      console.warn('Erro ao salvar cache no localStorage:', error);
    }
  }

  async loadLeaderboard(showLoading = true) {
    if (showLoading) {
      this.isLoading = true;
      this.error = null;
    }

    try {
      const response = await this.http.get<any>(`${this.baseUrl}/stats/participants-leaderboard?limit=500`).toPromise();
      if (response.success) {
        this.leaderboardData = response.data.map((player: any, index: number) => ({
          ...player,
          rank: index + 1,
          wins: player.wins ?? player.custom_wins ?? 0,
          games_played: player.games_played ?? player.custom_games_played ?? 0,
          riot_id_game_name: player.riot_id_game_name ?? undefined,
          riot_id_tagline: player.riot_id_tagline ?? undefined,
          profileIconId: undefined,
          calculated_mmr: player.calculated_mmr ?? player.lp ?? 0,
          lp: player.lp ?? player.custom_lp ?? 0
        }));

        this.lastUpdated = new Date();
        this.saveCacheToStorage();
      } else {
        this.error = 'Erro ao carregar leaderboard';
      }
    } catch (error) {
      console.error('❌ Erro ao carregar leaderboard:', error);
      this.error = 'Erro ao conectar com o servidor';
    } finally {
      this.isLoading = false;
    }
  }

  private async loadProfileIconsOptimized(): Promise<void> {
    // Filtrar jogadores que precisam buscar ícone
    // const playersToFetch = this.leaderboardData.filter(player => {
    //   // Verificar se já tem ícone no cache compartilhado
    //   const hasIcon = this.profileIconService.getProfileIconId(
    //     player.summoner_name,
    //     player.riot_id_game_name,
    //     player.riot_id_tagline
    //   );

    //   if (hasIcon) {
    //     player.profileIconId = hasIcon;
    //     return false;
    //   }
    //   return true;
    // });

    // if (playersToFetch.length === 0) {
    //   console.log('✅ Todos os ícones já estão em cache compartilhado');
    //   return;
    // }

    // console.log(`🔄 Carregando ${playersToFetch.length} ícones de perfil...`);
    // this.isLoadingProfileIcons = true;
    // this.profileIconsProgress = { current: 0, total: playersToFetch.length };

    // // Processar em lotes para melhor performance
    // const batchSize = 10;
    // const delayBetweenBatches = 100;

    // for (let i = 0; i < playersToFetch.length; i += batchSize) {
    //   const batch = playersToFetch.slice(i, i + batchSize);
    //   const batchPromises = batch.map(async (player) => {
    //     try {
    //       const profileIconId = await this.profileIconService.getOrFetchProfileIcon(
    //         player.summoner_name,
    //         player.riot_id_game_name,
    //         player.riot_id_tagline
    //       );
    //       if (profileIconId) {
    //         player.profileIconId = profileIconId;
    //       }
    //     } catch (error) {
    //       console.warn(`Erro ao carregar ícone para ${player.summoner_name}:`, error);
    //     } finally {
    //       this.profileIconsProgress.current++;
    //     }
    //   });
    //   await Promise.all(batchPromises);
    //   if (i + batchSize < playersToFetch.length) {
    //     await this.delay(delayBetweenBatches);
    //   }
    // }

    // this.isLoadingProfileIcons = false;
    // console.log(`✅ Ícones carregados e cache compartilhado atualizado`);
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private async loadRealTotalMMR(): Promise<void> {
    console.log('🔍 Carregando MMR total real para todos os jogadores...');

    const playersToFetch = this.leaderboardData.filter(player => {
      const playerIdentifier = player.summoner_name;
      if (this.playerTotalMMRCache.has(playerIdentifier)) {
        player.calculated_mmr = this.playerTotalMMRCache.get(playerIdentifier)!;
        return false;
      }
      return true;
    });

    this.mmrProgress = { current: 0, total: playersToFetch.length };
    console.log(`📊 Precisando calcular MMR para ${playersToFetch.length} jogadores`);

    // Processar em lotes maiores
    const batchSize = 15;
    const delayBetweenBatches = 0;

    for (let i = 0; i < playersToFetch.length; i += batchSize) {
      const batch = playersToFetch.slice(i, i + batchSize);
      const batchPromises = batch.map(async (player) => {
        const playerIdentifier = player.summoner_name;
        try {
          const customMatches = await this.fetchPlayerCustomMatches(playerIdentifier);
          const totalMMR = this.calculateTotalMMRFromMatches(customMatches);
          player.calculated_mmr = totalMMR;
          this.playerTotalMMRCache.set(playerIdentifier, totalMMR);
        } catch (error) {
          console.warn(`⚠️ Erro ao calcular MMR total para ${playerIdentifier}:`, error);
        } finally {
          this.mmrProgress.current++;
        }
      });
      await Promise.all(batchPromises);
    }

    console.log('✅ MMR total calculado para todos os jogadores');
  }

  private async fetchPlayerCustomMatches(playerIdentifier: string): Promise<any[]> {
    try {
      const response = await this.http.get<any>(`${this.baseUrl}/matches/custom/${encodeURIComponent(playerIdentifier)}?limit=500`).toPromise();
      return response.success ? response.data : [];
    } catch (error) {
      console.warn(`Erro ao buscar partidas customizadas para ${playerIdentifier}:`, error);
      return [];
    }
  }

  private calculateTotalMMRFromMatches(matches: any[]): number {
    let totalMMRGained = 0;
    matches.forEach(match => {
      if (match.player_mmr_change !== undefined && match.player_mmr_change !== null) {
        totalMMRGained += match.player_mmr_change;
      } else if (match.player_lp_change !== undefined && match.player_lp_change !== null) {
        totalMMRGained += match.player_lp_change;
      }
    });
    return totalMMRGained;
  }

  // Usar o serviço compartilhado para obter URLs de ícones
  getProfileIconUrl(profileIconId?: number): string {
    const iconId = profileIconId || 29;
    return `https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/v1/profile-icons/${iconId}.jpg`;
  }

  getPlayerProfileIconUrl(player: LeaderboardPlayer): Observable<string> {
    const identifier = player.riot_id_game_name && player.riot_id_tagline
      ? `${player.riot_id_game_name}#${player.riot_id_tagline}`
      : player.summoner_name;
    return this.profileIconService.getProfileIconUrl(identifier);
  }

  getChampionIconUrl(championName: string): string {
    if (!championName) return 'assets/images/champion-placeholder.svg';

    // O nome do campeão já vem no formato correto do Data Dragon
    return `https://ddragon.leagueoflegends.com/cdn/15.14.1/img/champion/${championName}.png`;
  }

  getChampionDisplayName(championName: string): string {
    if (!championName) return 'Nenhum';

    // O nome do campeão já vem no formato correto do backend
    return championName;
  }

  formatKDA(kda: any): string {
    return `${kda.kills}/${kda.deaths}/${kda.assists}`;
  }

  formatKDANew(kills: number, deaths: number, assists: number): string {
    const safeKills = kills ?? 0;
    const safeDeaths = deaths ?? 0;
    const safeAssists = assists ?? 0;
    return `${safeKills.toFixed(1)}/${safeDeaths.toFixed(1)}/${safeAssists.toFixed(1)}`;
  }

  getKDAColor(ratio: number): string {
    const safeRatio = ratio ?? 0;
    if (safeRatio >= 3.0) return '#10b981';
    if (safeRatio >= 2.0) return '#f59e0b';
    if (safeRatio >= 1.0) return '#6b7280';
    return '#ef4444';
  }

  getWinRateColor(winRate: number): string {
    const safeWinRate = winRate ?? 0;
    if (safeWinRate >= 65) return '#10b981';
    if (safeWinRate >= 55) return '#f59e0b';
    if (safeWinRate >= 45) return '#6b7280';
    return '#ef4444';
  }

  getRankColor(rank: number): string {
    const safeRank = rank ?? 0;
    switch (safeRank) {
      case 1: return '#ffd700';
      case 2: return '#c0c0c0';
      case 3: return '#cd7f32';
      default: return '#6b7280';
    }
  }

  getRankIcon(rank: number): string {
    const safeRank = rank ?? 0;
    switch (safeRank) {
      case 1: return '🥇';
      case 2: return '🥈';
      case 3: return '🥉';
      default: return `#${safeRank}`;
    }
  }

  formatGold(gold: number): string {
    const safeGold = gold ?? 0;
    if (safeGold >= 1000) {
      return `${(safeGold / 1000).toFixed(1)}k`;
    }
    return safeGold.toString();
  }

  formatDamage(damage: number): string {
    const safeDamage = damage ?? 0;
    if (safeDamage >= 1000) {
      return `${(safeDamage / 1000).toFixed(1)}k`;
    }
    return safeDamage.toString();
  }

  formatTime(dateString: string): string {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return 'Hoje';
    if (diffDays === 1) return 'Ontem';
    if (diffDays < 30) return `${diffDays} dias atrás`;
    if (diffDays < 365) return `${Math.floor(diffDays / 30)} meses atrás`;
    return `${Math.floor(diffDays / 365)} anos atrás`;
  }

  refresh() {
    console.log('🔄 Iniciando atualização do leaderboard...');
    this.loadLeaderboard(true); // Forçar mostrar loading
  }

  trackByPlayerId(index: number, player: LeaderboardPlayer): string {
    return player.summoner_name + '_' + index;
  }

  formatUpdateTime(date: Date): string {
    return date.toLocaleTimeString('pt-BR', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  }

  onImageError(event: Event, fallbackUrl: string): void {
    const target = event.target as HTMLImageElement;
    if (target) {
      target.src = fallbackUrl;
    }
  }

  onProfileIconError(event: Event, profileIconId?: number): void {
    this.profileIconService.onProfileIconError(event, profileIconId);
  }

  getLoadingStatus(): string {
    if (this.isLoading) return 'Carregando leaderboard...';
    if (this.isLoadingProfileIcons) {
      const { current, total } = this.profileIconsProgress;
      return `Carregando ícones (${current}/${total})...`;
    }
    if (this.isLoadingMMR) {
      const { current, total } = this.mmrProgress;
      return `Calculando MMR (${current}/${total})...`;
    }
    return '';
  }

  getLoadingProgress(): number {
    if (this.isLoadingProfileIcons && this.profileIconsProgress.total > 0) {
      return (this.profileIconsProgress.current / this.profileIconsProgress.total) * 100;
    }
    if (this.isLoadingMMR && this.mmrProgress.total > 0) {
      return (this.mmrProgress.current / this.mmrProgress.total) * 100;
    }
    return 0;
  }

  isAnyLoading(): boolean {
    return this.isLoading || this.isLoadingProfileIcons || this.isLoadingMMR;
  }

  async refreshAndRebuildPlayers() {
    console.log('🔄 Reconstruindo e atualizando todos os jogadores...');
    this.isLoading = true;
    try {
      const response = await this.http.post<any>(`${this.baseUrl}/stats/refresh-rebuild-players`, {}).toPromise();
      if (response.success) {
        console.log('✅ Reconstrução concluída, recarregando leaderboard...');
        await this.loadLeaderboard(false);
      } else {
        this.error = 'Falha ao reconstruir jogadores';
      }
    } catch (error) {
      console.error('❌ Erro ao reconstruir jogadores:', error);
      this.error = 'Erro no servidor durante reconstrução';
    } finally {
      this.isLoading = false;
    }
  }
}
