import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { interval, Subscription } from 'rxjs';
import { ChampionService } from '../../services/champion.service';

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
}

@Component({
  selector: 'app-leaderboard',
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
  private profileIconCache: Map<string, number> = new Map();
  private playerTotalMMRCache: Map<string, number> = new Map(); // Cache para MMR total

  // Estados de carregamento detalhados
  isLoadingProfileIcons = false;
  isLoadingMMR = false;
  profileIconsProgress = { current: 0, total: 0 };
  mmrProgress = { current: 0, total: 0 };

  constructor(private http: HttpClient, private championService: ChampionService) {}

  ngOnInit() {
    this.loadLeaderboard();
    // Atualizar a cada 2 minutos
    this.refreshSubscription = interval(1200000).subscribe(() => {
      this.loadLeaderboard(false);
    });
  }

  ngOnDestroy() {
    if (this.refreshSubscription) {
      this.refreshSubscription.unsubscribe();
    }
  }
  async loadLeaderboard(showLoading = true) {
    if (showLoading) {
      this.isLoading = true;
    }
    this.error = null;

    try {
      const response = await this.http.get<any>('http://localhost:3000/api/stats/participants-leaderboard?limit=200').toPromise();
      
      if (response.success) {
        // Processar dados e adicionar rank, adaptando campos
        this.leaderboardData = response.data.map((player: any, index: number) => ({
          ...player,
          rank: index + 1,
          // Corrigir nomes dos campos para compatibilidade
          wins: player.wins ?? player.custom_wins ?? 0,
          games_played: player.games_played ?? player.custom_games_played ?? 0,
          // Garantir que riot_id_game_name/tagline existam (pode ser undefined)
          riot_id_game_name: player.riot_id_game_name ?? undefined,
          riot_id_tagline: player.riot_id_tagline ?? undefined,
          // Profile icon será buscado pelo summoner_name se não houver Riot ID
          profileIconId: undefined
        }));
        
        this.isLoadingProfileIcons = true;
        await this.loadProfileIcons();
        this.isLoadingProfileIcons = false;

        this.isLoadingMMR = true;
        await this.loadRealTotalMMR();
        this.isLoadingMMR = false;

        this.lastUpdated = new Date();
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

  private async loadProfileIcons(): Promise<void> {
    // Filtrar jogadores que precisam buscar ícone
    const playersToFetch = this.leaderboardData.filter(player => {
      // Se não tem Riot ID, tenta buscar pelo summoner_name
      if (!player.riot_id_game_name || !player.riot_id_tagline) {
        if (this.profileIconCache.has(player.summoner_name)) {
          player.profileIconId = this.profileIconCache.get(player.summoner_name);
          return false;
        }
        return true;
      }
      const riotId = `${player.riot_id_game_name}#${player.riot_id_tagline}`;
      if (this.profileIconCache.has(riotId)) {
        player.profileIconId = this.profileIconCache.get(riotId);
        return false;
      }
      return true;
    });

    this.profileIconsProgress = { current: 0, total: playersToFetch.length };
    const batchSize = 5;
    const delayBetweenBatches = 250;

    for (let i = 0; i < playersToFetch.length; i += batchSize) {
      const batch = playersToFetch.slice(i, i + batchSize);
      const batchPromises = batch.map(async (player) => {
        let riotId;
        if (player.riot_id_game_name && player.riot_id_tagline) {
          riotId = `${player.riot_id_game_name}#${player.riot_id_tagline}`;
        } else {
          riotId = player.summoner_name;
        }
        try {
          const profileIconId = await this.fetchProfileIconWithRetry(riotId);
          if (profileIconId) {
            player.profileIconId = profileIconId;
            this.profileIconCache.set(riotId, profileIconId);
          }
        } catch (error) {
          // fallback
        } finally {
          this.profileIconsProgress.current++;
        }
      });
      await Promise.all(batchPromises);
      if (i + batchSize < playersToFetch.length) {
        await this.delay(delayBetweenBatches);
      }
    }
  }

  private async fetchProfileIconWithRetry(riotId: string, maxRetries = 2): Promise<number | null> {
    let lastError: any;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const profileIconId = await this.fetchProfileIcon(riotId);
        if (profileIconId) {
          return profileIconId;
        }

        // Se retornou null (404 ou outros erros controlados), não tentar novamente
        return null;
      } catch (error: any) {
        lastError = error;

        // Se for 404 (jogador não encontrado), não tentar novamente
        if (error.status === 404) {
          return null;
        }

        // Para outros erros, tentar novamente após um delay
        if (attempt < maxRetries) {
          const retryDelay = 200 * attempt; // Delay progressivo: 200ms, 400ms...
          console.log(`🔄 Tentativa ${attempt} falhou para ${riotId}, tentando novamente em ${retryDelay}ms...`);
          await this.delay(retryDelay);
        }
      }
    }

    // Se chegou aqui, todas as tentativas falharam
    throw lastError;
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private async loadRealTotalMMR(): Promise<void> {
    console.log('🔍 Carregando MMR total real para todos os jogadores...');

    // Filtrar jogadores que precisam calcular MMR
    const playersToFetch = this.leaderboardData.filter(player => {
      const playerIdentifier = player.summoner_name;

      // Verificar cache primeiro
      if (this.playerTotalMMRCache.has(playerIdentifier)) {
        player.calculated_mmr = this.playerTotalMMRCache.get(playerIdentifier)!;
        return false;
      }

      return true;
    });
    this.mmrProgress = { current: 0, total: playersToFetch.length };
    console.log(`📊 Precisando calcular MMR para ${playersToFetch.length} jogadores (consultas locais, sem delay)`);
    // Processar em lotes maiores - são consultas no banco local, mais rápidas
    const batchSize = 10; // Máximo 10 requisições simultâneas
    const delayBetweenBatches = 0; // Sem delay - consultas locais

    for (let i = 0; i < playersToFetch.length; i += batchSize) {
      const batch = playersToFetch.slice(i, i + batchSize);

      const batchPromises = batch.map(async (player) => {
        const playerIdentifier = player.summoner_name;

        try {
          const customMatches = await this.fetchPlayerCustomMatches(playerIdentifier);
          const totalMMR = this.calculateTotalMMRFromMatches(customMatches);

          // Atualizar player e cache
          player.calculated_mmr = totalMMR;
          this.playerTotalMMRCache.set(playerIdentifier, totalMMR);

          console.log(`✅ MMR total para ${playerIdentifier}: ${totalMMR}`);
        } catch (error) {
          console.warn(`⚠️ Erro ao calcular MMR total para ${playerIdentifier}:`, error);
          // Manter o calculated_mmr atual como fallback
        } finally {
          this.mmrProgress.current++;
        }
      });
      await Promise.all(batchPromises);

      // Sem delay para consultas no banco local - são rápidas
      // if (i + batchSize < playersToFetch.length) {
      //   await this.delay(delayBetweenBatches);
      // }
    }

    console.log('✅ MMR total calculado para todos os jogadores');
  }

  private async fetchPlayerCustomMatches(playerIdentifier: string): Promise<any[]> {
    try {
      // Usar o mesmo endpoint que o match-history usa
      const response = await this.http.get<any>(`http://localhost:3000/api/matches/custom/${encodeURIComponent(playerIdentifier)}?limit=100`).toPromise();

      if (response && response.success) {
        return response.matches || [];
      }

      return [];
    } catch (error) {
      console.warn(`Erro ao buscar partidas customizadas para ${playerIdentifier}:`, error);
      return [];
    }
  }

  private calculateTotalMMRFromMatches(matches: any[]): number {
    // Usar a mesma lógica EXATA do match-history component
    let totalMMRGained = 0;

    matches.forEach(match => {
      // Priorizar player_mmr_change que já vem calculado corretamente do backend
      if (match.player_mmr_change !== undefined && match.player_mmr_change !== null) {
        totalMMRGained += match.player_mmr_change;
        console.log(`📊 Partida ${match.id}: MMR change = ${match.player_mmr_change} (acumulado: ${totalMMRGained})`);
      } else if (match.player_lp_change !== undefined && match.player_lp_change !== null) {
        // Fallback para LP change se MMR change não estiver disponível
        totalMMRGained += match.player_lp_change;
        console.log(`📊 Partida ${match.id}: LP change (fallback) = ${match.player_lp_change} (acumulado: ${totalMMRGained})`);
      } else {
        console.log(`⚠️ Partida ${match.id}: Sem dados de MMR/LP change`);
      }
    });

    // MMR total = MMR inicial (0) + total de MMR ganho/perdido
    const baseMMR = 0;
    const finalMMR = baseMMR + totalMMRGained;

    console.log(`🎯 MMR total calculado para ${matches[0]?.player_identifier || 'jogador'}: ${baseMMR} (base) + ${totalMMRGained} (ganho) = ${finalMMR}`);

    return finalMMR;
  }

  private async fetchProfileIcon(riotId: string): Promise<number | null> {
    try {
      // Primeiro tentar o endpoint específico para profile icon
      const response = await this.http.get<any>(`http://localhost:3000/api/summoner/profile-icon/${encodeURIComponent(riotId)}`).toPromise();

      if (response.success && response.data.profileIconId !== undefined) {
        console.log(`✅ Profile icon encontrado para ${riotId}:`, response.data.profileIconId, `(fonte: ${response.data.source})`);
        return response.data.profileIconId;
      }

      return null;
    } catch (error: any) {
      // Se der erro 404, significa que o jogador não foi encontrado no LCU
      if (error.status === 404) {
        console.log(`ℹ️ Jogador ${riotId} não encontrado no LCU (não jogou recentemente)`);
      } else if (error.status === 503) {
        console.log(`⚠️ Cliente do LoL não conectado para buscar ${riotId}`);
      } else {
        console.warn(`Erro ao buscar profile icon para ${riotId}:`, error);
      }
      return null;
    }
  }

  getProfileIconUrl(profileIconId?: number): string {
    // Usar Community Dragon como primeira opção (mesma estratégia do dashboard)
    const iconId = profileIconId || 29; // Fallback para ícone padrão
    return `https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/v1/profile-icons/${iconId}.jpg`;
  }

  getChampionIconUrl(championName: string): string {
    if (!championName) return 'assets/images/champion-placeholder.svg';

    // Se o nome parece ser um ID numérico (ex: "Champion79"), usar o ChampionService
    const championIdMatch = championName.match(/Champion(\d+)/i);
    let finalName = championName;

    if (championIdMatch) {
      const championId = parseInt(championIdMatch[1]);
      finalName = ChampionService.getChampionNameById(championId);
    }

    // Normalize champion name for Data Dragon URL
    const normalizedName = this.normalizeChampionName(finalName);
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

    // Primeiro, tentar usar o mapeamento especial
    if (nameMap[championName]) {
      return nameMap[championName];
    }

    // Se o nome parece ser um ID numérico ou nome inválido (ex: "Champion79"),
    // tentar extrair o ID e usar o ChampionService
    const championIdMatch = championName.match(/Champion(\d+)/i);
    if (championIdMatch) {
      const championId = parseInt(championIdMatch[1]);
      const correctName = ChampionService.getChampionNameById(championId);
      return nameMap[correctName] || correctName;
    }

    // Se o nome não tem problemas especiais, retornar como está
    return championName;
  }

  getChampionDisplayName(championName: string): string {
    if (!championName) return 'Nenhum';

    // Se o nome parece ser um ID numérico (ex: "Champion79"), usar o ChampionService
    const championIdMatch = championName.match(/Champion(\d+)/i);

    if (championIdMatch) {
      const championId = parseInt(championIdMatch[1]);
      return ChampionService.getChampionNameById(championId);
    }

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
    if (safeRatio >= 3.0) return '#10b981'; // Verde
    if (safeRatio >= 2.0) return '#f59e0b'; // Amarelo
    if (safeRatio >= 1.0) return '#6b7280'; // Cinza
    return '#ef4444'; // Vermelho
  }

  getWinRateColor(winRate: number): string {
    const safeWinRate = winRate ?? 0;
    if (safeWinRate >= 65) return '#10b981'; // Verde
    if (safeWinRate >= 55) return '#f59e0b'; // Amarelo
    if (safeWinRate >= 45) return '#6b7280'; // Cinza
    return '#ef4444'; // Vermelho
  }

  getRankColor(rank: number): string {
    const safeRank = rank ?? 0;
    switch (safeRank) {
      case 1: return '#ffd700'; // Ouro
      case 2: return '#c0c0c0'; // Prata
      case 3: return '#cd7f32'; // Bronze
      default: return '#6b7280'; // Cinza
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
    this.loadLeaderboard();
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
    const target = event.target as HTMLImageElement;
    if (!target) return;

    const iconId = profileIconId || 29;
    const fallbackUrls = [
      `https://ddragon.leagueoflegends.com/cdn/15.12.1/img/profileicon/${iconId}.png`,
      `https://ddragon.leagueoflegends.com/cdn/14.24.1/img/profileicon/${iconId}.png`,
      `https://ddragon.leagueoflegends.com/cdn/14.23.1/img/profileicon/${iconId}.png`,
      `https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/v1/profile-icons/29.jpg` // Ícone padrão final
    ];

    // Pegar a próxima URL da lista de fallbacks
    const currentSrc = target.src;
    let nextIndex = 0;

    for (let i = 0; i < fallbackUrls.length; i++) {
      if (fallbackUrls[i] === currentSrc) {
        nextIndex = i + 1;
        break;
      }
    }

    if (nextIndex < fallbackUrls.length) {
      target.src = fallbackUrls[nextIndex];
    }
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
}
