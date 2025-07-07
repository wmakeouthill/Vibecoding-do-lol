import { WebSocket } from 'ws';
import { DatabaseManager } from '../database/DatabaseManager';

interface DraftData {
  matchId: number;
  team1: DraftPlayer[];
  team2: DraftPlayer[];
  averageMMR: { team1: number; team2: number };
  balanceQuality: number;
  autofillCount: number;
  createdAt: string;
}

interface DraftPlayer {
  summonerName: string;
  assignedLane: string;
  teamIndex: number;
  mmr: number;
  primaryLane: string;
  secondaryLane: string;
  isAutofill: boolean;
  championId?: number; // ✅ NOVO: Campeão escolhido no draft
}

interface DraftPhase {
  phase: 'bans' | 'picks';
  team: number; // 1 ou 2
  action: 'ban' | 'pick';
  playerIndex: number;
}

export class DraftService {
  private dbManager: DatabaseManager;
  private wss: any; // WebSocketServer
  private activeDrafts = new Map<number, DraftData>();
  private monitoringInterval: NodeJS.Timeout | null = null;

  constructor(dbManager: DatabaseManager, wss?: any) {
    this.dbManager = dbManager;
    this.wss = wss;
  }

  async initialize(): Promise<void> {
    console.log('🎯 [Draft] Inicializando DraftService...');
    
    // Monitorar partidas aceitas que precisam iniciar draft
    this.startDraftMonitoring();
    
    console.log('✅ [Draft] DraftService inicializado com sucesso');
  }

  // ✅ CORRIGIDO: Iniciar draft para partida aceita
  async startDraft(matchId: number): Promise<void> {
    console.log(`🎯 [Draft] Iniciando draft para partida ${matchId}...`);
    
    try {
      // 1. Buscar partida no banco
      const match = await this.dbManager.getCustomMatchById(matchId);
      if (!match) {
        throw new Error(`Partida ${matchId} não encontrada`);
      }

      // 2. ✅ CORREÇÃO: Tentar usar draft_data se disponível (já balanceado)
      let draftData: DraftData | null = null;
      
      if (match.draft_data) {
        try {
          const savedDraftData = typeof match.draft_data === 'string' 
            ? JSON.parse(match.draft_data) 
            : match.draft_data;
          
          console.log(`🔍 [Draft] Dados do draft encontrados no banco:`, {
            team1Count: savedDraftData.lanes?.team1?.length || 0,
            team2Count: savedDraftData.lanes?.team2?.length || 0,
            hasTeammates: !!savedDraftData.teammates,
            hasEnemies: !!savedDraftData.enemies
          });
          
          // ✅ CORREÇÃO: Usar dados já balanceados do MatchmakingService
          if (savedDraftData.lanes?.team1 && savedDraftData.lanes?.team2) {
            draftData = {
              matchId,
              team1: savedDraftData.lanes.team1.map((p: any, index: number) => ({
                summonerName: p.player,
                assignedLane: p.lane,
                teamIndex: index, // 0-4 para team1
                mmr: p.mmr,
                primaryLane: p.primaryLane || 'fill',
                secondaryLane: p.secondaryLane || 'fill',
                isAutofill: p.isAutofill || false
              })),
              team2: savedDraftData.lanes.team2.map((p: any, index: number) => ({
                summonerName: p.player,
                assignedLane: p.lane,
                teamIndex: index + 5, // 5-9 para team2
                mmr: p.mmr,
                primaryLane: p.primaryLane || 'fill',
                secondaryLane: p.secondaryLane || 'fill',
                isAutofill: p.isAutofill || false
              })),
              averageMMR: {
                team1: savedDraftData.averageMMR || 1200,
                team2: savedDraftData.averageMMR || 1200
              },
              balanceQuality: 0,
              autofillCount: 0,
              createdAt: new Date().toISOString()
            };
            
            console.log(`✅ [Draft] Usando dados já balanceados do MatchmakingService`);
          }
        } catch (error) {
          console.warn(`⚠️ [Draft] Erro ao parsear draft_data, usando fallback:`, error);
        }
      }
      
      // 3. ✅ FALLBACK: Se não temos dados balanceados, usar método antigo
      if (!draftData) {
        console.log(`🔍 [Draft] Dados balanceados não encontrados, usando método de fallback...`);
        
        // Parsear jogadores dos times
        let team1Players: string[] = [];
        let team2Players: string[] = [];
        
        try {
          team1Players = typeof match.team1_players === 'string' 
            ? JSON.parse(match.team1_players) 
            : (match.team1_players || []);
          team2Players = typeof match.team2_players === 'string' 
            ? JSON.parse(match.team2_players) 
            : (match.team2_players || []);
        } catch (parseError) {
          throw new Error('Erro ao parsear dados dos times');
        }

        // Buscar dados dos jogadores na fila para balanceamento
        const queuePlayers = await this.dbManager.getActiveQueuePlayers();
        const allPlayers = [...team1Players, ...team2Players];
        const matchPlayers = queuePlayers.filter(p => allPlayers.includes(p.summoner_name));

        console.log(`🔍 [Draft] Jogadores na fila: ${queuePlayers.length}`);
        console.log(`🔍 [Draft] Jogadores da partida: ${allPlayers.length}`);
        console.log(`🔍 [Draft] Jogadores encontrados na fila: ${matchPlayers.length}`);

        if (matchPlayers.length !== 10) {
          console.error(`❌ [Draft] Jogadores faltando: ${10 - matchPlayers.length}`);
          throw new Error('Nem todos os jogadores estão disponíveis para o draft');
        }

        // Preparar dados completos do draft usando método antigo
        draftData = await this.prepareDraftData(matchId, team1Players, team2Players, matchPlayers);
      }
      
      if (!draftData) {
        throw new Error('Erro ao preparar dados do draft');
      }

      // 4. ✅ CORREÇÃO: Atualizar partida no banco com dados do draft
      await this.dbManager.updateCustomMatch(matchId, {
        draft_data: JSON.stringify(draftData),
        status: 'draft'
      });

      // 5. ✅ CORREÇÃO: Remover jogadores da fila usando os nomes dos jogadores
      const allPlayerNames = [...draftData.team1.map(p => p.summonerName), ...draftData.team2.map(p => p.summonerName)];
      for (const playerName of allPlayerNames) {
        await this.dbManager.removePlayerFromQueueBySummonerName(playerName);
      }
      console.log('🗑️ [Draft] Todos os jogadores removidos da fila (draft iniciado)');

      // 6. Adicionar ao tracking local
      this.activeDrafts.set(matchId, draftData);

      // 7. ✅ CORREÇÃO: Notificar frontend sobre início do draft com dados completos
      this.notifyDraftStarted(matchId, draftData);

      console.log(`✅ [Draft] Draft iniciado com sucesso para partida ${matchId} com dados completos`);

    } catch (error) {
      console.error(`❌ [Draft] Erro ao iniciar draft para partida ${matchId}:`, error);
      throw error;
    }
  }

