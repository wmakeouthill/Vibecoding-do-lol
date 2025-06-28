// Métodos que estão faltando no MatchmakingService.ts

// Método para adicionar atividade ao histórico
private addActivity(type: QueueActivity['type'], message: string, playerName?: string, playerTag?: string, lane?: string): void {
  const activity: QueueActivity = {
    id: `activity_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    timestamp: new Date(),
    type,
    message,
    playerName,
    playerTag,
    lane
  };

  this.recentActivities.unshift(activity);

  // Manter apenas as últimas atividades
  if (this.recentActivities.length > this.MAX_ACTIVITIES) {
    this.recentActivities = this.recentActivities.slice(0, this.MAX_ACTIVITIES);
  }
}

// Método para calcular tempo estimado de espera
private calculateEstimatedWaitTime(): number {
  if (this.queue.length < 10) {
    return Math.max(30, this.queue.length * 5); // Mínimo 30 segundos
  }
  return 60; // 1 minuto quando há jogadores suficientes
}

// Método para obter nome de exibição da lane
private getLaneDisplayName(laneId?: string): string {
  const lanes: { [key: string]: string } = {
    'top': 'Topo',
    'jungle': 'Selva',
    'mid': 'Meio',
    'bot': 'Atirador',
    'support': 'Suporte',
    'fill': 'Preenchimento'
  };
  return lanes[laneId || 'fill'] || 'Preenchimento';
}

// Método para broadcast de atualização da fila
public async broadcastQueueUpdate(): Promise<void> {
  if (!this.wss) return;

  const queueStatus = await this.getQueueStatus();
  
  this.wss.clients.forEach((client: WebSocket) => {
    if (client.readyState === WebSocket.OPEN) {
      try {
        client.send(JSON.stringify({
          type: 'queue_update',
          data: queueStatus
        }));
      } catch (error) {
        console.error('Erro ao enviar atualização da fila:', error);
      }
    }
  });
}

// Método para obter status da fila
async getQueueStatus(): Promise<QueueStatus> {
  const playersInQueueList: QueuedPlayerInfo[] = this.queue.map(player => ({
    summonerName: player.summonerName,
    primaryLane: this.getLaneDisplayName(player.preferences?.primaryLane),
    secondaryLane: this.getLaneDisplayName(player.preferences?.secondaryLane),
    mmr: player.currentMMR,
    queuePosition: player.queuePosition || 0,
    joinTime: player.joinTime
  }));

  return {
    playersInQueue: this.queue.length,
    averageWaitTime: this.calculateEstimatedWaitTime(),
    estimatedMatchTime: this.queue.length >= 10 ? 60 : 120,
    isActive: this.isActive,
    playersInQueueList,
    recentActivities: [...this.recentActivities]
  };
}

// Método para obter partidas recentes
async getRecentMatches(): Promise<any[]> {
  try {
    return await this.dbManager.getCustomMatches(10);
  } catch (error) {
    console.error('Erro ao buscar partidas recentes:', error);
    return [];
  }
}

// Método para encontrar melhor partida
private async findBestMatch(): Promise<Match | null> {
  if (this.queue.length < 10) return null;

  // Ordenar jogadores por MMR
  const sortedPlayers = [...this.queue].sort((a, b) => a.currentMMR - b.currentMMR);
  
  // Dividir em dois times balanceados
  const team1: QueuedPlayer[] = [];
  const team2: QueuedPlayer[] = [];
  
  // Distribuir jogadores alternadamente para balancear MMR
  for (let i = 0; i < sortedPlayers.length && i < 10; i++) {
    if (i % 2 === 0) {
      team1.push(sortedPlayers[i]);
    } else {
      team2.push(sortedPlayers[i]);
    }
  }

  if (team1.length < 5 || team2.length < 5) return null;

  // Calcular MMR médio dos times
  const avgMMR1 = team1.reduce((sum, p) => sum + p.currentMMR, 0) / team1.length;
  const avgMMR2 = team2.reduce((sum, p) => sum + p.currentMMR, 0) / team2.length;

  // Verificar se a diferença de MMR é aceitável (máximo 200)
  if (Math.abs(avgMMR1 - avgMMR2) > 200) return null;

  // Atribuir lanes baseado no MMR
  this.assignLanesByMMR(team1);
  this.assignLanesByMMR(team2);

  const match: Match = {
    id: Date.now(),
    team1,
    team2,
    createdAt: new Date(),
    status: 'waiting',
    averageMMR1: avgMMR1,
    averageMMR2: avgMMR2,
    acceptedPlayers: new Set()
  };

  return match;
}

// Método para atribuir lanes baseado no MMR
private assignLanesByMMR(team: QueuedPlayer[]): void {
  // Ordenar por MMR (maior MMR = lane mais importante)
  const sortedByMMR = [...team].sort((a, b) => b.currentMMR - a.currentMMR);
  
  const lanes = ['mid', 'jungle', 'top', 'bot', 'support'];
  
  sortedByMMR.forEach((player, index) => {
    if (index < lanes.length) {
      player.preferences = {
        ...player.preferences,
        assignedLane: lanes[index],
        isAutofill: false
      };
    }
  });
}

// Método para iniciar fase de draft
private async startDraftPhase(matchId: number): Promise<void> {
  const match = this.activeMatches.get(matchId);
  if (!match) return;

  console.log(`🎯 Iniciando fase de draft para partida ${matchId}`);

  // Atualizar status da partida
  match.status = 'in_progress';

  // Criar dados do draft
  const draftData = {
    matchId: matchId,
    phase: 'draft',
    turnOrder: this.generateDraftTurnOrder(match),
    timeLimit: 30, // segundos por turno
    currentTurn: 0
  };

  // Notificar jogadores sobre o draft
  this.notifyDraftPhase(match, draftData);

  // Adicionar atividade
  this.addActivity('match_created', `Fase de draft iniciada para partida ${matchId}`);
}

// Método para gerar ordem de turnos no draft
private generateDraftTurnOrder(match: Match): number[] {
  const allPlayers = [...match.team1, ...match.team2];
  const turnOrder: number[] = [];
  
  // Ordem: Team1 ban, Team2 ban, Team1 ban, Team2 ban, Team1 ban, Team2 ban
  // Depois: Team1 pick, Team2 pick, Team2 pick, Team1 pick, Team1 pick, Team2 pick, Team2 pick, Team1 pick, Team1 pick, Team2 pick
  
  // Bans (6 total)
  for (let i = 0; i < 6; i++) {
    const team = i % 2 === 0 ? match.team1 : match.team2;
    const playerIndex = Math.floor(i / 2) % team.length;
    turnOrder.push(team[playerIndex].id);
  }
  
  // Picks (10 total)
  const pickOrder = [0, 1, 1, 0, 0, 1, 1, 0, 0, 1]; // 0 = team1, 1 = team2
  pickOrder.forEach((teamIndex, i) => {
    const team = teamIndex === 0 ? match.team1 : match.team2;
    const playerIndex = Math.floor(i / 2) % team.length;
    turnOrder.push(team[playerIndex].id);
  });
  
  return turnOrder;
}

// Método para notificar jogadores sobre fase de draft
private notifyDraftPhase(match: Match, draftData: any): void {
  const allPlayers = [...match.team1, ...match.team2];
  
  allPlayers.forEach(player => {
    if (player.websocket && player.id > 0) {
      try {
        player.websocket.send(JSON.stringify({
          type: 'draft_started',
          data: draftData
        }));
      } catch (error) {
        console.error(`Erro ao notificar draft para ${player.summonerName}:`, error);
      }
    }
  });
}

// Método para processar ação do draft
async processDraftAction(matchId: number, playerId: number, championId: number, action: 'pick' | 'ban'): Promise<void> {
  const match = this.activeMatches.get(matchId);
  if (!match) {
    throw new Error('Partida não encontrada');
  }

  console.log(`🎯 Draft action: ${action} champion ${championId} by player ${playerId} in match ${matchId}`);

  // Aqui você implementaria a lógica do draft
  // Por enquanto, apenas notificar outros jogadores
  const allPlayers = [...match.team1, ...match.team2];
  
  allPlayers.forEach(player => {
    if (player.websocket && player.id > 0 && player.id !== playerId) {
      try {
        player.websocket.send(JSON.stringify({
          type: 'draft_action',
          data: {
            matchId,
            playerId,
            championId,
            action
          }
        }));
      } catch (error) {
        console.error(`Erro ao notificar ação do draft para ${player.summonerName}:`, error);
      }
    }
  });
}

// Método para adicionar jogador à fila via Discord
async addPlayerToDiscordQueue(websocket: WebSocket, requestData: any): Promise<void> {
  try {
    // Validar dados da requisição
    if (!requestData || !requestData.discordId || !requestData.gameName || !requestData.tagLine) {
      throw new Error('Dados do Discord incompletos');
    }

    // Buscar link Discord-LoL
    const discordLink = await this.dbManager.getDiscordLink(requestData.discordId);
    if (!discordLink) {
      throw new Error('Conta Discord não vinculada ao LoL');
    }

    // Verificar se o link ainda é válido
    const isValid = await this.dbManager.verifyDiscordLink(
      requestData.discordId, 
      requestData.gameName, 
      requestData.tagLine
    );

    if (!isValid) {
      throw new Error('Dados do LoL não correspondem ao link Discord');
    }

    // Buscar jogador no banco
    const player = await this.dbManager.getPlayerBySummonerName(discordLink.summoner_name);
    if (!player) {
      throw new Error('Jogador não encontrado no banco de dados');
    }

    // Verificar se já está na fila
    const existingPlayerIndex = this.queue.findIndex(p => p.id === player.id);
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
      id: player.id!,
      summonerName: player.summoner_name,
      region: player.region,
      currentMMR: player.custom_lp || 0,
      joinTime: new Date(),
      websocket: websocket,
      queuePosition: this.queue.length + 1,
      preferences: requestData.preferences || { primaryLane: 'fill', secondaryLane: 'fill' }
    };

    this.queue.push(queuedPlayer);

    // Persistir entrada na fila no banco
    await this.dbManager.addPlayerToQueue(
      queuedPlayer.id,
      queuedPlayer.summonerName,
      queuedPlayer.region,
      queuedPlayer.currentMMR,
      queuedPlayer.preferences
    );

    // Adicionar atividade
    const primaryLaneName = this.getLaneDisplayName(queuedPlayer.preferences?.primaryLane);
    this.addActivity(
      'player_joined',
      `${player.summoner_name} entrou na fila via Discord como ${primaryLaneName}`,
      player.summoner_name,
      undefined,
      queuedPlayer.preferences?.primaryLane
    );

    // Notificar jogador
    websocket.send(JSON.stringify({
      type: 'queue_joined',
      data: {
        position: this.queue.length,
        estimatedWait: this.calculateEstimatedWaitTime(),
        queueStatus: await this.getQueueStatus()
      }
    }));

    // Broadcast atualização da fila
    await this.broadcastQueueUpdate();

    console.log(`✅ ${player.summoner_name} entrou na fila via Discord (Posição: ${this.queue.length})`);

  } catch (error: any) {
    console.error('Erro ao adicionar jogador à fila via Discord:', error);
    websocket.send(JSON.stringify({
      type: 'error',
      message: 'Falha ao entrar na fila via Discord: ' + error.message
    }));
  }
}

// Método para obter fila atual
public getQueue(): QueuedPlayer[] {
  return [...this.queue];
}

// Método para remover jogador da fila por ID ou nome
public removePlayerFromQueueById(playerId?: number, summonerName?: string): boolean {
  let playerIndex = -1;

  if (playerId) {
    playerIndex = this.queue.findIndex(p => p.id === playerId);
  } else if (summonerName) {
    playerIndex = this.queue.findIndex(p => p.summonerName === summonerName);
  }

  if (playerIndex !== -1) {
    const player = this.queue[playerIndex];
    this.queue.splice(playerIndex, 1);

    // Persistir saída da fila no banco
    this.dbManager.removePlayerFromQueue(player.id).catch(error => {
      console.error('❌ Erro ao remover jogador da fila persistente:', error);
    });

    // Adicionar atividade
    this.addActivity(
      'player_left',
      `${player.summonerName} removido da fila`,
      player.summonerName
    );

    // Atualizar posições na fila
    this.queue.forEach((p, index) => {
      p.queuePosition = index + 1;
    });

    // Broadcast atualização da fila
    this.broadcastQueueUpdate();

    console.log(`➖ ${player.summonerName} removido da fila`);
    return true;
  }

  return false;
}

// Método para desligar o serviço
public shutdown(): void {
  this.isActive = false;
  
  if (this.matchmakingInterval) {
    clearInterval(this.matchmakingInterval);
    this.matchmakingInterval = null;
  }
  
  if (this.cleanupInterval) {
    clearInterval(this.cleanupInterval);
    this.cleanupInterval = null;
  }

  // Limpar timeouts das partidas ativas
  this.activeMatches.forEach(match => {
    if (match.acceptTimeout) {
      clearTimeout(match.acceptTimeout);
    }
  });

  console.log('🛑 Serviço de matchmaking desligado');
}

// Método para verificar se o serviço está ativo
public isServiceActive(): boolean {
  return this.isActive;
} 