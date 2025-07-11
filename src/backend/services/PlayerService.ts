import { RiotAPIService } from './RiotAPIService';
import { DatabaseManager } from '../database/DatabaseManager';

export class PlayerService {
  private riotAPI: RiotAPIService;

  constructor(riotAPI: RiotAPIService, private dbManager: DatabaseManager) {
    this.riotAPI = riotAPI; // Use the passed RiotAPIService instance
    // No longer creating: this.riotAPI = new RiotAPIService();
  }

  async registerPlayer(summonerName: string, region: string): Promise<any> {
    try {
      // Verificar se jogador já existe
      const existingPlayer = await this.dbManager.getPlayerBySummonerName(summonerName);
      if (existingPlayer) {
        throw new Error('Jogador já registrado');
      }

      // Buscar dados na Riot API
      let summonerId: string | undefined;
      let puuid: string | undefined;
      try {
        const summonerData = await this.riotAPI.getSummoner(summonerName, region);
        summonerId = summonerData.id;
        puuid = summonerData.puuid;
      } catch (error) {
        // console.log(`⚠️ Não foi possível buscar dados da Riot API para ${summonerName}`);
        // Continuar sem os dados da Riot API
      }      // Criar jogador no banco
      const playerId = await this.dbManager.createPlayer({
        summoner_name: summonerName,
        summoner_id: summonerId,
        puuid: puuid,
        region: region,
        current_mmr: 1000,
        peak_mmr: 1000,
        games_played: 0,
        wins: 0,
        losses: 0,
        win_streak: 0
      });

      // Se conseguiu dados da Riot API, atualizar MMR inicial baseado no rank
      if (summonerId) {
        try {
          const rankedData = await this.riotAPI.getRankedData(summonerId, region);
          const initialMMR = this.calculateInitialMMR(rankedData);

          if (initialMMR !== 1000) {
            await this.dbManager.updatePlayerMMR(playerId, initialMMR);
          }
        } catch (error) {
          // console.log(`⚠️ Não foi possível buscar dados ranqueados para ${summonerName}`);
        }
      } const player = await this.dbManager.getPlayer(playerId);
      if (!player) {
        throw new Error(`Erro ao buscar jogador criado: ${playerId}`);
      }
      // console.log(`✅ Jogador registrado: ${summonerName} (MMR inicial: ${player.current_mmr})`);

      return player;
    } catch (error: any) {
      console.error('Erro ao registrar jogador:', error);
      throw error;
    }
  }

  async getPlayer(playerId: string): Promise<any> {
    const id = parseInt(playerId);
    const player = await this.dbManager.getPlayer(id);

    if (!player) {
      throw new Error('Jogador não encontrado');
    }

    return this.enrichPlayerData(player);
  }

  async getPlayerStats(playerId: string): Promise<any> {
    const id = parseInt(playerId);
    const player = await this.dbManager.getPlayer(id);

    if (!player) {
      throw new Error('Jogador não encontrado');
    }

    // Calcular estatísticas adicionais
    const winRate = player.games_played > 0 ?
      Math.round((player.wins / player.games_played) * 100) : 0;

    const rank = this.calculateRankFromMMR(player.current_mmr);
    const nextRankMMR = this.getNextRankMMR(player.current_mmr);
    const progressToNextRank = this.calculateRankProgress(player.current_mmr);

    return {
      ...player,
      winRate,
      rank,
      nextRankMMR,
      progressToNextRank,
      mmrGainedTotal: player.current_mmr - 1000, // Assumindo 1000 como MMR inicial
      averageMMRPerGame: player.games_played > 0 ?
        (player.current_mmr - 1000) / player.games_played : 0
    };
  }

  async updatePlayerFromRiotAPI(playerId: number): Promise<any> {
    const player = await this.dbManager.getPlayer(playerId);
    if (!player || !player.summoner_id) {
      throw new Error('Jogador não encontrado ou sem dados da Riot API');
    }

    try {      // Atualizar dados do summoner
      const summonerData = await this.riotAPI.getSummoner(player.summoner_name, player.region);

      // Buscar dados ranqueados atualizados
      const rankedData = await this.riotAPI.getRankedData(summonerData.id, player.region);

      // Atualizar MMR baseado no rank atual (opcional - pode manter o MMR interno)
      const currentMMRFromRank = this.calculateInitialMMR(rankedData);

      return {
        player,
        riotData: {
          summoner: summonerData,
          ranked: rankedData,
          suggestedMMR: currentMMRFromRank
        }
      };
    } catch (error: any) {
      console.error('Erro ao atualizar dados da Riot API:', error);
      throw new Error('Erro ao conectar com a Riot API');
    }
  }

