import { WebSocket } from 'ws';
import { DatabaseManager } from '../database/DatabaseManager';
import { DiscordService } from './DiscordService';
import { PlayerIdentifierService } from './PlayerIdentifierService';

interface AcceptanceStatus {
  matchId: number;
  players: string[];
  acceptedPlayers: Set<string>;
  declinedPlayers: Set<string>;
  createdAt: Date;
  timeout?: NodeJS.Timeout;
}

export class MatchFoundService {
  private dbManager: DatabaseManager;
  private wss: any; // WebSocketServer
  private pendingMatches = new Map<number, AcceptanceStatus>();
  private monitoringInterval: NodeJS.Timeout | null = null;
  private readonly ACCEPTANCE_TIMEOUT_MS = 30000; // 30 segundos para aceitar
  private discordService?: DiscordService; // ✅ NOVO: Referência ao DiscordService
  private matchCreationLocks = new Map<number, boolean>();

  constructor(dbManager: DatabaseManager, wss?: any, discordService?: DiscordService) {
    this.dbManager = dbManager;
    this.wss = wss;

    // ✅ CORREÇÃO: Aceitar DiscordService mesmo que não esteja pronto
    if (discordService) {
      this.discordService = discordService;
      console.log('🔗 [MatchFound] DiscordService configurado (pode não estar pronto ainda)');
      console.log('🔧 [MatchFound] DiscordService tipo:', typeof discordService);
      console.log('🔧 [MatchFound] DiscordService é instância:', discordService.constructor.name);
      console.log('🔧 [MatchFound] DiscordService isReady:', discordService.isReady());
    } else {
      console.warn('⚠️ [MatchFound] DiscordService não foi fornecido');
    }

    // ✅ DEBUG: Verificar se DiscordService foi injetado
    console.log('🔧 [MatchFound] Construtor chamado');
    console.log('🔧 [MatchFound] DiscordService recebido:', !!discordService);
  }

  // ✅ NOVO: Método para definir DiscordService após construção
  setDiscordService(discordService: DiscordService): void {
    this.discordService = discordService;
    console.log('🔗 [MatchFound] DiscordService configurado via setDiscordService');
    console.log('🔧 [MatchFound] DiscordService isReady:', discordService.isReady());
    console.log('🔧 [MatchFound] DiscordService isConnected:', discordService.isDiscordConnected());
  }

  // ✅ NOVO: Método para verificar se DiscordService está disponível e pronto
  isDiscordServiceReady(): boolean {
    return !!(this.discordService && this.discordService.isReady());
  }

  async initialize(): Promise<void> {
    console.log('🎯 [MatchFound] Inicializando MatchFoundService...');
    console.log('🔍 [MatchFound] WebSocket Server disponível:', !!this.wss);
    console.log('🔍 [MatchFound] WebSocket clients:', this.wss?.clients?.size || 0);

    // Iniciar monitoramento contínuo de acceptance_status
    this.startAcceptanceMonitoring();

    console.log('✅ [MatchFound] MatchFoundService inicializado com sucesso');
  }

  // ✅ Iniciar processo de aceitação para partida já criada
  async createMatchForAcceptance(matchData: {
    team1Players: string[];
    team2Players: string[];
    averageMMR: { team1: number; team2: number };
    balancedTeams: any;
    matchId?: number; // ✅ NOVO: ID da partida já criada
  }): Promise<number> {
    console.log('🎮 [MatchFound] Iniciando processo de aceitação para partida...');

    try {
      // ✅ CORREÇÃO: Usar matchId fornecido ou buscar partida existente
      let matchId = matchData.matchId;

      if (!matchId) {
        console.log('🔍 [MatchFound] Buscando partida existente no banco...');

        // Buscar partida mais recente que corresponda aos times
        const recentMatches = await this.dbManager.getCustomMatches(10, 0); // Buscar 10 partidas mais recentes
        const matchingMatch = recentMatches.find((match: any) => {
          try {
            const team1 = typeof match.team1_players === 'string'
              ? JSON.parse(match.team1_players)
              : (match.team1_players || []);
            const team2 = typeof match.team2_players === 'string'
              ? JSON.parse(match.team2_players)
              : (match.team2_players || []);

            return JSON.stringify(team1.sort()) === JSON.stringify(matchData.team1Players.sort()) &&
              JSON.stringify(team2.sort()) === JSON.stringify(matchData.team2Players.sort());
          } catch (error) {
            return false;
          }
        });

        if (matchingMatch) {
          matchId = matchingMatch.id;
          console.log(`✅ [MatchFound] Partida existente encontrada: ${matchId}`);
        } else {
          console.error('❌ [MatchFound] Nenhuma partida correspondente encontrada no banco!');
          throw new Error('Partida não encontrada no banco de dados');
        }
      }

      // ✅ VERIFICAÇÃO: Garantir que matchId é válido
      if (!matchId) {
        throw new Error('ID da partida não encontrado');
      }

      // 3. Adicionar coluna de acceptance_status se não existir
      await this.dbManager.addAcceptanceStatusColumn();

      // 4. ✅ CORREÇÃO: Resetar status apenas dos jogadores desta partida
      const matchPlayers = [...matchData.team1Players, ...matchData.team2Players];
      for (const playerName of matchPlayers) {
        await this.dbManager.updatePlayerAcceptanceStatus(playerName, 0);
      }
      console.log(`✅ [MatchFound] Status de aceitação resetado para ${matchPlayers.length} jogadores da partida ${matchId}`);

      // 5. Configurar tracking de aceitação
      const playersForAcceptance = [...matchData.team1Players, ...matchData.team2Players];
      const acceptanceStatus: AcceptanceStatus = {
        matchId,
        players: playersForAcceptance,
        acceptedPlayers: new Set(),
        declinedPlayers: new Set(),
        createdAt: new Date()
      };

      // 6. Configurar timeout para cancelar partida se não for aceita
      acceptanceStatus.timeout = setTimeout(() => {
        this.handleAcceptanceTimeout(matchId as number);
      }, this.ACCEPTANCE_TIMEOUT_MS);

      this.pendingMatches.set(matchId as number, acceptanceStatus);

      // 7. Notificar frontend sobre partida encontrada PRIMEIRO
      await this.notifyMatchFound(matchId as number, playersForAcceptance, matchData.balancedTeams, matchData.averageMMR);

      // 8. ✅ NOVO: Iniciar atualizações de timer em tempo real
      this.startTimerUpdates(matchId as number);

      // 9. Aceitar automaticamente para bots COM DELAY para dar tempo da tela aparecer
      setTimeout(async () => {
        await this.autoAcceptForBots(matchId as number, playersForAcceptance);
      }, 2000); // 2 segundos de delay para bots

      console.log(`✅ [MatchFound] Partida ${matchId} processada e processo de aceitação iniciado`);
      return matchId;

    } catch (error) {
      console.error('❌ [MatchFound] Erro ao criar partida para aceitação:', error);
      throw error;
    }
  }

