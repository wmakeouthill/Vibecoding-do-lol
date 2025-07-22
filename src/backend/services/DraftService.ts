import { WebSocket } from 'ws';
import { DatabaseManager } from '../database/DatabaseManager';
import { DiscordService } from './DiscordService';
import { PlayerIdentifierService, PlayerIdentifier } from './PlayerIdentifierService';

interface DraftData {
  matchId: number;
  team1: DraftPlayer[];
  team2: DraftPlayer[];
  averageMMR: { team1: number; team2: number };
  balanceQuality: number;
  autofillCount: number;
  createdAt: string;
  currentAction?: number;
  phases?: DraftPhase[];
  actions?: any[];
  phase?: string;
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
  private discordService?: DiscordService;
  private matchmakingService?: any; // ✅ NOVO: Referência ao MatchmakingService

  // ✅ SIMPLIFICADO: Timer único por partida
  private timers = new Map<number, {
    timeRemaining: number;
    interval: NodeJS.Timeout;
    onTimeout: () => void;
  }>();

  // ✅ SIMPLIFICADO: Controle de processamento único
  private processingActions = new Set<string>();

  constructor(dbManager: DatabaseManager, wss?: any, discordService?: DiscordService, matchmakingService?: any) {
    this.dbManager = dbManager;
    this.wss = wss;
    this.discordService = discordService;
    this.matchmakingService = matchmakingService; // ✅ NOVO: Armazenar referência
  }

  async initialize(): Promise<void> {
    console.log('🎯 [DraftPickBan] Inicializando DraftService...');

    // Iniciar monitoramento básico
    this.startBasicMonitoring();

    // ✅ NOVO: Iniciar monitoramento de partidas aceitas
    this.startAcceptedMatchesMonitoring();

    console.log('✅ [DraftPickBan] DraftService inicializado com sucesso');
  }

  // ✅ MELHORADO: Processamento único de ação com controle de ordem sequencial
  async processDraftAction(matchId: number, playerId: string, championId: number, action: 'pick' | 'ban'): Promise<void> {
    console.log(`[DraftPickBan] processDraftAction chamada:`, { matchId, playerId, championId, action });
    console.log(`🎯 [DraftPickBan] === PROCESSANDO AÇÃO DE DRAFT ===`);
    console.log(`🎯 [DraftPickBan] Parâmetros: matchId=${matchId}, playerId=${playerId}, championId=${championId}, action=${action}`);

    // ✅ VALIDAÇÃO: Parâmetros obrigatórios
    if (!matchId || !playerId || !championId || !action) {
      throw new Error('Parâmetros obrigatórios não fornecidos');
    }

    if (action !== 'pick' && action !== 'ban') {
      throw new Error('Ação deve ser "pick" ou "ban"');
    }

    // ✅ CONTROLE: Evitar processamento duplicado
    const actionKey = `${matchId}-${playerId}-${championId}-${action}`;
    if (this.processingActions.has(actionKey)) {
      console.log(`⚠️ [DraftPickBan] Ação já sendo processada: ${actionKey}`);
      return;
    }

    this.processingActions.add(actionKey);

    try {
      // ✅ VALIDAÇÃO: Verificar se partida existe e está em draft
      const match = await this.dbManager.getCustomMatchById(matchId);
      if (!match) {
        console.error(`[DraftPickBan] processDraftAction: partida ${matchId} não encontrada`);
        throw new Error(`Partida ${matchId} não encontrada`);
      }

      if (match.status !== 'draft') {
        throw new Error(`Partida ${matchId} não está em fase de draft (status: ${match.status})`);
      }

      // ✅ NOVO: Determinar o índice da ação atual
      const currentActionIndex = this.getCurrentActionIndex(match);
      console.log(`🎯 [DraftPickBan] Ação atual: ${currentActionIndex}`);

      // ✅ NOVO: Validar se a ação está na ordem correta
      if (!this.validateActionOrder(match, currentActionIndex)) {
        throw new Error(`Ação fora de ordem. Esperado: ${currentActionIndex}, mas recebido fora de sequência`);
      }

      // Antes da validação:
      const esperado = this.getExpectedPlayerId(match, currentActionIndex);
      console.log(`[DraftPickBan] processDraftAction: playerId recebido='${playerId}', esperado='${esperado}' (posição ${currentActionIndex})`);
      // ✅ MELHORADO: Validar se jogador está autorizado para esta ação específica
      if (!this.validatePlayerAction(match, playerId, action, currentActionIndex)) {
        console.error(`[DraftPickBan] Validação falhou: playerId recebido='${playerId}', esperado='${esperado}'`);
        throw new Error(`Jogador ${playerId} não autorizado para esta ação na posição ${currentActionIndex}`);
      }

      // ✅ PROCESSAMENTO: Salvar ação no MySQL
      await this.saveActionToDatabase(matchId, playerId, championId, action, match, currentActionIndex);

      // Após salvar no MySQL:
      console.log(`[DraftPickBan] Ação salva no MySQL:`, { matchId, playerId, championId, action, actionIndex: currentActionIndex });

      // ✅ NOTIFICAÇÃO: Enviar via WebSocket
      this.notifyAction(matchId, playerId, championId, action, currentActionIndex);

      console.log(`✅ [DraftPickBan] Ação ${action} processada com sucesso para ${playerId} na posição ${currentActionIndex}`);

      // NOVO: Após cada ação, tentar executar ações automáticas de bot
      await this.autoBotDraftLoop(matchId);

    } catch (error) {
      console.error(`❌ [DraftPickBan] Erro ao processar ação:`, error);
      throw error;
    } finally {
      this.processingActions.delete(actionKey);
    }
  }