  async getPlayerBySummonerNameWithDetails(displayName: string, region: string): Promise<any> {
    if (!displayName.includes('#')) {
      throw new Error('Formato de Display Name inválido. Use gameName#tagLine.');
    }
    const [gameName, tagLine] = displayName.split('#');

    if (!gameName || !tagLine) {
      throw new Error('gameName e tagLine são obrigatórios do Display Name.');
    } try {
      // Usar o método unificado que suporta tanto Display Name quanto summoner name legado
      const summonerDetails = await this.riotAPI.getSummoner(displayName, region);

      // O método getSummoner já retorna os dados completos incluindo gameName e tagLine
      return summonerDetails;

    } catch (error: any) {
      console.error(`Erro em getPlayerBySummonerNameWithDetails para ${displayName} na região ${region}:`, error);
      if (error.message.includes('não encontrado') || error.response?.status === 404) {
        throw new Error(`Jogador com Display Name '${displayName}' não encontrado na região ${region.toUpperCase()}`);
      }
      throw new Error('Falha ao buscar dados do jogador por Display Name na Riot API.');
    }
  }

  async getPlayerByPuuid(puuid: string, region: string): Promise<any> {
    try {
      // Step 1: Get Account data by PUUID (for gameName, tagLine)
      // Assuming a method like getAccountByPuuid exists in RiotAPIService
      const accountData = await this.riotAPI.getAccountByPuuid(puuid, region);
      if (!accountData) {
        throw new Error('Account data not found for PUUID.');
      }

      // Step 2: Get Summoner data by PUUID (for summonerId, profileIconId, summonerLevel)
      // Assuming a method like getSummonerByPuuid exists in RiotAPIService
      const summonerData = await this.riotAPI.getSummonerByPuuid(puuid, region);
      if (!summonerData) {
        throw new Error('Summoner data not found for PUUID.');
      }

      // Step 3: Get Ranked data by summonerId (from summonerData)
      const rankedData = await this.riotAPI.getRankedData(summonerData.id, region); // summonerData.id is the encryptedSummonerId

      // Step 4: Assemble the Player object
      // Find a solo queue entry if available
      const soloQueueEntry = rankedData.find((entry: any) => entry.queueType === 'RANKED_SOLO_5x5');

      let playerRank = undefined;
      if (soloQueueEntry) {
        playerRank = {
          tier: soloQueueEntry.tier,
          rank: soloQueueEntry.rank, // This is the division (I, II, III, IV)
          lp: soloQueueEntry.leaguePoints,
          wins: soloQueueEntry.wins,
          losses: soloQueueEntry.losses,
          display: `${soloQueueEntry.tier} ${soloQueueEntry.rank}`
        };
      }

      const playerData = {
        puuid: puuid,
        summonerName: accountData.gameName || summonerData.name, // Prefer gameName from account data
        tagLine: accountData.tagLine || null,
        summonerId: summonerData.id,
        profileIconId: summonerData.profileIconId,
        summonerLevel: summonerData.summonerLevel,
        region: region,
        rank: playerRank, // This will include wins and losses if soloQueueEntry is found
        wins: playerRank?.wins, // Explicitly set top-level wins
        losses: playerRank?.losses, // Explicitly set top-level losses
        // You might want to fetch and include other data like match history, etc.
        // For now, this matches the core structure needed for refresh.
      };

      // Optionally, update this information in your local database
      // await this.dbManager.updatePlayerByPuuid(playerData);

      return playerData;

    } catch (error: any) {
      console.error(`Error in getPlayerByPuuid for PUUID ${puuid} in region ${region}:`, error);
      // It's good practice to throw a more specific error or handle it
      if (error.response && error.response.status === 404) {
        throw new Error('Player not found via Riot API.');
      }
      throw new Error('Failed to fetch player data by PUUID from Riot API.');
    }
  }