  // ✅ Processar aceitação de jogador
  async acceptMatch(matchId: number, summonerName: string): Promise<void> {
    console.log(`✅ [MatchFound] ========== JOGADOR ACEITOU MATCH ==========`);
    console.log(`✅ [MatchFound] Jogador ${summonerName} aceitou partida ${matchId}`);
    console.log(`✅ [MatchFound] Timestamp: ${new Date().toISOString()}`);

    try {
      // 1. Atualizar no banco de dados
      await this.dbManager.updatePlayerAcceptanceStatus(summonerName, 1);
      console.log(`✅ [MatchFound] Status de aceitação atualizado no banco para ${summonerName}`);

      // 2. Atualizar tracking local
      const matchStatus = this.pendingMatches.get(matchId);
      if (matchStatus) {
        matchStatus.acceptedPlayers.add(summonerName);
        console.log(`✅ [MatchFound] Match ${matchId} - Jogadores que aceitaram: ${matchStatus.acceptedPlayers.size}/${matchStatus.players.length}`);
        console.log(`✅ [MatchFound] Jogadores que aceitaram:`, Array.from(matchStatus.acceptedPlayers));

        // Verificar se todos aceitaram
        if (matchStatus.acceptedPlayers.size === matchStatus.players.length) {
          console.log(`🎉 [MatchFound] TODOS OS JOGADORES ACEITARAM! Iniciando handleAllPlayersAccepted...`);
          await this.handleAllPlayersAccepted(matchId);
        } else {
          console.log(`⏳ [MatchFound] Aguardando mais jogadores aceitar...`);
          // Notificar progresso da aceitação
          this.notifyAcceptanceProgress(matchId, matchStatus);
        }
      } else {
        console.error(`❌ [MatchFound] Match ${matchId} não encontrado no tracking local!`);
      }

    } catch (error) {
      console.error(`❌ [MatchFound] Erro ao aceitar partida ${matchId}:`, error);
      throw error;
    }
  }

  // ✅ Processar recusa de jogador
  async declineMatch(matchId: number, summonerName: string): Promise<void> {
    console.log(`❌ [MatchFound] Jogador ${summonerName} recusou partida ${matchId}`);

    try {
      // 1. Atualizar no banco de dados
      await this.dbManager.updatePlayerAcceptanceStatus(summonerName, 2);

      // 2. Processar recusa imediatamente
      await this.handleMatchDeclined(matchId, [summonerName]);

    } catch (error) {
      console.error(`❌ [MatchFound] Erro ao recusar partida ${matchId}:`, error);
      throw error;
    }
  }

  // ✅ Monitoramento contínuo de acceptance_status via MySQL
  private startAcceptanceMonitoring(): void {
    console.log('🔍 [MatchFound] Iniciando monitoramento contínuo...');

    this.monitoringInterval = setInterval(async () => {
      await this.monitorAcceptanceStatus();
    }, 1000); // Verificar a cada 1 segundo
  }

  private async monitorAcceptanceStatus(): Promise<void> {
    try {
      // Buscar partidas ativas no banco
      const activeMatches = await this.dbManager.getActiveCustomMatches();

      for (const match of activeMatches) {
        await this.processMatchAcceptanceFromDB(match);
      }
    } catch (error) {
      console.error('❌ [MatchFound] Erro no monitoramento:', error);
    }
  }

