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

  constructor(dbManager: DatabaseManager, wss?: any, discordService?: DiscordService) {
    this.dbManager = dbManager;
    this.wss = wss;
    this.discordService = discordService; // ✅ NOVO: Armazenar referência
    
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
      this.notifyMatchFound(matchId as number, matchData);

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
    // ✅ PROTEÇÃO: Verificar se já está sendo processado
    if (this.processingMatches.has(matchId)) {
      console.log(`⏳ [MatchFound] Partida ${matchId} já está sendo processada, ignorando chamada duplicada`);
      return;
    }
    
    this.processingMatches.add(matchId);
    console.log(`🎉 [MatchFound] ========== TODOS JOGADORES ACEITARAM ==========`);
    console.log(`🎉 [MatchFound] Todos os jogadores aceitaram partida ${matchId}!`);
    console.log(`🎉 [MatchFound] Timestamp: ${new Date().toISOString()}`);
    
    try {
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

      // 7. ✅ NOVO: Criar match no Discord se o serviço estiver disponível
      console.log(`🤖 [MatchFound] ========== VERIFICANDO DISCORD SERVICE ==========`);
      console.log(`🤖 [MatchFound] DiscordService existe:`, !!this.discordService);
      console.log(`🤖 [MatchFound] DiscordService referência:`, this.discordService ? 'VÁLIDA' : 'NULL/UNDEFINED');
      if (this.discordService) {
        console.log(`🤖 [MatchFound] DiscordService tipo:`, typeof this.discordService);
        console.log(`🤖 [MatchFound] DiscordService constructor:`, this.discordService.constructor.name);
        console.log(`🤖 [MatchFound] DiscordService disponível! Verificando conexão...`);
        console.log(`🤖 [MatchFound] Discord conectado:`, this.discordService.isDiscordConnected());
        console.log(`🤖 [MatchFound] ========== CHAMANDO createDiscordMatch ==========`);
        
        // ✅ PROTEÇÃO ADICIONAL: Verificar se já existe um match Discord para esta partida
        try {
          console.log(`🤖 [MatchFound] Verificando se já existe match Discord para partida ${matchId}...`);
          await this.discordService.createDiscordMatch(matchId, match);
          console.log(`🤖 [MatchFound] ========== createDiscordMatch EXECUTADO ==========`);
        } catch (discordError) {
          console.error(`❌ [MatchFound] Erro ao criar match Discord:`, discordError);
          // Não falhar o processo todo se o Discord falhar
        }
      } else {
        console.warn(`⚠️ [MatchFound] PROBLEMA: DiscordService não disponível!`);
        console.warn(`⚠️ [MatchFound] this.discordService =`, this.discordService);
      }

      console.log(`✅ [MatchFound] Partida ${matchId} totalmente aceita - encaminhando para Draft`);

    } catch (error) {
      console.error(`❌ [MatchFound] Erro ao processar aceitação completa:`, error);
    } finally {
      // ✅ IMPORTANTE: Remover da proteção após processamento
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

      // 4. ✅ NOVO: Limpar match no Discord se existir
      if (this.discordService) {
        try {
          console.log(`🤖 [MatchFound] Limpando match ${matchId} no Discord...`);
          await this.discordService.cleanupMatchByCustomId(matchId);
          console.log(`🤖 [MatchFound] Match ${matchId} limpo no Discord`);
        } catch (discordError) {
          console.error(`❌ [MatchFound] Erro ao limpar match ${matchId} no Discord:`, discordError);
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

  // ✅ Notificações WebSocket
  private notifyMatchFound(matchId: number, matchData: any): void {
    console.log('🔍 [MatchFound] notifyMatchFound chamado');
    console.log('🔍 [MatchFound] WebSocket Server:', !!this.wss);
    console.log('🔍 [MatchFound] WebSocket clients:', this.wss?.clients?.size || 0);
    
    if (!this.wss) {
      console.error('❌ [MatchFound] WebSocket Server não disponível!');
      return;
    }

    console.log(`🎮 [MatchFound] Preparando notificação match_found para partida ${matchId}`);
    console.log(`🎮 [MatchFound] Dados da partida:`, {
      matchId,
      team1Count: matchData.team1Players?.length || 0,
      team2Count: matchData.team2Players?.length || 0,
      hasBalancedTeams: !!matchData.balancedTeams,
      clientsConnected: this.wss.clients?.size || 0
    });

    // ✅ NOVO: Obter lista de jogadores da partida
    const allPlayersInMatch = [...(matchData.team1Players || []), ...(matchData.team2Players || [])];
    console.log('🎯 [MatchFound] Jogadores da partida:', allPlayersInMatch);

    const message = {
      type: 'match_found',
      data: {
        matchId,
        team1: matchData.team1Players,
        team2: matchData.team2Players,
        averageMMR: matchData.averageMMR,
        balancedTeams: matchData.balancedTeams,
        message: 'Partida encontrada! Aguardando aceitação dos jogadores...',
        acceptanceTimeout: this.ACCEPTANCE_TIMEOUT_MS
      },
      timestamp: Date.now()
    };

    console.log(`📤 [MatchFound] Enviando mensagem match_found:`, JSON.stringify(message, null, 2));
    
    // ✅ NOVO: Enviar apenas para jogadores que estão na partida
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

        // ✅ VERIFICAR: Se o cliente está identificado e está na partida
        if (isIdentified && clientInfo) {
          const isInMatch = this.isPlayerInMatch(clientInfo, allPlayersInMatch);
          
          if (isInMatch) {
            try {
              client.send(JSON.stringify(message));
              sentCount++;
              matchedClients++;
              console.log(`✅ [MatchFound] Notificação enviada para: ${clientInfo.displayName || clientInfo.summonerName}`);
            } catch (error) {
              console.error('❌ [MatchFound] Erro ao enviar notificação:', error);
            }
          } else {
            console.log(`➖ [MatchFound] Cliente identificado mas não está na partida: ${clientInfo.displayName || clientInfo.summonerName}`);
          }
        } else {
          // ✅ FALLBACK: Para clientes não identificados, enviar para todos (compatibilidade)
          try {
            client.send(JSON.stringify(message));
            sentCount++;
            console.log(`📡 [MatchFound] Notificação enviada para cliente não identificado (fallback)`);
          } catch (error) {
            console.error('❌ [MatchFound] Erro ao enviar notificação:', error);
          }
        }
      }
    });

    console.log(`📢 [MatchFound] Resumo do envio:`, {
      totalClients: this.wss.clients?.size || 0,
      identifiedClients,
      matchedClients,
      sentCount,
      matchId
    });
  }

  // ✅ NOVO: Verificar se um jogador está na partida
  private isPlayerInMatch(playerInfo: any, playersInMatch: string[]): boolean {
    if (!playerInfo || !playersInMatch.length) return false;

    // Obter identificadores possíveis do jogador
    const identifiers = [];
    
    if (playerInfo.displayName) {
      identifiers.push(playerInfo.displayName);
    }
    if (playerInfo.summonerName) {
      identifiers.push(playerInfo.summonerName);
    }
    if (playerInfo.gameName) {
      identifiers.push(playerInfo.gameName);
      if (playerInfo.tagLine) {
        identifiers.push(`${playerInfo.gameName}#${playerInfo.tagLine}`);
      }
    }

    // Verificar se algum identificador coincide com os jogadores da partida
    for (const identifier of identifiers) {
      for (const matchPlayer of playersInMatch) {
        // Comparação exata
        if (identifier === matchPlayer) {
          console.log(`✅ [MatchFound] Match exato: ${identifier} === ${matchPlayer}`);
          return true;
        }
        
        // Comparação por gameName (ignorando tag)
        if (identifier.includes('#') && matchPlayer.includes('#')) {
          const identifierGameName = identifier.split('#')[0];
          const matchPlayerGameName = matchPlayer.split('#')[0];
          if (identifierGameName === matchPlayerGameName) {
            console.log(`✅ [MatchFound] Match por gameName: ${identifierGameName} === ${matchPlayerGameName}`);
            return true;
          }
        }
        
        // Comparação de gameName com nome completo
        if (identifier.includes('#')) {
          const identifierGameName = identifier.split('#')[0];
          if (identifierGameName === matchPlayer) {
            console.log(`✅ [MatchFound] Match gameName com nome completo: ${identifierGameName} === ${matchPlayer}`);
            return true;
          }
        }
        
        if (matchPlayer.includes('#')) {
          const matchPlayerGameName = matchPlayer.split('#')[0];
          if (identifier === matchPlayerGameName) {
            console.log(`✅ [MatchFound] Match nome com gameName: ${identifier} === ${matchPlayerGameName}`);
            return true;
          }
        }
      }
    }

    console.log(`❌ [MatchFound] Nenhum match encontrado para:`, {
      playerIdentifiers: identifiers,
      matchPlayers: playersInMatch
    });
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

    this.broadcastMessage(message);
    console.log(`📢 [MatchFound] Notificação de cancelamento enviada (${matchId})`);
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