  // ✅ Preparar dados completos do draft com balanceamento
  private async prepareDraftData(matchId: number, team1Players: string[], team2Players: string[], queuePlayers: any[]): Promise<DraftData | null> {
    console.log(`🎯 [Draft] Preparando dados do draft para partida ${matchId}...`);
    
    try {
      // Criar mapa de dados dos jogadores
      const playerDataMap = new Map<string, any>();
      
      for (const queuePlayer of queuePlayers) {
        const playerData = {
          summonerName: queuePlayer.summoner_name,
          mmr: queuePlayer.custom_lp || 1000,
          primaryLane: queuePlayer.primary_lane || 'fill',
          secondaryLane: queuePlayer.secondary_lane || 'fill'
        };
        playerDataMap.set(queuePlayer.summoner_name, playerData);
      }

      // Preparar dados dos times com informações completas
      const allPlayerData = [...team1Players, ...team2Players].map(playerName => {
        const data = playerDataMap.get(playerName);
        if (!data) {
          console.warn(`⚠️ [Draft] Dados não encontrados para jogador: ${playerName}`);
          return {
            summonerName: playerName,
            mmr: 1000,
            primaryLane: 'fill',
            secondaryLane: 'fill'
          };
        }
        return data;
      });

      // Balancear times e atribuir lanes baseado em MMR e preferências
      const balancedData = this.balanceTeamsAndAssignLanes(allPlayerData);
      
      if (!balancedData) {
        console.error('❌ [Draft] Erro ao balancear times e atribuir lanes');
        return null;
      }

      // Calcular MMR médio dos times
      const team1MMR = balancedData.team1.reduce((sum, p) => sum + p.mmr, 0) / balancedData.team1.length;
      const team2MMR = balancedData.team2.reduce((sum, p) => sum + p.mmr, 0) / balancedData.team2.length;

      // Preparar dados completos do draft
      const draftData: DraftData = {
        matchId,
        team1: balancedData.team1.map((p, index) => ({
          summonerName: p.summonerName,
          assignedLane: p.assignedLane,
          teamIndex: index, // 0-4 para team1
          mmr: p.mmr,
          primaryLane: p.primaryLane,
          secondaryLane: p.secondaryLane,
          isAutofill: p.isAutofill
        })),
        team2: balancedData.team2.map((p, index) => ({
          summonerName: p.summonerName,
          assignedLane: p.assignedLane,
          teamIndex: index + 5, // 5-9 para team2
          mmr: p.mmr,
          primaryLane: p.primaryLane,
          secondaryLane: p.secondaryLane,
          isAutofill: p.isAutofill
        })),
        averageMMR: {
          team1: team1MMR,
          team2: team2MMR
        },
        balanceQuality: Math.abs(team1MMR - team2MMR),
        autofillCount: balancedData.team1.filter(p => p.isAutofill).length + 
                       balancedData.team2.filter(p => p.isAutofill).length,
        createdAt: new Date().toISOString()
      };

      console.log(`✅ [Draft] Dados do draft preparados:`, {
        matchId,
        team1MMR: Math.round(team1MMR),
        team2MMR: Math.round(team2MMR),
        balanceQuality: Math.round(draftData.balanceQuality),
        autofillCount: draftData.autofillCount,
        team1Lanes: draftData.team1.map(p => p.assignedLane),
        team2Lanes: draftData.team2.map(p => p.assignedLane)
      });

      return draftData;

    } catch (error) {
      console.error(`❌ [Draft] Erro ao preparar dados do draft:`, error);
      return null;
    }
  }