  private async processMatchAcceptanceFromDB(match: any): Promise<void> {
    const matchId = match.id;

    // Parsear jogadores dos times
    let allPlayers: string[] = [];
    try {
      const team1 = typeof match.team1_players === 'string'
        ? JSON.parse(match.team1_players)
        : (match.team1_players || []);
      const team2 = typeof match.team2_players === 'string'
        ? JSON.parse(match.team2_players)
        : (match.team2_players || []);

      allPlayers = [...team1, ...team2];
    } catch (parseError) {
      console.error(`❌ [MatchFound] Erro ao parsear jogadores da partida ${matchId}`);
      return;
    }

    if (allPlayers.length !== 10) {
      return;
    }

    // Buscar status de aceitação dos jogadores
    const queuePlayers = await this.dbManager.getActiveQueuePlayers();
    const matchPlayers = queuePlayers.filter(p => allPlayers.includes(p.summoner_name));

    if (matchPlayers.length !== 10) {
      return;
    }

    // Verificar recusas
    const declinedPlayers = matchPlayers.filter(p => p.acceptance_status === 2);
    if (declinedPlayers.length > 0) {
      await this.handleMatchDeclined(matchId, declinedPlayers.map(p => p.summoner_name));
      return;
    }

    // Verificar se todos aceitaram
    const acceptedPlayers = matchPlayers.filter(p => p.acceptance_status === 1);
    if (acceptedPlayers.length === 10) {
      await this.handleAllPlayersAccepted(matchId);
      return;
    }
  }

  // ✅ CORREÇÃO: Proteção contra múltiplas execuções
  private processingMatches = new Set<number>();

  // ✅ Lidar com todos os jogadores tendo aceitado
  private async handleAllPlayersAccepted(matchId: number): Promise<void> {
    // Verificar se já está sendo processado
    if (this.processingMatches.has(matchId) || this.matchCreationLocks.get(matchId)) {
      console.log(`⏳ [MatchFound] Partida ${matchId} já está sendo processada, ignorando chamada duplicada`);
      return;
    }

    try {
      this.matchCreationLocks.set(matchId, true);
      this.processingMatches.add(matchId);

      // 1. Limpar timeout se existir
      const matchStatus = this.pendingMatches.get(matchId);
      if (matchStatus?.timeout) {
        clearTimeout(matchStatus.timeout);
      }
      this.pendingMatches.delete(matchId);

      // 2. Buscar dados da partida
      const match = await this.dbManager.getCustomMatchById(matchId);
      if (!match) {
        console.error(`❌ [MatchFound] Partida ${matchId} não encontrada`);
        return;
      }
      console.log(`📊 [MatchFound] Dados da partida encontrados:`, {
        id: match.id,
        team1_players: match.team1_players,
        team2_players: match.team2_players,
        status: match.status
      });

      // 3. ✅ VERIFICAÇÃO: Se partida já foi aceita, não processar novamente
      if (match.status === 'accepted' || match.status === 'draft') {
        console.log(`✅ [MatchFound] Partida ${matchId} já foi aceita (status: ${match.status}), ignorando`);
        return;
      }

      // 4. Atualizar status da partida para 'accepted'
      await this.dbManager.updateCustomMatchStatus(matchId, 'accepted');
      console.log(`✅ [MatchFound] Status da partida atualizado para 'accepted'`);

      // 5. ✅ CORREÇÃO: NÃO remover jogadores da fila aqui - deixar o DraftService fazer isso
      // Os jogadores precisam permanecer na fila para o DraftService buscar seus dados
      console.log(`✅ [MatchFound] Jogadores mantidos na fila para o DraftService`);

      // 6. ✅ CORREÇÃO: Criar match no Discord PRIMEIRO
      if (this.discordService) {
        // ✅ NOVO: Verificar se o DiscordService está pronto
        if (this.discordService.isReady()) {
          try {
            console.log(`🤖 [MatchFound] ========== CRIANDO MATCH DISCORD ==========`);
            console.log(`🤖 [MatchFound] Match ID: ${matchId}`);
            console.log(`🤖 [MatchFound] DiscordService status:`, {
              isReady: this.discordService.isReady(),
              isConnected: this.discordService.isDiscordConnected(),
              botUsername: this.discordService.getBotUsername(),
              activeMatches: this.discordService.getAllActiveMatches().size
            });
            console.log(`🤖 [MatchFound] Dados da partida:`, {
              team1_players: match.team1_players,
              team2_players: match.team2_players,
              status: match.status
            });

            await this.discordService.createDiscordMatch(matchId, match);
            console.log(`🤖 [MatchFound] Match Discord criado com sucesso`);

            // ✅ NOVO: Verificar se o match foi realmente criado
            const activeMatches = this.discordService.getAllActiveMatches();
            const matchExists = activeMatches.has(matchId.toString());
            console.log(`🤖 [MatchFound] Verificação pós-criação: match ${matchId} existe no DiscordService: ${matchExists}`);

          } catch (discordError) {
            console.error(`❌ [MatchFound] Erro ao criar match Discord:`, discordError);
            console.error(`❌ [MatchFound] Stack trace:`, (discordError as Error).stack);
            // Não falhar o processo, apenas registrar o erro
          }
        } else {
          console.warn(`⚠️ [MatchFound] DiscordService não está pronto ainda`);
          console.warn(`⚠️ [MatchFound] DiscordService status:`, {
            exists: !!this.discordService,
            isReady: this.discordService.isReady(),
            isConnected: this.discordService.isDiscordConnected(),
            botUsername: this.discordService.getBotUsername(),
            activeMatches: this.discordService.getAllActiveMatches().size
          });
        }
      } else {
        console.warn(`⚠️ [MatchFound] DiscordService não está disponível`);
      }

      // 7. ✅ CORREÇÃO: Notificar que todos aceitaram (será processado pelo DraftService)
      this.notifyAllPlayersAccepted(matchId, match);

      // 8. ✅ REMOVIDO: Chamada desnecessária do DraftService
      // O DraftService será chamado automaticamente pelo monitoramento

      console.log(`✅ [MatchFound] Partida ${matchId} totalmente aceita - encaminhando para Draft`);

    } catch (error) {
      console.error(`❌ [MatchFound] Erro ao processar aceitação completa:`, error);
    } finally {
      // ✅ IMPORTANTE: Remover da proteção após processamento
      this.matchCreationLocks.delete(matchId);
      this.processingMatches.delete(matchId);
      console.log(`🔒 [MatchFound] Proteção removida para partida ${matchId}`);
    }
  }