  private enrichPlayerData(player: any): any {
    const rank = this.calculateRankFromMMR(player.current_mmr);
    const winRate = player.games_played > 0 ?
      Math.round((player.wins / player.games_played) * 100) : 0;

    return {
      ...player,
      rank,
      winRate,
      isActive: true // Adicionar lógica de atividade se necessário
    };
  }

  private calculateInitialMMR(rankedData: any[]): number {
    // Mapear tiers e ranks para MMR
    const tierMMR: { [key: string]: number } = {
      'IRON': 400,
      'BRONZE': 600,
      'SILVER': 800,
      'GOLD': 1100,
      'PLATINUM': 1400,
      'EMERALD': 1700,
      'DIAMOND': 2000,
      'MASTER': 2400,
      'GRANDMASTER': 2700,
      'CHALLENGER': 3000
    };

    const rankMultiplier: { [key: string]: number } = {
      'IV': 0,
      'III': 50,
      'II': 100,
      'I': 150
    };

    // Procurar por RANKED_SOLO_5x5 primeiro, depois RANKED_FLEX_SR
    const soloQueue = rankedData.find(entry => entry.queueType === 'RANKED_SOLO_5x5');
    const flexQueue = rankedData.find(entry => entry.queueType === 'RANKED_FLEX_SR');

    const rankedEntry = soloQueue || flexQueue;

    if (!rankedEntry) {
      return 1000; // MMR padrão para unranked
    }

    const baseMmr = tierMMR[rankedEntry.tier] || 1000;
    const rankBonus = rankMultiplier[rankedEntry.rank] || 0;
    const lpBonus = Math.floor(rankedEntry.leaguePoints * 0.4); // 0.4 MMR por LP

    return baseMmr + rankBonus + lpBonus;
  }

  private calculateRankFromMMR(mmr: number): { tier: string, rank: string, display: string } {
    if (mmr < 500) {
      return { tier: 'IRON', rank: 'IV', display: 'Iron IV' };
    } else if (mmr < 550) {
      return { tier: 'IRON', rank: 'III', display: 'Iron III' };
    } else if (mmr < 600) {
      return { tier: 'IRON', rank: 'II', display: 'Iron II' };
    } else if (mmr < 650) {
      return { tier: 'IRON', rank: 'I', display: 'Iron I' };
    } else if (mmr < 700) {
      return { tier: 'BRONZE', rank: 'IV', display: 'Bronze IV' };
    } else if (mmr < 750) {
      return { tier: 'BRONZE', rank: 'III', display: 'Bronze III' };
    } else if (mmr < 800) {
      return { tier: 'BRONZE', rank: 'II', display: 'Bronze II' };
    } else if (mmr < 850) {
      return { tier: 'BRONZE', rank: 'I', display: 'Bronze I' };
    } else if (mmr < 900) {
      return { tier: 'SILVER', rank: 'IV', display: 'Silver IV' };
    } else if (mmr < 950) {
      return { tier: 'SILVER', rank: 'III', display: 'Silver III' };
    } else if (mmr < 1000) {
      return { tier: 'SILVER', rank: 'II', display: 'Silver II' };
    } else if (mmr < 1050) {
      return { tier: 'SILVER', rank: 'I', display: 'Silver I' };
    } else if (mmr < 1200) {
      return { tier: 'GOLD', rank: 'IV', display: 'Gold IV' };
    } else if (mmr < 1300) {
      return { tier: 'GOLD', rank: 'III', display: 'Gold III' };
    } else if (mmr < 1400) {
      return { tier: 'GOLD', rank: 'II', display: 'Gold II' };
    } else if (mmr < 1500) {
      return { tier: 'GOLD', rank: 'I', display: 'Gold I' };
    } else if (mmr < 1600) {
      return { tier: 'PLATINUM', rank: 'IV', display: 'Platinum IV' };
    } else if (mmr < 1700) {
      return { tier: 'PLATINUM', rank: 'III', display: 'Platinum III' };
    } else if (mmr < 1800) {
      return { tier: 'PLATINUM', rank: 'II', display: 'Platinum II' };
    } else if (mmr < 1900) {
      return { tier: 'PLATINUM', rank: 'I', display: 'Platinum I' };
    } else if (mmr < 2000) {
      return { tier: 'EMERALD', rank: 'IV', display: 'Emerald IV' };
    } else if (mmr < 2100) {
      return { tier: 'EMERALD', rank: 'III', display: 'Emerald III' };
    } else if (mmr < 2200) {
      return { tier: 'EMERALD', rank: 'II', display: 'Emerald II' };
    } else if (mmr < 2300) {
      return { tier: 'EMERALD', rank: 'I', display: 'Emerald I' };
    } else if (mmr < 2400) {
      return { tier: 'DIAMOND', rank: 'IV', display: 'Diamond IV' };
    } else if (mmr < 2500) {
      return { tier: 'DIAMOND', rank: 'III', display: 'Diamond III' };
    } else if (mmr < 2600) {
      return { tier: 'DIAMOND', rank: 'II', display: 'Diamond II' };
    } else if (mmr < 2700) {
      return { tier: 'DIAMOND', rank: 'I', display: 'Diamond I' };
    } else if (mmr < 2800) {
      return { tier: 'MASTER', rank: 'I', display: 'Master' };
    } else if (mmr < 3000) {
      return { tier: 'GRANDMASTER', rank: 'I', display: 'Grandmaster' };
    } else {
      return { tier: 'CHALLENGER', rank: 'I', display: 'Challenger' };
    }
  }

