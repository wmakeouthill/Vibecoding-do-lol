import axios, { AxiosInstance } from 'axios';

interface SummonerData {
  id: string;
  accountId: string;
  puuid: string;
  name: string;
  profileIconId: number;
  revisionDate: number;
  summonerLevel: number;
}

interface RankedData {
  leagueId: string;
  queueType: string;
  tier: string;
  rank: string;
  summonerId: string;
  summonerName: string;
  leaguePoints: number;
  wins: number;
  losses: number;
  veteran: boolean;
  inactive: boolean;
  freshBlood: boolean;
  hotStreak: boolean;
}

interface AccountData {
  puuid: string;
  gameName?: string;
  tagLine?: string;
}

export class RiotAPIService {
    private apiKey: string | null = null; // MODIFICADO: Permitir null e inicializar com null
    private apiKeyConfigured: boolean = false;
    private axiosInstance: AxiosInstance;
    private readonly MAX_RETRIES = 3;
    private readonly RETRY_DELAY_MS = 1000;

    private baseUrls: { [region: string]: string } = {
      'br1': 'https://br1.api.riotgames.com',
      'eun1': 'https://eun1.api.riotgames.com',
      'euw1': 'https://euw1.api.riotgames.com',
      'jp1': 'https://jp1.api.riotgames.com',
      'kr': 'https://kr.api.riotgames.com',
      'la1': 'https://la1.api.riotgames.com',
      'la2': 'https://la2.api.riotgames.com',
      'na1': 'https://na1.api.riotgames.com',
      'oc1': 'https://oc1.api.riotgames.com',
      'tr1': 'https://tr1.api.riotgames.com',
      'ru': 'https://ru.api.riotgames.com',
      'ph2': 'https://ph2.api.riotgames.com',
      'sg2': 'https://sg2.api.riotgames.com',
      'th2': 'https://th2.api.riotgames.com',
      'tw2': 'https://tw2.api.riotgames.com',
      'vn2': 'https://vn2.api.riotgames.com'
    };

    private regionalRoutingMap: { [key: string]: string } = {
      'br1': 'americas',
      'na1': 'americas',
      'la1': 'americas',
      'la2': 'americas',
      'oc1': 'sea', // Oceania é geralmente agrupado com SEA ou Americas dependendo da API
      'kr': 'asia',
      'jp1': 'asia',
      'eun1': 'europe',
      'euw1': 'europe',
      'tr1': 'europe',
      'ru': 'europe',
      'ph2': 'sea',
      'sg2': 'sea',
      'th2': 'sea',
      'tw2': 'sea',
      'vn2': 'sea',
    };

    private regionalBaseUrls: { [key: string]: string } = {
      'americas': 'https://americas.api.riotgames.com',
      'asia': 'https://asia.api.riotgames.com',
      'europe': 'https://europe.api.riotgames.com',
      'sea': 'https://sea.api.riotgames.com', // Sudeste Asiático
    };


    constructor() {
        this.apiKey = process.env.RIOT_API_KEY || null; // MODIFICADO: Atribuir null se não definida
        if (this.apiKey && this.apiKey.trim() !== '') {
            this.apiKeyConfigured = true;
            console.log('[RiotAPIService] Chave da API da Riot carregada da variável de ambiente.');
        } else {
            this.apiKeyConfigured = false;
            console.warn('[RiotAPIService] Chave da API da Riot não encontrada nas variáveis de ambiente.');
        }
        this.axiosInstance = this.createAxiosInstance();
    }

    private createAxiosInstance(): AxiosInstance {
        const instance = axios.create({
            timeout: 10000, // 10 segundos de timeout
            headers: {
                'X-Riot-Token': this.apiKey || '' // MODIFICADO: Usar string vazia se apiKey for null
            }
        });

        instance.interceptors.response.use(
            response => response,
            error => {
                // Aqui você pode adicionar lógica para tratar erros globalmente
                return Promise.reject(error);
            }
        );

        return instance;
    }

