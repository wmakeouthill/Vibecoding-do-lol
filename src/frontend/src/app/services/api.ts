import { Injectable } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { catchError, retry, map } from 'rxjs/operators';

interface Player {
  id: number;
  summonerName: string;
  currentMMR: number;
  region: string;
  profileIconId?: number;
}

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
      return 'http://localhost:3000/api';
    }

    // Em produção web, usar URL relativa
    const host = window.location.hostname;
    if (host === 'localhost' || host === '127.0.0.1') {
      return 'http://localhost:3000/api';
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
      errorMessage = error.error?.error || error.message || `Erro ${error.status}`;
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
  }

  // Player endpoints
  registerPlayer(summonerName: string, region: string): Observable<Player> {
    return this.http.post<Player>(`${this.baseUrl}/player/register`, {
      summonerName,
      region
    }).pipe(
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

  // Mock getCurrentPlayer - REMOVE OR REPLACE WITH ACTUAL IMPLEMENTATION
  getCurrentPlayer(): Observable<any> {
    // This should ideally fetch from LCU or a similar source if player is logged in
    // For now, returning an empty object or a mock response
    return this.http.get(`${this.baseUrl}/player/current-browser`) // Using existing comprehensive endpoint
      .pipe(
        map(response => {
          // Assuming the structure is { success: boolean, data: { lcuData: Player } }
          // Adjust based on actual response structure
          if ((response as any).success && (response as any).data?.lcuData) {
            return { success: true, player: (response as any).data.lcuData };
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

  // Adicionado para getCurrentPlayerComprehensive
  getCurrentPlayerComprehensive(): Observable<any> {
    return this.http.get<any>(`${this.baseUrl}/player/current-comprehensive`)
      .pipe(catchError(this.handleError));
  }

  // Adicionado para getCurrentPlayerDebug
  getCurrentPlayerDebug(): Observable<any> {
    return this.http.get<any>(`${this.baseUrl}/debug/lcu-summoner`)
      .pipe(catchError(this.handleError));
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
}