  // ✅ CORRIGIDO: Determinar o índice da ação atual baseado no fluxo do draft
  private getCurrentActionIndex(match: any): number {
    try {
      let pickBanData: any = {};
      if (match.pick_ban_data) {
        pickBanData = typeof match.pick_ban_data === 'string' ? JSON.parse(match.pick_ban_data) : match.pick_ban_data;
      }

      // ✅ CORREÇÃO: O actionIndex deve ser baseado na posição no fluxo do draft (0-19)
      // Se não há ações, a próxima ação é a 0
      if (!pickBanData.actions || pickBanData.actions.length === 0) {
        console.log(`🔍 [DraftPickBan] Primeira ação do draft (actionIndex: 0)`);
        return 0;
      }

      // ✅ CORREÇÃO: Encontrar o maior actionIndex já processado e retornar o próximo
      const maxActionIndex = Math.max(...pickBanData.actions.map((a: any) => a.actionIndex || 0));
      const nextActionIndex = maxActionIndex + 1;

      console.log(`🔍 [DraftPickBan] Ações processadas: ${pickBanData.actions.length}, Maior actionIndex: ${maxActionIndex}, Próximo: ${nextActionIndex}`);

      // ✅ CORREÇÃO: Verificar se o draft já foi completado
      if (nextActionIndex >= 20) {
        console.log(`🎉 [DraftPickBan] Draft completado (${nextActionIndex}/20 ações)`);
        return 20; // Draft completado
      }

      return nextActionIndex;
    } catch (error) {
      console.error(`❌ [DraftPickBan] Erro ao determinar índice da ação:`, error);
      return 0;
    }
  }

  // ✅ NOVO: Validar se a ação está na ordem correta
  private validateActionOrder(match: any, actionIndex: number): boolean {
    // Verificar se não excedeu o limite de 20 ações
    if (actionIndex >= 20) {
      console.log(`❌ [DraftPickBan] Draft já completado (${actionIndex}/20 ações)`);
      return false;
    }

    console.log(`✅ [DraftPickBan] Ação ${actionIndex} está na ordem correta`);
    return true;
  }

  // ✅ NOVO: Obter o playerId esperado para a ação
  private getExpectedPlayerId(match: any, actionIndex: number): string {
    try {
      let pickBanData: any = {};
      if (match.pick_ban_data) {
        pickBanData = typeof match.pick_ban_data === 'string' ? JSON.parse(match.pick_ban_data) : match.pick_ban_data;
      }
      const phases = pickBanData.phases || this.generateDraftPhases();
      if (!phases[actionIndex]) return '';
      const phase = phases[actionIndex];
      const teamPlayers = phase.team === 1
        ? (typeof match.team1_players === 'string' ? JSON.parse(match.team1_players) : match.team1_players)
        : (typeof match.team2_players === 'string' ? JSON.parse(match.team2_players) : match.team2_players);
      return teamPlayers[phase.playerIndex] || '';
    } catch {
      return '';
    }
  }

  private validatePlayerAction(match: any, playerId: string, action: 'pick' | 'ban', actionIndex: number): boolean {
    try {
      console.log(`🔍 [DraftPickBan] Validando ação: ${action} para jogador: ${playerId} (posição: ${actionIndex})`);

      // Usar PlayerIdentifierService para validação padronizada
      const validation = PlayerIdentifierService.validateDraftAction(match, playerId, action, actionIndex);

      if (!validation.valid) {
        console.warn(`⚠️ [DraftPickBan] Validação falhou: ${validation.reason}`);
        return false;
      }

      console.log(`✅ [DraftPickBan] Validação aprovada para jogador: ${playerId} (posição: ${actionIndex})`);
      return true;

    } catch (error) {
      console.error(`❌ [DraftPickBan] Erro ao validar jogador:`, error);
      return false;
    }
  }

