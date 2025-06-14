import { RiotAPIService } from './RiotAPIService';
import { DatabaseManager } from '../database/DatabaseManager';
import axios from 'axios';

interface MatchData {
  gameId: string;
  puuid: string;
  participants: any[];
  gameMode: string;
  gameDuration: number;
  gameCreation: number;
  gameEndTimestamp?: number;
}

// Classe para capturar dados sem API key (como Porofessor)
class PublicRiotDataService {
  // URLs públicas da Riot (sem necessidade de API key)
  async getPublicSummonerData(summonerName: string, region: string = 'br1'): Promise<any> {
    try {
      // Usar endpoints públicos do OP.GG ou sites similares
      const cleanName = encodeURIComponent(summonerName.replace(/\s+/g, ''));
      
      // Endpoint público do DataDragon + informações via terceiros
      console.log(`🔍 Buscando dados públicos para: ${summonerName}`);
      
      // Retornar dados mockados por enquanto - será implementado com scraping ou APIs públicas
      return {
        name: summonerName,
        level: 30,
        region: region,
        lastUpdated: new Date(),
        source: 'public'
      };
    } catch (error) {
      console.error('Erro ao buscar dados públicos:', error);
      return null;
    }
  }

  async getPublicMatchHistory(summonerName: string, region: string = 'br1'): Promise<any[]> {
    try {
      console.log(`📊 Buscando histórico público para: ${summonerName}`);
      
      // Implementação futura: usar scraping de sites como OP.GG, U.GG, etc
      // Por enquanto, retorna dados de exemplo
      return [
        {
          gameId: 'BR1_' + Date.now(),
          gameMode: 'CLASSIC',
          champion: 'Unknown',
          result: 'UNKNOWN',
          duration: 1500,
          createdAt: new Date(),
          source: 'public'
        }
      ];
    } catch (error) {
      console.error('Erro ao buscar histórico público:', error);
      return [];
    }
  }
}

export class MatchHistoryService {
  private riotAPI: RiotAPIService;
  private dbManager: DatabaseManager;
  private publicService: PublicRiotDataService;
  private hasApiKey: boolean = false;

  constructor(riotAPI: RiotAPIService, dbManager: DatabaseManager) {
    this.riotAPI = riotAPI; // Use the passed RiotAPIService instance
    this.dbManager = dbManager;
    this.publicService = new PublicRiotDataService();
    
    // Verificar se tem API key configurada
    this.checkApiKey();
  }
  private async checkApiKey(): Promise<void> {
    try {
      // Check if the global RiotAPIService has a configured API key
      this.hasApiKey = this.riotAPI.isApiKeyConfigured();
      
      if (this.hasApiKey) {
        console.log('🔑 Chave da Riot API encontrada - usando dados oficiais');
      } else {
        console.log('🌐 Sem chave da API - usando captura automática via LCU e dados públicos');
      }
    } catch (error) {
      this.hasApiKey = false;
    }
  }

  async captureLatestMatch(puuid: string, gameId?: string): Promise<void> {
    try {
      console.log('📥 Iniciando captura do histórico...');
      
      if (this.hasApiKey) {
        await this.captureWithApiKey(puuid, gameId);
      } else {
        await this.captureWithoutApiKey(puuid, gameId);
      }

    } catch (error: any) {
      console.error('❌ Erro ao capturar histórico:', error.message);
    }
  }

  private async captureWithApiKey(puuid: string, gameId?: string): Promise<void> {
    // Método original com API key
    const matchHistory = await this.riotAPI.getMatchHistory(puuid, 'americas', 1);
    
    if (matchHistory && matchHistory.length > 0) {
      const latestMatchId = matchHistory[0];
      const matchDetails = await this.riotAPI.getMatchDetails(latestMatchId, 'americas');
      
      if (matchDetails) {
        await this.saveMatchToDatabase(matchDetails, puuid);
        console.log(`✅ Partida ${latestMatchId} salva no histórico (via API oficial)`);
      }
    }
  }

  private async captureWithoutApiKey(puuid: string, gameId?: string): Promise<void> {
    console.log('🔄 Capturando dados sem API key (modo Porofessor)...');
    
    try {
      // Salvar dados básicos da partida com o gameId do LCU
      if (gameId) {
        const matchData = {
          gameId: gameId,
          gameMode: 'CLASSIC', // Padrão por enquanto
          gameDuration: 0, // Será atualizado quando soubermos
          gameCreation: new Date(),
          participants: [], // Será preenchido com dados do LCU
          playerResult: {
            won: null, // Desconhecido por enquanto
            kills: 0,
            deaths: 0,
            assists: 0,
            champion: 'Unknown',
            items: []
          }
        };

        await this.saveBasicMatchData(matchData, puuid);
        console.log(`📝 Partida ${gameId} registrada (dados básicos via LCU)`);
      }

      // Tentar capturar dados públicos adiccionais
      const publicData = await this.publicService.getPublicMatchHistory(puuid);
      console.log('📊 Dados públicos capturados:', publicData.length, 'partidas');
      
    } catch (error) {
      console.error('Erro na captura sem API key:', error);
    }
  }

