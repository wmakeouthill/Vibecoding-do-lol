import { Injectable } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { catchError, retry, map } from 'rxjs/operators';
import { Player, RefreshPlayerResponse } from '../interfaces'; // Importar Player e RefreshPlayerResponse

interface QueueStatus {
  playersInQueue: number;
  activeMatches: number;
  averageWaitTime: number;
  queuedPlayers: any[];
}

interface LCUStatus {
  isConnected: boolean;
  summoner?: any;
  gameflowPhase?: string;
  lobby?: any;
}

interface MatchHistory {
  id: number;
  matchId: string;
  team1Players: number[];
  team2Players: number[];
  winnerTeam?: number;
  createdAt: string;
  completedAt?: string;
}

@Injectable({
  providedIn: 'root'
})
export class ApiService {
  private baseUrl = this.getBaseUrl();

  constructor(private http: HttpClient) {}

  private getBaseUrl(): string {
    // Em desenvolvimento, usar localhost
    if (this.isElectron()) {
      return 'http://localhost:3000/api'; // Alterado para porta 3000
    }

    // Em produção web, usar URL relativa
    const host = window.location.hostname;
    if (host === 'localhost' || host === '127.0.0.1') {
      return 'http://localhost:3000/api'; // Alterado para porta 3000
    }

    // URL da nuvem quando em produção
    return `/api`;
  }

  private isElectron(): boolean {
    return !!(window as any).electronAPI;
  }
  private handleError(error: HttpErrorResponse) {
    let errorMessage = 'Erro desconhecido';

    if (error.error instanceof ErrorEvent) {
      // Erro do lado do cliente
      errorMessage = `Erro: ${error.error.message}`;
    } else {
      // Erro do lado do servidor
      if (error.status === 503 && error.error?.error?.includes('Riot API')) {
        errorMessage = 'Chave da Riot API não configurada ou inválida. Configure uma chave válida nas configurações.';
      } else if (error.status === 503 && error.error?.error?.includes('LCU')) {
        errorMessage = 'Cliente do League of Legends não está conectado. Abra o jogo e tente novamente.';
      } else if (error.status === 404 && error.error?.error?.includes('não encontrado')) {
        errorMessage = error.error.error;
      } else {
        errorMessage = error.error?.error || error.message || `Erro ${error.status}`;
      }
    }

    console.error('Erro na API:', errorMessage);
    return throwError(() => new Error(errorMessage));
  }

  // Health check
  checkHealth(): Observable<any> {
    return this.http.get(`${this.baseUrl}/health`)
      .pipe(
        retry(2),
        catchError(this.handleError)
      );
  }  // Player endpoints
  registerPlayer(riotId: string, region: string): Observable<Player> {
    // Use the new refresh endpoint that handles Riot ID properly
    return this.refreshPlayerByRiotId(riotId, region).pipe(
      map(response => {
        if (!response.player) {
          throw new Error('Falha ao registrar jogador');
        }
        return response.player;
      }),
      catchError(this.handleError)
    );
  }

  getPlayer(playerId: number): Observable<Player> {
    return this.http.get<Player>(`${this.baseUrl}/player/${playerId}`)
      .pipe(
        catchError(this.handleError)
      );
  }

  getPlayerBySummoner(summonerName: string): Observable<Player> {
    return this.http.get<Player>(`${this.baseUrl}/player/summoner/${summonerName}`)
      .pipe(
        catchError(this.handleError)
      );
  }

  // Add this method
  getPlayerByPuuid(puuid: string, region: string): Observable<Player> {
    // Adjust the endpoint as per your backend API structure for fetching by PUUID
    return this.http.get<Player>(`${this.baseUrl}/player/puuid/${puuid}?region=${region}`)
      .pipe(
        catchError(this.handleError)
      );
  }