  // ✅ CORRIGIDO: Salvar ação no banco de dados na posição correta do fluxo
  private async saveActionToDatabase(matchId: number, playerId: string, championId: number, action: 'pick' | 'ban', match: any, actionIndex: number): Promise<void> {
    console.log(`💾 [DraftPickBan] Salvando ação no MySQL: ${action} - ${playerId} - ${championId} (posição: ${actionIndex})`);

    // Carregar dados atuais
    let pickBanData: any = {};
    try {
      if (match.pick_ban_data) {
        pickBanData = typeof match.pick_ban_data === 'string' ? JSON.parse(match.pick_ban_data) : match.pick_ban_data;
      }
    } catch (error) {
      console.warn(`⚠️ [DraftPickBan] Erro ao parsear pick_ban_data existente:`, error);
      pickBanData = {};
    }

    // ✅ CORRIGIDO: Verificar se ação já foi processada na mesma posição
    const existingAction = pickBanData.actions?.find((a: any) =>
      a.actionIndex === actionIndex
    );

    if (existingAction) {
      console.log(`⚠️ [DraftPickBan] Ação na posição ${actionIndex} já foi processada anteriormente`);
      return;
    }

    // Inicializar estruturas se necessário
    if (!pickBanData.team1Picks) pickBanData.team1Picks = [];
    if (!pickBanData.team1Bans) pickBanData.team1Bans = [];
    if (!pickBanData.team2Picks) pickBanData.team2Picks = [];
    if (!pickBanData.team2Bans) pickBanData.team2Bans = [];
    if (!pickBanData.actions) pickBanData.actions = [];

    // Determinar time do jogador
    const team1Players = typeof match.team1_players === 'string' ? JSON.parse(match.team1_players) : (match.team1_players || []);
    const team2Players = typeof match.team2_players === 'string' ? JSON.parse(match.team2_players) : (match.team2_players || []);

    // NOVO: Função robusta para comparar playerId
    function normalizeId(id: string) {
      return (id || '').toLowerCase().trim();
    }
    const normPlayerId = normalizeId(playerId);
    let isTeam1 = false;
    let playerTeamIndex = -1;
    for (let i = 0; i < team1Players.length; i++) {
      if (normalizeId(team1Players[i]) === normPlayerId) {
        isTeam1 = true;
        playerTeamIndex = i;
        break;
      }
    }
    if (!isTeam1) {
      for (let i = 0; i < team2Players.length; i++) {
        if (normalizeId(team2Players[i]) === normPlayerId) {
          isTeam1 = false;
          playerTeamIndex = i;
          break;
        }
      }
    }
    const teamIndex = isTeam1 ? 1 : 2;
    // Determinar lane baseada no índice
    const lanes = ['top', 'jungle', 'mid', 'adc', 'support'];
    const playerLane = lanes[playerTeamIndex] || 'unknown';
    console.log('💡 [DraftPickBan] Identificação de jogador:', {
      playerId,
      normPlayerId,
      isTeam1,
      playerTeamIndex,
      teamIndex,
      playerLane,
      team1Players,
      team2Players
    });

    // ✅ CORRIGIDO: Criar dados da ação com actionIndex correto
    const actionData = {
      teamIndex,
      playerIndex: playerTeamIndex,
      playerName: playerId,
      playerLane,
      championId,
      action,
      actionIndex, // ✅ CORRIGIDO: Índice sequencial da ação no fluxo (0-19)
      timestamp: new Date().toISOString()
    };

    // ✅ CORRIGIDO: Salvar em estruturas organizadas
    if (action === 'pick') {
      if (teamIndex === 1) {
        pickBanData.team1Picks.push(actionData);
      } else {
        pickBanData.team2Picks.push(actionData);
      }
    } else {
      if (teamIndex === 1) {
        pickBanData.team1Bans.push(actionData);
      } else {
        pickBanData.team2Bans.push(actionData);
      }
    }

    // ✅ CORRIGIDO: Adicionar à lista de ações sequenciais na posição correta
    pickBanData.actions.push(actionData);

    // ✅ CORRIGIDO: Ordenar ações por actionIndex para garantir ordem
    pickBanData.actions.sort((a: any, b: any) => (a.actionIndex || 0) - (b.actionIndex || 0));

    // ✅ NOVO: Atualizar currentAction para refletir o número de ações já realizadas
    pickBanData.currentAction = pickBanData.actions.length;

    // Salvar no banco
    await this.dbManager.updateCustomMatch(matchId, {
      pick_ban_data: JSON.stringify(pickBanData)
    });

    console.log(`✅ [DraftPickBan] Ação salva no MySQL:`, {
      partida: matchId,
      jogador: playerId,
      lane: playerLane,
      team: teamIndex === 1 ? 'AZUL' : 'VERMELHO',
      campeao: championId,
      acao: action,
      totalAcoes: pickBanData.actions.length,
      posicao: actionIndex,
      acoesOrdenadas: pickBanData.actions.map((a: any) => ({ actionIndex: a.actionIndex, playerName: a.playerName, action: a.action }))
    });
  }