  // ✅ Balancear times e atribuir lanes baseado em MMR e preferências
  private balanceTeamsAndAssignLanes(players: any[]): { team1: any[], team2: any[] } | null {
    console.log('🎯 [Draft] Balanceando times e atribuindo lanes...');
    
    if (players.length !== 10) {
      console.error(`❌ [Draft] Número incorreto de jogadores: ${players.length}`);
      return null;
    }

    // Ordenar jogadores por MMR (maior primeiro)
    const sortedPlayers = [...players].sort((a, b) => b.mmr - a.mmr);
    
    // Atribuir lanes únicas baseado em MMR e preferências
    const playersWithLanes = this.assignLanesOptimized(sortedPlayers);
    
    if (playersWithLanes.length !== 10) {
      console.error('❌ [Draft] Erro na atribuição de lanes');
      return null;
    }
    
    // Verificar distribuição de lanes (2 de cada)
    const laneCount: { [key: string]: number } = {};
    playersWithLanes.forEach(p => {
      laneCount[p.assignedLane] = (laneCount[p.assignedLane] || 0) + 1;
    });
    
    const hasCorrectDistribution = Object.values(laneCount).every(count => count === 2);
    if (!hasCorrectDistribution) {
      console.error('❌ [Draft] Distribuição incorreta de lanes:', laneCount);
      return null;
    }
    
    // Balancear times por MMR mantendo lanes únicas
    const team1: any[] = [];
    const team2: any[] = [];
    
    // Distribuir alternadamente para balancear MMR
    for (let i = 0; i < playersWithLanes.length; i++) {
      if (i % 2 === 0) {
        team1.push(playersWithLanes[i]);
      } else {
        team2.push(playersWithLanes[i]);
      }
    }
    
    console.log('✅ [Draft] Times balanceados:', {
      team1: team1.map(p => ({ name: p.summonerName, lane: p.assignedLane, mmr: p.mmr, autofill: p.isAutofill })),
      team2: team2.map(p => ({ name: p.summonerName, lane: p.assignedLane, mmr: p.mmr, autofill: p.isAutofill }))
    });
    
    return { team1, team2 };
  }