  private async saveBasicMatchData(matchData: any, playerPuuid: string): Promise<void> {
    try {
      // Verificar se já existe
      const existingMatch = await this.dbManager.getRiotMatchByGameId(matchData.gameId);
      if (existingMatch) {
        console.log('Partida já registrada');
        return;
      }

      // Salvar dados básicos
      await this.dbManager.saveRiotMatch({
        gameId: matchData.gameId,
        gameMode: matchData.gameMode,
        gameDuration: matchData.gameDuration,
        gameCreation: matchData.gameCreation,
        participants: matchData.participants,
        playerResult: matchData.playerResult
      });

      console.log('✅ Dados básicos da partida salvos');
    } catch (error) {
      console.error('Erro ao salvar dados básicos:', error);
    }
  }

  private async saveMatchToDatabase(matchData: any, playerPuuid: string): Promise<void> {
    try {
      // Encontrar o jogador na partida
      const playerData = matchData.info.participants.find(
        (p: any) => p.puuid === playerPuuid
      );

      if (!playerData) {
        console.error('Jogador não encontrado na partida');
        return;
      }      // Verificar se a partida já existe no banco
      const existingMatch = await this.dbManager.getRiotMatchByGameId(matchData.metadata.matchId);
      if (existingMatch) {
        console.log('Partida já existe no banco de dados');
        return;
      }

      // Calcular resultado
      const won = playerData.win;
      const gameDuration = Math.floor(matchData.info.gameDuration / 60); // Converter para minutos

      // Dados da partida para salvar
      const matchToSave = {
        gameId: matchData.metadata.matchId,
        gameMode: matchData.info.gameMode,
        gameDuration: gameDuration,
        gameCreation: new Date(matchData.info.gameCreation),
        participants: matchData.info.participants.map((p: any) => ({
          puuid: p.puuid,
          summonerName: p.summonerName,
          championName: p.championName,
          kills: p.kills,
          deaths: p.deaths,
          assists: p.assists,
          win: p.win,
          teamId: p.teamId
        })),
        playerResult: {
          won,
          kills: playerData.kills,
          deaths: playerData.deaths,
          assists: playerData.assists,
          champion: playerData.championName,
          items: [
            playerData.item0,
            playerData.item1,
            playerData.item2,
            playerData.item3,
            playerData.item4,
            playerData.item5,
            playerData.item6
          ].filter(item => item > 0)
        }
      };      // Salvar no banco de dados
      await this.dbManager.saveRiotMatch(matchToSave);

      // Atualizar MMR do jogador baseado no resultado
      const player = await this.dbManager.getPlayerByPuuid(playerPuuid);
      if (player) {
        const mmrChange = won ? 25 : -20; // Ganho/perda base
        const newMMR = player.current_mmr + mmrChange;
        
        await this.dbManager.updatePlayerMMR(player.id, newMMR);
        console.log(`📊 MMR atualizado: ${player.current_mmr} → ${newMMR} (${mmrChange > 0 ? '+' : ''}${mmrChange})`);
      }

    } catch (error: any) {
      console.error('Erro ao salvar partida no banco:', error);
    }
  }
  // Buscar histórico do banco de dados
  async getPlayerMatchHistory(playerId: number, limit: number = 10): Promise<any[]> {
    try {
      return await this.dbManager.getPlayerRiotMatches(playerId, limit);
    } catch (error) {
      console.error('Erro ao buscar histórico:', error);
      return [];
    }
  }

  // Estatísticas do jogador
  async getPlayerStats(playerId: number): Promise<any> {
    try {
      const matches = await this.dbManager.getPlayerRiotMatches(playerId, 50);
      
      if (matches.length === 0) {
        return {
          totalGames: 0,
          wins: 0,
          losses: 0,
          winRate: 0,
          averageKDA: { kills: 0, deaths: 0, assists: 0 }
        };
      }

      const wins = matches.filter(m => m.won).length;
      const losses = matches.length - wins;
      const winRate = Math.round((wins / matches.length) * 100);

      const kdaSum = matches.reduce((acc, match) => ({
        kills: acc.kills + (match.kills || 0),
        deaths: acc.deaths + (match.deaths || 0),
        assists: acc.assists + (match.assists || 0)
      }), { kills: 0, deaths: 0, assists: 0 });

      const averageKDA = {
        kills: Math.round((kdaSum.kills / matches.length) * 10) / 10,
        deaths: Math.round((kdaSum.deaths / matches.length) * 10) / 10,
        assists: Math.round((kdaSum.assists / matches.length) * 10) / 10
      };

      return {
        totalGames: matches.length,
        wins,
        losses,
        winRate,
        averageKDA,
        recentMatches: matches.slice(0, 5)
      };

    } catch (error) {
      console.error('Erro ao calcular estatísticas:', error);
      return null;
    }
  }
}