  // ✅ SIMPLIFICADO: Notificar ação via WebSocket
  private notifyAction(matchId: number, playerId: string, championId: number, action: 'pick' | 'ban', actionIndex: number): void {
    if (!this.wss) return;

    const message = {
      type: 'draft_action',
      data: {
        matchId,
        playerId,
        championId,
        action,
        playerName: playerId,
        timestamp: new Date().toISOString(),
        actionIndex: actionIndex
      },
      timestamp: Date.now()
    };

    this.broadcastMessage(message, matchId);
    console.log(`📢 [DraftPickBan] Notificação enviada: ${action} - ${playerId} - ${championId} (posição: ${actionIndex})`);
  }

  // ✅ SIMPLIFICADO: Timer único por partida
  startTimer(matchId: number, duration: number, onTimeout: () => void): void {
    this.stopTimer(matchId);

    this.timers.set(matchId, {
      timeRemaining: duration,
      interval: setInterval(() => {
        const timer = this.timers.get(matchId);
        if (!timer) return;

        if (timer.timeRemaining > 0) {
          timer.timeRemaining--;
          this.notifyTimerUpdate(matchId, timer.timeRemaining);
        } else {
          this.stopTimer(matchId);
          onTimeout();
        }
      }, 1000),
      onTimeout
    });

    console.log(`⏰ [DraftPickBan] Timer iniciado para partida ${matchId}: ${duration}s`);
  }

  stopTimer(matchId: number): void {
    const timer = this.timers.get(matchId);
    if (timer) {
      clearInterval(timer.interval);
      this.timers.delete(matchId);
      console.log(`🛑 [DraftPickBan] Timer parado para partida ${matchId}`);
    }
  }

  private notifyTimerUpdate(matchId: number, timeRemaining: number): void {
    if (!this.wss) return;

    const message = {
      type: 'draft_timer_update',
      data: {
        matchId,
        timeRemaining,
        isUrgent: timeRemaining <= 10
      },
      timestamp: Date.now()
    };

    this.broadcastMessage(message, matchId);
  }

  // ✅ SIMPLIFICADO: Iniciar draft
  async startDraft(matchId: number): Promise<void> {
    console.log(`🎯 [DraftPickBan] Iniciando draft para partida ${matchId}`);

    try {
      const match = await this.dbManager.getCustomMatchById(matchId);
      if (!match) {
        throw new Error(`Partida ${matchId} não encontrada`);
      }

      // ✅ NOVO: Remover jogadores da fila antes de iniciar o draft
      console.log(`🗑️ [DraftPickBan] Removendo jogadores da fila para partida ${matchId}`);
      const allPlayers = await this.getAllPlayersFromMatch(match);

      for (const playerName of allPlayers) {
        try {
          // Remover do banco de dados
          const removed = await this.dbManager.removePlayerFromQueueBySummonerName(playerName);
          if (removed) {
            console.log(`✅ [DraftPickBan] Jogador ${playerName} removido da fila (banco)`);
          } else {
            console.warn(`⚠️ [DraftPickBan] Jogador ${playerName} não encontrado na fila (banco)`);
          }

          // ✅ NOVO: Remover da fila local do MatchmakingService se disponível
          if (this.matchmakingService) {
            try {
              const localRemoved = await this.matchmakingService.removePlayerFromQueueById(undefined, playerName);
              if (localRemoved) {
                console.log(`✅ [DraftPickBan] Jogador ${playerName} removido da fila local`);
              }
            } catch (localError) {
              console.warn(`⚠️ [DraftPickBan] Erro ao remover jogador ${playerName} da fila local:`, localError);
            }
          }
        } catch (error) {
          console.error(`❌ [DraftPickBan] Erro ao remover jogador ${playerName} da fila:`, error);
        }
      }
      console.log(`✅ [DraftPickBan] Limpeza da fila concluída para partida ${matchId}`);

      // Preparar dados do draft
      const draftData = await this.prepareDraftData(matchId, match);
      if (!draftData) {
        throw new Error('Erro ao preparar dados do draft');
      }

      // Salvar dados iniciais no banco
      await this.dbManager.updateCustomMatch(matchId, {
        pick_ban_data: JSON.stringify({
          team1: draftData.team1,
          team2: draftData.team2,
          currentAction: 0,
          phase: 'bans',
          phases: this.generateDraftPhases(),
          actions: []
        })
      });

      // Atualizar status da partida
      await this.dbManager.updateCustomMatchStatus(matchId, 'draft');

      // Adicionar ao tracking local
      this.activeDrafts.set(matchId, draftData);

      // Notificar frontend
      this.notifyDraftStarted(matchId, draftData);

      console.log(`✅ [DraftPickBan] Draft ${matchId} iniciado com sucesso`);

      // NOVO: Iniciar execução automática de bots se for a vez de um bot
      await this.autoBotDraftLoop(matchId);

    } catch (error) {
      console.error(`❌ [DraftPickBan] Erro ao iniciar draft:`, error);
      throw error;
    }
  }