  // ✅ Atribuir lanes otimizado
  private assignLanesOptimized(players: any[]): any[] {
    const laneOrder = ['top', 'jungle', 'mid', 'bot', 'support'];
    const laneAssignments: { [key: string]: number } = { 'top': 0, 'jungle': 0, 'mid': 0, 'bot': 0, 'support': 0 };
    const playersWithLanes: any[] = [];
    
    // Atribuir lanes baseado em MMR e preferências
    for (const player of players) {
      const primaryLane = player.primaryLane || 'fill';
      const secondaryLane = player.secondaryLane || 'fill';
      
      let assignedLane = "";
      let isAutofill = false;
      
      // Tentar lane primária
      if (primaryLane !== 'fill' && laneAssignments[primaryLane] < 2) {
        assignedLane = primaryLane;
        isAutofill = false;
        laneAssignments[primaryLane]++;
      }
      // Tentar lane secundária
      else if (secondaryLane !== 'fill' && laneAssignments[secondaryLane] < 2) {
        assignedLane = secondaryLane;
        isAutofill = false;
        laneAssignments[secondaryLane]++;
      }
      // Autofill: encontrar primeira lane disponível
      else {
        for (const lane of laneOrder) {
          if (laneAssignments[lane] < 2) {
            assignedLane = lane;
            isAutofill = true;
            laneAssignments[lane]++;
            break;
          }
        }
      }
      
      const playerWithLane = {
        ...player,
        assignedLane,
        isAutofill
      };
      
      playersWithLanes.push(playerWithLane);
      
      console.log(`🎯 [Draft] ${player.summonerName} (MMR: ${player.mmr}) → ${assignedLane} ${isAutofill ? '(autofill)' : '(preferência)'}`);
    }
    
    console.log('✅ [Draft] Atribuição final:', laneAssignments);
    return playersWithLanes;
  }