  // ✅ Lidar com partida recusada
  private async handleMatchDeclined(matchId: number, declinedPlayerNames: string[]): Promise<void> {
    console.log(`🚫 [MatchFound] Partida ${matchId} recusada por:`, declinedPlayerNames);

    try {
      // 1. Limpar timeout se existir
      const matchStatus = this.pendingMatches.get(matchId);
      if (matchStatus?.timeout) {
        clearTimeout(matchStatus.timeout);
      }
      this.pendingMatches.delete(matchId);

      // 2. Remover jogadores que recusaram da fila
      for (const playerName of declinedPlayerNames) {
        await this.dbManager.removePlayerFromQueueBySummonerName(playerName);
        console.log(`🗑️ [MatchFound] Jogador ${playerName} removido da fila (recusou)`);
      }

      // 3. Deletar a partida
      await this.dbManager.deleteCustomMatch(matchId);

      // 4. Limpar match no Discord com verificação de tentativas
      if (this.discordService) {
        let retryCount = 0;
        const maxRetries = 3;

        while (retryCount < maxRetries) {
          try {
            console.log(`🤖 [MatchFound] Tentativa ${retryCount + 1} de limpar match ${matchId} no Discord...`);
            await this.discordService.cleanupMatchByCustomId(matchId);
            console.log(`🤖 [MatchFound] Match ${matchId} limpo no Discord`);
            break;
          } catch (discordError) {
            retryCount++;
            console.error(`❌ [MatchFound] Erro ao limpar match ${matchId} no Discord (tentativa ${retryCount}):`, discordError);
            if (retryCount < maxRetries) {
              await new Promise(resolve => setTimeout(resolve, 1000 * retryCount));
            }
          }
        }
      }

      // 6. ✅ CORREÇÃO: Resetar status apenas dos jogadores restantes (não removidos)
      const currentMatchStatus = this.pendingMatches.get(matchId);
      if (currentMatchStatus) {
        const remainingPlayers = currentMatchStatus.players.filter(p => !declinedPlayerNames.includes(p));
        for (const playerName of remainingPlayers) {
          await this.dbManager.updatePlayerAcceptanceStatus(playerName, 0);
        }
        console.log(`✅ [MatchFound] Status resetado para ${remainingPlayers.length} jogadores restantes`);
      }

      // 7. Notificar frontend sobre cancelamento
      this.notifyMatchCancelled(matchId, declinedPlayerNames);

      console.log(`✅ [MatchFound] Partida ${matchId} cancelada e jogadores removidos`);

    } catch (error) {
      console.error(`❌ [MatchFound] Erro ao processar recusa:`, error);
    }
  }

  // ✅ Timeout de aceitação
  private async handleAcceptanceTimeout(matchId: number): Promise<void> {
    console.log(`⏰ [MatchFound] Timeout de aceitação para partida ${matchId}`);

    try {
      // Buscar jogadores que não aceitaram
      const queuePlayers = await this.dbManager.getActiveQueuePlayers();
      const nonAcceptedPlayers = queuePlayers
        .filter(p => p.acceptance_status === 0)
        .map(p => p.summoner_name);

      if (nonAcceptedPlayers.length > 0) {
        await this.handleMatchDeclined(matchId, nonAcceptedPlayers);
      }
    } catch (error) {
      console.error(`❌ [MatchFound] Erro no timeout:`, error);
    }
  }

  // ✅ CORREÇÃO: Enviar atualizações de timer em tempo real de forma otimizada
  private startTimerUpdates(matchId: number): void {
    const matchStatus = this.pendingMatches.get(matchId);
    if (!matchStatus) return;

    let timeLeft = Math.floor(this.ACCEPTANCE_TIMEOUT_MS / 1000); // 30 segundos

    // Enviar primeiro update imediatamente
    this.notifyTimerUpdate(matchId, timeLeft);

    const timerInterval = setInterval(() => {
      timeLeft--;

      // Enviar atualização do timer via WebSocket
      this.notifyTimerUpdate(matchId, timeLeft);

      // Log menos frequente para não poluir o console
      if (timeLeft % 5 === 0 || timeLeft <= 10) {
        console.log(`⏰ [MatchFound] Timer partida ${matchId}: ${timeLeft}s restantes`);
      }

      // Parar quando chegar a 0 ou partida não existir mais
      if (timeLeft <= 0 || !this.pendingMatches.has(matchId)) {
        clearInterval(timerInterval);
        console.log(`⏰ [MatchFound] Timer parado para partida ${matchId}`);
      }
    }, 1000);
  }