  // NOVO: Executar ações automáticas de bot, respeitando a ordem do draft, com delay de 5s entre cada ação
  private async autoBotDraftLoop(matchId: number): Promise<void> {
    try {
      console.log(`[DraftPickBan] 🤖 Iniciando loop de bots para partida ${matchId}`);

      const match = await this.dbManager.getCustomMatchById(matchId);
      if (!match) {
        console.log(`[DraftPickBan] ❌ Partida ${matchId} não encontrada`);
        return;
      }

      const pickBanData = await this.prepareDraftData(matchId, match);
      if (!pickBanData) {
        console.log(`[DraftPickBan] ❌ Dados do draft não preparados para partida ${matchId}`);
        return;
      }

      console.log(`[DraftPickBan] 🔍 Dados do draft preparados:`, {
        currentAction: pickBanData.currentAction,
        phasesLength: pickBanData.phases?.length || 0,
        team1Length: pickBanData.team1?.length || 0,
        team2Length: pickBanData.team2?.length || 0,
        actionsLength: pickBanData.actions?.length || 0
      });

      const currentActionIndex = this.getCurrentActionIndex(pickBanData);
      if (currentActionIndex >= (pickBanData.phases?.length || 0)) {
        console.log(`[DraftPickBan] ✅ Draft completado - todas as ações foram realizadas`);
        return;
      }

      const currentPhase = pickBanData.phases?.[currentActionIndex];
      if (!currentPhase) {
        console.log(`[DraftPickBan] ❌ Fase atual não encontrada no índice ${currentActionIndex}`);
        return;
      }

      console.log(`[DraftPickBan] 🔍 Fase atual:`, {
        actionIndex: currentActionIndex,
        phase: currentPhase.phase,
        team: currentPhase.team,
        action: currentPhase.action,
        playerIndex: currentPhase.playerIndex
      });

      // Encontrar o jogador da vez
      const teamPlayers = currentPhase.team === 1 ? pickBanData.team1 : pickBanData.team2;
      const currentPlayer = teamPlayers[currentPhase.playerIndex];

      if (!currentPlayer) {
        console.log(`[DraftPickBan] ❌ Jogador não encontrado no índice ${currentPhase.playerIndex}`);
        return;
      }

      console.log(`[DraftPickBan] 🔍 Jogador da vez:`, {
        summonerName: currentPlayer.summonerName,
        isBot: this.isPlayerBot(currentPlayer.summonerName),
        team: currentPhase.team,
        playerIndex: currentPhase.playerIndex
      });

      // Verificar se é um bot
      if (!this.isPlayerBot(currentPlayer.summonerName)) {
        console.log(`[DraftPickBan] ⏳ Aguardando ação humana de ${currentPlayer.summonerName}`);
        return;
      }

      console.log(`[DraftPickBan] 🤖 Executando ação de bot para ${currentPlayer.summonerName}`);

      // Simular delay para ação do bot
      await new Promise(resolve => setTimeout(resolve, 2000 + Math.random() * 3000));

      // Selecionar campeão aleatório para o bot
      const championId = await this.selectRandomChampion();

      console.log(`[DraftPickBan] 🤖 Bot ${currentPlayer.summonerName} selecionou campeão ${championId}`);

      // Salvar ação do bot usando o método existente
      await this.saveActionToDatabase(matchId, currentPlayer.summonerName, championId, currentPhase.action, match, currentActionIndex);

      console.log(`[DraftPickBan] ✅ Ação do bot salva com sucesso`);

      // Notificar sobre a ação usando o método existente
      this.notifyAction(matchId, currentPlayer.summonerName, championId, currentPhase.action, currentActionIndex);

      console.log(`[DraftPickBan] 🔄 Agendando próxima verificação em 1 segundo`);

      // Agendar próxima verificação
      setTimeout(() => this.autoBotDraftLoop(matchId), 1000);

    } catch (error) {
      console.error(`[DraftPickBan] ❌ Erro no loop de bots:`, error);
    }
  }