  getPlayerStats(playerId: number): Observable<any> {
    return this.http.get(`${this.baseUrl}/player/${playerId}/stats`)
      .pipe(
        catchError(this.handleError)
      );
  }
  // Novo método para buscar dados detalhados do jogador atual
  // Endpoint para obter dados completos do jogador logado no LCU
  getCurrentPlayerDetails(): Observable<any> {
    return this.http.get(`${this.baseUrl}/player/current-details`)
      .pipe(
        retry(1), // Tentar novamente uma vez se falhar
        catchError(this.handleError)
      );
  }
  // Método para buscar dados básicos do jogador (para modo Browser ou fallback)
  // Endpoint alternativo para obter dados do LCU
  getCurrentPlayerDebug(): Observable<any> {
    return this.http.get(`${this.baseUrl}/lcu/current-summoner`)
      .pipe(
        retry(1), // Tentar novamente uma vez se falhar
        catchError(this.handleError)
      );
  }

  // Queue endpoints
  getQueueStatus(): Observable<QueueStatus> {
    return this.http.get<QueueStatus>(`${this.baseUrl}/queue/status`)
      .pipe(
        catchError(this.handleError)
      );
  }
  getRecentMatches(): Observable<MatchHistory[]> {
    return this.http.get<MatchHistory[]>(`${this.baseUrl}/matches/recent`)
      .pipe(
        catchError(this.handleError)
      );
  }
  getMatchHistory(playerId: string, offset: number = 0, limit: number = 10): Observable<any> {
    return this.http.get(`${this.baseUrl}/match-history/${playerId}?offset=${offset}&limit=${limit}`)
      .pipe(
        catchError(this.handleError)
      );
  }

  // Riot API endpoints
  getSummonerData(region: string, summonerName: string): Observable<any> {
    return this.http.get(`${this.baseUrl}/riot/summoner/${region}/${summonerName}`)
      .pipe(
        catchError(this.handleError)
      );
  }
  getRankedData(region: string, summonerId: string): Observable<any> {
    return this.http.get(`${this.baseUrl}/riot/ranked/${region}/${summonerId}`)
      .pipe(
        catchError(this.handleError)
      );
  }
  // LCU endpoints
  getLCUStatus(): Observable<LCUStatus> {
    return this.http.get<LCUStatus>(`${this.baseUrl}/lcu/status`)
      .pipe(
        catchError(this.handleError)
      );
  }

  getCurrentSummonerFromLCU(): Observable<any> {
    return this.http.get(`${this.baseUrl}/lcu/current-summoner`)
      .pipe(
        catchError(this.handleError)
      );
  }

  createLobby(gameMode: string = 'CLASSIC'): Observable<any> {
    return this.http.post(`${this.baseUrl}/lcu/create-lobby`, {
      gameMode
    }).pipe(
      catchError(this.handleError)
    );
  }

  invitePlayers(summonerNames: string[]): Observable<any> {
    return this.http.post(`${this.baseUrl}/lcu/invite-players`, {
      summonerNames
    }).pipe(
      catchError(this.handleError)
    );
  }

  // Settings endpoints
  saveSettings(settings: any): Observable<any> {
    return this.http.post(`${this.baseUrl}/settings`, settings)
      .pipe(
        catchError(this.handleError)
      );
  }

  // Novo método para configurar a Riot API Key
  setRiotApiKey(apiKey: string): Observable<any> {
    return this.http.post(`${this.baseUrl}/settings/riot-api-key`, { apiKey })
      .pipe(
        catchError(this.handleError)
      );
  }
  // Método para atualizar dados do jogador usando Riot ID (gameName#tagLine)
  refreshPlayerByRiotId(riotId: string, region: string): Observable<RefreshPlayerResponse> {
    return this.http.post<RefreshPlayerResponse>(`${this.baseUrl}/player/refresh-by-riot-id`, {
      riotId,
      region
    }).pipe(
      map(response => {
        // Adaptar a resposta do backend para o formato esperado pelo frontend
        if ((response as any).success && (response as any).data) {
          return {
            success: true,
            player: (response as any).data as Player,
            message: (response as any).message || 'Dados atualizados com sucesso'
          };
        }
        return response;
      }),
      catchError(this.handleError)
    );
  }
  // Get current player from LCU - UPDATED TO USE CORRECT ENDPOINT
  getCurrentPlayer(): Observable<any> {
    return this.getCurrentPlayerDetails().pipe(
      map(response => {
        if (response.success && response.data) {
          return { success: true, player: response.data.riotApi };
        }
        return { success: false, player: null };
      }),
      catchError(this.handleError)
    );
  }

