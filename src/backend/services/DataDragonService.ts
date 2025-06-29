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
      Object.entries(this.championsCache).forEach(([championKey, champion]) => {
        const championId = parseInt(champion.key);
        // Usar a chave do objeto (nome correto para URL) em vez do campo name
        this.championIdToNameMap[championId] = championKey;
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

    // O Data Dragon já retorna os nomes no formato correto
    return this.championsCache[championName] || null;
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
    // O nome do campeão já vem no formato correto do Data Dragon
    return `${this.baseUrl}/${this.version}/img/champion/${championName}.png`;
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
        championImageUrl: championName ? this.getChampionImageUrl(championName) : null,
        // Adiciona lane detectada baseada nas tags do Data Dragon
        detectedLane: championName ? this.detectChampionLane(championName) : 'UNKNOWN'
      };
    });
  }

  /**
   * Detecta a lane mais provável de um campeão baseado nas tags e estatísticas do Data Dragon
   */
  private detectChampionLane(championName: string): string {
    const champion = this.getChampionByName(championName);
    if (!champion) {
      return 'UNKNOWN';
    }

    const tags = champion.tags;
    const stats = champion.stats;
    
    // Sistema de pontuação para cada lane
    const laneScores: { [key: string]: number } = {
      'TOP': 0,
      'JUNGLE': 0,
      'MIDDLE': 0,
      'ADC': 0,
      'SUPPORT': 0
    };

    // Pontuação baseada nas tags
    if (tags.includes('Marksman')) {
      laneScores['ADC'] += 80;
      laneScores['MIDDLE'] += 20; // Alguns marksmen podem ir mid
    }

    if (tags.includes('Support')) {
      laneScores['SUPPORT'] += 80;
      laneScores['ADC'] += 10; // Alguns supports podem ir ADC
    }

    if (tags.includes('Mage')) {
      laneScores['MIDDLE'] += 70;
      laneScores['SUPPORT'] += 30; // Mages podem ser support
      if (!tags.includes('Support')) {
        laneScores['ADC'] += 10; // Mages não-support podem ser ADC
      }
    }

    if (tags.includes('Fighter')) {
      laneScores['TOP'] += 70;
      laneScores['JUNGLE'] += 30; // Fighters também podem ser jungle
    }

    if (tags.includes('Tank')) {
      laneScores['TOP'] += 70;
      laneScores['SUPPORT'] += 30; // Tanks também podem ser support
    }

    if (tags.includes('Assassin')) {
      laneScores['JUNGLE'] += 60;
      laneScores['MIDDLE'] += 50; // Assassins também podem ser mid
      laneScores['TOP'] += 20; // Assassins também podem ser top
    }

    // Pontuação baseada nas estatísticas
    if (stats.attackrange > 500) {
      laneScores['ADC'] += 20; // Campeões com range alto tendem a ser ADC
    }

    if (stats.attackdamage > 60) {
      laneScores['ADC'] += 15; // Alto dano físico sugere ADC
    }

    if (stats.hp > 600) {
      laneScores['TOP'] += 15; // Alto HP sugere top lane
    }

    if (stats.movespeed > 340) {
      laneScores['JUNGLE'] += 10; // Alta velocidade sugere jungle
    }

    // Encontrar a lane com maior pontuação
    const bestLane = Object.entries(laneScores).reduce((a, b) =>
      laneScores[a[0]] > laneScores[b[0]] ? a : b
    )[0];

    // Se a melhor pontuação for muito baixa, usar fallback
    if (laneScores[bestLane] < 20) {
      return 'UNKNOWN';
    }

    return bestLane;
  }
} 