  // NOVO: Buscar todos os championIds válidos (mock simples, pode ser melhorado)
  private async getAllChampionIds(): Promise<number[]> {
    // Ideal: buscar do banco ou cache, aqui mock simples para LoL
    // Exemplo: 1 a 200 (ajuste conforme necessário)
    return Array.from({ length: 200 }, (_, i) => i + 1);
  }

  // ✅ SIMPLIFICADO: Preparar dados do draft
  private async prepareDraftData(matchId: number, match: any): Promise<DraftData | null> {
    try {
      const team1PlayersRaw = typeof match.team1_players === 'string' ? JSON.parse(match.team1_players) : (match.team1_players || []);
      const team2PlayersRaw = typeof match.team2_players === 'string' ? JSON.parse(match.team2_players) : (match.team2_players || []);

      // Função para garantir que cada jogador seja um objeto com pelo menos summonerName
      function normalizePlayer(p: any, idx: number): any {
        if (typeof p === 'string') {
          return { summonerName: p };
        }
        if (typeof p === 'object' && p !== null) {
          // Se já tem summonerName, retorna como está
          if (p.summonerName) return p;
          // Se tem name, usa como summonerName
          if (p.name) return { ...p, summonerName: p.name };
        }
        // Fallback
        return { summonerName: `Jogador${idx + 1}` };
      }

      const team1Players = team1PlayersRaw.map(normalizePlayer);
      const team2Players = team2PlayersRaw.map(normalizePlayer);

      // Buscar dados dos jogadores na fila (não usado diretamente aqui)
      // const queuePlayers = await this.dbManager.getActiveQueuePlayers();

      const draftData: DraftData = {
        matchId,
        team1: team1Players.map((p: any, index: number) => ({
          summonerName: p.summonerName,
          assignedLane: this.getLaneForIndex(index),
          teamIndex: index,
          mmr: 1200, // Default MMR
          primaryLane: this.getLaneForIndex(index),
          secondaryLane: 'fill',
          isAutofill: false
        })),
        team2: team2Players.map((p: any, index: number) => ({
          summonerName: p.summonerName,
          assignedLane: this.getLaneForIndex(index),
          teamIndex: index + 5,
          mmr: 1200, // Default MMR
          primaryLane: this.getLaneForIndex(index),
          secondaryLane: 'fill',
          isAutofill: false
        })),
        averageMMR: { team1: 1200, team2: 1200 },
        balanceQuality: 0,
        autofillCount: 0,
        createdAt: new Date().toISOString()
      };

      return draftData;

    } catch (error) {
      console.error(`❌ [DraftPickBan] Erro ao preparar dados do draft:`, error);
      return null;
    }
  }

  // ✅ SIMPLIFICADO: Gerar fases do draft
  private generateDraftPhases(): DraftPhase[] {
    const phases: DraftPhase[] = [];

    // Fase de bans (3 bans por time)
    for (let i = 0; i < 3; i++) {
      phases.push({ phase: 'bans', team: 1, action: 'ban', playerIndex: i });
      phases.push({ phase: 'bans', team: 2, action: 'ban', playerIndex: i });
    }

    // Fase de picks (5 picks por time)
    for (let i = 0; i < 5; i++) {
      phases.push({ phase: 'picks', team: 1, action: 'pick', playerIndex: i });
      phases.push({ phase: 'picks', team: 2, action: 'pick', playerIndex: i });
    }

    return phases;
  }

  // ✅ SIMPLIFICADO: Notificar início do draft
  private notifyDraftStarted(matchId: number, draftData: DraftData): void {
    if (!this.wss) return;

    const message = {
      type: 'draft_started',
      data: {
        matchId,
        team1: draftData.team1,
        team2: draftData.team2,
        phases: this.generateDraftPhases(),
        averageMMR: draftData.averageMMR,
        balanceQuality: draftData.balanceQuality,
        autofillCount: draftData.autofillCount
      },
      timestamp: Date.now()
    };

    this.broadcastMessage(message, matchId);
    console.log(`📢 [DraftPickBan] Notificação de draft iniciado enviada para partida ${matchId}`);
  }

