import { DatabaseManager } from '../database/DatabaseManager';
import { WebSocket } from 'ws';

// Interfaces
interface QueuedPlayer {
  id: number;
  summonerName: string;
  region: string;
  currentMMR: number;
  joinTime: Date;
  websocket: WebSocket;
  queuePosition?: number;
}

interface Match {
  id: number;
  team1: QueuedPlayer[];
  team2: QueuedPlayer[];
  createdAt: Date;
  status: 'waiting' | 'in_progress' | 'completed';
  averageMMR1: number;
  averageMMR2: number;
}

interface QueueStatus {
  playersInQueue: number;
  averageWaitTime: number;
  estimatedMatchTime: number;
  isActive: boolean;
}

export class MatchmakingService {
  private dbManager: DatabaseManager;
  private queue: QueuedPlayer[] = [];
  private activeMatches: Map<number, Match> = new Map();
  private matchmakingInterval: NodeJS.Timeout | null = null;
  private isActive = true;

  constructor(dbManager: DatabaseManager) {
    this.dbManager = dbManager;
  }

  async initialize(): Promise<void> {
    console.log('🔍 Inicializando sistema de matchmaking...');
    
    // Iniciar processamento de matchmaking a cada 5 segundos
    this.matchmakingInterval = setInterval(() => {
      this.processMatchmaking();
    }, 5000);

    console.log('✅ Sistema de matchmaking ativo');
  }
  async addPlayerToQueue(websocket: WebSocket, playerData: any): Promise<void> {
    try {
      // Validar dados do jogador
      if (!playerData) {
        throw new Error('Dados do jogador não fornecidos');
      }

      if (!playerData.summonerName) {
        throw new Error('Nome do invocador é obrigatório');
      }

      console.log('🔍 Dados do jogador recebidos:', playerData);

      // Buscar jogador no banco ou criar novo
      let player = await this.dbManager.getPlayerBySummonerName(playerData.summonerName);
      
      if (!player) {
        // Criar novo jogador se não existir
        const playerId = await this.dbManager.createPlayer(
          playerData.summonerName,
          playerData.region,
          playerData.summonerId,
          playerData.puuid
        );
        player = await this.dbManager.getPlayer(playerId);
      }

      if (!player) {
        throw new Error('Falha ao criar/recuperar jogador');
      }

      // Verificar se jogador já está na fila
      const existingPlayerIndex = this.queue.findIndex(p => p.id === player!.id);
      if (existingPlayerIndex !== -1) {
        // Atualizar websocket se jogador reconectar
        this.queue[existingPlayerIndex].websocket = websocket;
        websocket.send(JSON.stringify({
          type: 'queue_joined',
          data: { position: existingPlayerIndex + 1, estimated_wait: this.calculateEstimatedWaitTime() }
        }));
        return;
      }

      // Adicionar à fila
      const queuedPlayer: QueuedPlayer = {
        id: player.id,
        summonerName: player.summoner_name,
        region: player.region,
        currentMMR: player.current_mmr,
        joinTime: new Date(),
        websocket: websocket,
        queuePosition: this.queue.length + 1
      };

      this.queue.push(queuedPlayer);

      // Notificar jogador sobre entrada na fila
      websocket.send(JSON.stringify({
        type: 'queue_joined',
        data: {
          position: this.queue.length,
          estimatedWait: this.calculateEstimatedWaitTime(),
          queueStatus: this.getQueueStatus()
        }
      }));

      // Broadcast atualização da fila
      this.broadcastQueueUpdate();

      console.log(`➕ ${player.summoner_name} entrou na fila (Posição: ${this.queue.length}, MMR: ${player.current_mmr})`);

    } catch (error: any) {
      console.error('Erro ao adicionar jogador à fila:', error);
      websocket.send(JSON.stringify({
        type: 'error',
        message: 'Falha ao entrar na fila: ' + error.message
      }));
    }
  }

  removePlayerFromQueue(websocket: WebSocket): void {
    const playerIndex = this.queue.findIndex(player => player.websocket === websocket);
    if (playerIndex !== -1) {
      const player = this.queue[playerIndex];
      this.queue.splice(playerIndex, 1);

      // Atualizar posições na fila
      this.queue.forEach((p, index) => {
        p.queuePosition = index + 1;
      });

      console.log(`➖ ${player.summonerName} saiu da fila`);
      this.broadcastQueueUpdate();
    }
  }