    public setApiKey(newKey: string): void {
        const trimmedKey = newKey ? newKey.trim() : null;

        if (trimmedKey && trimmedKey !== '') {
            this.apiKey = trimmedKey;
            this.apiKeyConfigured = true;
            // GARANTE QUE A INSTÂNCIA AXIOS TENHA A CHAVE ATUALIZADA
            this.axiosInstance.defaults.headers['X-Riot-Token'] = this.apiKey;
            console.log(`[RiotAPIService] Chave da API da Riot atualizada e configurada no cliente HTTP.`);
        } else {
            this.apiKey = null; // MODIFICADO: Definir como null
            this.apiKeyConfigured = false;
            // REMOVE A CHAVE DA INSTÂNCIA AXIOS
            this.axiosInstance.defaults.headers['X-Riot-Token'] = ''; // MODIFICADO: Usar string vazia
            console.warn('[RiotAPIService] Chave da API removida ou configurada como vazia.');
        }
    }

    public isApiKeyConfigured(): boolean {
        // MODIFICADO: Checar se apiKey não é null e não é uma string vazia
        return this.apiKeyConfigured && !!this.apiKey && this.apiKey.trim() !== '';
    }    // Método privado para validar formato de PUUID
    private isValidPuuidFormat(puuid: string): boolean {
      // PUUID deve ter 36 caracteres e seguir o formato UUID v4
      const puuidRegex = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
      return !!(puuid && typeof puuid === 'string' && puuid.length === 36 && puuidRegex.test(puuid));
    }

    public async validateApiKey(region: string = 'br1'): Promise<boolean> {
        // MODIFICADO: Checar se apiKey não é null e não é uma string vazia
        if (!this.apiKey || this.apiKey.trim() === '') {
            console.warn('[RiotAPIService] Tentativa de validar: Nenhuma chave de API está atualmente definida ou é inválida.');
            // Lançar erro aqui é mais apropriado para o chamador tratar
            throw new Error('Nenhuma chave de API válida definida para validação.');
        }
        
        // Use platform-specific URL for platform-data endpoint
        const platformUrl = this.baseUrls[region.toLowerCase()];
        if (!platformUrl) {
            throw new Error(`Região da plataforma ${region} não suportada para validação.`);
        }

        // Usar um endpoint que não consome muita cota, como o status da plataforma.
        const statusUrl = `${platformUrl}/lol/status/v4/platform-data`;
        try {
          await axios.get(statusUrl, {
            headers: { 'X-Riot-Token': this.apiKey },
            timeout: 8000 
          });
          console.log(`✅ Validação da chave da API para a região ${region} bem-sucedida.`);
          return true;
        } catch (error: any) {
          if (error.response) {
            console.error(`❌ Erro ${error.response.status} na validação da chave da API para ${region}: ${error.response.data?.status?.message || error.message}`);
            if (error.response.status === 401 || error.response.status === 403) {
              throw new Error(`Chave da Riot API inválida, expirada ou sem permissões (Erro ${error.response.status})`);
            }
            throw new Error(`Falha na validação da chave da API: ${error.response.status} - ${error.response.data?.status?.message || error.message}`);
          } else {
            console.error(`❌ Erro inesperado na validação da chave da API para ${region}: ${error.message}`);
            throw new Error(`Falha na validação da chave da API: ${error.message}`);
          }
        }
      }      
      public getRegionalUrl(platformRegion: string): string {
        const regionKey = platformRegion.toLowerCase();
        const regionalGroup = this.regionalRoutingMap[regionKey] || 'americas'; // Default to 'americas' if not mapped
        const url = this.regionalBaseUrls[regionalGroup];
        if (!url) {
          console.warn(`Não foi possível encontrar URL regional para o grupo de ${regionalGroup} (região original: ${platformRegion}). Usando Americas como fallback.`)
          return this.regionalBaseUrls['americas'];
        }
        return url;
      }

