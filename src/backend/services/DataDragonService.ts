import axios from 'axios';

interface ChampionData {
  id: string;
  key: string;
  name: string;
  title: string;
  blurb: string;
  info: {
    attack: number;
    defense: number;
    magic: number;
    difficulty: number;
  };
  image: {
    full: string;
    sprite: string;
    group: string;
    x: number;
    y: number;
    w: number;
    h: number;
  };
  tags: string[];
  partype: string;
  stats: {
    hp: number;
    hpperlevel: number;
    mp: number;
    mpperlevel: number;
    movespeed: number;
    armor: number;
    armorperlevel: number;
    spellblock: number;
    spellblockperlevel: number;
    attackrange: number;
    hpregen: number;
    hpregenperlevel: number;
    mpregen: number;
    mpregenperlevel: number;
    crit: number;
    critperlevel: number;
    attackdamage: number;
    attackdamageperlevel: number;
    attackspeedperlevel: number;
    attackspeed: number;
  };
}

interface DataDragonResponse {
  type: string;
  format: string;
  version: string;
  data: { [championName: string]: ChampionData };
}

export class DataDragonService {
  private readonly baseUrl = 'https://ddragon.leagueoflegends.com/cdn';
  private readonly version = '15.13.1';
  private readonly language = 'pt_BR';
  
  private championsCache: { [championName: string]: ChampionData } = {};
  private championsLoaded = false;
  private championIdToNameMap: { [championId: number]: string } = {};

  /**
   * Carrega todos os campeões da Data Dragon API
   */
  async loadChampions(): Promise<void> {
    if (this.championsLoaded) {
      return;
    }

    try {
      const url = `${this.baseUrl}/${this.version}/data/${this.language}/champion.json`;
      console.log(`🔍 Carregando campeões da Data Dragon: ${url}`);
      
      const response = await axios.get<DataDragonResponse>(url);
      this.championsCache = response.data.data;
      this.championsLoaded = true;

      // Criar mapeamento de ID para nome
      Object.values(this.championsCache).forEach(champion => {
        const championId = parseInt(champion.key);
        this.championIdToNameMap[championId] = champion.name;
      });

      console.log(`✅ DataDragon: ${Object.keys(this.championsCache).length} campeões carregados`);
      console.log(`✅ Mapeamento ID->Nome: ${Object.keys(this.championIdToNameMap).length} entradas`);
    } catch (error) {
      console.error('❌ Erro ao carregar campeões da Data Dragon:', error);
      throw error;
    }
  }

  /**
   * Obtém o nome do campeão pelo seu ID
   */
  getChampionNameById(championId: number): string | null {
    if (!this.championsLoaded) {
      console.warn('⚠️ Champions não carregados. Chamando loadChampions()...');
      this.loadChampions().catch(error => {
        console.error('❌ Erro ao carregar champions:', error);
      });
      return null;
    }

    return this.championIdToNameMap[championId] || null;
  }

  /**
   * Obtém dados completos de um campeão pelo nome
   */
  getChampionByName(championName: string): ChampionData | null {
    if (!this.championsLoaded) {
      return null;
    }

    const normalizedName = this.normalizeChampionName(championName);
    return this.championsCache[normalizedName] || null;
  }

  /**
   * Obtém dados completos de um campeão pelo ID
   */
  getChampionById(championId: number): ChampionData | null {
    const championName = this.getChampionNameById(championId);
    if (!championName) {
      return null;
    }

    return this.getChampionByName(championName);
  }

  /**
   * Obtém a URL da imagem de um campeão
   */
  getChampionImageUrl(championName: string): string {
    const normalizedName = this.normalizeChampionName(championName);
    return `${this.baseUrl}/${this.version}/img/champion/${normalizedName}.png`;
  }

  /**
   * Normaliza o nome do campeão para corresponder ao formato da Data Dragon
   */
  private normalizeChampionName(championName: string): string {
    // Mapeamento de nomes especiais que não correspondem exatamente
    const nameMapping: { [key: string]: string } = {
      'Aurelion Sol': 'AurelionSol',
      'Cho\'Gath': 'Chogath',
      'Dr. Mundo': 'DrMundo',
      'Fiddlesticks': 'FiddleSticks',
      'Heimerdinger': 'Heimerdinger',
      'Jarvan IV': 'JarvanIV',
      'Kai\'Sa': 'Kaisa',
      'Kha\'Zix': 'Khazix',
      'Kog\'Maw': 'KogMaw',
      'K\'Sante': 'KSante',
      'LeBlanc': 'Leblanc',
      'Lee Sin': 'LeeSin',
      'Master Yi': 'MasterYi',
      'Miss Fortune': 'MissFortune',
      'Monkey King': 'MonkeyKing',
      'Nunu & Willump': 'Nunu',
      'Nunu e Willump': 'Nunu',
      'Rek\'Sai': 'RekSai',
      'Renata Glasc': 'Renata',
      'Tahm Kench': 'TahmKench',
      'Twisted Fate': 'TwistedFate',
      'Vel\'Koz': 'Velkoz',
      'Xin Zhao': 'XinZhao'
    };

    // Verificar se existe um mapeamento específico
    if (nameMapping[championName]) {
      return nameMapping[championName];
    }

    // Se não, tentar normalizar o nome
    return championName.replace(/[^a-zA-Z0-9]/g, '');
  }

  /**
   * Verifica se os campeões já foram carregados
   */
  isLoaded(): boolean {
    return this.championsLoaded;
  }

  /**
   * Força o recarregamento dos campeões
   */
  async reloadChampions(): Promise<void> {
    this.championsLoaded = false;
    this.championsCache = {};
    this.championIdToNameMap = {};
    await this.loadChampions();
  }

  /**
   * Processa dados de participantes do LCU, adicionando nomes de campeões
   * Mantém a mesma estrutura que o frontend espera
   */
  processParticipants(participants: any[]): any[] {
    if (!this.championsLoaded) {
      console.warn('⚠️ Champions não carregados. Processando sem conversão...');
      return participants;
    }

    return participants.map(participant => {
      const championId = participant.championId;
      const championName = this.getChampionNameById(championId);
      
      return {
        ...participant,
        // Mantém a mesma estrutura que o frontend espera
        championName: championName || `Champion${championId}`,
        // Adiciona URL da imagem se necessário
        championImageUrl: championName ? this.getChampionImageUrl(championName) : null
      };
    });
  }
} 