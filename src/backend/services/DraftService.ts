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

      // 2. ✅ CORREÇÃO: Usar EXATAMENTE os dados já balanceados do match-found
      let draftData: DraftData | null = null;
      
      if (match.draft_data) {
        try {
          const savedDraftData = typeof match.draft_data === 'string' 
            ? JSON.parse(match.draft_data) 
            : match.draft_data;
          
          console.log(`🔍 [Draft] Dados encontrados no banco:`, {
            hasTeammates: !!savedDraftData.teammates,
            hasEnemies: !!savedDraftData.enemies,
            teammatesCount: savedDraftData.teammates?.length || 0,
            enemiesCount: savedDraftData.enemies?.length || 0
          });
          
          // ✅ PRIORIDADE 1: Usar dados do match-found (teammates/enemies) se disponíveis
          if (savedDraftData.teammates && savedDraftData.enemies) {
            console.log(`✅ [Draft] Usando dados EXATOS do match-found (teammates/enemies)`);
            
            // ✅ CORREÇÃO: Usar EXATAMENTE os índices do match-found (0-4 azul, 5-9 vermelho)
            // NÃO reordenar! Os dados já vêm na ordem correta: top, jungle, mid, adc, support
            
            // Função para normalizar lane (adc/bot são a mesma coisa)
            const normalizeLane = (lane: string): string => {
              if (lane === 'bot' || lane === 'adc') return 'adc';
              return lane;
            };
            
            // ✅ CORREÇÃO: Ordenar teammates por teamIndex (0-4) para manter ordem do match-found
            const sortedTeammates = [...savedDraftData.teammates].sort((a, b) => {
              const indexA = a.teamIndex !== undefined ? a.teamIndex : 999;
              const indexB = b.teamIndex !== undefined ? b.teamIndex : 999;
              return indexA - indexB;
            });
            
            // ✅ CORREÇÃO: Ordenar enemies por teamIndex (5-9) para manter ordem do match-found
            const sortedEnemies = [...savedDraftData.enemies].sort((a, b) => {
              const indexA = a.teamIndex !== undefined ? a.teamIndex : 999;
              const indexB = b.teamIndex !== undefined ? b.teamIndex : 999;
              return indexA - indexB;
            });
            
            draftData = {
              matchId,
              team1: sortedTeammates.map((p: any) => ({
                summonerName: p.summonerName,
                assignedLane: normalizeLane(p.assignedLane || p.lane), // ✅ CORREÇÃO: Normalizar lane
                teamIndex: p.teamIndex, // ✅ USAR O ÍNDICE EXATO DO MATCH-FOUND (0-4)
                mmr: p.mmr,
                primaryLane: p.primaryLane || 'fill',
                secondaryLane: p.secondaryLane || 'fill',
                isAutofill: p.isAutofill || false
              })),
              team2: sortedEnemies.map((p: any) => ({
                summonerName: p.summonerName,
                assignedLane: normalizeLane(p.assignedLane || p.lane), // ✅ CORREÇÃO: Normalizar lane
                teamIndex: p.teamIndex, // ✅ USAR O ÍNDICE EXATO DO MATCH-FOUND (5-9)
                mmr: p.mmr,
                primaryLane: p.primaryLane || 'fill',
                secondaryLane: p.secondaryLane || 'fill',
                isAutofill: p.isAutofill || false
              })),
              averageMMR: {
                team1: savedDraftData.teamStats?.team1?.averageMMR || 1200,
                team2: savedDraftData.teamStats?.team2?.averageMMR || 1200
              },
              balanceQuality: savedDraftData.balancingInfo?.mmrDifference || 0,
              autofillCount: (savedDraftData.balancingInfo?.autofillCount?.team1 || 0) + 
                           (savedDraftData.balancingInfo?.autofillCount?.team2 || 0),
              createdAt: new Date().toISOString()
            };
            
            console.log(`✅ [Draft] Times com índices EXATOS do match-found:`, {
              team1: draftData.team1.map(p => `${p.teamIndex}: ${p.summonerName} (${p.assignedLane})`),
              team2: draftData.team2.map(p => `${p.teamIndex}: ${p.summonerName} (${p.assignedLane})`)
            });
          }
          // ✅ FALLBACK: Usar dados antigos (lanes.team1/team2) se teammates/enemies não existirem
          else if (savedDraftData.lanes?.team1 && savedDraftData.lanes?.team2) {
            console.log(`⚠️ [Draft] Usando dados antigos (lanes.team1/team2) como fallback`);
            
            draftData = {
              matchId,
              team1: savedDraftData.lanes.team1.map((p: any, index: number) => ({
                summonerName: p.player,
                assignedLane: p.lane,
                teamIndex: index,
                mmr: p.mmr,
                primaryLane: p.primaryLane || 'fill',
                secondaryLane: p.secondaryLane || 'fill',
                isAutofill: p.isAutofill || false
              })),
              team2: savedDraftData.lanes.team2.map((p: any, index: number) => ({
                summonerName: p.player,
                assignedLane: p.lane,
                teamIndex: index + 5,
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

  // ✅ CORRIGIDO: Atribuir lanes na ordem EXATA da ranqueada
  private assignLanesOptimized(players: any[]): any[] {
    const laneOrder = ['top', 'jungle', 'mid', 'adc', 'support']; // ✅ ORDEM EXATA DA RANQUEADA
    const laneAssignments: { [key: string]: number } = { 'top': 0, 'jungle': 0, 'mid': 0, 'adc': 0, 'support': 0 };
    const playersWithLanes: any[] = [];
    
    // Normalizar lanes (bot = adc)
    const normalizeLane = (lane: string): string => {
      if (lane === 'bot') return 'adc';
      return lane;
    };
    
    // Atribuir lanes baseado em MMR e preferências
    for (const player of players) {
      const primaryLane = normalizeLane(player.primaryLane || 'fill');
      const secondaryLane = normalizeLane(player.secondaryLane || 'fill');
      
      let assignedLane = null;
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
      // Autofill: encontrar primeira lane disponível NA ORDEM CORRETA
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
    
    // ✅ CORREÇÃO: Ordenar jogadores por lane na ordem EXATA da ranqueada
    const sortedPlayers = playersWithLanes.sort((a, b) => {
      const indexA = laneOrder.indexOf(a.assignedLane);
      const indexB = laneOrder.indexOf(b.assignedLane);
      return (indexA === -1 ? 999 : indexA) - (indexB === -1 ? 999 : indexB);
    });
    
    console.log('✅ [Draft] Atribuição final (ordem ranqueada):', {
      lanes: laneAssignments,
      playerOrder: sortedPlayers.map(p => `${p.summonerName} (${p.assignedLane})`)
    });
    
    return sortedPlayers;
  }

  // ✅ CORRIGIDO: Processar ação de draft (pick/ban) com salvamento (sem necessidade de draft ativo)
  async processDraftAction(matchId: number, playerId: string, championId: number, action: 'pick' | 'ban'): Promise<void> {
    console.log(`🎯 [Draft] Processando ${action} do campeão ${championId} por jogador ${playerId} na partida ${matchId}`);
    
    try {
      // 1. ✅ NOVO: Buscar partida no banco (não precisa de draft ativo na memória)
      const match = await this.dbManager.getCustomMatchById(matchId);
      if (!match) {
        throw new Error(`Partida ${matchId} não encontrada no banco`);
      }

      console.log(`✅ [Draft] Partida encontrada: ${match.id} - Status: ${match.status}`);

      // 2. ✅ NOVO: Carregar dados atuais de pick/ban
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

      // 3. ✅ NOVO: Inicializar estrutura se não existir
      if (!pickBanData.team1Picks) pickBanData.team1Picks = [];
      if (!pickBanData.team1Bans) pickBanData.team1Bans = [];
      if (!pickBanData.team2Picks) pickBanData.team2Picks = [];
      if (!pickBanData.team2Bans) pickBanData.team2Bans = [];
      if (!pickBanData.actions) pickBanData.actions = [];

      // 4. ✅ CORREÇÃO: Determinar qual time e jogador com base nos dados da partida
      let teamIndex = 1; // Default team 1 (blue)
      let playerName = playerId; // Usar playerId como nome
      let playerLane = 'unknown';
      
      // ✅ NOVO: Buscar jogador nos dados da partida (team1_players e team2_players)
      let foundInTeam1 = false;
      let foundInTeam2 = false;
      let playerTeamIndex = -1;

      try {
        // Parsear listas de jogadores da partida
        const team1Players = typeof match.team1_players === 'string' 
          ? JSON.parse(match.team1_players) 
          : (match.team1_players || []);
        const team2Players = typeof match.team2_players === 'string' 
          ? JSON.parse(match.team2_players) 
          : (match.team2_players || []);

        console.log(`🔍 [Draft] Jogadores do time 1:`, team1Players);
        console.log(`🔍 [Draft] Jogadores do time 2:`, team2Players);
        console.log(`🔍 [Draft] Buscando jogador:`, playerId);

        // Verificar se o jogador está no team1
        const team1Index = team1Players.findIndex((player: string) => {
          return player === playerId || player.includes(playerId) || playerId.includes(player);
        });

        if (team1Index !== -1) {
          foundInTeam1 = true;
          teamIndex = 1;
          playerTeamIndex = team1Index;
          playerName = team1Players[team1Index];
          console.log(`✅ [Draft] Jogador encontrado no Team 1 (índice ${team1Index}): ${playerName}`);
        } else {
          // Verificar se o jogador está no team2
          const team2Index = team2Players.findIndex((player: string) => {
            return player === playerId || player.includes(playerId) || playerId.includes(player);
          });

          if (team2Index !== -1) {
            foundInTeam2 = true;
            teamIndex = 2;
            playerTeamIndex = team2Index;
            playerName = team2Players[team2Index];
            console.log(`✅ [Draft] Jogador encontrado no Team 2 (índice ${team2Index}): ${playerName}`);
          }
        }

        if (!foundInTeam1 && !foundInTeam2) {
          console.warn(`⚠️ [Draft] Jogador ${playerId} não encontrado em nenhum time, usando dados padrão`);
          playerName = playerId;
          teamIndex = 1; // Default para team 1
          playerTeamIndex = 0;
        }

        // Determinar lane baseada no índice do jogador
        const lanes = ['top', 'jungle', 'mid', 'adc', 'support'];
        playerLane = lanes[playerTeamIndex] || 'unknown';

      } catch (parseError) {
        console.error(`❌ [Draft] Erro ao parsear jogadores da partida:`, parseError);
        playerName = playerId;
        teamIndex = 1;
        playerLane = 'unknown';
      }

      // 5. ✅ CORRIGIDO: Salvar ação baseada no tipo e time com dados completos
      const actionData = {
        teamIndex,
        playerIndex: playerTeamIndex,
        playerName,
        playerLane,
        championId,
        action,
        timestamp: new Date().toISOString()
      };

      console.log(`🎯 [Draft] Dados da ação processada:`, actionData);

      // ✅ CORREÇÃO: Salvar em estruturas mais organizadas
      if (action === 'pick') {
        if (teamIndex === 1) {
          pickBanData.team1Picks.push(actionData);
          console.log(`✅ [Draft] Pick salvo para time azul: ${playerName} (${playerLane}) escolheu campeão ${championId}`);
        } else {
          pickBanData.team2Picks.push(actionData);
          console.log(`✅ [Draft] Pick salvo para time vermelho: ${playerName} (${playerLane}) escolheu campeão ${championId}`);
        }
      } else if (action === 'ban') {
        if (teamIndex === 1) {
          pickBanData.team1Bans.push(actionData);
          console.log(`✅ [Draft] Ban salvo para time azul: ${playerName} (${playerLane}) baniu campeão ${championId}`);
        } else {
          pickBanData.team2Bans.push(actionData);
          console.log(`✅ [Draft] Ban salvo para time vermelho: ${playerName} (${playerLane}) baniu campeão ${championId}`);
        }
      }

      // 6. ✅ NOVO: Adicionar à lista de ações sequenciais
      pickBanData.actions.push(actionData);

      // 7. ✅ CORRIGIDO: Salvar no banco de dados com logs detalhados
      await this.dbManager.updateCustomMatch(matchId, {
        pick_ban_data: JSON.stringify(pickBanData)
      });

      console.log(`✅ [Draft] ${action.toUpperCase()} SALVO NO BANCO:`, {
        partida: matchId,
        jogador: playerName,
        lane: playerLane,
        team: teamIndex === 1 ? 'AZUL' : 'VERMELHO',
        teamIndex: playerTeamIndex,
        campeao: championId,
        acao: action,
        totalPicks: pickBanData.team1Picks.length + pickBanData.team2Picks.length,
        totalBans: pickBanData.team1Bans.length + pickBanData.team2Bans.length,
        picksAzul: pickBanData.team1Picks.length,
        picksVermelho: pickBanData.team2Picks.length,
        bansAzul: pickBanData.team1Bans.length,
        bansVermelho: pickBanData.team2Bans.length,
        totalAcoes: pickBanData.actions.length
      });

      console.log(`🎉 [Draft] Ação do draft processada com sucesso para partida ${matchId}`);

    } catch (error) {
      console.error(`❌ [Draft] Erro ao processar ação do draft:`, error);
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
    const teammates = draftData.team1.map(player => ({
      id: player.summonerName,
      summonerName: player.summonerName,
      name: player.summonerName,
      assignedLane: player.assignedLane,
      lane: player.assignedLane,
      teamIndex: player.teamIndex, // 0-4 para team1
      mmr: player.mmr,
      primaryLane: player.primaryLane,
      secondaryLane: player.secondaryLane,
      isAutofill: player.isAutofill,
      team: 'blue' // ✅ NOVO: Identificação do time igual ao match-found
    }));

    const enemies = draftData.team2.map(player => ({
      id: player.summonerName,
      summonerName: player.summonerName,
      name: player.summonerName,
      assignedLane: player.assignedLane,
      lane: player.assignedLane,
      teamIndex: player.teamIndex, // 5-9 para team2
      mmr: player.mmr,
      primaryLane: player.primaryLane,
      secondaryLane: player.secondaryLane,
      isAutofill: player.isAutofill,
      team: 'red' // ✅ NOVO: Identificação do time igual ao match-found
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
      team2Lanes: enemies.map(p => `${p.summonerName}:${p.assignedLane}`)
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
        // ✅ NOVO: Dados essenciais para o frontend
        playerName: extraData?.playerName || `Player${playerId}`,
        playerLane: extraData?.playerLane || 'unknown',
        teamIndex: extraData?.teamIndex || 1,
        teamColor: extraData?.teamColor || 'blue',
        actionType: extraData?.actionType || action,
        championSelected: extraData?.championSelected || championId,
        playerInfo: extraData?.playerInfo || {},
        // ✅ NOVO: Estado completo do draft
        draftState: {
          totalPicks: extraData?.totalPicks || 0,
          totalBans: extraData?.totalBans || 0,
          pickBanData: extraData?.pickBanData || {}
        },
        ...extraData
      },
      timestamp: Date.now()
    };

    this.broadcastMessage(message);
    
    console.log(`📢 [Draft] Notificação de ${action} enviada:`, {
      matchId,
      playerId,
      playerName: extraData?.playerName,
      teamColor: extraData?.teamColor,
      championId,
      action
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

  // ✅ CORRIGIDO: Gerar fases do draft (sequência EXATA da ranqueada do LoL)
  private generateDraftPhases(): DraftPhase[] {
    return [
      // ===== PRIMEIRA FASE DE BANS (6 bans) =====
      { phase: 'bans', team: 1, action: 'ban', playerIndex: 0 },   // Blue Ban 1 (Top)
      { phase: 'bans', team: 2, action: 'ban', playerIndex: 0 },   // Red Ban 1 (Top)
      { phase: 'bans', team: 1, action: 'ban', playerIndex: 1 },   // Blue Ban 2 (Jungle)
      { phase: 'bans', team: 2, action: 'ban', playerIndex: 1 },   // Red Ban 2 (Jungle)
      { phase: 'bans', team: 1, action: 'ban', playerIndex: 2 },   // Blue Ban 3 (Mid)
      { phase: 'bans', team: 2, action: 'ban', playerIndex: 2 },   // Red Ban 3 (Mid)
      
      // ===== PRIMEIRA FASE DE PICKS (6 picks) =====
      { phase: 'picks', team: 1, action: 'pick', playerIndex: 0 }, // Blue Pick 1 (Top) - FIRST PICK
      { phase: 'picks', team: 2, action: 'pick', playerIndex: 0 }, // Red Pick 1 (Top)
      { phase: 'picks', team: 2, action: 'pick', playerIndex: 1 }, // Red Pick 2 (Jungle)
      { phase: 'picks', team: 1, action: 'pick', playerIndex: 1 }, // Blue Pick 2 (Jungle)
      { phase: 'picks', team: 1, action: 'pick', playerIndex: 2 }, // Blue Pick 3 (Mid)
      { phase: 'picks', team: 2, action: 'pick', playerIndex: 2 }, // Red Pick 3 (Mid)
      
      // ===== SEGUNDA FASE DE BANS (4 bans) =====
      { phase: 'bans', team: 2, action: 'ban', playerIndex: 3 },   // Red Ban 4 (ADC)
      { phase: 'bans', team: 1, action: 'ban', playerIndex: 3 },   // Blue Ban 4 (ADC)
      { phase: 'bans', team: 2, action: 'ban', playerIndex: 4 },   // Red Ban 5 (Support)
      { phase: 'bans', team: 1, action: 'ban', playerIndex: 4 },   // Blue Ban 5 (Support)
      
      // ===== SEGUNDA FASE DE PICKS (4 picks) =====
      { phase: 'picks', team: 2, action: 'pick', playerIndex: 3 }, // Red Pick 4 (ADC)
      { phase: 'picks', team: 1, action: 'pick', playerIndex: 3 }, // Blue Pick 4 (ADC)
      { phase: 'picks', team: 1, action: 'pick', playerIndex: 4 }, // Blue Pick 5 (Support)
      { phase: 'picks', team: 2, action: 'pick', playerIndex: 4 }  // Red Pick 5 (Support) - LAST PICK
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
