import { Injectable } from '@angular/core';

export interface Champion {
  id: string;
  key: string;
  name: string;
  title: string;
  image: string;
  tags: string[];
  info: {
    attack: number;
    defense: number;
    magic: number;
    difficulty: number;
  };
}

export interface ChampionsByRole {
  top: Champion[];
  jungle: Champion[];
  mid: Champion[];
  adc: Champion[];
  support: Champion[];
  all: Champion[];
}

@Injectable({
  providedIn: 'root'
})
export class ChampionService {
  private baseImageUrl = 'https://ddragon.leagueoflegends.com/cdn/15.13.1/img/champion/';

  private roleMapping = {
    top: ['Fighter', 'Tank'],
    jungle: ['Assassin', 'Fighter', 'Tank'],
    mid: ['Mage', 'Assassin'],
    adc: ['Marksman'],
    support: ['Support', 'Tank', 'Mage']
  };

  // Lista mínima de campeões mais comuns para funcionalidades básicas
  private allChampions: Champion[] = [
    { id: '266', key: 'Aatrox', name: 'Aatrox', title: 'a Espada Darkin', image: this.baseImageUrl + 'Aatrox.png', tags: ['Fighter'], info: { attack: 8, defense: 4, magic: 3, difficulty: 4 } },
    { id: '103', key: 'Ahri', name: 'Ahri', title: 'a Raposa de Nove Caudas', image: this.baseImageUrl + 'Ahri.png', tags: ['Mage', 'Assassin'], info: { attack: 3, defense: 4, magic: 8, difficulty: 5 } },
    { id: '84', key: 'Akali', name: 'Akali', title: 'a Assassina Renegada', image: this.baseImageUrl + 'Akali.png', tags: ['Assassin'], info: { attack: 5, defense: 3, magic: 8, difficulty: 7 } },
    { id: '166', key: 'Akshan', name: 'Akshan', title: 'o Sentinela Rebelde', image: this.baseImageUrl + 'Akshan.png', tags: ['Marksman', 'Assassin'], info: { attack: 0, defense: 0, magic: 0, difficulty: 0 } },
    { id: '12', key: 'Alistar', name: 'Alistar', title: 'o Minotauro', image: this.baseImageUrl + 'Alistar.png', tags: ['Tank', 'Support'], info: { attack: 6, defense: 9, magic: 5, difficulty: 7 } }
  ];

  /**
   * Obtém o nome do campeão pelo seu ID
   * 
   * NOTA: Este método agora é usado apenas como fallback.
   * O backend já processa os dados dos campeões automaticamente.
   * 
   * @param championId - ID numérico do campeão
   * @returns Nome do campeão ou 'Minion' como fallback
   */
  static getChampionNameById(championId: number | undefined): string {
    if (!championId) return 'Minion';
    
    // Fallback simples - retorna 'Minion' para qualquer ID desconhecido
    // O backend já processa os dados automaticamente, então este método
    // é usado apenas em casos extremos onde o backend não está disponível
    return 'Minion';
  }

  /**
   * Obtém todos os campeões
   * 
   * NOTA: Esta lista agora é mínima, pois o backend processa os dados automaticamente.
   * Esta lista é usada apenas para funcionalidades que não dependem do backend.
   */
  getAllChampions(): Champion[] {
    return this.allChampions;
  }

  /**
   * Obtém campeões organizados por role
   */
  getChampionsByRole(): ChampionsByRole {
    const allChampions = this.getAllChampions();
    
    const result: ChampionsByRole = {
      top: [],
      jungle: [],
      mid: [],
      adc: [],
      support: [],
      all: allChampions
    };

    allChampions.forEach(champion => {
      // Top lane
      if (champion.tags.some(tag => this.roleMapping.top.includes(tag))) {
        result.top.push(champion);
      }

      // Jungle
      if (champion.tags.some(tag => this.roleMapping.jungle.includes(tag))) {
        result.jungle.push(champion);
      }

      // Mid lane
      if (champion.tags.some(tag => this.roleMapping.mid.includes(tag))) {
        result.mid.push(champion);
      }

      // ADC
      if (champion.tags.some(tag => this.roleMapping.adc.includes(tag))) {
        result.adc.push(champion);
      }

      // Support
      if (champion.tags.some(tag => this.roleMapping.support.includes(tag))) {
        result.support.push(champion);
      }
    });

    return result;
  }

  /**
   * Busca campeões por query
   */
  searchChampions(query: string, role?: string): Champion[] {
    let champions = role && role !== 'all' ? this.getChampionsByRole()[role as keyof ChampionsByRole] : this.getAllChampions();

    if (!query.trim()) {
      return champions;
    }

    return champions.filter(champion =>
      champion.name.toLowerCase().includes(query.toLowerCase()) ||
      champion.title.toLowerCase().includes(query.toLowerCase()) ||
      champion.tags.some(tag => tag.toLowerCase().includes(query.toLowerCase()))
    );
  }

  /**
   * Obtém um campeão aleatório
   */
  getRandomChampion(excludeIds: string[] = []): Champion {
    const availableChampions = this.getAllChampions().filter(c => !excludeIds.includes(c.id));
    const randomIndex = Math.floor(Math.random() * availableChampions.length);
    return availableChampions[randomIndex];
  }

  /**
   * Verifica se um campeão está banido
   */
  isChampionBanned(championId: string, bannedChampions: Champion[]): boolean {
    return bannedChampions.some(banned => banned.id === championId);
  }

  /**
   * Verifica se um campeão foi escolhido
   */
  isChampionPicked(championId: string, pickedChampions: Champion[]): boolean {
    return pickedChampions.some(picked => picked.id === championId);
  }
}