      async getSummonerByName(summonerName: string, region: string): Promise<any> {
        if (!this.isApiKeyConfigured()) {
          throw new Error('Chave da Riot API não configurada');
        }

        try {
          const baseUrl = this.baseUrls[region.toLowerCase()];
          if (!baseUrl) {
            throw new Error(`Região ${region} não suportada`);
          }

          const summonerUrl = `${baseUrl}/lol/summoner/v4/summoners/by-name/${encodeURIComponent(summonerName)}`;
          const summonerResponse = await this.axiosInstance.get(summonerUrl, { // MODIFIED: Use this.axiosInstance
            // headers: { 'X-Riot-Token': this.apiKey }, // Header is now set by default in axiosInstance
            timeout: 10000
          });
          const summoner = summonerResponse.data;

          const rankedUrl = `${baseUrl}/lol/league/v4/entries/by-summoner/${summoner.id}`;
          const rankedResponse = await this.axiosInstance.get(rankedUrl, { // MODIFIED: Use this.axiosInstance
            // headers: { 'X-Riot-Token': this.apiKey },
            timeout: 10000
          });
          const rankedData = rankedResponse.data;
          
          let accountData: AccountData | null = null;
          try {
            // Account API usa roteamento regional (americas, asia, europe)
            const accountRegionalUrl = this.getRegionalUrl(region);
            const accountUrl = `${accountRegionalUrl}/riot/account/v1/accounts/by-puuid/${summoner.puuid}`;
            const accountResponse = await this.axiosInstance.get(accountUrl, { // MODIFIED: Use this.axiosInstance
              // headers: { 'X-Riot-Token': this.apiKey },
              timeout: 10000
            });
            accountData = accountResponse.data;
          } catch (error) {
            console.log('ℹ️ Não foi possível buscar dados da conta (gameName/tagLine):', error instanceof Error ? error.message : 'Erro desconhecido');
          }

          const soloQueueData = rankedData.find((entry: any) => entry.queueType === 'RANKED_SOLO_5x5');
          const flexQueueData = rankedData.find((entry: any) => entry.queueType === 'RANKED_FLEX_SR');

          return {
            id: summoner.id,
            accountId: summoner.accountId,
            puuid: summoner.puuid,
            name: summoner.name, // Este é o summonerName legado
            profileIconId: summoner.profileIconId,
            summonerLevel: summoner.summonerLevel,
            gameName: accountData?.gameName || summoner.name, // Prioriza gameName se disponível
            tagLine: accountData?.tagLine || null,
            soloQueue: soloQueueData ? { ...soloQueueData } : null,
            flexQueue: flexQueueData ? { ...flexQueueData } : null,
            region: region,
            lastUpdated: new Date().toISOString()
          };

        } catch (error: any) {
          if (error.response?.status === 404) {
            throw new Error(`Invocador '${summonerName}' não encontrado na região ${region.toUpperCase()}`);
          } else if (error.response?.status === 403) {
            throw new Error('Chave da Riot API inválida ou expirada');
          } else if (error.response?.status === 429) {
            throw new Error('Limite de requisições da Riot API excedido. Tente novamente em alguns minutos.');
          } else {
            console.error('Erro na Riot API (getSummonerByName):', error.response?.data || error.message);
            throw new Error('Erro ao conectar com a Riot API');
          }
        }
      }      async getSummonerByPuuid(puuid: string, region: string): Promise<SummonerData> {
        if (!this.isApiKeyConfigured()) {
          throw new Error('Chave da Riot API não configurada');
        }

        // Validar formato do PUUID antes de fazer a requisição
        if (!this.isValidPuuidFormat(puuid)) {
          throw new Error(`Formato de PUUID inválido: ${puuid}. O PUUID deve seguir o formato UUID v4.`);
        }

        const baseUrl = this.baseUrls[region.toLowerCase()];
        if (!baseUrl) {
          throw new Error(`Região não suportada: ${region}`);
        }

        try {
          const response = await this.axiosInstance.get( // MODIFIED: Use this.axiosInstance
            `${baseUrl}/lol/summoner/v4/summoners/by-puuid/${puuid}`,
            { /* headers: { 'X-Riot-Token': this.apiKey } */ timeout: 10000 } // Header is now set by default in axiosInstance
          );
          return response.data;        } catch (error: any) {
          if (error.response?.status === 404) {
            throw new Error(`Invocador com PUUID '${puuid}' não encontrado na região ${region.toUpperCase()}`);
          } else if (error.response?.status === 403) {
            throw new Error('Chave da Riot API inválida ou expirada');
          } else if (error.response?.status === 429) {
            throw new Error('Limite de requisições da Riot API excedido.');
          } else if (error.response?.status === 400) {
            // Handle specific case of invalid PUUID format for summoner endpoint too
            const errorMessage = error.response?.data?.status?.message || error.message;
            if (errorMessage.includes('Exception decrypting') || errorMessage.includes('malformed')) {
              throw new Error(`PUUID rejeitado pela API da Riot: ${puuid}. Verifique se o PUUID está correto.`);
            }
            throw new Error(`Requisição inválida: ${errorMessage}`);
          } else {
            console.error('Erro ao buscar summoner por PUUID na Riot API:', error.response?.data || error.message);
            throw new Error('Erro ao conectar com a Riot API para buscar summoner por PUUID');
          }
        }
      }      async getAccountByPuuid(puuid: string, region: string): Promise<AccountData> {
        if (!this.isApiKeyConfigured()) {
          throw new Error('Chave da Riot API não configurada');
        }

        // Validar formato do PUUID antes de fazer a requisição
        if (!this.isValidPuuidFormat(puuid)) {
          throw new Error(`Formato de PUUID inválido: ${puuid}. O PUUID deve seguir o formato UUID v4.`);
        }

        const regionalUrl = this.getRegionalUrl(region);
        try {
          const response = await this.axiosInstance.get( // MODIFIED: Use this.axiosInstance
            `${regionalUrl}/riot/account/v1/accounts/by-puuid/${puuid}`,
            { /* headers: { 'X-Riot-Token': this.apiKey } */ timeout: 10000 } // Header is now set by default in axiosInstance
          );
          return response.data;
        } catch (error: any) {
          if (error.response?.status === 404) {
            throw new Error(`Conta com PUUID '${puuid}' não encontrada`);
          } else if (error.response?.status === 403) {
            throw new Error('Chave da Riot API inválida ou expirada');
          } else if (error.response?.status === 429) {
            throw new Error('Limite de requisições da Riot API excedido.');
          } else if (error.response?.status === 400) {
            // Handle specific case of invalid PUUID format
            const errorMessage = error.response?.data?.status?.message || error.message;
            if (errorMessage.includes('Exception decrypting') || errorMessage.includes('malformed')) {
              throw new Error(`PUUID rejeitado pela API da Riot: ${puuid}. Verifique se o PUUID está correto.`);
            }
            throw new Error(`Requisição inválida: ${errorMessage}`);
          } else {
            console.error('Erro ao buscar conta por PUUID na Riot API:', error.response?.data || error.message);
            throw new Error('Erro ao conectar com a Riot API para buscar conta por PUUID');
          }
        }
      }

