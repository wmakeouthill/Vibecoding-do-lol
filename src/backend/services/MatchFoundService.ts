import { WebSocket } from 'ws';
import { DatabaseManager } from '../database/DatabaseManager';
import { DiscordService } from './DiscordService';

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

    // Verificar se o DiscordService está pronto
    if (discordService && discordService.isReady()) {
      this.discordService = discordService;
      console.log('🔗 [MatchFound] DiscordService configurado e pronto');
    } else {
      console.warn('⚠️ [MatchFound] DiscordService não está pronto ou não foi fornecido');
    }

    // ✅ DEBUG: Verificar se DiscordService foi injetado
    console.log('🔧 [MatchFound] Construtor chamado');
    console.log('🔧 [MatchFound] DiscordService recebido:', !!discordService);
    if (discordService) {
      console.log('🔧 [MatchFound] DiscordService tipo:', typeof discordService);
      console.log('🔧 [MatchFound] DiscordService é instância:', discordService.constructor.name);
    }
  }

  // ✅ NOVO: Método para definir DiscordService após construção
  setDiscordService(discordService: DiscordService): void {
    this.discordService = discordService;
    console.log('🔗 [MatchFound] DiscordService configurado');
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
      this.notifyMatchFound(matchId as number, playersForAcceptance);

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

      // 6. Notificar que todos aceitaram (será processado pelo DraftService)
      this.notifyAllPlayersAccepted(matchId, match);

      // 7. Criar match no Discord
      if (this.discordService?.isReady()) {
        try {
          console.log(`🤖 [MatchFound] Criando match Discord para partida ${matchId}...`);
          await this.discordService.createDiscordMatch(matchId, match);
          console.log(`🤖 [MatchFound] Match Discord criado com sucesso`);
        } catch (discordError) {
          console.error(`❌ [MatchFound] Erro ao criar match Discord:`, discordError);
          // Não falhar o processo, apenas registrar o erro
        }
      } else {
        console.warn(`⚠️ [MatchFound] DiscordService não está disponível ou não está pronto`);
      }

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
    return playerName.toLowerCase().includes('bot') ||
      playerName.toLowerCase().includes('ai') ||
      playerName.toLowerCase().includes('computer') ||
      playerName.toLowerCase().includes('cpu');
  }

  // ✅ MELHORADO: Sistema de notificação com múltiplas estratégias de entrega
  private async notifyMatchFound(matchId: number, allPlayersInMatch: string[]): Promise<void> {
    if (!this.wss) {
      console.error('❌ [MatchFound] WebSocket Server não disponível para notificação');
      return;
    }

    const message = {
      type: 'match_found',
      data: {
        matchId,
        players: allPlayersInMatch,
        timestamp: Date.now()
      }
    };

    console.log(`🎯 [MatchFound] === INICIANDO NOTIFICAÇÃO PARA PARTIDA ${matchId} ===`);
    console.log(`📋 [MatchFound] Jogadores na partida:`, allPlayersInMatch);
    console.log(`📤 [MatchFound] Enviando mensagem match_found:`, JSON.stringify(message, null, 2));

    // ✅ ESTRATÉGIA 1: Notificação direcionada via WebSocket (PRINCIPAL)
    const wsResults = await this.sendWebSocketNotifications(message, allPlayersInMatch);

    // ✅ ESTRATÉGIA 2: Verificar se todos os jogadores foram notificados
    const notifiedPlayers = new Set(wsResults.notifiedPlayers);
    const missingPlayers = allPlayersInMatch.filter(player => !notifiedPlayers.has(player));

    console.log(`📊 [MatchFound] Resultado WebSocket:`, {
      totalPlayers: allPlayersInMatch.length,
      notifiedPlayers: wsResults.notifiedPlayers.length,
      missingPlayers: missingPlayers.length,
      totalClients: wsResults.totalClients,
      identifiedClients: wsResults.identifiedClients,
      matchedClients: wsResults.matchedClients
    });

    // ✅ ESTRATÉGIA 3: Fallback para jogadores não notificados
    if (missingPlayers.length > 0) {
      console.warn(`⚠️ [MatchFound] Jogadores não notificados via WebSocket:`, missingPlayers);
      await this.sendFallbackNotifications(matchId, missingPlayers);
    }

    // ✅ ESTRATÉGIA 4: Log final com métricas
    console.log(`✅ [MatchFound] === NOTIFICAÇÃO COMPLETA PARA PARTIDA ${matchId} ===`);
    console.log(`📈 [MatchFound] Métricas finais:`, {
      matchId,
      totalPlayers: allPlayersInMatch.length,
      wsNotified: wsResults.notifiedPlayers.length,
      fallbackAttempted: missingPlayers.length,
      successRate: `${((wsResults.notifiedPlayers.length / allPlayersInMatch.length) * 100).toFixed(1)}%`
    });
  }

  // ✅ NOVO: Sistema de notificação WebSocket melhorado
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

        // ✅ VERIFICAR: Se o cliente está identificado e está na partida
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
          // ✅ FALLBACK: Para clientes não identificados, enviar para todos (compatibilidade)
          try {
            client.send(JSON.stringify(message));
            console.log(`📡 [MatchFound] Notificação enviada para cliente não identificado (fallback)`);
          } catch (error) {
            console.error('❌ [MatchFound] Erro ao enviar notificação:', error);
          }
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

  // ✅ NOVO: Obter identificador único do jogador
  private getPlayerIdentifier(playerInfo: any): string | null {
    // ✅ PRIORIDADE 1: gameName#tagLine (padrão)
    if (playerInfo.gameName && playerInfo.tagLine) {
      return `${playerInfo.gameName}#${playerInfo.tagLine}`;
    }

    // ✅ PRIORIDADE 2: displayName (se já está no formato correto)
    if (playerInfo.displayName && playerInfo.displayName.includes('#')) {
      return playerInfo.displayName;
    }

    // ✅ PRIORIDADE 3: summonerName (fallback)
    if (playerInfo.summonerName) {
      return playerInfo.summonerName;
    }

    return null;
  }

  // ✅ MELHORADO: Verificar se um jogador está na partida com identificação mais precisa
  private isPlayerInMatch(playerInfo: any, playersInMatch: string[]): boolean {
    if (!playerInfo || !playersInMatch.length) return false;

    const playerIdentifier = this.getPlayerIdentifier(playerInfo);
    if (!playerIdentifier) {
      console.warn('⚠️ [MatchFound] Não foi possível obter identificador do jogador:', playerInfo);
      return false;
    }

    // ✅ COMPARAÇÃO EXATA: Priorizar match exato
    for (const matchPlayer of playersInMatch) {
      if (playerIdentifier === matchPlayer) {
        console.log(`✅ [MatchFound] Match exato: ${playerIdentifier} === ${matchPlayer}`);
        return true;
      }
    }

    // ✅ COMPARAÇÃO POR GAMENAME: Fallback apenas se necessário
    if (playerIdentifier.includes('#')) {
      const playerGameName = playerIdentifier.split('#')[0];
      for (const matchPlayer of playersInMatch) {
        if (matchPlayer.includes('#')) {
          const matchPlayerGameName = matchPlayer.split('#')[0];
          if (playerGameName === matchPlayerGameName) {
            console.log(`✅ [MatchFound] Match por gameName: ${playerGameName} === ${matchPlayerGameName}`);
            return true;
          }
        }
      }
    }

    console.log(`❌ [MatchFound] Nenhum match encontrado para: ${playerIdentifier}`);
    return false;
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