  // ✅ Aceitar automaticamente para bots
  private async autoAcceptForBots(matchId: number, players: string[]): Promise<void> {
    try {
      console.log(`🤖 [MatchFound] Verificando bots para partida ${matchId}...`);
      console.log(`🤖 [MatchFound] Jogadores:`, players);

      let botCount = 0;
      let humanCount = 0;

      // Buscar o status da partida no tracking local
      const matchStatus = this.pendingMatches.get(matchId);

      for (const playerName of players) {
        if (this.isBot(playerName)) {
          // Atualizar no banco de dados
          await this.dbManager.updatePlayerAcceptanceStatus(playerName, 1);

          // ✅ CORREÇÃO: Atualizar também o tracking local
          if (matchStatus) {
            matchStatus.acceptedPlayers.add(playerName);
          }

          console.log(`🤖 [MatchFound] Bot ${playerName} aceitou automaticamente`);
          botCount++;
        } else {
          console.log(`👤 [MatchFound] Jogador humano ${playerName} precisa aceitar manualmente`);
          humanCount++;
        }
      }

      console.log(`🤖 [MatchFound] Resumo: ${botCount} bots aceitaram, ${humanCount} humanos precisam aceitar`);

      // ✅ CORREÇÃO: Verificar se todos aceitaram após aceitar os bots
      if (matchStatus && matchStatus.acceptedPlayers.size === matchStatus.players.length) {
        console.log(`🎉 [MatchFound] Todos os jogadores (incluindo bots) aceitaram partida ${matchId}!`);
        await this.handleAllPlayersAccepted(matchId);
      } else if (matchStatus) {
        // Notificar progresso da aceitação
        this.notifyAcceptanceProgress(matchId, matchStatus);
      }

    } catch (error) {
      console.error('❌ [MatchFound] Erro na aceitação automática de bots:', error);
    }
  }

  private isBot(playerName: string): boolean {
    if (!playerName) return false;

    const nameCheck = playerName.toLowerCase();
    return nameCheck.includes('bot') ||
      nameCheck.includes('ai') ||
      nameCheck.includes('computer') ||
      nameCheck.includes('cpu') ||
      playerName.includes('#BOT') || // Padrão antigo (compatibilidade)
      /^bot\d+$/i.test(playerName); // ✅ NOVO: Padrão sequencial (Bot1, Bot2, etc.)
  }