      async getRankedData(summonerId: string, region: string): Promise<RankedData[]> {
        if (!this.isApiKeyConfigured()) {
          throw new Error('Chave da Riot API não configurada');
        }
        const baseUrl = this.baseUrls[region.toLowerCase()];
        if (!baseUrl) {
          throw new Error(`Região não suportada: ${region}`);
        }
        try {
          const response = await this.axiosInstance.get( // MODIFIED: Use this.axiosInstance
            `${baseUrl}/lol/league/v4/entries/by-summoner/${summonerId}`,
            { /* headers: { 'X-Riot-Token': this.apiKey } */ timeout: 10000 } // Header is now set by default in axiosInstance
          );
          return response.data;
        } catch (error: any) {
          if (error.response?.status === 404) {
            return []; 
          } else if (error.response?.status === 403) {
            throw new Error('Chave da Riot API inválida ou expirada');
          } else if (error.response?.status === 429) {
            throw new Error('Limite de requisições da Riot API excedido.');
          } else {
            console.error('Erro na Riot API (getRankedData):', error.response?.data || error.message);
            throw new Error('Erro ao conectar com a Riot API');
          }
        }
      }

      async getMatchHistory(puuid: string, region: string, count: number = 20, startTime?: number, endTime?: number, queue?: number): Promise<string[]> {
        if (!this.isApiKeyConfigured()) {
          throw new Error('Chave da Riot API não configurada');
        }
        const regionalUrl = this.getRegionalUrl(region);
        try {
          const params: any = { start: 0, count };
          if (startTime) params.startTime = startTime;
          if (endTime) params.endTime = endTime;
          if (queue) params.queue = queue;

          const response = await this.axiosInstance.get( // MODIFIED: Use this.axiosInstance
            `${regionalUrl}/lol/match/v5/matches/by-puuid/${puuid}/ids`,
            { /* headers: { 'X-Riot-Token': this.apiKey } */ params, timeout: 15000 } // Header is now set by default in axiosInstance
          );
          return response.data;
        } catch (error: any) {
          if (error.response?.status === 404) {
            return [];
          } else if (error.response?.status === 403) {
            throw new Error('Chave da Riot API inválida ou expirada');
          } else if (error.response?.status === 429) {
            throw new Error('Limite de requisições da Riot API excedido.');
          } else {
            console.error('Erro na Riot API (getMatchHistory):', error.response?.data || error.message);
            throw new Error('Erro ao conectar com a Riot API');
          }
        }
      }