  // ✅ CORRIGIDO: Processar ação de draft (pick/ban) com salvamento no banco
  async processDraftAction(matchId: number, playerId: number, championId: number, action: 'pick' | 'ban'): Promise<void> {
    console.log(`🎯 [Draft] Processando ${action} do campeão ${championId} por jogador ${playerId} na partida ${matchId}`);
    
    try {
      // 1. Buscar draft ativo
      const draftData = this.activeDrafts.get(matchId);
      if (!draftData) {
        throw new Error(`Draft ${matchId} não encontrado ou não ativo`);
      }

      // 2. Buscar partida no banco para atualizar pick_ban_data
      const match = await this.dbManager.getCustomMatchById(matchId);
      if (!match) {
        throw new Error(`Partida ${matchId} não encontrada no banco`);
      }

      // 3. Carregar dados atuais de pick/ban
      let pickBanData: any = {};
      try {
        if (match.pick_ban_data) {
          pickBanData = typeof match.pick_ban_data === 'string' 
            ? JSON.parse(match.pick_ban_data) 
            : match.pick_ban_data;
        }
      } catch (error) {
        console.warn(`⚠️ [Draft] Erro ao parsear pick_ban_data existente:`, error);
        pickBanData = {};
      }

      // 4. Inicializar estrutura se não existir
      if (!pickBanData.picks) pickBanData.picks = { team1: {}, team2: {} };
      if (!pickBanData.bans) pickBanData.bans = { team1: [], team2: [] };
      if (!pickBanData.actions) pickBanData.actions = [];

      // 5. ✅ CORREÇÃO: Identificar jogador pelos dados do draft (usando teamIndex)
      const allPlayers = [...draftData.team1, ...draftData.team2];
      const player = allPlayers.find(p => p.teamIndex === playerId);
      
      if (!player) {
        console.error(`❌ [Draft] Jogador com teamIndex ${playerId} não encontrado:`, {
          playerId,
          availableIndexes: allPlayers.map(p => p.teamIndex),
          team1Indexes: draftData.team1.map(p => p.teamIndex),
          team2Indexes: draftData.team2.map(p => p.teamIndex)
        });
        throw new Error(`Jogador ${playerId} não encontrado na partida ${matchId}`);
      }

      // 6. ✅ CORREÇÃO: Determinar time baseado no teamIndex (0-4 = team1, 5-9 = team2)
      const isTeam1 = player.teamIndex <= 4;
      const teamKey = isTeam1 ? 'team1' : 'team2';
      const teamNumber = isTeam1 ? 1 : 2;
      
      console.log(`🔍 [Draft] Jogador identificado:`, {
        playerId,
        playerName: player.summonerName,
        teamIndex: player.teamIndex,
        lane: player.assignedLane,
        isTeam1,
        teamKey,
        teamNumber,
        action,
        championId
      });

      // 7. ✅ CORREÇÃO: Salvar ação baseada no tipo e time
      const actionData = {
        playerId,
        playerName: player.summonerName,
        teamIndex: player.teamIndex,
        lane: player.assignedLane,
        championId,
        action,
        team: teamNumber,
        timestamp: Date.now()
      };

      // 8. ✅ CORREÇÃO: Salvar pick/ban específico
      if (action === 'pick') {
        pickBanData.picks[teamKey][player.assignedLane] = {
          championId,
          playerId,
          playerName: player.summonerName,
          teamIndex: player.teamIndex,
          lane: player.assignedLane,
          timestamp: Date.now()
        };
        console.log(`✅ [Draft] Pick salvo para ${teamKey}.${player.assignedLane}:`, pickBanData.picks[teamKey][player.assignedLane]);
      } else if (action === 'ban') {
        pickBanData.bans[teamKey].push({
          championId,
          playerId,
          playerName: player.summonerName,
          teamIndex: player.teamIndex,
          lane: player.assignedLane,
          timestamp: Date.now()
        });
        console.log(`✅ [Draft] Ban salvo para ${teamKey}:`, pickBanData.bans[teamKey]);
      }

      // 9. Adicionar à lista de ações sequenciais
      pickBanData.actions.push(actionData);

      // 10. ✅ NOVO: Atualizar draft_data com campeão escolhido (somente para picks)
      let updatedDraftData = draftData;
      if (action === 'pick') {
        // Atualizar o jogador no draft_data com o campeão escolhido
        const isTeam1Player = player.teamIndex <= 4;
        const teamArray = isTeam1Player ? updatedDraftData.team1 : updatedDraftData.team2;
        const playerInTeam = teamArray.find(p => p.teamIndex === player.teamIndex);
        
        if (playerInTeam) {
          playerInTeam.championId = championId;
          console.log(`✅ [Draft] Campeão ${championId} atribuído ao jogador ${playerInTeam.summonerName} (${playerInTeam.assignedLane}) no draft_data`);
        }
      }

      // 11. ✅ CORREÇÃO: Salvar no banco de dados (pick_ban_data + draft_data atualizado)
      const updateData: any = {
        pick_ban_data: JSON.stringify(pickBanData)
      };
      
      // Atualizar draft_data somente se foi um pick
      if (action === 'pick') {
        updateData.draft_data = JSON.stringify(updatedDraftData);
      }
      
      await this.dbManager.updateCustomMatch(matchId, updateData);

      console.log(`✅ [Draft] ${action} salvo no banco: ${player.summonerName} (${teamKey}, ${player.assignedLane}) ${action === 'pick' ? 'escolheu' : 'baniu'} campeão ${championId}`);

      // 12. ✅ CORREÇÃO: Notificar frontend sobre a ação com dados completos
      this.notifyDraftAction(matchId, playerId, championId, action, {
        player: player.summonerName,
        lane: player.assignedLane,
        team: teamNumber,
        teamKey,
        teamIndex: player.teamIndex,
        championId,
        action,
        pickBanData,
        draftData: updatedDraftData, // ✅ NOVO: Enviar draft_data atualizado
        totalPicks: Object.keys(pickBanData.picks.team1).length + Object.keys(pickBanData.picks.team2).length,
        totalBans: pickBanData.bans.team1.length + pickBanData.bans.team2.length
      });

    } catch (error) {
      console.error(`❌ [Draft] Erro ao processar ação de draft:`, error);
      throw error;
    }
  }

  // ✅ Finalizar draft e iniciar jogo
  async finalizeDraft(matchId: number, draftResults: any): Promise<void> {
    console.log(`🏁 [Draft] Finalizando draft da partida ${matchId}...`);
    
    try {
      // 1. Atualizar partida no banco com resultados do draft
      await this.dbManager.updateCustomMatch(matchId, {
        pick_ban_data: JSON.stringify(draftResults),
        status: 'in_progress'
      });

      // 2. Remover do tracking local
      this.activeDrafts.delete(matchId);

      // 3. Notificar frontend que jogo está iniciando
      this.notifyGameStarting(matchId, draftResults);

      console.log(`✅ [Draft] Draft finalizado, partida ${matchId} iniciando...`);

    } catch (error) {
      console.error(`❌ [Draft] Erro ao finalizar draft:`, error);
      throw error;
    }
  }