  // ✅ SIMPLIFICADO: Broadcast de mensagens
  private broadcastMessage(message: any, matchId?: number): void {
    if (!this.wss) return;

    this.wss.clients.forEach((client: WebSocket) => {
      if (client.readyState === WebSocket.OPEN) {
        try {
          client.send(JSON.stringify(message));
        } catch (error) {
          console.error('❌ [DraftPickBan] Erro ao enviar mensagem WebSocket:', error);
        }
      }
    });
  }

  // ✅ SIMPLIFICADO: Obter lane por índice
  private getLaneForIndex(index: number): string {
    const lanes = ['top', 'jungle', 'mid', 'adc', 'support'];
    return lanes[index] || 'fill';
  }

  // ✅ SIMPLIFICADO: Monitoramento básico
  private startBasicMonitoring(): void {
    console.log('🔍 [DraftPickBan] Iniciando monitoramento básico');

    // Monitorar partidas em draft a cada 5 segundos
    setInterval(async () => {
      try {
        const draftMatches = await this.dbManager.getCustomMatchesByStatus('draft');
        for (const match of draftMatches) {
          // Verificar se partida ainda está ativa
          if (!this.activeDrafts.has(match.id)) {
            console.log(`🔄 [DraftPickBan] Partida ${match.id} não está no tracking local, removendo do banco`);
            await this.dbManager.updateCustomMatchStatus(match.id, 'cancelled');
          }
        }
      } catch (error) {
        console.error('❌ [DraftPickBan] Erro no monitoramento:', error);
      }
    }, 5000);
  }

  // ✅ NOVO: Monitoramento de partidas aceitas para iniciar draft
  private startAcceptedMatchesMonitoring(): void {
    console.log('🔍 [DraftPickBan] Iniciando monitoramento de partidas aceitas');

    // Verificar partidas aceitas a cada 3 segundos
    setInterval(async () => {
      try {
        const acceptedMatches = await this.dbManager.getCustomMatchesByStatus('accepted');

        for (const match of acceptedMatches) {
          console.log(`🔍 [DraftPickBan] Verificando partida aceita ${match.id} para iniciar draft`);

          // Verificar se já não está sendo processada
          if (this.activeDrafts.has(match.id)) {
            console.log(`⏳ [DraftPickBan] Partida ${match.id} já está em draft, ignorando`);
            continue;
          }

          // Verificar se todos os jogadores aceitaram
          const allPlayers = await this.getAllPlayersFromMatch(match);
          const acceptedPlayers = await this.getAcceptedPlayers(allPlayers);

          if (acceptedPlayers.length === 10) {
            console.log(`🎉 [DraftPickBan] Todos os 10 jogadores aceitaram partida ${match.id}, iniciando draft`);
            await this.startDraft(match.id);
          } else {
            console.log(`⏳ [DraftPickBan] Partida ${match.id} aguardando aceitação: ${acceptedPlayers.length}/10 jogadores`);
          }
        }
      } catch (error) {
        console.error('❌ [DraftPickBan] Erro no monitoramento de partidas aceitas:', error);
      }
    }, 3000); // 3 segundos
  }

  // ✅ NOVO: Obter todos os jogadores de uma partida
  private async getAllPlayersFromMatch(match: any): Promise<string[]> {
    try {
      const team1 = typeof match.team1_players === 'string'
        ? JSON.parse(match.team1_players)
        : (match.team1_players || []);
      const team2 = typeof match.team2_players === 'string'
        ? JSON.parse(match.team2_players)
        : (match.team2_players || []);

      return [...team1, ...team2];
    } catch (error) {
      console.error(`❌ [DraftPickBan] Erro ao parsear jogadores da partida ${match.id}:`, error);
      return [];
    }
  }

  // ✅ NOVO: Obter jogadores que aceitaram
  private async getAcceptedPlayers(playerNames: string[]): Promise<string[]> {
    try {
      const queuePlayers = await this.dbManager.getActiveQueuePlayers();
      const matchPlayers = queuePlayers.filter(p => playerNames.includes(p.summoner_name));

      return matchPlayers
        .filter(p => p.acceptance_status === 1)
        .map(p => p.summoner_name);
    } catch (error) {
      console.error('❌ [DraftPickBan] Erro ao obter jogadores aceitos:', error);
      return [];
    }
  }

