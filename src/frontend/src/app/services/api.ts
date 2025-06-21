import { Injectable } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { catchError, retry, map, switchMap } from 'rxjs/operators';
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

  // Error suppression system to reduce spam when services are down
  private errorSuppressionCache = new Map<string, number>();
  private readonly ERROR_SUPPRESSION_DURATION = 30000; // 30 seconds

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
  }  private handleError(error: HttpErrorResponse) {
    let errorMessage = 'Erro desconhecido';
    const currentTime = Date.now();

    if (error.error instanceof ErrorEvent) {
      // Erro do lado do cliente
      errorMessage = `Erro: ${error.error.message}`;
    } else {
      // Erro do lado do servidor
      if (error.status === 503 && error.error?.error?.includes('Riot API')) {
        errorMessage = 'Chave da Riot API não configurada ou inválida. Configure uma chave válida nas configurações.';

        // Suppress repeated Riot API errors
        const errorKey = 'riot-api-503';
        const lastErrorTime = this.errorSuppressionCache.get(errorKey);
        if (!lastErrorTime || (currentTime - lastErrorTime) > this.ERROR_SUPPRESSION_DURATION) {
          console.warn('🚫 Riot API service unavailable');
          this.errorSuppressionCache.set(errorKey, currentTime);
        }
      } else if (error.status === 503 && error.error?.error?.includes('LCU')) {
        errorMessage = 'Cliente do League of Legends não está conectado. Abra o jogo e tente novamente.';

        // Suppress repeated LCU errors
        const errorKey = 'lcu-503';
        const lastErrorTime = this.errorSuppressionCache.get(errorKey);
        if (!lastErrorTime || (currentTime - lastErrorTime) > this.ERROR_SUPPRESSION_DURATION) {
          console.warn('🎮 LCU not connected');
          this.errorSuppressionCache.set(errorKey, currentTime);
        }
      } else if (error.status === 404 && error.error?.error?.includes('não encontrado')) {
        errorMessage = error.error.error;
      } else {
        errorMessage = error.error?.error || error.message || `Erro ${error.status}`;

        // Only log unexpected errors
        const errorKey = `${error.status}-${error.url}`;
        const lastErrorTime = this.errorSuppressionCache.get(errorKey);
        if (!lastErrorTime || (currentTime - lastErrorTime) > this.ERROR_SUPPRESSION_DURATION) {
          console.error('❌ API Error:', errorMessage);
          this.errorSuppressionCache.set(errorKey, currentTime);
        }
      }
    }

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
  }  // Novo método para buscar dados detalhados do jogador atual
  // Endpoint para obter dados completos do jogador logado no LCU
  getCurrentPlayerDetails(): Observable<any> {
    // First get LCU data to extract Riot ID
    return this.getCurrentSummonerFromLCU().pipe(
      switchMap((lcuData: any) => {
        if (lcuData && lcuData.gameName && lcuData.tagLine) {
          const riotId = `${lcuData.gameName}#${lcuData.tagLine}`;
          // Use the working refresh endpoint
          return this.refreshPlayerByRiotId(riotId, 'br1').pipe(
            map(response => ({
              success: true,
              data: {
                lcu: lcuData,
                riotAccount: {
                  gameName: lcuData.gameName,
                  tagLine: lcuData.tagLine,
                  puuid: lcuData.puuid
                },
                riotApi: response.player
              }
            }))
          );
        } else {
          throw new Error('Dados do LCU incompletos');
        }
      }),
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
  }  // Método para buscar automaticamente do LCU (cliente do LoL) - MAIS CONVENIENTE
  getPlayerFromLCU(): Observable<Player> {
    // Strategy 1: Try LCU + Riot API combined endpoint first
    return this.http.get<any>(`${this.baseUrl}/player/current-details`)
      .pipe(
        retry(1),
        map(response => {
          if (response.success && response.data) {
            const mappedPlayer = this.mapApiResponseToPlayer(response.data);

            // Add metadata about data completeness
            (mappedPlayer as any)._isPartialData = response.data.partialData || false;
            (mappedPlayer as any)._dataSource = response.data.partialData ? 'LCU apenas' : 'LCU + Riot API';

            // Log the data source for debugging
            if (response.data.partialData) {
              console.log('📡 Dados carregados apenas do LCU (Riot API indisponível)');
            } else {
              console.log('✅ Dados completos carregados do LCU + Riot API');
            }

            return mappedPlayer;
          }
          throw new Error('Nenhum jogador conectado no League of Legends');
        }),
        catchError((error: any) => {
          // If combined endpoint fails due to Riot API, try LCU-only endpoint
          console.log('💡 Combined LCU+Riot endpoint failed, trying LCU-only approach:', error.message);

          if (error.message?.includes('Riot API') || error.message?.includes('não encontrado')) {
            return this.getLCUOnlyPlayerData();
          }

          // For other errors, propagate them
          return this.handleError(error);
        })
      );
  }

  // Fallback method: Get player data from LCU only (no Riot API dependency)
  private getLCUOnlyPlayerData(): Observable<Player> {
    console.log('🎮 Falling back to LCU-only data (Riot API unavailable)');

    return this.http.get<any>(`${this.baseUrl}/lcu/current-summoner`)
      .pipe(
        retry(1),
        map(lcuData => {
          if (!lcuData) {
            throw new Error('Dados do LCU não disponíveis');
          }

          // Create a Player object from LCU data only
          const lcuPlayer: Player = {
            id: lcuData.summonerId || 0,
            summonerName: lcuData.gameName || lcuData.displayName || 'Unknown',
            tagLine: lcuData.tagLine || null,
            summonerId: (lcuData.summonerId || '0').toString(),
            puuid: lcuData.puuid || '',
            profileIconId: lcuData.profileIconId || 29,
            summonerLevel: lcuData.summonerLevel || 30,
            region: 'br1', // Default region
            currentMMR: 1200, // Default MMR when Riot API unavailable
            rank: undefined, // No rank data without Riot API
            wins: undefined,
            losses: undefined
          };

          console.log('✅ Player data created from LCU-only (Riot API offline):', lcuPlayer.summonerName);
          return lcuPlayer;
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
  }  // Método auxiliar para mapear resposta da API para Player
  private mapApiResponseToPlayer(data: any): Player {
    // Adaptar diferentes formatos de resposta da API para o formato Player esperado
    const lcuData = data.lcu || data.lcuData || {};
    const riotAccount = data.riotAccount || {};
    const riotApi = data.riotApi || data.riotData || data;
    const lcuRankedStats = data.lcuRankedStats || null;

    // Process rank data from multiple sources
    const rankedData = this.processRankedData(riotApi, lcuRankedStats);

    return {
      id: riotApi.id || lcuData.summonerId || 0,
      summonerName: riotAccount.gameName || riotApi.gameName || riotApi.name || lcuData.gameName || lcuData.displayName || 'Unknown',
      tagLine: riotAccount.tagLine || riotApi.tagLine || lcuData.tagLine || null,
      summonerId: riotApi.id || lcuData.summonerId?.toString() || '0',
      puuid: riotAccount.puuid || riotApi.puuid || lcuData.puuid || '',
      profileIconId: riotApi.profileIconId || lcuData.profileIconId || 1,
      summonerLevel: riotApi.summonerLevel || lcuData.summonerLevel || 30,
      region: riotApi.region || 'br1',
      currentMMR: this.calculateMMRFromData(riotApi, lcuRankedStats),
      rank: rankedData.soloQueue ? this.extractRankData(riotApi) : undefined,
      wins: rankedData.soloQueue?.wins || riotApi.soloQueue?.wins || riotApi.wins,
      losses: rankedData.soloQueue?.losses || riotApi.soloQueue?.losses || riotApi.losses,
      rankedData: rankedData
    };
  }

  private processRankedData(riotApi: any, lcuRankedStats: any): any {
    const result = {
      soloQueue: null as any,
      flexQueue: null as any
    };

    // Priority 1: Use Riot API data if available
    if (riotApi?.soloQueue || riotApi?.rankedData?.soloQueue) {
      result.soloQueue = riotApi.soloQueue || riotApi.rankedData.soloQueue;
    }

    if (riotApi?.flexQueue || riotApi?.rankedData?.flexQueue) {
      result.flexQueue = riotApi.flexQueue || riotApi.rankedData.flexQueue;
    }

    // Priority 2: Use LCU ranked stats as fallback or supplement
    if (lcuRankedStats?.queues) {
      lcuRankedStats.queues.forEach((queue: any) => {
        if (queue.queueType === 'RANKED_SOLO_5x5' && !result.soloQueue) {
          result.soloQueue = {
            tier: queue.tier,
            rank: queue.division,
            leaguePoints: queue.leaguePoints,
            wins: queue.wins,
            losses: queue.losses,
            isProvisional: queue.isProvisional || false
          };
        } else if (queue.queueType === 'RANKED_FLEX_SR' && !result.flexQueue) {
          result.flexQueue = {
            tier: queue.tier,
            rank: queue.division,
            leaguePoints: queue.leaguePoints,
            wins: queue.wins,
            losses: queue.losses,
            isProvisional: queue.isProvisional || false
          };
        }
      });
    }

    return result;
  }
  private calculateMMRFromData(data: any, lcuRankedStats?: any): number {
    // Try Riot API data first
    const soloQueue = data.soloQueue || data.rankedData?.soloQueue;
    if (soloQueue?.tier) {
      return this.calculateMMRFromRankData(soloQueue);
    }

    // Try LCU ranked stats as fallback
    if (lcuRankedStats?.queues) {
      const lcuSoloQueue = lcuRankedStats.queues.find((q: any) => q.queueType === 'RANKED_SOLO_5x5');
      if (lcuSoloQueue?.tier) {
        return this.calculateMMRFromRankData({
          tier: lcuSoloQueue.tier,
          rank: lcuSoloQueue.division,
          leaguePoints: lcuSoloQueue.leaguePoints
        });
      }
    }

    return 1200; // Default MMR
  }
  private calculateMMRFromRankData(rankData: any): number {
    if (!rankData?.tier) return 1200;

    const tierValues: { [key: string]: number } = {
      'IRON': 800, 'BRONZE': 1000, 'SILVER': 1200, 'GOLD': 1400,
      'PLATINUM': 1700, 'EMERALD': 2000, 'DIAMOND': 2300,
      'MASTER': 2600, 'GRANDMASTER': 2800, 'CHALLENGER': 3000
    };

    const rankValues: { [key: string]: number } = {
      'IV': 0, 'III': 50, 'II': 100, 'I': 150
    };

    const baseMMR = tierValues[rankData.tier] || 1200;
    const rankBonus = rankValues[rankData.rank] || 0;
    const lpBonus = (rankData.leaguePoints || 0) * 0.8;

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
  }  // ========== FIM DOS MÉTODOS AMIGÁVEIS ==========

  // Método para salvar partida customizada após o jogo
  saveCustomMatch(matchData: any): Observable<any> {
    return this.http.post(`${this.baseUrl}/matches/custom`, matchData)
      .pipe(
        catchError(this.handleError)
      );
  }

  // Método para criar partida customizada com dados reais do LCU
  createLCUBasedMatch(data: { lcuMatchData: any, playerIdentifier: string }): Observable<any> {
    return this.http.post(`${this.baseUrl}/test/create-lcu-based-match`, data)
      .pipe(
        catchError(this.handleError)
      );
  }
  // Métodos para buscar histórico de partidas da Riot API
  getRiotApiMatchHistory(puuid: string, region: string, start: number = 0, count: number = 20): Observable<any> {
    return this.http.get<any>(`${this.baseUrl}/riot/match-history/${puuid}?region=${region}&start=${start}&count=${count}`)
      .pipe(
        catchError(this.handleError)
      );
  }

  getRiotApiMatchDetails(matchId: string, region: string): Observable<any> {
    return this.http.get<any>(`${this.baseUrl}/riot/match-details/${matchId}?region=${region}`)
      .pipe(
        catchError(this.handleError)
      );
  }

  // LCU Match History
  getLCUMatchHistory(startIndex: number = 0, count: number = 20): Observable<any> {
    return this.http.get(`${this.baseUrl}/lcu/match-history?startIndex=${startIndex}&count=${count}`)
      .pipe(
        catchError(this.handleError)
      );
  }
  // LCU Match History - ALL matches (including custom) for dashboard
  getLCUMatchHistoryAll(startIndex: number = 0, count: number = 5, customOnly: boolean = false): Observable<any> {
    return this.http.get(`${this.baseUrl}/lcu/match-history-all?startIndex=${startIndex}&count=${count}&customOnly=${customOnly}`)
      .pipe(
        catchError(this.handleError)
      );
  }

  // Queue endpointsnpm run dev

  joinQueue(playerData: any, preferences: any): Observable<any> {
    return this.http.post(`${this.baseUrl}/queue/join`, { player: playerData, preferences })
      .pipe(
        retry(1),
        catchError(this.handleError)
      );
  }

  leaveQueue(playerId: number): Observable<any> {
    return this.http.post(`${this.baseUrl}/queue/leave`, { playerId })
      .pipe(
        retry(1),
        catchError(this.handleError)
      );
  }

  // Método para adicionar bot na fila (feature temporária para testes)
  addBotToQueue(): Observable<any> {
    return this.http.post(`${this.baseUrl}/queue/add-bot`, {})
      .pipe(
        retry(1),
        catchError(this.handleError)
      );  }
  // Métodos para sistema de partidas
  acceptMatch(matchId: number, playerId?: number, summonerName?: string): Observable<any> {
    const body: any = { matchId };
    if (playerId) body.playerId = playerId;
    if (summonerName) body.summonerName = summonerName;

    return this.http.post(`${this.baseUrl}/match/accept`, body)
      .pipe(
        retry(1),
        catchError(this.handleError)
      );
  }

  declineMatch(matchId: number, playerId?: number, summonerName?: string): Observable<any> {
    const body: any = { matchId };
    if (playerId) body.playerId = playerId;
    if (summonerName) body.summonerName = summonerName;

    return this.http.post(`${this.baseUrl}/match/decline`, body)
      .pipe(
        retry(1),
        catchError(this.handleError)
      );
  }

  // Método original do sistema antigo (manter para compatibilidade)
  joinLegacyQueue(playerId: number, mmr: number, role: string): Observable<any> {
    return this.http.post(`${this.baseUrl}/queue/join-legacy`, { playerId, mmr, role })
      .pipe(
        retry(1),
        catchError(this.handleError)
      );
  }

  leaveLegacyQueue(playerId: number): Observable<any> {
    return this.http.post(`${this.baseUrl}/queue/leave-legacy`, { playerId })
      .pipe(
        retry(1),
        catchError(this.handleError)
      );
  }

  // Método para atualizar resultado de partida customizada existente (para simulações baseadas em partidas reais)
  updateCustomMatchResult(updateData: any): Observable<any> {
    return this.http.put(`${this.baseUrl}/matches/custom/${updateData.matchId}/result`, updateData)
      .pipe(
        catchError(this.handleError)
      );
  }

  // Método para limpar partidas de teste do banco de dados
  cleanupTestMatches(): Observable<any> {
    return this.http.delete(`${this.baseUrl}/matches/cleanup-test-matches`)
      .pipe(
        catchError(this.handleError)
      );
  }

  // Método para buscar partidas customizadas de um jogador
  getCustomMatches(playerIdentifier: string, offset: number = 0, limit: number = 10): Observable<any> {
    return this.http.get(`${this.baseUrl}/matches/custom/${playerIdentifier}?offset=${offset}&limit=${limit}`)
      .pipe(
        catchError(this.handleError)
      );
  }

  // Método para criar partida de exemplo (para testes)
  createSampleMatch(playerIdentifier: string): Observable<any> {
    return this.http.post(`${this.baseUrl}/test/create-sample-match`, { playerIdentifier })
      .pipe(
        catchError(this.handleError)
      );
  }

  // Método para buscar a última partida customizada de um jogador
  getLastCustomMatch(playerIdentifier: string): Observable<any> {
    return this.http.get(`${this.baseUrl}/matches/custom/${playerIdentifier}?offset=0&limit=1`)
      .pipe(
        catchError(this.handleError)
      );
  }
}