  // ✅ NOVO: Cancelar draft e remover partida do banco
  async cancelDraft(matchId: number, reason: string): Promise<void> {
    console.log(`🚫 [Draft] Cancelando draft ${matchId}: ${reason}`);
    
    try {
      // 1. Buscar dados do draft antes de cancelar
      const draftData = this.activeDrafts.get(matchId);
      
      // 2. ✅ CORREÇÃO: Remover partida do banco de dados (igual ao recusar match-found)
      await this.dbManager.deleteCustomMatch(matchId);
      console.log(`✅ [Draft] Partida ${matchId} removida do banco de dados`);
      
      // 3. Remover do tracking local
      this.activeDrafts.delete(matchId);
      
      // 4. ✅ NOVO: Se temos dados do draft, retornar jogadores para a fila
      if (draftData) {
        const allPlayerNames = [
          ...draftData.team1.map(p => p.summonerName),
          ...draftData.team2.map(p => p.summonerName)
        ];
        
        console.log(`🔄 [Draft] Retornando ${allPlayerNames.length} jogadores para a fila...`);
        
        // Buscar dados dos jogadores para retorná-los à fila
        for (const playerName of allPlayerNames) {
          try {
            // Buscar jogador no banco
            const player = await this.dbManager.getPlayerBySummonerName(playerName);
            if (player && player.id) {
              // Adicionar de volta à fila com preferências padrão
              await this.dbManager.addPlayerToQueue(
                player.id,
                playerName,
                player.region || 'br1',
                player.custom_lp || 1200,
                { primaryLane: 'fill', secondaryLane: 'fill' }
              );
              console.log(`✅ [Draft] Jogador ${playerName} retornado à fila`);
            }
          } catch (error) {
            console.error(`❌ [Draft] Erro ao retornar jogador ${playerName} à fila:`, error);
          }
        }
      }
      
      // 5. Notificar frontend sobre cancelamento
      this.notifyDraftCancelled(matchId, reason);
      
      console.log(`✅ [Draft] Draft ${matchId} cancelado com sucesso`);
      
    } catch (error) {
      console.error(`❌ [Draft] Erro ao cancelar draft ${matchId}:`, error);
      throw error;
    }
  }

  // ✅ Monitoramento de partidas aceitas
  private startDraftMonitoring(): void {
    console.log('🔍 [Draft] Iniciando monitoramento de partidas aceitas...');
    
    this.monitoringInterval = setInterval(async () => {
      await this.monitorAcceptedMatches();
    }, 2000); // Verificar a cada 2 segundos
  }

  private async monitorAcceptedMatches(): Promise<void> {
    try {
      // Buscar partidas com status 'accepted' que precisam iniciar draft
      const acceptedMatches = await this.dbManager.getCustomMatchesByStatus('accepted');
      
      for (const match of acceptedMatches) {
        if (!this.activeDrafts.has(match.id)) {
          console.log(`🎯 [Draft] Partida ${match.id} aceita detectada, iniciando draft...`);
          await this.startDraft(match.id);
        }
      }
    } catch (error) {
      console.error('❌ [Draft] Erro no monitoramento:', error);
    }
  }