  // ✅ SIMPLIFICADO: Finalizar draft
  async finalizeDraft(matchId: number, draftResults: any): Promise<void> {
    console.log(`🏁 [DraftPickBan] Finalizando draft ${matchId}`);

    try {
      // Atualizar status da partida
      await this.dbManager.updateCustomMatchStatus(matchId, 'in_progress');

      // Parar timer
      this.stopTimer(matchId);

      // Remover do tracking local
      this.activeDrafts.delete(matchId);

      // Notificar frontend
      if (this.wss) {
        const message = {
          type: 'draft_completed',
          data: { matchId, draftResults },
          timestamp: Date.now()
        };
        this.broadcastMessage(message, matchId);
      }

      console.log(`✅ [DraftPickBan] Draft ${matchId} finalizado com sucesso`);

    } catch (error) {
      console.error(`❌ [DraftPickBan] Erro ao finalizar draft:`, error);
      throw error;
    }
  }

  // ✅ CORRIGIDO: Cancelar draft com limpeza completa
  async cancelDraft(matchId: number, reason: string): Promise<void> {
    console.log(`🚫 [DraftPickBan] ========== INÍCIO DO CANCELAMENTO DE DRAFT ==========`);
    console.log(`🚫 [DraftPickBan] Cancelando draft ${matchId}: ${reason}`);

    try {
      // 1. ✅ NOVO: Limpar canais do Discord ANTES de apagar do banco
      if (this.discordService) {
        try {
          console.log(`🤖 [DraftPickBan] ========== INICIANDO LIMPEZA DISCORD ==========`);
          console.log(`🤖 [DraftPickBan] Limpando canais do Discord para draft cancelado ${matchId}...`);
          console.log(`🤖 [DraftPickBan] Chamando discordService.cleanupMatchByCustomId(${matchId})...`);

          await this.discordService.cleanupMatchByCustomId(matchId);

          console.log(`🤖 [DraftPickBan] ========== LIMPEZA DISCORD CONCLUÍDA ==========`);
          console.log(`🤖 [DraftPickBan] Canais do Discord limpos para draft ${matchId}`);
        } catch (discordError) {
          console.error(`❌ [DraftPickBan] Erro ao limpar Discord para draft cancelado ${matchId}:`, discordError);
          console.error(`❌ [DraftPickBan] Stack trace:`, (discordError as Error).stack);
        }
      } else {
        console.warn(`⚠️ [DraftPickBan] DiscordService não disponível para limpar draft cancelado ${matchId}`);
      }

      // 2. ✅ NOVO: Apagar partida do banco de dados
      console.log(`🗄️ [DraftPickBan] ========== INICIANDO LIMPEZA BANCO ==========`);
      try {
        await this.dbManager.deleteCustomMatch(matchId);
        console.log(`✅ [DraftPickBan] Partida ${matchId} apagada do banco de dados`);
      } catch (dbError) {
        console.error(`❌ [DraftPickBan] Erro ao apagar partida ${matchId} do banco:`, dbError);
        // Tentar apenas atualizar status como fallback
        try {
          await this.dbManager.updateCustomMatchStatus(matchId, 'cancelled');
          console.log(`⚠️ [DraftPickBan] Fallback: Status da partida ${matchId} atualizado para 'cancelled'`);
        } catch (statusError) {
          console.error(`❌ [DraftPickBan] Erro no fallback ao atualizar status:`, statusError);
        }
      }

      // 3. Parar timer
      this.stopTimer(matchId);

      // 4. Remover do tracking local
      this.activeDrafts.delete(matchId);

      // 5. Notificar frontend
      if (this.wss) {
        const message = {
          type: 'draft_cancelled',
          data: { matchId, reason },
          timestamp: Date.now()
        };
        this.broadcastMessage(message, matchId);
      }

      console.log(`✅ [DraftPickBan] ========== DRAFT ${matchId} CANCELADO COM SUCESSO ==========`);

    } catch (error) {
      console.error(`❌ [DraftPickBan] Erro ao cancelar draft:`, error);
      throw error;
    }
  }

  setDiscordService(discordService: DiscordService): void {
    this.discordService = discordService;
  }

  shutdown(): void {
    console.log('🔄 [DraftPickBan] Desligando DraftService');

    // Parar todos os timers
    for (const [matchId] of this.timers) {
      this.stopTimer(matchId);
    }

    // Limpar dados
    this.activeDrafts.clear();
    this.processingActions.clear();
  }

  // ✅ NOVO: Verificar se um jogador é bot
  private isPlayerBot(playerName: string): boolean {
    return typeof playerName === 'string' && playerName.toLowerCase().includes('bot');
  }

  // ✅ NOVO: Selecionar campeão aleatório
  private async selectRandomChampion(): Promise<number> {
    const allChampions = await this.getAllChampionIds();
    return allChampions[Math.floor(Math.random() * allChampions.length)];
  }
}