      async getMatchDetails(matchId: string, region: string): Promise<any> {
        if (!this.isApiKeyConfigured()) {
          throw new Error('Chave da Riot API não configurada');
        }
        const regionalUrl = this.getRegionalUrl(region);
        try {
          const response = await this.axiosInstance.get( // MODIFIED: Use this.axiosInstance
            `${regionalUrl}/lol/match/v5/matches/${matchId}`,
            { /* headers: { 'X-Riot-Token': this.apiKey } */ timeout: 15000 } // Header is now set by default in axiosInstance
          );
          return response.data;
        } catch (error: any) {
          if (error.response?.status === 404) {
            throw new Error(`Detalhes da partida '${matchId}' não encontrados`);
          } else if (error.response?.status === 403) {
            throw new Error('Chave da Riot API inválida ou expirada');
          } else if (error.response?.status === 429) {
            throw new Error('Limite de requisições da Riot API excedido.');
          } else {
            console.error('Erro na Riot API (getMatchDetails):', error.response?.data || error.message);
            throw new Error('Erro ao conectar com a Riot API');
          }
        }
      }      async getSummonerByRiotId(gameName: string, tagLine: string, region: string): Promise<any> {
        if (!this.isApiKeyConfigured()) {
          throw new Error('Chave da Riot API não configurada');
        }

        try {
          // Etapa 1: Buscar dados da conta usando Account API (roteamento regional)
          const accountRegionalUrl = this.getRegionalUrl(region);
          const accountUrl = `${accountRegionalUrl}/riot/account/v1/accounts/by-riot-id/${encodeURIComponent(gameName)}/${encodeURIComponent(tagLine)}`;
          
          const accountResponse = await this.axiosInstance.get(accountUrl, {
            timeout: 10000
          });
          const accountData: AccountData = accountResponse.data;

          // Etapa 2: Usar o PUUID para buscar dados do summoner
          const baseUrl = this.baseUrls[region.toLowerCase()];
          if (!baseUrl) {
            throw new Error(`Região ${region} não suportada`);
          }

          const summonerUrl = `${baseUrl}/lol/summoner/v4/summoners/by-puuid/${accountData.puuid}`;
          const summonerResponse = await this.axiosInstance.get(summonerUrl, {
            timeout: 10000
          });
          const summoner = summonerResponse.data;

          // Etapa 3: Buscar dados ranqueados
          const rankedUrl = `${baseUrl}/lol/league/v4/entries/by-summoner/${summoner.id}`;
          const rankedResponse = await this.axiosInstance.get(rankedUrl, {
            timeout: 10000
          });
          const rankedData = rankedResponse.data;

          const soloQueueData = rankedData.find((entry: any) => entry.queueType === 'RANKED_SOLO_5x5');
          const flexQueueData = rankedData.find((entry: any) => entry.queueType === 'RANKED_FLEX_SR');

          return {
            id: summoner.id,
            accountId: summoner.accountId,
            puuid: summoner.puuid,
            name: summoner.name, // Este é o summonerName legado
            profileIconId: summoner.profileIconId,
            summonerLevel: summoner.summonerLevel,
            gameName: accountData.gameName || gameName,
            tagLine: accountData.tagLine || tagLine,
            soloQueue: soloQueueData ? { ...soloQueueData } : null,
            flexQueue: flexQueueData ? { ...flexQueueData } : null,
            region: region,
            lastUpdated: new Date().toISOString()
          };

        } catch (error: any) {
          if (error.response?.status === 404) {
            throw new Error(`Conta '${gameName}#${tagLine}' não encontrada na região ${region.toUpperCase()}`);
          } else if (error.response?.status === 403) {
            throw new Error('Chave da Riot API inválida ou expirada');
          } else if (error.response?.status === 429) {
            throw new Error('Limite de requisições da Riot API excedido. Tente novamente em alguns minutos.');
          } else {
            console.error('Erro na Riot API (getSummonerByRiotId):', error.response?.data || error.message);
            throw new Error('Erro ao conectar com a Riot API');
          }
        }
      }