  // ✅ CORREÇÃO: Notificações WebSocket com dados estruturados como match-found
  private notifyDraftStarted(matchId: number, draftData: DraftData): void {
    if (!this.wss) return;

    // ✅ CORREÇÃO: Preparar dados estruturados EXATAMENTE igual ao match-found
    const teammates = draftData.team1.map((player, index) => ({
      id: player.summonerName,
      summonerName: player.summonerName,
      name: player.summonerName,
      assignedLane: player.assignedLane,
      lane: player.assignedLane,
      teamIndex: player.teamIndex, // 0-4 para team1
      index: index, // ✅ NOVO: Índice no array (0-4)
      mmr: player.mmr,
      primaryLane: player.primaryLane,
      secondaryLane: player.secondaryLane,
      isAutofill: player.isAutofill,
      team: 'blue', // ✅ NOVO: Identificação do time igual ao match-found
      side: 'left', // ✅ NOVO: Time azul fica do lado esquerdo
      isBot: player.summonerName.includes('#BOT'), // ✅ NOVO: Identificar bots
      championId: player.championId || null // ✅ NOVO: Campeão escolhido
    }));

    const enemies = draftData.team2.map((player, index) => ({
      id: player.summonerName,
      summonerName: player.summonerName,
      name: player.summonerName,
      assignedLane: player.assignedLane,
      lane: player.assignedLane,
      teamIndex: player.teamIndex, // 5-9 para team2
      index: index, // ✅ NOVO: Índice no array (0-4)
      mmr: player.mmr,
      primaryLane: player.primaryLane,
      secondaryLane: player.secondaryLane,
      isAutofill: player.isAutofill,
      team: 'red', // ✅ NOVO: Identificação do time igual ao match-found
      side: 'right', // ✅ NOVO: Time vermelho fica do lado direito
      isBot: player.summonerName.includes('#BOT'), // ✅ NOVO: Identificar bots
      championId: player.championId || null // ✅ NOVO: Campeão escolhido
    }));

    // ✅ CORREÇÃO: Estruturar dados EXATAMENTE como match-found
    const message = {
      type: 'draft_started',
      data: {
        matchId,
        id: matchId, // ✅ COMPATIBILIDADE: Alguns componentes usam id
        // ✅ PRINCIPAL: Dados estruturados dos times (igual match-found)
        teammates,
        enemies,
        // ✅ COMPATIBILIDADE: Múltiplos formatos para garantir compatibilidade
        team1: teammates,
        team2: enemies,
        blueTeam: teammates,
        redTeam: enemies,
        // ✅ NOVO: Dados com posicionamento correto
        leftTeam: teammates, // Time azul fica à esquerda
        rightTeam: enemies,  // Time vermelho fica à direita
        // ✅ CORREÇÃO: Estatísticas detalhadas dos times (igual match-found)
        teamStats: {
          team1: {
            averageMMR: Math.round(draftData.averageMMR.team1),
            totalMMR: Math.round(draftData.averageMMR.team1 * 5),
            players: teammates.length,
            lanes: teammates.map(p => p.assignedLane).sort()
          },
          team2: {
            averageMMR: Math.round(draftData.averageMMR.team2),
            totalMMR: Math.round(draftData.averageMMR.team2 * 5),
            players: enemies.length,
            lanes: enemies.map(p => p.assignedLane).sort()
          }
        },
        // ✅ CORREÇÃO: Informações de balanceamento (igual match-found)
        balancingInfo: {
          mmrDifference: Math.abs(draftData.averageMMR.team1 - draftData.averageMMR.team2),
          isWellBalanced: Math.abs(draftData.averageMMR.team1 - draftData.averageMMR.team2) <= 100,
          autofillCount: {
            team1: teammates.filter(p => p.isAutofill).length,
            team2: enemies.filter(p => p.isAutofill).length
          }
        },
        // ✅ CAMPOS ESPECÍFICOS DO DRAFT
        averageMMR: draftData.averageMMR,
        balanceQuality: draftData.balanceQuality,
        autofillCount: draftData.autofillCount,
        phase: 'draft', // ✅ NOVO: Fase atual
        message: 'Draft iniciado! Todos os jogadores aceitaram a partida.',
        // ✅ CORREÇÃO: Fases do draft para o componente
        phases: this.generateDraftPhases(),
        // ✅ NOVO: Informações adicionais para o frontend
        gameMode: 'RANKED_SOLO_5x5',
        mapId: 11, // Summoner's Rift
        queueType: 'RANKED',
        // ✅ NOVO: Estrutura inicial dos picks/bans
        picks: { team1: {}, team2: {} },
        bans: { team1: [], team2: [] },
        // ✅ COMPATIBILIDADE: Campo draftData para compatibilidade com código antigo
        draftData
      },
      timestamp: Date.now()
    };

    this.broadcastMessage(message);
    console.log(`📢 [Draft] Notificação de draft iniciado enviada (${matchId}) com dados estruturados:`, {
      teammates: teammates.length,
      enemies: enemies.length,
      team1MMR: Math.round(draftData.averageMMR.team1),
      team2MMR: Math.round(draftData.averageMMR.team2),
      team1Lanes: teammates.map(p => `${p.summonerName}:${p.assignedLane}`),
      team2Lanes: enemies.map(p => `${p.summonerName}:${p.assignedLane}`),
      leftTeam: 'blue (teammates)',
      rightTeam: 'red (enemies)'
    });
  }