  // ✅ MELHORADO: Sistema de notificação com múltiplas estratégias de entrega
  private async notifyMatchFound(matchId: number, allPlayersInMatch: string[], balancedTeams?: any, averageMMR?: any): Promise<void> {
    if (!this.wss) {
      console.error('❌ [MatchFound] WebSocket Server não disponível para notificação');
      return;
    }

    // ✅ CORREÇÃO: Preparar dados completos se balancedTeams estiver disponível
    let matchFoundData: any = {
      type: 'match_found',
      data: {
        matchId,
        players: allPlayersInMatch,
        timestamp: Date.now()
      }
    };

    // ✅ NOVO: Se temos dados balanceados, incluir informações completas
    console.log('🎯 [MatchFound] === VERIFICANDO DADOS BALANCEADOS ===');
    console.log('🎯 [MatchFound] balancedTeams presente:', !!balancedTeams);
    console.log('🎯 [MatchFound] balancedTeams.team1 presente:', !!(balancedTeams && balancedTeams.team1));
    console.log('🎯 [MatchFound] balancedTeams.team2 presente:', !!(balancedTeams && balancedTeams.team2));
    console.log('🎯 [MatchFound] averageMMR presente:', !!averageMMR);

    if (balancedTeams && balancedTeams.team1 && balancedTeams.team2) {
      const team1 = balancedTeams.team1;
      const team2 = balancedTeams.team2;
      const team1MMR = averageMMR?.team1 || 1200;
      const team2MMR = averageMMR?.team2 || 1200;

      console.log('🎯 [MatchFound] === DADOS BALANCEADOS ENCONTRADOS ===');
      console.log('🎯 [MatchFound] team1:', team1.map((p: any) => ({ name: p.summonerName, lane: p.assignedLane, mmr: p.mmr })));
      console.log('🎯 [MatchFound] team2:', team2.map((p: any) => ({ name: p.summonerName, lane: p.assignedLane, mmr: p.mmr })));
      console.log('🎯 [MatchFound] MMRs:', { team1: team1MMR, team2: team2MMR });

      console.log('🎯 [MatchFound] === PREPARANDO DADOS PARA FRONTEND ===');
      console.log('🎯 [MatchFound] Team1 dados originais:', team1.map((p: any) => ({
        name: p.summonerName,
        assignedLane: p.assignedLane,
        primaryLane: p.primaryLane,
        secondaryLane: p.secondaryLane,
        isAutofill: p.isAutofill,
        teamIndex: p.teamIndex
      })));
      console.log('🎯 [MatchFound] Team2 dados originais:', team2.map((p: any) => ({
        name: p.summonerName,
        assignedLane: p.assignedLane,
        primaryLane: p.primaryLane,
        secondaryLane: p.secondaryLane,
        isAutofill: p.isAutofill,
        teamIndex: p.teamIndex
      })));

      matchFoundData.data = {
        ...matchFoundData.data,
        // ✅ CORREÇÃO: Incluir todas as informações necessárias para o frontend
        teammates: team1.map((p: any, index: number) => {
          const playerData = {
            summonerName: p.summonerName,
            mmr: p.mmr,
            primaryLane: p.primaryLane,
            secondaryLane: p.secondaryLane,
            assignedLane: p.assignedLane, // ✅ NOVO: Lane atribuída após balanceamento
            teamIndex: index, // ✅ NOVO: Índice no time (0-4)
            isAutofill: p.isAutofill || false, // ✅ NOVO: Se foi autofill
            team: 'blue' // ✅ NOVO: Identificação do time
          };
          console.log(`🎯 [MatchFound] Team1 player ${index}:`, playerData);
          return playerData;
        }),
        enemies: team2.map((p: any, index: number) => {
          const playerData = {
            summonerName: p.summonerName,
            mmr: p.mmr,
            primaryLane: p.primaryLane,
            secondaryLane: p.secondaryLane,
            assignedLane: p.assignedLane, // ✅ NOVO: Lane atribuída após balanceamento
            teamIndex: index + 5, // ✅ NOVO: Índice no time (5-9)
            isAutofill: p.isAutofill || false, // ✅ NOVO: Se foi autofill
            team: 'red' // ✅ NOVO: Identificação do time
          };
          console.log(`🎯 [MatchFound] Team2 player ${index}:`, playerData);
          return playerData;
        }),
        // ✅ CORREÇÃO: Estatísticas detalhadas dos times
        teamStats: {
          team1: {
            averageMMR: Math.round(team1MMR),
            totalMMR: Math.round(team1MMR * 5),
            players: team1.length,
            lanes: team1.map((p: any) => p.assignedLane).sort()
          },
          team2: {
            averageMMR: Math.round(team2MMR),
            totalMMR: Math.round(team2MMR * 5),
            players: team2.length,
            lanes: team2.map((p: any) => p.assignedLane).sort()
          }
        },
        // ✅ CORREÇÃO: Informações de balanceamento
        balancingInfo: {
          mmrDifference: Math.abs(team1MMR - team2MMR),
          isWellBalanced: Math.abs(team1MMR - team2MMR) <= 100,
          autofillCount: {
            team1: team1.filter((p: any) => p.isAutofill).length,
            team2: team2.filter((p: any) => p.isAutofill).length
          }
        },
        // ✅ CORREÇÃO: Timer e deadline
        acceptanceDeadline: new Date(Date.now() + 30000).toISOString(), // 30 segundos para aceitar
        acceptanceTimer: 30, // ✅ NOVO: Timer em segundos para o frontend
        acceptTimeout: 30, // ✅ COMPATIBILIDADE: Campo antigo para compatibilidade
        phase: 'accept', // ✅ NOVO: Fase da partida
        message: 'Partida encontrada! Aceite para continuar.',
        // ✅ NOVO: Informações adicionais para o frontend
        gameMode: 'RANKED_SOLO_5x5',
        mapId: 11, // Summoner's Rift
        queueType: 'RANKED'
      };
    }

    const message = matchFoundData;

    console.log(`🎯 [MatchFound] === INICIANDO NOTIFICAÇÃO PARA PARTIDA ${matchId} ===`);
    console.log(`📋 [MatchFound] Jogadores na partida:`, allPlayersInMatch);
    console.log(`📤 [MatchFound] Enviando mensagem match_found:`, JSON.stringify(message, null, 2));

    // ✅ USAR RETRY
    console.log('🎯 [MatchFound] === ENVIANDO NOTIFICAÇÃO ===');
    console.log('🎯 [MatchFound] Mensagem final:', JSON.stringify(message, null, 2));
    console.log('🎯 [MatchFound] Jogadores para notificar:', allPlayersInMatch);

    await this.sendNotificationWithRetry(message, allPlayersInMatch);

    // ✅ ESTRATÉGIA 4: Log final com métricas
    // (O log detalhado já está no método de retry)
    console.log(`✅ [MatchFound] === NOTIFICAÇÃO COMPLETA PARA PARTIDA ${matchId} ===`);
  }

