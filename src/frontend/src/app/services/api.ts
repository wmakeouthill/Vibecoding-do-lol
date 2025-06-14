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
  private riotApiKey: string | null = null; // Add this line

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
    let headers = {};
    if (this.riotApiKey) {
      headers = { 'X-Riot-Token': this.riotApiKey };
    }
    // Adjust the endpoint as per your backend API structure for fetching by PUUID
    return this.http.get<Player>(`${this.baseUrl}/player/puuid/${puuid}?region=${region}`, { headers })
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

  getSettings(): Observable<any> {
    return this.http.get(`${this.baseUrl}/settings`)
      .pipe(
        catchError(this.handleError)
      );
  }

  // Match endpoints
  completeMatch(matchId: number, winnerTeam: number): Observable<any> {
    return this.http.post(`${this.baseUrl}/matches/${matchId}/complete`, {
      winnerTeam
    }).pipe(
      catchError(this.handleError)
    );
  }

  reportMatchResult(matchId: number, playerId: number, won: boolean): Observable<any> {
    return this.http.post(`${this.baseUrl}/matches/${matchId}/result`, {
      playerId,
      won
    }).pipe(
      catchError(this.handleError)
    );
  }

  // Auto-registration and current game endpoints
  getCurrentPlayer(): Observable<any> {
    return this.http.get(`${this.baseUrl}/current-player`)
      .pipe(
        catchError(this.handleError)
      );
  }

  getCurrentGame(): Observable<any> {
    return this.http.get(`${this.baseUrl}/current-game`)
      .pipe(
        catchError(this.handleError)
      );
  }

  autoJoinQueue(): Observable<any> {
    return this.http.post(`${this.baseUrl}/auto-join-queue`, {})
      .pipe(
        catchError(this.handleError)
      );
  }

  leaveQueue(): Observable<any> {
    return this.http.post(`${this.baseUrl}/leave-queue`, {})
      .pipe(
        catchError(this.handleError)
      );
  }

  getPlayerMatchHistory(playerId: number, limit: number = 10): Observable<any> {
    return this.http.get(`${this.baseUrl}/player/${playerId}/match-history?limit=${limit}`)
      .pipe(
        catchError(this.handleError)
      );
  }

  // NEW: Real player data endpoints
  getCurrentPlayerComprehensive(): Observable<any> {
    return this.http.get(`${this.baseUrl}/player/current-comprehensive`)
      .pipe(
        catchError(this.handleError)
      );
  }

  refreshPlayerData(): Observable<any> {
    return this.http.post(`${this.baseUrl}/player/refresh`, {})
      .pipe(
        catchError(this.handleError)
      );
  }

  getPlayerMatchHistoryFromRiot(puuid: string, count: number = 20): Observable<any> {
    return this.http.get(`${this.baseUrl}/player/match-history-riot/${puuid}?count=${count}`)
      .pipe(
        catchError(this.handleError)
      );
  }

  getMatchDetails(matchId: string): Observable<any> {
    return this.http.get(`${this.baseUrl}/match/${matchId}`)
      .pipe(
        catchError(this.handleError)
      );
  }

  updateRiotApiKey(apiKey: string): Observable<any> {
    return this.http.post(`${this.baseUrl}/settings/riot-api-key`, { apiKey })
      .pipe(
        catchError(this.handleError)
      );
  }

  // Add this method
  setApiKey(apiKey: string): void {
    this.riotApiKey = apiKey;
    // Optionally, you could also immediately try to update/validate the key with the backend
    // or store it in a more persistent way if needed beyond the service instance lifecycle,
    // though localStorage is handled in app.ts for UI persistence.
    console.log('Riot API Key set in ApiService');
  }

  // NEW: Browser-compatible method that bypasses CORS limitations
  getCurrentPlayerBrowser(): Observable<any> {
    return this.http.get(`${this.baseUrl}/player/current-browser`)
      .pipe(
        catchError(this.handleError)
      );
  }

  // NEW: Debug method that works correctly (using the working endpoint)
  getCurrentPlayerDebug(): Observable<any> {
    return this.http.get(`${this.baseUrl}/debug/lcu-summoner`)
      .pipe(
        catchError(this.handleError)
      );
  }

  // NEW: Comprehensive status check for both LCU and Riot API
  getComprehensiveStatus(): Observable<any> {
    return this.http.get(`${this.baseUrl}/status/comprehensive`)
      .pipe(
        catchError(this.handleError)
      );
  }

  // Utility methods
  testConnection(): Promise<boolean> {
    return new Promise((resolve) => {
      this.checkHealth().subscribe({
        next: () => resolve(true),
        error: () => resolve(false)
      });
    });
  }

  async waitForServer(maxAttempts: number = 10, interval: number = 2000): Promise<boolean> {
    for (let i = 0; i < maxAttempts; i++) {
      if (await this.testConnection()) {
        return true;
      }

      if (i < maxAttempts - 1) {
        await new Promise(resolve => setTimeout(resolve, interval));
      }
    }

    return false;
  }

  // Cache management
  private cache = new Map<string, { data: any, timestamp: number }>();
  private cacheTimeout = 30000; // 30 segundos

  private getCachedData(key: string): any | null {
    const cached = this.cache.get(key);
    if (cached && (Date.now() - cached.timestamp) < this.cacheTimeout) {
      return cached.data;
    }

    this.cache.delete(key);
    return null;
  }

  private setCachedData(key: string, data: any): void {
    this.cache.set(key, {
      data,
      timestamp: Date.now()
    });
  }

  // Cached versions of frequently called endpoints
  getQueueStatusCached(): Observable<QueueStatus> {
    const cacheKey = 'queue_status';
    const cached = this.getCachedData(cacheKey);

    if (cached) {
      return new Observable(observer => {
        observer.next(cached);
        observer.complete();
      });
    }    return this.getQueueStatus().pipe(
      catchError(this.handleError),
      // Cache the result
      map((result: QueueStatus) => {
        this.setCachedData(cacheKey, result);
        return result;
      })
    );
  }

  clearCache(): void {
    this.cache.clear();
  }
}