  private notifyDraftAction(matchId: number, playerId: number, championId: number, action: string, extraData?: any): void {
    if (!this.wss) return;

    const message = {
      type: 'draft_action',
      data: {
        matchId,
        playerId,
        championId,
        action,
        // ✅ CORREÇÃO: Incluir dados detalhados da ação
        player: extraData?.player,
        lane: extraData?.lane,
        team: extraData?.team,
        teamKey: extraData?.teamKey,
        teamIndex: extraData?.teamIndex,
        // ✅ CORREÇÃO: Incluir dados completos de picks/bans para o frontend
        picks: extraData?.pickBanData?.picks || { team1: {}, team2: {} },
        bans: extraData?.pickBanData?.bans || { team1: [], team2: [] },
        // ✅ CORREÇÃO: Incluir informações de progresso
        totalPicks: extraData?.totalPicks || 0,
        totalBans: extraData?.totalBans || 0,
        // ✅ CORREÇÃO: Incluir se é bot para o frontend
        isBot: extraData?.player?.includes('#BOT') || false
      },
      timestamp: Date.now()
    };

    this.broadcastMessage(message);
    console.log(`📢 [Draft] Notificação de ação enviada:`, {
      matchId,
      playerId,
      championId,
      action,
      player: extraData?.player,
      lane: extraData?.lane,
      team: extraData?.team,
      teamKey: extraData?.teamKey,
      teamIndex: extraData?.teamIndex,
      totalPicks: extraData?.totalPicks,
      totalBans: extraData?.totalBans,
      picksSaved: extraData?.pickBanData?.picks ? 'YES' : 'NO'
    });
  }

  private notifyGameStarting(matchId: number, draftResults: any): void {
    if (!this.wss) return;

    const message = {
      type: 'game_starting',
      data: {
        matchId,
        draftResults,
        message: 'Draft finalizado! O jogo está iniciando...'
      },
      timestamp: Date.now()
    };

    this.broadcastMessage(message);
    console.log(`📢 [Draft] Notificação de início de jogo enviada (${matchId})`);
  }

  // ✅ NOVO: Notificar frontend sobre cancelamento do draft
  private notifyDraftCancelled(matchId: number, reason: string): void {
    if (!this.wss) return;

    const message = {
      type: 'draft_cancelled',
      data: {
        matchId,
        reason,
        message: `Draft cancelado: ${reason}`
      },
      timestamp: Date.now()
    };

    this.broadcastMessage(message);
    console.log(`📢 [Draft] Notificação de cancelamento enviada (${matchId}): ${reason}`);
  }

  private broadcastMessage(message: any): void {
    if (!this.wss?.clients) return;

    this.wss.clients.forEach((client: WebSocket) => {
      if (client.readyState === WebSocket.OPEN) {
        try {
          client.send(JSON.stringify(message));
        } catch (error) {
          console.error('❌ [Draft] Erro ao enviar mensagem:', error);
        }
      }
    });
  }

  // ✅ Gerar fases do draft (sequência de picks/bans)
  private generateDraftPhases(): DraftPhase[] {
    return [
      // Primeira rodada de bans
      { phase: 'bans', team: 1, action: 'ban', playerIndex: 0 },
      { phase: 'bans', team: 2, action: 'ban', playerIndex: 0 },
      { phase: 'bans', team: 1, action: 'ban', playerIndex: 1 },
      { phase: 'bans', team: 2, action: 'ban', playerIndex: 1 },
      { phase: 'bans', team: 1, action: 'ban', playerIndex: 2 },
      { phase: 'bans', team: 2, action: 'ban', playerIndex: 2 },
      
      // Primeira rodada de picks
      { phase: 'picks', team: 1, action: 'pick', playerIndex: 0 },
      { phase: 'picks', team: 2, action: 'pick', playerIndex: 0 },
      { phase: 'picks', team: 2, action: 'pick', playerIndex: 1 },
      { phase: 'picks', team: 1, action: 'pick', playerIndex: 1 },
      { phase: 'picks', team: 1, action: 'pick', playerIndex: 2 },
      { phase: 'picks', team: 2, action: 'pick', playerIndex: 2 },
      
      // Segunda rodada de bans
      { phase: 'bans', team: 2, action: 'ban', playerIndex: 3 },
      { phase: 'bans', team: 1, action: 'ban', playerIndex: 3 },
      { phase: 'bans', team: 2, action: 'ban', playerIndex: 4 },
      { phase: 'bans', team: 1, action: 'ban', playerIndex: 4 },
      
      // Picks finais
      { phase: 'picks', team: 2, action: 'pick', playerIndex: 3 },
      { phase: 'picks', team: 1, action: 'pick', playerIndex: 3 },
      { phase: 'picks', team: 2, action: 'pick', playerIndex: 4 },
      { phase: 'picks', team: 1, action: 'pick', playerIndex: 4 }
    ];
  }

  // ✅ Shutdown
  shutdown(): void {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
    }

    this.activeDrafts.clear();
    console.log('🛑 [Draft] DraftService desligado');
  }
}