  // Mock autoJoinQueue - REMOVE OR REPLACE WITH ACTUAL IMPLEMENTATION
  autoJoinQueue(): Observable<any> {
    // This needs a proper backend endpoint and logic
    return throwError(() => new Error('autoJoinQueue not implemented'));
  }

  // Adicionado para setApiKey (se ainda for usado internamente no app.ts, embora não recomendado)
  setApiKey(apiKey: string): void {
    // Esta função não envia a chave para o backend.
    // A configuração da chave no backend é feita por setRiotApiKey.
    // Esta função poderia ser usada para armazenar a chave no frontend se necessário,
    // mas geralmente não é uma boa prática.
    console.warn('ApiService.setApiKey foi chamada. Esta função não configura a chave no backend.');
  }

  // Método para buscar detalhes da partida atual (LCU)
  getCurrentGame(): Observable<any> {
    // Assumindo que você terá um endpoint no backend como /api/lcu/current-match
    // Este endpoint chamaria lcuService.getCurrentMatchDetails() ou similar.
    // Se o endpoint for diferente, ajuste aqui.
    return this.http.get<any>(`${this.baseUrl}/lcu/current-match-details`) // Verifique se este endpoint existe no backend
      .pipe(catchError(this.handleError));
  }

  // Método para buscar histórico de partidas de um jogador pela Riot API
  getPlayerMatchHistoryFromRiot(puuid: string, region: string, count: number = 20): Observable<any> {
    // O backend espera a região no path ou query? Ajustar conforme necessário.
    // O endpoint atual em server.ts é /api/player/match-history-riot/:puuid e não usa region no path.
    // A região é fixada como 'americas' no backend globalRiotAPI.getMatchHistory. Se precisar ser dinâmica, o backend precisa mudar.
    return this.http.get<any>(`${this.baseUrl}/player/match-history-riot/${puuid}?count=${count}`)
      .pipe(catchError(this.handleError));
  }

  // Método para buscar detalhes de uma partida específica pela Riot API
  getMatchDetails(matchId: string): Observable<any> {
    // O backend espera a região no path ou query? Ajustar conforme necessário.
    // O endpoint atual em server.ts é /api/match/:matchId e não usa region no path.
    // A região é fixada como 'americas' no backend globalRiotAPI.getMatchDetails. Se precisar ser dinâmica, o backend precisa mudar.
    return this.http.get<any>(`${this.baseUrl}/match/${matchId}`)
      .pipe(catchError(this.handleError));
  }

  // ========== MÉTODOS MAIS AMIGÁVEIS PARA BUSCAR JOGADOR ==========

  // Método principal: buscar por Riot ID (GameName#TagLine) - MAIS AMIGÁVEL
  getPlayerByRiotId(riotId: string, region: string): Observable<Player> {
    if (!riotId.includes('#')) {
      return throwError(() => new Error('Formato inválido. Use: NomeDoJogo#TAG (ex: Player#BR1)'));
    }

    return this.http.get<Player>(`${this.baseUrl}/player/details/${encodeURIComponent(riotId)}?region=${region}`)
      .pipe(
        retry(1),
        catchError(this.handleError)
      );
  }

  // Método para buscar automaticamente do LCU (cliente do LoL) - MAIS CONVENIENTE
  getPlayerFromLCU(): Observable<Player> {
    return this.http.get<any>(`${this.baseUrl}/player/current-details`)
      .pipe(
        retry(1),
        map(response => {
          if (response.success && response.data) {
            return this.mapApiResponseToPlayer(response.data);
          }
          throw new Error('Nenhum jogador conectado no League of Legends');
        }),
        catchError(this.handleError)
      );
  }