  private getNextRankMMR(currentMMR: number): number {
    const thresholds = [
      500, 550, 600, 650, 700, 750, 800, 850, 900, 950, 1000, 1050,
      1200, 1300, 1400, 1500, 1600, 1700, 1800, 1900, 2000, 2100,
      2200, 2300, 2400, 2500, 2600, 2700, 2800, 3000
    ];

    for (const threshold of thresholds) {
      if (currentMMR < threshold) {
        return threshold;
      }
    }

    return currentMMR + 100; // Para ranks muito altos
  }

  private calculateRankProgress(currentMMR: number): number {
    const nextRankMMR = this.getNextRankMMR(currentMMR);
    const currentRank = this.calculateRankFromMMR(currentMMR);
    const previousRankMMR = this.getPreviousRankMMR(currentMMR);

    const totalProgress = nextRankMMR - previousRankMMR;
    const currentProgress = currentMMR - previousRankMMR;

    return Math.max(0, Math.min(100, Math.round((currentProgress / totalProgress) * 100)));
  }

  private getPreviousRankMMR(currentMMR: number): number {
    const thresholds = [
      400, 500, 550, 600, 650, 700, 750, 800, 850, 900, 950, 1000,
      1050, 1200, 1300, 1400, 1500, 1600, 1700, 1800, 1900, 2000,
      2100, 2200, 2300, 2400, 2500, 2600, 2700, 2800
    ];

    for (let i = thresholds.length - 1; i >= 0; i--) {
      if (currentMMR >= thresholds[i]) {
        return thresholds[i];
      }
    }

    return 400; // MMR mínimo
  }

  async searchPlayers(query: string): Promise<any[]> {
    // Implementar busca de jogadores por nome
    // Por enquanto, retorna lista vazia
    return [];
  } async getLeaderboard(limit: number = 100): Promise<any[]> {
    try {
      const result = await this.dbManager.getParticipantsLeaderboard(limit);
      return result.map((player: any, index: number) => {
        let favoriteChampion = null;
        // Processar dados do campeão favorito
        if (player.favorite_champion && typeof player.favorite_champion === 'object') {
          favoriteChampion = {
            name: player.favorite_champion.name,
            id: player.favorite_champion.id,
            games: player.favorite_champion.games
          };
        }

        return {
          rank: index + 1,
          id: player.id,
          summonerName: player.summoner_name,
          profileIconId: player.profile_icon_id || 1,
          mmr: player.calculated_mmr || 1000,
          gamesPlayed: player.games_played || 0,
          wins: player.wins || 0,
          losses: (player.games_played || 0) - (player.wins || 0),
          winRate: player.win_rate || 0,
          favoriteChampion,
          averageKDA: {
            kills: Math.round((player.avg_kills || 0) * 10) / 10,
            deaths: Math.round((player.avg_deaths || 0) * 10) / 10,
            assists: Math.round((player.avg_assists || 0) * 10) / 10,
            ratio: player.kda_ratio || 0
          },
          averageGold: Math.round(player.avg_gold || 0),
          joinedAt: player.created_at
        };
      });
    } catch (error) {
      console.error('❌ Erro ao buscar leaderboard:', error);
      return [];
    }
  }
}