  // ✅ CORRIGIDO: Sistema de notificação WebSocket direcionado
  private async sendWebSocketNotifications(message: any, allPlayersInMatch: string[]): Promise<{
    notifiedPlayers: string[],
    totalClients: number,
    identifiedClients: number,
    matchedClients: number
  }> {
    const notifiedPlayers: string[] = [];
    let totalClients = 0;
    let identifiedClients = 0;
    let matchedClients = 0;

    this.wss.clients.forEach((client: WebSocket) => {
      if (client.readyState === WebSocket.OPEN) {
        totalClients++;
        const clientInfo = (client as any).playerInfo;
        const isIdentified = (client as any).isIdentified;

        if (isIdentified) {
          identifiedClients++;
        }

        // ✅ CORREÇÃO: Enviar APENAS para jogadores identificados na partida
        if (isIdentified && clientInfo) {
          const isInMatch = this.isPlayerInMatch(clientInfo, allPlayersInMatch);

          if (isInMatch) {
            try {
              client.send(JSON.stringify(message));
              matchedClients++;

              // ✅ RASTREAR: Qual jogador foi notificado
              const playerIdentifier = this.getPlayerIdentifier(clientInfo);
              if (playerIdentifier) {
                notifiedPlayers.push(playerIdentifier);
                console.log(`✅ [MatchFound] Notificação enviada para: ${playerIdentifier}`);
              }
            } catch (error) {
              console.error('❌ [MatchFound] Erro ao enviar notificação:', error);
            }
          } else {
            console.log(`➖ [MatchFound] Cliente identificado mas não está na partida: ${this.getPlayerIdentifier(clientInfo)}`);
          }
        } else {
          // ❌ REMOVIDO: Fallback perigoso para clientes não identificados
          console.log(`⚠️ [MatchFound] Cliente não identificado ignorado: ${clientInfo ? 'tem dados' : 'sem dados'}`);
        }
      }
    });

    return {
      notifiedPlayers,
      totalClients,
      identifiedClients,
      matchedClients
    };
  }