      /**
       * Método unificado que detecta automaticamente se a entrada é Riot ID ou summoner name legado
       * @param nameInput - Pode ser "gameName#tagLine" ou "summonerName"
       * @param region - Região do servidor
       * @returns Dados do summoner
       */
      async getSummoner(nameInput: string, region: string): Promise<any> {
        if (!nameInput || typeof nameInput !== 'string') {
          throw new Error('Nome de entrada inválido');
        }

        const trimmedInput = nameInput.trim();
        
        // Detectar se é Riot ID (contém #)
        if (trimmedInput.includes('#')) {
          const parts = trimmedInput.split('#');
          if (parts.length !== 2) {
            throw new Error('Formato de Riot ID inválido. Use: gameName#tagLine');
          }
          
          const [gameName, tagLine] = parts;
          if (!gameName.trim() || !tagLine.trim()) {
            throw new Error('gameName e tagLine não podem estar vazios');
          }
          
          return this.getSummonerByRiotId(gameName.trim(), tagLine.trim(), region);
        } else {
          // É um summoner name legado
          return this.getSummonerByName(trimmedInput, region);
        }
      }

      /**
       * Busca apenas os dados da conta usando a Account API
       * @param gameName - Nome do jogo
       * @param tagLine - Tag da conta
       * @param region - Região do servidor
       * @returns Dados da conta (AccountDto)
       */
      async getAccountByRiotId(gameName: string, tagLine: string, region: string): Promise<AccountData> {
        if (!this.isApiKeyConfigured()) {
          throw new Error('Chave da Riot API não configurada');
        }

        try {
          const accountRegionalUrl = this.getRegionalUrl(region);
          const accountUrl = `${accountRegionalUrl}/riot/account/v1/accounts/by-riot-id/${encodeURIComponent(gameName)}/${encodeURIComponent(tagLine)}`;
          
          const accountResponse = await this.axiosInstance.get(accountUrl, {
            timeout: 10000
          });
          
          return accountResponse.data;
        } catch (error: any) {
          if (error.response?.status === 404) {
            throw new Error(`Conta '${gameName}#${tagLine}' não encontrada na região ${region.toUpperCase()}`);
          } else if (error.response?.status === 403) {
            throw new Error('Chave da Riot API inválida ou expirada');
          } else if (error.response?.status === 429) {
            throw new Error('Limite de requisições da Riot API excedido. Tente novamente em alguns minutos.');
          } else {
            console.error('Erro na Riot API (getAccountByRiotId):', error.response?.data || error.message);
            throw new Error('Erro ao conectar com a Riot API');
          }
        }
      }
    }