  // Método para adicionar jogador à fila sem WebSocket (para uso automático)
  addPlayerToQueueDirect(playerData: any): void {
    try {
      // Verificar se o jogador já está na fila
      const existingPlayer = this.queue.find(p => p.id === playerData.id);
      if (existingPlayer) {
        console.log(`⚠️ Jogador ${playerData.summonerName} já está na fila`);
        return;
      }

      const queuedPlayer: QueuedPlayer = {
        id: playerData.id,
        summonerName: playerData.summonerName,
        region: playerData.region,
        currentMMR: playerData.currentMMR,
        joinTime: new Date(),
        websocket: null as any, // Para entrada automática, sem WebSocket
        queuePosition: this.queue.length + 1
      };

      this.queue.push(queuedPlayer);
      
      // Registrar entrada na fila no banco
      this.dbManager.recordQueueAction(playerData.id, 'join');
      
      console.log(`🎯 Jogador ${playerData.summonerName} adicionado à fila automaticamente (posição ${queuedPlayer.queuePosition})`);
      
      // Notificar outros jogadores via WebSocket sobre atualização da fila
      this.broadcastQueueUpdate();
    } catch (error) {
      console.error('Erro ao adicionar jogador à fila:', error);
    }
  }

  private async processMatchmaking(): Promise<void> {
    if (!this.isActive || this.queue.length < 10) return; // Precisa de 10 jogadores

    try {
      const match = await this.findBestMatch();
      if (match) {
        await this.createMatch(match.team1, match.team2);
      }
    } catch (error: any) {
      console.error('Erro no processamento de matchmaking:', error);
    }
  }

  private async findBestMatch(): Promise<{ team1: QueuedPlayer[], team2: QueuedPlayer[] } | null> {
    if (this.queue.length < 10) return null;

    // Pegar os 10 primeiros jogadores da fila
    const players = this.queue.slice(0, 10);
    
    const bestTeams = this.balanceTeams(players);
    if (bestTeams) {
      const maxMMRDiff = await this.getMaxMMRDifference();
      if (Math.abs(bestTeams.team1AvgMMR - bestTeams.team2AvgMMR) <= maxMMRDiff) {
        return {
          team1: bestTeams.team1,
          team2: bestTeams.team2
        };
      }
    }
    
    return null;
  }

  private balanceTeams(players: QueuedPlayer[]): {
    team1: QueuedPlayer[],
    team2: QueuedPlayer[],
    team1AvgMMR: number,
    team2AvgMMR: number
  } | null {
    
    // Algoritmo de busca por força bruta otimizada para encontrar melhor balanceamento
    const combinations = this.generateTeamCombinations(players, 5);
    let bestCombination = null;
    let smallestMMRDiff = Infinity;

    for (const combination of combinations) {
      const team1 = combination;
      const team2 = players.filter(p => !team1.includes(p));
      
      const team1AvgMMR = team1.reduce((sum, p) => sum + p.currentMMR, 0) / team1.length;
      const team2AvgMMR = team2.reduce((sum, p) => sum + p.currentMMR, 0) / team2.length;
      
      const mmrDiff = Math.abs(team1AvgMMR - team2AvgMMR);
      
      if (mmrDiff < smallestMMRDiff) {
        smallestMMRDiff = mmrDiff;
        bestCombination = {
          team1,
          team2,
          team1AvgMMR,
          team2AvgMMR
        };
      }
    }

    return bestCombination;
  }

  private generateTeamCombinations(players: QueuedPlayer[], teamSize: number): QueuedPlayer[][] {
    const combinations: QueuedPlayer[][] = [];
    
    function combine(start: number, combo: QueuedPlayer[]) {
      if (combo.length === teamSize) {
        combinations.push([...combo]);
        return;
      }
      
      for (let i = start; i < players.length; i++) {
        combo.push(players[i]);
        combine(i + 1, combo);
        combo.pop();
      }
    }
    
    combine(0, []);
    return combinations;
  }