  // Método de busca inteligente - tenta várias formas automaticamente
  smartPlayerSearch(identifier: string, region: string = 'br1'): Observable<Player> {
    // Detectar o tipo de identificador e usar o método apropriado
    if (identifier.includes('#')) {
      // É um Riot ID (GameName#TagLine)
      return this.getPlayerByRiotId(identifier, region);
    } else if (identifier.match(/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/)) {
      // É um PUUID
      return this.getPlayerByPuuid(identifier, region);
    } else {
      // É um summoner name legado
      return this.getPlayerBySummoner(identifier);
    }
  }

  // Método para buscar por summoner name legado (ainda funciona)
  searchPlayerBySummonerName(summonerName: string, region: string): Observable<Player> {
    return this.http.get<any>(`${this.baseUrl}/riot/summoner/${region}/${encodeURIComponent(summonerName)}`)
      .pipe(
        retry(1),
        map(response => this.mapApiResponseToPlayer(response)),
        catchError(this.handleError)
      );
  }
  // Método auxiliar para mapear resposta da API para Player
  private mapApiResponseToPlayer(data: any): Player {
    // Adaptar diferentes formatos de resposta da API para o formato Player esperado
    const lcuData = data.lcu || data.lcuData || {};
    const riotAccount = data.riotAccount || {};
    const riotApi = data.riotApi || data.riotData || data;

    return {
      id: riotApi.id || lcuData.summonerId || 0,
      summonerName: riotAccount.gameName || riotApi.gameName || riotApi.name || lcuData.gameName || lcuData.displayName || 'Unknown',
      tagLine: riotAccount.tagLine || riotApi.tagLine || lcuData.tagLine || null,
      summonerId: riotApi.id || lcuData.summonerId?.toString() || '0',
      puuid: riotAccount.puuid || riotApi.puuid || lcuData.puuid || '',
      profileIconId: riotApi.profileIconId || lcuData.profileIconId || 1,
      summonerLevel: riotApi.summonerLevel || lcuData.summonerLevel || 30,
      region: riotApi.region || 'br1',
      currentMMR: this.calculateMMRFromData(riotApi),
      rank: this.extractRankData(riotApi),
      wins: riotApi.soloQueue?.wins || riotApi.wins,
      losses: riotApi.soloQueue?.losses || riotApi.losses
    };
  }

  private calculateMMRFromData(data: any): number {
    const soloQueue = data.soloQueue || data.rankedData?.soloQueue;
    if (!soloQueue) return 1200;

    const tierValues: { [key: string]: number } = {
      'IRON': 800, 'BRONZE': 1000, 'SILVER': 1200, 'GOLD': 1400,
      'PLATINUM': 1700, 'EMERALD': 2000, 'DIAMOND': 2300,
      'MASTER': 2600, 'GRANDMASTER': 2800, 'CHALLENGER': 3000
    };

    const rankValues: { [key: string]: number } = {
      'IV': 0, 'III': 50, 'II': 100, 'I': 150
    };

    const baseMMR = tierValues[soloQueue.tier] || 1200;
    const rankBonus = rankValues[soloQueue.rank] || 0;
    const lpBonus = (soloQueue.leaguePoints || 0) * 0.8;

    return Math.round(baseMMR + rankBonus + lpBonus);
  }

  private extractRankData(data: any): any {
    const soloQueue = data.soloQueue || data.rankedData?.soloQueue;
    if (!soloQueue || !soloQueue.tier) return undefined;

    return {
      tier: soloQueue.tier,
      rank: soloQueue.rank,
      lp: soloQueue.leaguePoints,
      wins: soloQueue.wins,
      losses: soloQueue.losses,
      display: `${soloQueue.tier} ${soloQueue.rank}`
    };
  }
  // ========== FIM DOS MÉTODOS AMIGÁVEIS ==========

  // Método para verificar se a Riot API Key está configurada e funcionando
  checkRiotApiStatus(): Observable<any> {
    return this.http.get(`${this.baseUrl}/settings/riot-api-status`)
      .pipe(
        catchError(this.handleError)
      );
  }

  // Método para obter configurações atuais
  getSettings(): Observable<any> {
    return this.http.get(`${this.baseUrl}/settings`)
      .pipe(
        catchError(this.handleError)
      );
  }
}
