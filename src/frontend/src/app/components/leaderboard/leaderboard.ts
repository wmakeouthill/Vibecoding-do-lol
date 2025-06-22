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

  constructor(private http: HttpClient, private championService: ChampionService) {}

  ngOnInit() {
    this.loadLeaderboard();
    // Atualizar a cada 2 minutos
    this.refreshSubscription = interval(120000).subscribe(() => {
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

    try {      const response = await this.http.get<any>('http://localhost:3000/api/stats/participants-leaderboard?limit=50').toPromise();

      if (response.success) {
        // Processar dados e adicionar rank
        this.leaderboardData = response.data.map((player: any, index: number) => ({
          ...player,
          rank: index + 1,          // Garantir que profileIconId existe e tem um valor padrão (dados antigos podem não ter esse campo)
          profileIconId: player.profileIconId || player.profile_icon_id || 1
        }));
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

  getProfileIconUrl(profileIconId: number): string {
    return `https://ddragon.leagueoflegends.com/cdn/15.12.1/img/profileicon/${profileIconId}.png`;
  }  getChampionIconUrl(championName: string): string {
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
    return `${kills.toFixed(1)}/${deaths.toFixed(1)}/${assists.toFixed(1)}`;
  }

  getKDAColor(ratio: number): string {
    if (ratio >= 3.0) return '#10b981'; // Verde
    if (ratio >= 2.0) return '#f59e0b'; // Amarelo
    if (ratio >= 1.0) return '#6b7280'; // Cinza
    return '#ef4444'; // Vermelho
  }

  getWinRateColor(winRate: number): string {
    if (winRate >= 65) return '#10b981'; // Verde
    if (winRate >= 55) return '#f59e0b'; // Amarelo
    if (winRate >= 45) return '#6b7280'; // Cinza
    return '#ef4444'; // Vermelho
  }

  getRankColor(rank: number): string {
    switch (rank) {
      case 1: return '#ffd700'; // Ouro
      case 2: return '#c0c0c0'; // Prata
      case 3: return '#cd7f32'; // Bronze
      default: return '#6b7280'; // Cinza
    }
  }

  getRankIcon(rank: number): string {
    switch (rank) {
      case 1: return '🥇';
      case 2: return '🥈';
      case 3: return '🥉';
      default: return `#${rank}`;
    }
  }

  formatGold(gold: number): string {
    if (gold >= 1000) {
      return `${(gold / 1000).toFixed(1)}k`;
    }
    return gold.toString();
  }

  formatDamage(damage: number): string {
    if (damage >= 1000) {
      return `${(damage / 1000).toFixed(1)}k`;
    }
    return damage.toString();
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
}