  private async createMatch(team1: QueuedPlayer[], team2: QueuedPlayer[]): Promise<void> {
    try {
      const team1AvgMMR = team1.reduce((sum, p) => sum + p.currentMMR, 0) / team1.length;
      const team2AvgMMR = team2.reduce((sum, p) => sum + p.currentMMR, 0) / team2.length;

      // Criar partida no banco
      const matchId = await this.dbManager.createMatch(
        team1.map(p => p.id),
        team2.map(p => p.id),
        team1AvgMMR,
        team2AvgMMR
      );

      // Remover jogadores da fila
      const allPlayers = [...team1, ...team2];
      for (const player of allPlayers) {
        const index = this.queue.findIndex(p => p.id === player.id);
        if (index !== -1) {
          this.queue.splice(index, 1);
        }
      }

      // Criar objeto da partida
      const match: Match = {
        id: matchId,
        team1,
        team2,
        createdAt: new Date(),
        status: 'waiting',
        averageMMR1: team1AvgMMR,
        averageMMR2: team2AvgMMR
      };

      this.activeMatches.set(matchId, match);

      // Notificar todos os jogadores sobre a partida encontrada
      for (const player of allPlayers) {
        if (player.websocket && player.websocket.readyState === WebSocket.OPEN) {
          player.websocket.send(JSON.stringify({
            type: 'match_found',
            data: {
              matchId,
              team1: team1.map(p => ({ id: p.id, summonerName: p.summonerName, mmr: p.currentMMR })),
              team2: team2.map(p => ({ id: p.id, summonerName: p.summonerName, mmr: p.currentMMR })),
              yourTeam: team1.some(p => p.id === player.id) ? 1 : 2,
              averageMMR1: team1AvgMMR,
              averageMMR2: team2AvgMMR
            }
          }));
        }
      }

      this.broadcastQueueUpdate();

      console.log(`🏁 Partida criada! Team 1 MMR: ${team1AvgMMR}, Team 2 MMR: ${team2AvgMMR}`);
      console.log(`🔵 Team 1: ${team1.map(p => p.summonerName).join(', ')}`);
      console.log(`🔴 Team 2: ${team2.map(p => p.summonerName).join(', ')}`);

    } catch (error: any) {
      console.error('Erro ao criar partida:', error);
    }
  }

  // Método para broadcast de atualizações da fila
  private broadcastQueueUpdate(): void {
    const queueStatus = this.getQueueStatus();
    const message = JSON.stringify({
      type: 'queue_update',
      data: queueStatus
    });

    // Enviar para todos os jogadores conectados via WebSocket
    this.queue.forEach(player => {
      if (player.websocket && player.websocket.readyState === player.websocket.OPEN) {
        try {
          player.websocket.send(message);
        } catch (error) {
          console.error('Erro ao enviar atualização da fila:', error);
        }
      }
    });
  }

  private calculateEstimatedWaitTime(): number {
    // Estimativa baseada no número de pessoas na fila e histórico
    const playersInQueue = this.queue.length;
    const baseWaitTime = 60; // 60 segundos base
    
    if (playersInQueue >= 10) return baseWaitTime;
    if (playersInQueue >= 5) return baseWaitTime * 2;
    return baseWaitTime * 3;
  }

  private async getMaxMMRDifference(): Promise<number> {
    const setting = await this.dbManager.getSetting('max_mmr_difference');
    return setting ? parseInt(setting) : 200; // 200 MMR por padrão
  }

  async getRecentMatches(): Promise<any[]> {
    return this.dbManager.getRecentMatches();
  }

  async completeMatch(matchId: number, winnerTeam: number): Promise<void> {
    const match = this.activeMatches.get(matchId);
    if (!match) throw new Error('Partida não encontrada');

    // Calcular mudanças de MMR
    const mmrChanges = this.calculateMMRChanges(match, winnerTeam);

    // Atualizar MMR dos jogadores
    for (const [playerId, change] of Object.entries(mmrChanges)) {
      const player = await this.dbManager.getPlayer(parseInt(playerId));
      if (player) {
        const newMMR = player.current_mmr + change;
        await this.dbManager.updatePlayerMMR(parseInt(playerId), newMMR);
      }
    }    // Marcar partida como completa
    await this.dbManager.completeMatch(matchId, winnerTeam, mmrChanges);
    this.activeMatches.delete(matchId);

    console.log(`✅ Partida ${matchId} finalizada. Vencedor: Team ${winnerTeam}`);
  }

  private calculateMMRChanges(match: Match, winnerTeam: number): { [playerId: number]: number } {
    const changes: { [playerId: number]: number } = {};
    
    // Sistema ELO simplificado
    const K = 32; // Fator K
    const avgMMR1 = match.averageMMR1;
    const avgMMR2 = match.averageMMR2;

    // Calcular probabilidade de vitória esperada
    const expectedScore1 = 1 / (1 + Math.pow(10, (avgMMR2 - avgMMR1) / 400));
    const actualScore1 = winnerTeam === 1 ? 1 : 0;

    const mmrChange1 = Math.round(K * (actualScore1 - expectedScore1));
    const mmrChange2 = -mmrChange1;

    // Aplicar mudanças aos jogadores
    match.team1.forEach(player => {
      changes[player.id] = mmrChange1;
    });
    match.team2.forEach(player => {
      changes[player.id] = mmrChange2;
    });

    return changes;
  }

  getQueueStatus(): QueueStatus {
    return {
      playersInQueue: this.queue.length,
      averageWaitTime: this.calculateEstimatedWaitTime(),
      estimatedMatchTime: this.queue.length >= 10 ? 30 : this.calculateEstimatedWaitTime(),
      isActive: this.isActive
    };
  }

  destroy(): void {
    if (this.matchmakingInterval) {
      clearInterval(this.matchmakingInterval);
    }
  }
}