  // ✅ NOVO: Sistema de retry para notificações WebSocket
  private async sendNotificationWithRetry(message: any, allPlayersInMatch: string[], maxRetries: number = 3): Promise<void> {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      const wsResults = await this.sendWebSocketNotifications(message, allPlayersInMatch);
      const missingPlayers = allPlayersInMatch.filter(player => !wsResults.notifiedPlayers.includes(player));
      if (missingPlayers.length === 0) {
        console.log(`✅ [MatchFound] Todas as notificações enviadas com sucesso na tentativa ${attempt}`);
        return;
      }
      console.warn(`⚠️ [MatchFound] Tentativa ${attempt}: ${missingPlayers.length} jogadores não notificados:`, missingPlayers);
      if (attempt < maxRetries) {
        await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
      }
    }
    // Última tentativa: fallback
    console.error(`❌ [MatchFound] Falha após ${maxRetries} tentativas, usando fallback`);
    await this.sendFallbackNotifications(message.data.matchId, allPlayersInMatch);
  }

  // ✅ NOVO: Sistema de fallback para jogadores não notificados
  private async sendFallbackNotifications(matchId: number, missingPlayers: string[]): Promise<void> {
    console.log(`🔄 [MatchFound] Iniciando fallback para ${missingPlayers.length} jogadores não notificados`);

    // ✅ FALLBACK 1: Tentar notificar via banco de dados (para jogadores offline)
    try {
      for (const playerIdentifier of missingPlayers) {
        console.log(`📝 [MatchFound] Registrando notificação pendente para: ${playerIdentifier}`);
        // Aqui você pode implementar um sistema de notificações pendentes no banco
        // que será entregue quando o jogador reconectar
      }
    } catch (error) {
      console.error('❌ [MatchFound] Erro ao registrar notificações pendentes:', error);
    }

    // ✅ FALLBACK 2: Broadcast geral como último recurso
    console.log(`📢 [MatchFound] Executando broadcast geral como fallback`);
    this.broadcastMessage({
      type: 'match_found_fallback',
      data: {
        matchId,
        message: 'Partida encontrada! Verifique se você está na partida.',
        timestamp: Date.now()
      }
    });
  }

  // ✅ CORREÇÃO: Usar PlayerIdentifierService centralizado
  private getPlayerIdentifier(playerInfo: any): string | null {
    return PlayerIdentifierService.getPlayerIdentifier(playerInfo);
  }

  // ✅ CORREÇÃO: Usar PlayerIdentifierService centralizado
  private isPlayerInMatch(playerInfo: any, playersInMatch: string[]): boolean {
    return PlayerIdentifierService.isPlayerInMatch(playerInfo, playersInMatch);
  }

  private notifyAcceptanceProgress(matchId: number, matchStatus: AcceptanceStatus): void {
    if (!this.wss) return;

    const message = {
      type: 'match_acceptance_progress',
      data: {
        matchId,
        acceptedCount: matchStatus.acceptedPlayers.size,
        totalPlayers: matchStatus.players.length,
        acceptedPlayers: Array.from(matchStatus.acceptedPlayers),
        pendingPlayers: matchStatus.players.filter(p =>
          !matchStatus.acceptedPlayers.has(p) && !matchStatus.declinedPlayers.has(p)
        )
      },
      timestamp: Date.now()
    };

    this.broadcastMessage(message);
  }

  private notifyAllPlayersAccepted(matchId: number, match: any): void {
    if (!this.wss) return;

    const message = {
      type: 'match_fully_accepted',
      data: {
        matchId,
        match,
        message: 'Todos os jogadores aceitaram! Iniciando draft...'
      },
      timestamp: Date.now()
    };

    this.broadcastMessage(message);
    console.log(`📢 [MatchFound] Notificação de aceitação completa enviada (${matchId})`);
  }

  private notifyMatchCancelled(matchId: number, declinedPlayers: string[]): void {
    if (!this.wss) return;

    const message = {
      type: 'match_cancelled',
      data: {
        matchId,
        declinedPlayers,
        message: 'Partida cancelada devido a recusas. Jogadores que recusaram foram removidos da fila.'
      },
      timestamp: Date.now()
    };

    // ✅ NOVO: Envio direcionado igual ao match_found
    console.log(`🚫 [MatchFound] Preparando notificação de cancelamento para partida ${matchId}`);

    // Buscar dados da partida para obter lista de jogadores
    this.dbManager.getCustomMatchById(matchId).then(match => {
      if (!match) {
        console.warn(`⚠️ [MatchFound] Partida ${matchId} não encontrada para notificação de cancelamento`);
        this.broadcastMessage(message); // Fallback para todos
        return;
      }

      let allPlayersInMatch: string[] = [];
      try {
        const team1 = typeof match.team1_players === 'string'
          ? JSON.parse(match.team1_players)
          : (match.team1_players || []);
        const team2 = typeof match.team2_players === 'string'
          ? JSON.parse(match.team2_players)
          : (match.team2_players || []);

        allPlayersInMatch = [...team1, ...team2];
      } catch (error) {
        console.error(`❌ [MatchFound] Erro ao parsear jogadores da partida ${matchId}:`, error);
        this.broadcastMessage(message); // Fallback para todos
        return;
      }

      console.log('🎯 [MatchFound] Jogadores afetados pelo cancelamento:', allPlayersInMatch);

      // ✅ NOVO: Enviar apenas para jogadores que estavam na partida
      let sentCount = 0;
      let identifiedClients = 0;
      let matchedClients = 0;

      this.wss.clients.forEach((client: WebSocket) => {
        if (client.readyState === WebSocket.OPEN) {
          const clientInfo = (client as any).playerInfo;
          const isIdentified = (client as any).isIdentified;

          if (isIdentified) {
            identifiedClients++;
          }

          // ✅ VERIFICAR: Se o cliente estava na partida cancelada
          if (isIdentified && clientInfo) {
            const isInMatch = this.isPlayerInMatch(clientInfo, allPlayersInMatch);

            if (isInMatch) {
              try {
                client.send(JSON.stringify(message));
                sentCount++;
                matchedClients++;
                console.log(`✅ [MatchFound] Cancelamento notificado para: ${clientInfo.displayName || clientInfo.summonerName}`);
              } catch (error) {
                console.error('❌ [MatchFound] Erro ao enviar notificação de cancelamento:', error);
              }
            } else {
              console.log(`➖ [MatchFound] Cliente não estava na partida cancelada: ${clientInfo.displayName || clientInfo.summonerName}`);
            }
          } else {
            // ✅ FALLBACK: Para clientes não identificados, enviar para todos (compatibilidade)
            try {
              client.send(JSON.stringify(message));
              sentCount++;
              console.log(`📡 [MatchFound] Cancelamento enviado para cliente não identificado (fallback)`);
            } catch (error) {
              console.error('❌ [MatchFound] Erro ao enviar notificação de cancelamento:', error);
            }
          }
        }
      });

      console.log(`📢 [MatchFound] Resumo do cancelamento:`, {
        totalClients: this.wss.clients?.size || 0,
        identifiedClients,
        matchedClients,
        sentCount,
        matchId
      });
    }).catch(error => {
      console.error(`❌ [MatchFound] Erro ao buscar dados da partida para cancelamento:`, error);
      this.broadcastMessage(message); // Fallback para todos
    });

    console.log(`📢 [MatchFound] Notificação de cancelamento processada (${matchId})`);
  }

  // ✅ NOVO: Notificar atualização do timer
  private notifyTimerUpdate(matchId: number, timeLeft: number): void {
    if (!this.wss) return;

    const message = {
      type: 'match_timer_update',
      data: {
        matchId,
        timeLeft,
        isUrgent: timeLeft <= 10
      },
      timestamp: Date.now()
    };

    this.broadcastMessage(message);
  }

  private broadcastMessage(message: any): void {
    console.log('🔍 [MatchFound] broadcastMessage chamado');
    console.log('🔍 [MatchFound] WebSocket clients:', this.wss?.clients?.size || 0);

    if (!this.wss?.clients) {
      console.error('❌ [MatchFound] WebSocket clients não disponível!');
      return;
    }

    let sentCount = 0;
    this.wss.clients.forEach((client: WebSocket) => {
      console.log('🔍 [MatchFound] Client state:', client.readyState);
      if (client.readyState === WebSocket.OPEN) {
        try {
          client.send(JSON.stringify(message));
          sentCount++;
          console.log('✅ [MatchFound] Mensagem enviada para cliente');
        } catch (error) {
          console.error('❌ [MatchFound] Erro ao enviar mensagem:', error);
        }
      } else {
        console.log('⚠️ [MatchFound] Cliente não está aberto, estado:', client.readyState);
      }
    });

    console.log(`📤 [MatchFound] Mensagem enviada para ${sentCount} clientes`);
  }

  // ✅ Shutdown
  shutdown(): void {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
    }

    // Limpar timeouts
    this.pendingMatches.forEach(match => {
      if (match.timeout) {
        clearTimeout(match.timeout);
      }
    });
    this.pendingMatches.clear();

    console.log('🛑 [MatchFound] MatchFoundService desligado');
  }
}