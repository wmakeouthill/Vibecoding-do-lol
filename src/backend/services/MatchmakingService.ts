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
  preferences?: {
    primaryLane?: string;
    secondaryLane?: string;
    autoAccept?: boolean;
    assignedLane?: string;
    isAutofill?: boolean;
  };
}

interface Match {
  id: number;
  team1: QueuedPlayer[];
  team2: QueuedPlayer[];
  createdAt: Date;
  status: 'waiting' | 'in_progress' | 'completed' | 'waiting_accept';
  averageMMR1: number;
  averageMMR2: number;
  acceptedPlayers: Set<number>; // IDs dos jogadores que aceitaram
  acceptTimeout?: NodeJS.Timeout; // Timer para timeout da aceitação
}

interface QueueStatus {
  playersInQueue: number;
  averageWaitTime: number;
  estimatedMatchTime: number;
  isActive: boolean;
  playersInQueueList?: QueuedPlayerInfo[];
  recentActivities?: QueueActivity[];
}

interface QueuedPlayerInfo {
  summonerName: string;
  tagLine?: string;
  primaryLane: string;
  secondaryLane: string;
  primaryLaneDisplay: string;
  secondaryLaneDisplay: string;
  mmr: number;
  queuePosition: number;
  joinTime: Date;
}

interface QueueActivity {
  id: string;
  timestamp: Date;
  type: 'player_joined' | 'player_left' | 'match_created' | 'system_update' | 'queue_cleared';
  message: string;
  playerName?: string;
  playerTag?: string;
  lane?: string;
}

export class MatchmakingService {
  private dbManager: DatabaseManager;
  private wss: any; // WebSocketServer
  private queue: QueuedPlayer[] = [];
  private activeMatches: Map<number, Match> = new Map();
  private matchmakingInterval: NodeJS.Timeout | null = null;
  private cleanupInterval: NodeJS.Timeout | null = null; // Novo: intervalo de limpeza
  private isActive = true;
  private recentActivities: QueueActivity[] = [];
  private readonly MAX_ACTIVITIES = 20;
  private readonly QUEUE_TIMEOUT_MINUTES = 120; // Timeout para jogadores inativos (2 horas)
  private readonly CLEANUP_INTERVAL_MS = 30000; // Limpeza a cada 30 segundos
  private nextMatchId = 1; // Adicionar propriedade nextMatchId

  // Otimizações de performance - REMOVIDO DEBOUNCE DESNECESSÁRIO
  // Broadcast imediato apenas quando necessário (entrada/saída da fila)
  private lastBroadcastTime = 0;
  private readonly MIN_BROADCAST_INTERVAL = 100; // Mínimo 100ms entre broadcasts para evitar spam

  // NOVO: Sistema de sincronização via MySQL
  private syncInterval: NodeJS.Timeout | null = null;
  private readonly SYNC_INTERVAL_MS = 2000; // Sincronizar a cada 2 segundos
  private lastSyncTime = 0;

  constructor(dbManager: DatabaseManager, wss?: any) {
    this.dbManager = dbManager;
    this.wss = wss;
    console.log('🎯 MatchmakingService inicializado');
  }

  async initialize(): Promise<void> {
    console.log('🚀 Inicializando MatchmakingService...');

    // Carregar fila do banco de dados
    await this.loadQueueFromDatabase();

    // Iniciar intervalos
    this.startMatchmakingInterval();
    this.startCleanupInterval();
    
    // NOVO: Iniciar sincronização via MySQL
    this.startMySQLSync();

    console.log('✅ MatchmakingService inicializado com sucesso');
  }

  // NOVO: Iniciar sincronização via MySQL
  private startMySQLSync(): void {
    console.log('⚠️ [MySQL Sync] Sincronização automática DESABILITADA para preservar dados');
    console.log('🔧 [MySQL Sync] Sincronização será executada apenas sob demanda (refreshs manuais)');
    
    // ✅ DESABILITADO: Sincronização automática a cada 2 segundos
    // Motivo: Prevenir sobrescrita de custom_lp e lanes originais
    /*
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
    }

    this.syncInterval = setInterval(async () => {
      try {
        await this.syncQueueWithDatabase();
      } catch (error) {
        console.error('❌ [MySQL Sync] Erro na sincronização:', error);
      }
    }, this.SYNC_INTERVAL_MS);

    console.log(`🔄 [MySQL Sync] Sincronização iniciada a cada ${this.SYNC_INTERVAL_MS}ms`);
    */
  }

  // ✅ CORREÇÃO: Sincronizar fila com banco de dados (APENAS LEITURA)
  private async syncQueueWithDatabase(): Promise<void> {
    try {
      const currentTime = Date.now();
      if (currentTime - this.lastSyncTime < this.SYNC_INTERVAL_MS) {
        return; // Evitar sincronização muito frequente
      }
      this.lastSyncTime = currentTime;

      console.log('🔄 [MySQL Sync] Iniciando sincronização READ-ONLY da fila com MySQL...');

      // Buscar estado atual da fila no MySQL
      const dbPlayers = await this.dbManager.getActiveQueuePlayers();
      console.log(`📊 [MySQL Sync] Encontrados ${dbPlayers.length} jogadores no MySQL`);
      console.log(`📊 [MySQL Sync] Fila local atual: ${this.queue.length} jogadores`);

      if (dbPlayers.length === 0 && this.queue.length === 0) {
        console.log('✅ [MySQL Sync] Fila vazia em ambos os sistemas - nada para sincronizar');
        return;
      }

      // Criar set de identificadores únicos para cada sistema
      const dbPlayerIds = new Set(dbPlayers.map(p => p.summoner_name));
      const localPlayerIds = new Set(this.queue.map(p => p.summonerName));

      console.log('🔍 [MySQL Sync] Jogadores no MySQL:', Array.from(dbPlayerIds));
      console.log('🔍 [MySQL Sync] Jogadores na fila local:', Array.from(localPlayerIds));

      // 1. ✅ APENAS REMOVER da fila local jogadores que não estão no MySQL
      const playersToRemoveFromLocal = this.queue.filter(localPlayer => 
        !dbPlayerIds.has(localPlayer.summonerName)
      );

      for (const player of playersToRemoveFromLocal) {
        console.log(`➖ [MySQL Sync] Removendo ${player.summonerName} da fila local (não está no MySQL)`);
        const index = this.queue.findIndex(p => p.summonerName === player.summonerName);
        if (index !== -1) {
          this.queue.splice(index, 1);
        }
      }

      // 2. ✅ APENAS ADICIONAR jogadores que estão no MySQL mas não na fila local
      // IMPORTANTE: Usar dados do MySQL SEM sobrescrever dados já existentes
      const playersToAddToLocal = dbPlayers.filter(dbPlayer => 
        !localPlayerIds.has(dbPlayer.summoner_name)
      );

      for (const dbPlayer of playersToAddToLocal) {
        console.log(`➕ [MySQL Sync] Adicionando ${dbPlayer.summoner_name} à fila local (preservando dados originais do MySQL)`);
        
        // ✅ CORREÇÃO: Usar dados DIRETAMENTE do MySQL (queue_players) 
        // sem buscar na tabela players para não sobrescrever
        const queuedPlayer: QueuedPlayer = {
          id: dbPlayer.player_id,
          summonerName: dbPlayer.summoner_name,
          region: dbPlayer.region || 'br1', // Usar região do MySQL queue_players
          currentMMR: dbPlayer.custom_lp, // ✅ USAR exatamente o custom_lp da entrada na fila
          joinTime: new Date(dbPlayer.join_time),
          websocket: null as any, // Jogador via HTTP/LCU não tem WebSocket
          queuePosition: dbPlayer.queue_position,
          preferences: {
            // ✅ USAR exatamente as lanes da entrada na fila
            primaryLane: dbPlayer.primary_lane,
            secondaryLane: dbPlayer.secondary_lane
          }
        };
        
        this.queue.push(queuedPlayer);
        console.log(`✅ [MySQL Sync] ${dbPlayer.summoner_name} adicionado com dados originais: MMR=${dbPlayer.custom_lp}, Lanes=${dbPlayer.primary_lane}/${dbPlayer.secondary_lane}`);
      }

      // 3. ✅ APENAS ATUALIZAR posições (sem tocar em outros dados)
      for (const dbPlayer of dbPlayers) {
        const localPlayer = this.queue.find(p => p.summonerName === dbPlayer.summoner_name);
        if (localPlayer && localPlayer.queuePosition !== dbPlayer.queue_position) {
          console.log(`🔄 [MySQL Sync] Atualizando APENAS posição de ${dbPlayer.summoner_name}: ${localPlayer.queuePosition} → ${dbPlayer.queue_position}`);
          localPlayer.queuePosition = dbPlayer.queue_position;
          // ✅ NÃO tocar em currentMMR, lanes, ou outros dados
        }
      }

      // 4. ORDENAR fila local pela posição
      this.queue.sort((a, b) => (a.queuePosition || 0) - (b.queuePosition || 0));

      // 5. VERIFICAR e CORRIGIR inconsistências (apenas duplicatas)
      if (this.queue.length !== dbPlayers.length) {
        console.log(`⚠️ [MySQL Sync] Inconsistência detectada: Local=${this.queue.length}, MySQL=${dbPlayers.length}`);
        
        // Limpar apenas jogadores duplicados (sem modificar dados)
        const seenNames = new Set<string>();
        this.queue = this.queue.filter(player => {
          if (seenNames.has(player.summonerName)) {
            console.log(`🗑️ [MySQL Sync] Removendo jogador duplicado: ${player.summonerName}`);
            return false;
          }
          seenNames.add(player.summonerName);
          return true;
        });
      }

      console.log(`✅ [MySQL Sync] Sincronização READ-ONLY concluída: ${this.queue.length} jogadores na fila`);
      console.log('📊 [MySQL Sync] Fila final (dados preservados):', this.queue.map(p => ({
        name: p.summonerName,
        position: p.queuePosition,
        mmr: p.currentMMR, // ✅ MMR original preservado
        lanes: `${p.preferences?.primaryLane}/${p.preferences?.secondaryLane}`, // ✅ Lanes originais preservadas
        hasWebSocket: !!p.websocket
      })));

      // Broadcast atualização APENAS se houve mudanças na composição da fila
      if (playersToRemoveFromLocal.length > 0 || playersToAddToLocal.length > 0) {
        await this.broadcastQueueUpdate();
      }

    } catch (error) {
      console.error('❌ [MySQL Sync] Erro na sincronização READ-ONLY:', error);
    }
  }

  // Novo método: Limpeza automática de jogadores inativos
  private async cleanupInactivePlayers(): Promise<void> {
    try {
      const now = new Date();
      const timeoutMs = this.QUEUE_TIMEOUT_MINUTES * 60 * 1000;
      const playersToRemove: QueuedPlayer[] = [];

      console.log(`🔍 Verificando ${this.queue.length} jogadores na fila para limpeza...`);

      // Verificar jogadores inativos
      for (const player of this.queue) {
        const timeInQueue = now.getTime() - player.joinTime.getTime();
        const timeInQueueMinutes = Math.floor(timeInQueue / (1000 * 60));

        // Verificar se é um bot (ID negativo)
        const isBot = player.id < 0;

        // ✅ CORREÇÃO: Verificar se WebSocket está morto APENAS se existir
        // Se websocket é null, assume que o jogador foi adicionado via HTTP e deve permanecer na fila
        const hasWebSocket = !!player.websocket;
        const isWebSocketDead = hasWebSocket && (
          player.websocket.readyState === WebSocket.CLOSED ||
          player.websocket.readyState === WebSocket.CLOSING
        );

        // Log do estado do jogador
        console.log(`👤 ${player.summonerName}: ${timeInQueueMinutes}min na fila, WebSocket: ${hasWebSocket ? (isWebSocketDead ? 'morto' : 'ativo') : 'HTTP/null'}, Bot: ${isBot}`);

        // Para bots: só remover se tempo for negativo (dados corrompidos) ou timeout muito longo (mais de 24 horas)
        if (isBot) {
          if (timeInQueue < 0 || timeInQueue > (24 * 60 * 60 * 1000)) {
            let reason = timeInQueue < 0 ? 'Dados de tempo corrompidos' : 'Timeout de 24 horas';
            console.log(`⚠️ Marcando bot ${player.summonerName} para remoção: ${reason}`);
            playersToRemove.push(player);
          }
          continue; // Pular verificações de WebSocket para bots
        }

        // ✅ CORREÇÃO: Para jogadores reais, só remover se:
        // 1. TEM WebSocket E está morto (jogador desconectou) OU
        // 2. Jogador está na fila há mais tempo que o timeout (2 horas) OU
        // 3. Tempo negativo (dados corrompidos)
        // 
        // NÃO remover jogadores que:
        // - Não têm WebSocket (foram adicionados via HTTP/LCU)
        // - Têm WebSocket ativo
        const shouldRemove = 
          (hasWebSocket && isWebSocketDead) ||  // WebSocket morto
          timeInQueue > timeoutMs ||            // Timeout muito longo
          timeInQueue < 0;                      // Dados corrompidos

        if (shouldRemove) {
          let reason = '';
          if (timeInQueue < 0) {
            reason = 'Dados de tempo corrompidos';
          } else if (hasWebSocket && isWebSocketDead) {
            reason = 'WebSocket desconectado';
          } else if (timeInQueue > timeoutMs) {
            reason = 'Timeout de 2 horas';
          }
          console.log(`⚠️ Marcando ${player.summonerName} para remoção: ${reason}`);
          playersToRemove.push(player);
        } else if (!hasWebSocket) {
          console.log(`✅ ${player.summonerName} mantido na fila (sem WebSocket - provavelmente via HTTP/LCU)`);
        }
      }

      // Remover jogadores inativos
      for (const player of playersToRemove) {
        const playerIndex = this.queue.findIndex(p => p.id === player.id);
        if (playerIndex !== -1) {
          this.queue.splice(playerIndex, 1);

          // ✅ CORREÇÃO: Persistir saída da fila no banco APENAS para jogadores reais
          if (player.id > 0) {
            console.log(`🗑️ Removendo ${player.summonerName} do MySQL (is_active = 0)`);
            await this.dbManager.removePlayerFromQueue(player.id);
          }

          // Adicionar atividade de saída automática
          this.addActivity(
            'player_left',
            `${player.summonerName} removido automaticamente da fila (inativo)`,
            player.summonerName
          );
        }
      }

      // Atualizar posições se houve remoções
      if (playersToRemove.length > 0) {
        console.log(`🔄 ${playersToRemove.length} jogadores removidos, atualizando posições...`);
        await this.updateQueuePositions();
        await this.broadcastQueueUpdate();
      }

    } catch (error) {
      console.error('Erro na limpeza de jogadores inativos:', error);
    }
  }

  // Método para verificar se um WebSocket está ativo
  private isWebSocketActive(websocket: WebSocket): boolean {
    return websocket &&
      websocket.readyState === WebSocket.OPEN;
  }

  // Método para carregar fila do banco de dados
  private async loadQueueFromDatabase(): Promise<void> {
    try {
      console.log('📊 [Matchmaking] Carregando fila do banco de dados...');
      
      const queuePlayers = await this.dbManager.getActiveQueuePlayers();
      console.log(`📊 [Matchmaking] Encontrados ${queuePlayers.length} jogadores ativos no banco`);

      for (const dbPlayer of queuePlayers) {
        // Validar dados de tempo
        const joinTime = new Date(dbPlayer.join_time);
        const now = new Date();
        const timeInQueue = now.getTime() - joinTime.getTime();
        const timeInQueueMinutes = Math.floor(timeInQueue / (1000 * 60));

        // Se o tempo for negativo (dados corrompidos), pular este jogador
        if (timeInQueue < 0) {
          console.log(`⚠️ [Matchmaking] Jogador com dados de tempo corrompidos: ${dbPlayer.summoner_name}`);
          console.log(`   - join_time: ${dbPlayer.join_time}`);
          console.log(`   - timeInQueue: ${timeInQueueMinutes}min`);
          console.log(`   - Removendo da fila persistente...`);

          // Remover da fila persistente
          try {
            await this.dbManager.removePlayerFromQueue(dbPlayer.player_id);
            console.log(`✅ [Matchmaking] Jogador removido da fila persistente: ${dbPlayer.summoner_name}`);
          } catch (error) {
            console.error(`❌ [Matchmaking] Erro ao remover jogador da fila persistente:`, error);
          }
          continue;
        }

        // Para jogadores muito antigos (mais de 6 horas), remover automaticamente
        if (timeInQueue > (6 * 60 * 60 * 1000)) {
          console.log(`⚠️ [Matchmaking] Jogador muito antigo na fila: ${dbPlayer.summoner_name} (${timeInQueueMinutes}min)`);
          console.log(`   - Removendo automaticamente...`);

          try {
            await this.dbManager.removePlayerFromQueue(dbPlayer.player_id);
            console.log(`✅ [Matchmaking] Jogador antigo removido: ${dbPlayer.summoner_name}`);
          } catch (error) {
            console.error(`❌ [Matchmaking] Erro ao remover jogador antigo:`, error);
          }
          continue;
        }

        // Verificar se o jogador já está na fila local (evitar duplicatas)
        const existingPlayer = this.queue.find(p => p.id === dbPlayer.player_id);
        if (existingPlayer) {
          console.log(`🔄 [Matchmaking] Jogador já carregado na fila local: ${dbPlayer.summoner_name}`);
          continue;
        }

        const queuedPlayer: QueuedPlayer = {
          id: dbPlayer.player_id,
          summonerName: dbPlayer.summoner_name,
          region: dbPlayer.region,
          currentMMR: dbPlayer.custom_lp || 0,
          joinTime: joinTime,
          websocket: null as any, // WebSocket será atualizado quando o jogador reconectar
          queuePosition: dbPlayer.queue_position || 0,
          preferences: {
            primaryLane: dbPlayer.primary_lane || 'fill',
            secondaryLane: dbPlayer.secondary_lane || 'fill'
          }
        };

        this.queue.push(queuedPlayer);
        console.log(`📊 [Matchmaking] Jogador carregado da fila persistente: ${dbPlayer.summoner_name} (${timeInQueueMinutes}min na fila, posição: ${queuedPlayer.queuePosition})`);
      }

      // Garantir que as posições estejam corretas após carregar
      await this.updateQueuePositions();

      console.log(`📊 [Matchmaking] Carregados ${this.queue.length} jogadores da fila persistente`);
      
      // Adicionar atividades iniciais
      this.addActivity('system_update', 'Sistema de matchmaking inicializado');
      this.addActivity('system_update', `Fila carregada com ${this.queue.length} jogadores`);
    } catch (error) {
      console.error('❌ [Matchmaking] Erro ao carregar fila do banco:', error);
    }
  }

  async addPlayerToQueue(websocket: WebSocket, playerData: any, preferences?: any): Promise<void> {
    try {
      console.log('➕ [Matchmaking] Adicionando jogador à fila:', playerData);

      // Construir o nome completo no formato gameName#tagLine
      const fullSummonerName = playerData.gameName && playerData.tagLine 
        ? `${playerData.gameName}#${playerData.tagLine}`
        : playerData.summonerName;

      console.log('🔍 [Matchmaking] Nome completo do jogador:', fullSummonerName);

      // PRIMEIRO: Verificar se já está na fila no MySQL
      const existingInDB = await this.dbManager.getActiveQueuePlayers();
      const isAlreadyInQueue = existingInDB.some(dbPlayer => 
        dbPlayer.summoner_name === fullSummonerName ||
        dbPlayer.player_id === playerData.id
      );

      if (isAlreadyInQueue) {
        console.log(`⚠️ [Matchmaking] Jogador ${fullSummonerName} já está na fila (MySQL)`);
        websocket.send(JSON.stringify({
          type: 'error',
          message: 'Você já está na fila'
        }));
        return;
      }

      // SEGUNDO: Verificar se já está na fila local
      const existingInLocal = this.queue.find(p => 
        p.summonerName === fullSummonerName ||
        p.id === playerData.id
      );

      if (existingInLocal) {
        console.log(`⚠️ [Matchmaking] Jogador ${fullSummonerName} já está na fila (local)`);
        websocket.send(JSON.stringify({
          type: 'error',
          message: 'Você já está na fila'
        }));
        return;
      }

      // TERCEIRO: Adicionar ao MySQL PRIMEIRO
      await this.dbManager.addPlayerToQueue(
        playerData.id,
        fullSummonerName, // Usar nome completo
        playerData.region,
        playerData.customLp || 0,
        preferences
      );

      // QUARTO: Adicionar à fila local
      const queuedPlayer: QueuedPlayer = {
        id: playerData.id,
        summonerName: fullSummonerName, // Usar nome completo
        region: playerData.region,
        currentMMR: playerData.customLp || 0,
        joinTime: new Date(),
        websocket: websocket,
        queuePosition: this.queue.length + 1,
        preferences: preferences || {
          primaryLane: 'fill',
          secondaryLane: 'fill'
        }
      };

      this.queue.push(queuedPlayer);

      // QUINTO: Atualizar posições no MySQL
      await this.updateQueuePositions();

      // SEXTO: Adicionar atividade
      this.addActivity(
        'player_joined',
        `${fullSummonerName} entrou na fila`,
        fullSummonerName,
        preferences?.primaryLane || 'fill'
      );

      // SÉTIMO: Notificar jogador
      websocket.send(JSON.stringify({
        type: 'queue_joined',
        data: {
          position: queuedPlayer.queuePosition,
          estimatedWait: this.calculateEstimatedWaitTime(),
          queueStatus: this.getQueueStatus()
        }
      }));

      // OITAVO: Broadcast atualização da fila
      await this.broadcastQueueUpdate();

      console.log(`✅ [Matchmaking] ${fullSummonerName} adicionado à fila (MySQL + Local)`);

    } catch (error: any) {
      console.error('❌ [Matchmaking] Erro ao adicionar jogador à fila:', error);
      websocket.send(JSON.stringify({
        type: 'error',
        message: 'Falha ao entrar na fila: ' + error.message
      }));
    }
  }

  async removePlayerFromQueue(websocket: WebSocket): Promise<void> {
    console.log('🔍 [Matchmaking] removePlayerFromQueue chamado via WebSocket');
    console.log('🔍 [Matchmaking] Fila atual:', this.queue.map(p => ({
      id: p.id,
      name: p.summonerName,
      wsActive: p.websocket?.readyState === WebSocket.OPEN,
      wsRef: p.websocket === websocket ? 'MATCH' : 'DIFFERENT'
    })));

    // Tentar encontrar o jogador por WebSocket
    let playerIndex = this.queue.findIndex(player => player.websocket === websocket);
    console.log('🔍 [Matchmaking] Player index encontrado por WebSocket:', playerIndex);

    // Se não encontrou por WebSocket, tentar por WebSocket ID ou referência
    if (playerIndex === -1) {
      console.log('🔍 [Matchmaking] Tentando busca alternativa por WebSocket...');
      console.log('🔍 [Matchmaking] WebSocket recebido:', {
        readyState: websocket.readyState,
        url: (websocket as any).url,
        protocol: (websocket as any).protocol
      });

      // Tentar encontrar por qualquer critério que possa identificar o WebSocket
      playerIndex = this.queue.findIndex(player => {
        const playerWs = player.websocket;
        return playerWs && (
          playerWs === websocket ||
          playerWs.readyState === websocket.readyState ||
          (playerWs as any).url === (websocket as any).url
        );
      });
      console.log('🔍 [Matchmaking] Player index encontrado por busca alternativa:', playerIndex);
    }

    console.log('🔍 [Matchmaking] Tamanho da fila antes:', this.queue.length);

    if (playerIndex !== -1) {
      const player = this.queue[playerIndex];
      console.log('✅ [Matchmaking] Removendo jogador:', { id: player.id, name: player.summonerName });

      this.queue.splice(playerIndex, 1);

      // Persistir saída da fila no banco
      this.dbManager.removePlayerFromQueue(player.id).then(() => {
        console.log(`✅ [Matchmaking] Jogador ${player.summonerName} removido da fila persistente`);
      }).catch(error => {
        console.error('❌ [Matchmaking] Erro ao remover jogador da fila persistente:', error);
      });

      // Adicionar atividade de saída
      this.addActivity(
        'player_left',
        `${player.summonerName} saiu da fila`,
        player.summonerName
      );

      // Atualizar posições na fila E NO BANCO
      await this.updateQueuePositions();

      console.log(`➖ [Matchmaking] ${player.summonerName} saiu da fila`);
      console.log('🔍 [Matchmaking] Tamanho da fila depois:', this.queue.length);
      console.log('🔍 [Matchmaking] Nova fila:', this.queue.map(p => ({ id: p.id, name: p.summonerName })));

      // Broadcast atualização da fila (forçar imediatamente para saída)
      await this.forceQueueUpdate();
    } else {
      console.log('⚠️ [Matchmaking] Jogador não encontrado na fila para remoção via WebSocket');
      console.log('🔍 [Matchmaking] WebSocket recebido:', {
        readyState: websocket.readyState,
        url: (websocket as any).url,
        protocol: (websocket as any).protocol
      });
      console.log('🔍 [Matchmaking] WebSockets na fila:', this.queue.map(p => ({
        name: p.summonerName,
        wsState: p.websocket?.readyState,
        wsUrl: (p.websocket as any)?.url
      })));
    }
  }

  // NOVO: Método para atualizar posições na fila e no banco
  private async updateQueuePositions(): Promise<void> {
    try {
      // Atualizar posições na memória
      this.queue.forEach((p, index) => {
        p.queuePosition = index + 1;
      });

      // Atualizar posições no banco de dados
      for (let i = 0; i < this.queue.length; i++) {
        const player = this.queue[i];
        await this.dbManager.updateQueuePosition(player.id, i + 1);
      }

      console.log(`✅ [Matchmaking] Posições da fila atualizadas: ${this.queue.length} jogadores`);
    } catch (error) {
      console.error('❌ [Matchmaking] Erro ao atualizar posições da fila:', error);
    }
  }

  // Método para adicionar jogador à fila sem WebSocket (para uso automático)
  addPlayerToQueueDirect(playerData: any): void {
    try {
      // Verificar se o jogador já está na fila
      const existingPlayer = this.queue.find(p => p.id === playerData.id); if (existingPlayer) {
        // console.log(`⚠️ Jogador ${playerData.summonerName} já está na fila`);
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
      this.dbManager.recordQueueAction('join', queuedPlayer.id);

      console.log(`🎯 Jogador ${playerData.summonerName} adicionado à fila automaticamente (posição ${queuedPlayer.queuePosition})`);

      // Notificar outros jogadores via WebSocket sobre atualização da fila
      this.broadcastQueueUpdate();
    } catch (error) {
      console.error('Erro ao adicionar jogador à fila:', error);
    }
  }

  // Método temporário para adicionar bots na fila (apenas para testes)
  async addBotToQueue(): Promise<void> {
    const availableLanes = ['top', 'jungle', 'mid', 'bot', 'support'];
    const usedLanes = this.queue.map(p => p.preferences?.primaryLane).filter(Boolean);
    const availableUnusedLanes = availableLanes.filter(lane => !usedLanes.includes(lane));

    // Se não há lanes livres, usar lane aleatória mesmo assim
    const selectedLanes = availableUnusedLanes.length > 0 ? availableUnusedLanes : availableLanes;
    const primaryLane = selectedLanes[Math.floor(Math.random() * selectedLanes.length)];

    // Selecionar lane secundária diferente da primária
    let secondaryLane = availableLanes.filter(lane => lane !== primaryLane)[Math.floor(Math.random() * 4)];

    const botNumber = this.queue.filter(p => p.summonerName.startsWith('Bot')).length + 1;
    const botName = `Bot${botNumber}`;

    // Gerar MMR aleatório entre 800 e 2000
    const randomMMR = Math.floor(Math.random() * 1200) + 800;

    const botPlayer: QueuedPlayer = {
      id: -botNumber, // ID negativo para distinguir de jogadores reais
      summonerName: botName,
      region: 'br1',
      currentMMR: randomMMR,
      joinTime: new Date(),
      websocket: null as any, // Bots não têm WebSocket
      queuePosition: this.queue.length + 1,
      preferences: {
        primaryLane: primaryLane,
        secondaryLane: secondaryLane,
        autoAccept: true
      }
    };

    this.queue.push(botPlayer);

    // Adicionar atividade
    const primaryLaneName = this.getLaneName(primaryLane);
    this.addActivity(
      'player_joined',
      `🤖 ${botName} (Bot) entrou na fila como ${primaryLaneName}`,
      botName,
      undefined,
      primaryLane
    );

    console.log(`🤖 Bot ${botName} adicionado à fila - Lane: ${primaryLaneName}, MMR: ${randomMMR}`);

    // Atualizar posições na fila
    this.queue.forEach((p, index) => {
      p.queuePosition = index + 1;
    });

    // Notificar todos os clientes sobre a atualização
    this.broadcastQueueUpdate();
  }

  // Método auxiliar para obter nome das lanes
  private getLaneName(laneId: string): string {
    const lanes: { [key: string]: string } = {
      'top': 'Topo',
      'jungle': 'Selva',
      'mid': 'Meio',
      'bot': 'Atirador',
      'support': 'Suporte'
    };
    return lanes[laneId] || laneId;
  } private async processMatchmaking(): Promise<void> {
    console.log(`🔄 [Matchmaking] Processando matchmaking - ${this.queue.length} jogadores na fila`);

    if (!this.isActive || this.queue.length < 10) {
      console.log(`❌ [Matchmaking] Matchmaking não ativo ou jogadores insuficientes: ativo=${this.isActive}, jogadores=${this.queue.length}`);
      return;
    }

    try {
      console.log(`🔍 [Matchmaking] Buscando melhor partida...`);
      const match = await this.findBestMatch();

      if (match) {
        console.log('🎮 Partida encontrada! Criando lobby...', {
          team1Players: match.team1.length,
          team2Players: match.team2.length,
          avgMMR1: Math.round(match.averageMMR1),
          avgMMR2: Math.round(match.averageMMR2)
        });

        // Salvar partida no banco de dados
        await this.createMatchAndNotify(match);

        // Remover jogadores da fila
        const allMatchPlayers = [...match.team1, ...match.team2];
        this.queue = this.queue.filter(player =>
          !allMatchPlayers.some(matchPlayer => matchPlayer.id === player.id)
        );

        // Notificar todos os jogadores da partida
        this.notifyMatchFound(match);

        // Adicionar atividade
        this.addActivity(
          'match_created',
          `Partida criada! ${match.team1.length}v${match.team2.length} - MMR médio: ${Math.round((match.averageMMR1 + match.averageMMR2) / 2)}`
        );

        // Atualizar status da fila
        this.broadcastQueueUpdate();

        console.log('✅ Partida criada com sucesso!');
      } else {
        console.log(`❌ [Matchmaking] Nenhuma partida encontrada para ${this.queue.length} jogadores`);
      }
    } catch (error) {
      console.error('❌ [Matchmaking] Erro no processamento de matchmaking:', error);
    }
  }

  // Método para criar partida no banco e notificar jogadores
  private async createMatchAndNotify(match: Match): Promise<void> {
    try {
      // Salvar partida no banco de dados como partida personalizada
      const matchId = await this.dbManager.createCustomMatch({
        title: `Partida Automatizada ${new Date().toLocaleString()}`,
        description: `Times balanceados - MMR médio: Time 1: ${Math.round(match.averageMMR1)}, Time 2: ${Math.round(match.averageMMR2)}`,
        team1Players: match.team1.map(p => p.summonerName),
        team2Players: match.team2.map(p => p.summonerName),
        createdBy: 'Sistema de Matchmaking',
        gameMode: 'CLASSIC'
      });

      // Atualizar o ID da partida
      match.id = matchId;

      // Adicionar à lista de partidas ativas
      this.activeMatches.set(matchId, match);

      // Remover jogadores da fila
      const matchPlayerIds = [...match.team1, ...match.team2].map(p => p.id);
      this.queue = this.queue.filter(p => !matchPlayerIds.includes(p.id));

      // Adicionar atividade
      this.addActivity('match_created', `Partida criada! ${match.team1.length}v${match.team2.length} - MMR médio: ${Math.round((match.averageMMR1 + match.averageMMR2) / 2)}`);

      // Configurar timeout para aceitação (30 segundos)
      match.acceptTimeout = setTimeout(() => {
        this.handleMatchTimeout(matchId);
      }, 30000);

      // Notificar todos os jogadores sobre a partida encontrada
      this.notifyMatchFound(match);

      // Auto-aceitar bots após 1 segundo (simular tempo de reação)
      setTimeout(() => {
        this.autoAcceptBots(matchId);
      }, 1000);

      // Atualizar status da fila
      this.broadcastQueueUpdate();

      console.log(`🎮 Partida criada! ID: ${matchId}, Players: ${matchPlayerIds.length}`);
    } catch (error) {
      console.error('Erro ao criar partida:', error);
    }
  }

  // Método para lidar com timeout de aceitação
  private handleMatchTimeout(matchId: number): void {
    const match = this.activeMatches.get(matchId);
    if (!match) return;

    const allPlayers = [...match.team1, ...match.team2];
    const nonAcceptedPlayers = allPlayers.filter(p => !match.acceptedPlayers.has(p.id));

    if (nonAcceptedPlayers.length > 0) {
      console.log(`⏰ Timeout da partida ${matchId}! Jogadores que não aceitaram:`,
        nonAcceptedPlayers.map(p => p.summonerName));

      // Usar o mesmo método do botão recusar para cada jogador que não aceitou
      nonAcceptedPlayers.forEach(async (player) => {
        if (player.id > 0) { // Pular bots
          try {
            await this.declineMatch(player.id, matchId, player.summonerName);
            console.log(`✅ [Timeout] ${player.summonerName} removido via declineMatch (timeout)`);
          } catch (error) {
            console.error(`❌ [Timeout] Erro ao remover ${player.summonerName} via declineMatch:`, error);
          }
        }
      });
    }
  }

  // Método para auto-aceitar bots
  private autoAcceptBots(matchId: number): void {
    const match = this.activeMatches.get(matchId);
    if (!match) return;

    const allPlayers = [...match.team1, ...match.team2];
    const botPlayers = allPlayers.filter(p => p.id < 0); // Bots têm ID negativo

    if (botPlayers.length === 0) {
      console.log(`🤖 Nenhum bot encontrado na partida ${matchId}`);
      return;
    }

    console.log(`🤖 Auto-aceitando ${botPlayers.length} bots na partida ${matchId}`);

    // Auto-aceitar cada bot com delay para simular tempo de reação
    botPlayers.forEach((bot, index) => {
      setTimeout(() => {
        try {
          // Adicionar bot diretamente aos aceitos sem chamar acceptMatch
          match.acceptedPlayers.add(bot.id);
          console.log(`🤖 Bot ${bot.summonerName} aceitou automaticamente`);

          // Verificar se todos os jogadores aceitaram
          const allPlayers = [...match.team1, ...match.team2];
          const allAccepted = allPlayers.every(p => match.acceptedPlayers.has(p.id));

          console.log(`📊 Partida ${matchId}: ${match.acceptedPlayers.size}/${allPlayers.length} aceitaram`);

          if (allAccepted) {
            console.log(`🎉 Todos os jogadores aceitaram a partida ${matchId}! Iniciando draft...`);

            // Limpar timeout se existir
            if (match.acceptTimeout) {
              clearTimeout(match.acceptTimeout);
              match.acceptTimeout = undefined;
            }

            // Iniciar fase de draft
            this.startDraftPhase(matchId);
          }
        } catch (error) {
          console.error(`Erro ao auto-aceitar bot ${bot.summonerName}:`, error);
        }
      }, (index + 1) * 500); // 500ms de delay entre cada bot
    });
  }

  // Método para notificar jogadores sobre partida encontrada
  private notifyMatchFound(match: Match): void {
    const allPlayers = [...match.team1, ...match.team2];

    allPlayers.forEach((player, index) => {
      // Pular bots (eles não têm websocket)
      if (!player.websocket || player.id < 0) return;

      const isTeam1 = match.team1.includes(player);
      const team = isTeam1 ? match.team1 : match.team2;
      const enemyTeam = isTeam1 ? match.team2 : match.team1;

      const matchData = {
        matchId: match.id,
        playerSide: isTeam1 ? 'blue' : 'red',
        teammates: team.map(p => ({
          id: p.id,
          summonerName: p.summonerName,
          mmr: p.currentMMR,
          primaryLane: p.preferences?.primaryLane || 'fill',
          secondaryLane: p.preferences?.secondaryLane || 'fill',
          assignedLane: p.preferences?.assignedLane || 'fill',
          isAutofill: p.preferences?.isAutofill || false
        })),
        enemies: enemyTeam.map(p => ({
          id: p.id,
          summonerName: p.summonerName,
          mmr: p.currentMMR,
          primaryLane: p.preferences?.primaryLane || 'fill',
          secondaryLane: p.preferences?.secondaryLane || 'fill',
          assignedLane: p.preferences?.assignedLane || 'fill',
          isAutofill: p.preferences?.isAutofill || false
        })),
        averageMMR: {
          yourTeam: isTeam1 ? match.averageMMR1 : match.averageMMR2,
          enemyTeam: isTeam1 ? match.averageMMR2 : match.averageMMR1
        },
        estimatedGameDuration: 25, // minutos
        phase: 'accept', // accept -> draft -> in_game
        acceptTimeout: 30 // segundos para aceitar
      };

      try {
        player.websocket.send(JSON.stringify({
          type: 'match_found',
          data: matchData
        }));
      } catch (error) {
        console.error(`Erro ao notificar jogador ${player.summonerName}:`, error);
      }
    });
  }

  // Método para aceitar partida
  async acceptMatch(playerId: number, matchId: number, summonerName?: string): Promise<void> {
    const match = this.activeMatches.get(matchId);
    if (!match) {
      throw new Error('Partida não encontrada');
    }

    console.log(`🔍 [Matchmaking] Tentativa de aceitar partida - Match ID: ${matchId}, Player ID: ${playerId}, Nome: ${summonerName}`);
    console.log(`🔍 [Matchmaking] Jogadores na partida:`, [...match.team1, ...match.team2].map(p => ({ id: p.id, name: p.summonerName })));

    // Procurar jogador - priorizar por nome se disponível
    let player: QueuedPlayer | undefined;

    if (summonerName) {
      // Primeira tentativa: buscar por nome exato
      player = [...match.team1, ...match.team2].find(p => p.summonerName === summonerName);

      // Segunda tentativa: buscar por nome parcial (sem tagline)
      if (!player && summonerName.includes('#')) {
        const gameNameOnly = summonerName.split('#')[0];
        player = [...match.team1, ...match.team2].find(p => p.summonerName.startsWith(gameNameOnly + '#'));
      }

      // Terceira tentativa: buscar por gameName apenas
      if (!player) {
        player = [...match.team1, ...match.team2].find(p => p.summonerName.split('#')[0] === summonerName);
      }
    }

    // Se não encontrou por nome, tentar por ID
    if (!player && playerId) {
      player = [...match.team1, ...match.team2].find(p => p.id === playerId);
    }

    if (!player) {
      console.log(`❌ [Matchmaking] Jogador não encontrado na partida`);
      console.log(`🔍 [Matchmaking] Dados recebidos:`, { playerId, summonerName });
      console.log(`🔍 [Matchmaking] Jogadores disponíveis:`, [...match.team1, ...match.team2].map(p => ({ id: p.id, name: p.summonerName })));
      throw new Error('Jogador não está nesta partida');
    }

    // Verificar se o jogador já aceitou
    if (match.acceptedPlayers.has(player.id)) {
      console.log(`⚠️ [Matchmaking] ${player.summonerName} já aceitou a partida ${matchId}`);
      return; // Não é um erro, apenas já aceitou
    }

    // Adicionar jogador aos que aceitaram
    match.acceptedPlayers.add(player.id);
    console.log(`✅ [Matchmaking] ${player.summonerName} aceitou a partida ${matchId}`);

    // Verificar se todos os jogadores aceitaram
    const allPlayers = [...match.team1, ...match.team2];
    const allAccepted = allPlayers.every(p => match.acceptedPlayers.has(p.id));

    console.log(`📊 [Matchmaking] Partida ${matchId}: ${match.acceptedPlayers.size}/${allPlayers.length} aceitaram`);

    if (allAccepted) {
      console.log(`🎉 [Matchmaking] Todos os jogadores aceitaram a partida ${matchId}! Iniciando draft...`);

      // Limpar timeout se existir
      if (match.acceptTimeout) {
        clearTimeout(match.acceptTimeout);
        match.acceptTimeout = undefined;
      }

      // Iniciar fase de draft
      this.startDraftPhase(matchId);
    }
  }

  // Método para recusar partida
  async declineMatch(playerId: number, matchId: number, summonerName?: string): Promise<void> {
    const match = this.activeMatches.get(matchId);
    if (!match) {
      throw new Error('Partida não encontrada');
    }

    console.log(`🔍 [Matchmaking] Tentativa de recusar partida - Match ID: ${matchId}, Player ID: ${playerId}, Nome: ${summonerName}`);
    console.log(`🔍 [Matchmaking] Jogadores na partida:`, [...match.team1, ...match.team2].map(p => ({ id: p.id, name: p.summonerName })));

    // Procurar jogador - priorizar por nome se disponível
    let player: QueuedPlayer | undefined;

    if (summonerName) {
      // Primeira tentativa: buscar por nome exato
      player = [...match.team1, ...match.team2].find(p => p.summonerName === summonerName);

      // Segunda tentativa: buscar por nome parcial (sem tagline)
      if (!player && summonerName.includes('#')) {
        const gameNameOnly = summonerName.split('#')[0];
        player = [...match.team1, ...match.team2].find(p => p.summonerName.startsWith(gameNameOnly + '#'));
      }

      // Terceira tentativa: buscar por gameName apenas
      if (!player) {
        player = [...match.team1, ...match.team2].find(p => p.summonerName.split('#')[0] === summonerName);
      }
    }

    // Se não encontrou por nome, tentar por ID
    if (!player && playerId) {
      player = [...match.team1, ...match.team2].find(p => p.id === playerId);
    }

    if (!player) {
      console.log(`❌ [Matchmaking] Jogador não encontrado na partida para recusar`);
      console.log(`🔍 [Matchmaking] Dados recebidos:`, { playerId, summonerName });
      console.log(`🔍 [Matchmaking] Jogadores disponíveis:`, [...match.team1, ...match.team2].map(p => ({ id: p.id, name: p.summonerName })));
      throw new Error('Jogador não está nesta partida');
    }

    console.log(`❌ [Matchmaking] ${player.summonerName} recusou a partida ${matchId}`);

    // Cancelar partida imediatamente quando alguém recusa
    await this.cancelMatch(matchId, `${player.summonerName} recusou a partida`);
  }

  // Método para cancelar partida
  private async cancelMatch(matchId: number, reason: string): Promise<void> {
    const match = this.activeMatches.get(matchId);
    if (!match) {
      console.log(`⚠️ [CancelMatch] Partida ${matchId} não encontrada nas partidas ativas`);
      return;
    }

    console.log(`🎉 Partida ${matchId} cancelada por ${reason}`);
    console.log(`🔍 [CancelMatch] Dados da partida:`, {
      matchId: matchId,
      matchIdInMatch: match.id,
      team1Size: match.team1.length,
      team2Size: match.team2.length,
      status: match.status
    });

    // Remover partida das ativas
    this.activeMatches.delete(matchId);

    // Limpar timeout se existir
    if (match.acceptTimeout) {
      clearTimeout(match.acceptTimeout);
      match.acceptTimeout = undefined;
    }

    // APAGAR partida do banco de dados se foi salva
    try {
      if (match.id) {
        console.log(`🗑️ [CancelMatch] Tentando apagar partida ${matchId} do banco (ID: ${match.id})`);
        await this.dbManager.deleteCustomMatch(match.id);
        console.log(`🗑️ [Matchmaking] Partida ${matchId} apagada do banco de dados (ID: ${match.id})`);
      } else {
        console.log(`⚠️ [Matchmaking] Partida ${matchId} não tem ID no banco para apagar`);
      }
    } catch (error) {
      console.error(`❌ [Matchmaking] Erro ao apagar partida ${matchId} do banco:`, error);
    }

    // CORREÇÃO: Apenas quem recusou sai da fila, os outros continuam
    const allPlayers = [...match.team1, ...match.team2];

    // Se a razão indica que alguém recusou, identificar quem recusou
    let declinedPlayer: QueuedPlayer | undefined;
    if (reason.includes('recusou a partida')) {
      const playerName = reason.replace(' recusou a partida', '');
      declinedPlayer = allPlayers.find(p => p.summonerName === playerName);
      console.log(`🔍 [CancelMatch] Jogador que recusou identificado:`, declinedPlayer?.summonerName);
    }

    const removedPlayers: string[] = [];
    const returnedPlayers: string[] = [];

    // Processar jogadores
    allPlayers.forEach(player => {
      if (player === declinedPlayer) {
        // Apenas quem recusou sai da fila
        const playerIndex = this.queue.findIndex(p => p.id === player.id);
        if (playerIndex !== -1) {
          this.queue.splice(playerIndex, 1);
          removedPlayers.push(player.summonerName);
          console.log(`🗑️ [CancelMatch] ${player.summonerName} removido da fila (recusou a partida)`);
        }
      } else {
        // Os outros jogadores continuam na fila
        const playerIndex = this.queue.findIndex(p => p.id === player.id);
        if (playerIndex === -1) {
          // Se não está na fila, adicionar de volta
          player.websocket = null as any; // Resetar websocket
          this.queue.push(player);
          returnedPlayers.push(player.summonerName);
          console.log(`🔄 [CancelMatch] ${player.summonerName} retornou à fila (Bot: ${player.id < 0})`);
        } else {
          console.log(`✅ [CancelMatch] ${player.summonerName} já está na fila (Bot: ${player.id < 0})`);
        }
      }
    });

    // Notificar jogadores sobre o cancelamento
    allPlayers.forEach(player => {
      if (player.websocket && player.id > 0) { // Pular bots
        try {
          player.websocket.send(JSON.stringify({
            type: 'match_cancelled',
            data: {
              matchId: matchId,
              reason: reason,
              declinedPlayer: declinedPlayer?.summonerName
            }
          }));
        } catch (error) {
          console.error(`Erro ao notificar cancelamento para ${player.summonerName}:`, error);
        }
      }
    });

    // Atualizar posições na fila
    this.queue.forEach((p, index) => {
      p.queuePosition = index + 1;
    });

    // Broadcast atualização da fila
    this.broadcastQueueUpdate();

    console.log(`✅ [CancelMatch] ${removedPlayers.length} jogador removido da fila:`, removedPlayers);
    console.log(`✅ [CancelMatch] ${returnedPlayers.length} jogadores retornaram à fila:`, returnedPlayers);
    this.addActivity('match_created', `Partida ${matchId} cancelada por ${reason} - ${removedPlayers.length} jogador removido, ${returnedPlayers.length} retornaram à fila`);
  }

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

  // Método simplificado para broadcast imediato
  public async broadcastQueueUpdate(force: boolean = false): Promise<void> {
    if (!this.wss) {
      console.log('⚠️ [Matchmaking] WebSocket server não disponível para broadcast');
      return;
    }

    const now = Date.now();

    // Proteção básica contra spam (mínimo 50ms entre broadcasts para tempo real)
    if (!force && now - this.lastBroadcastTime < 50) {
      console.log(`⏱️ [Matchmaking] Broadcast ignorado (throttling): ${now - this.lastBroadcastTime}ms desde último`);
      return;
    }

    this.lastBroadcastTime = now;

    try {
      const queueStatus = await this.getQueueStatus();

      console.log(`📡 [Matchmaking] Enviando broadcast para ${this.wss.clients.size} clientes:`, {
        playersInQueue: queueStatus.playersInQueue,
        playersList: queueStatus.playersInQueueList?.map(p => p.summonerName),
        timestamp: now,
        force: force
      });

      // Preparar dados da fila para broadcast (incluindo informações da fila para Discord)
      const broadcastData = {
        type: 'queue_update',
        data: queueStatus,
        timestamp: now,
        // Adicionar informações extras para Discord
        queuePlayers: queueStatus.playersInQueueList?.map(player => ({
          summonerName: player.summonerName,
          tagLine: player.tagLine,
          primaryLane: player.primaryLane,
          secondaryLane: player.secondaryLane,
          mmr: player.mmr,
          queuePosition: player.queuePosition,
          joinTime: player.joinTime
        })) || []
      };

      // Enviar para todos os clientes conectados
      let sentCount = 0;
      this.wss.clients.forEach((client: WebSocket) => {
        if (client.readyState === WebSocket.OPEN) {
          try {
            client.send(JSON.stringify(broadcastData));
            sentCount++;
          } catch (error) {
            console.error('❌ [Matchmaking] Erro ao enviar atualização da fila:', error);
          }
        }
      });

      console.log(`✅ [Matchmaking] Broadcast enviado para ${sentCount}/${this.wss.clients.size} clientes`);
      console.log(`📊 [Matchmaking] Dados incluídos: ${broadcastData.queuePlayers.length} jogadores na fila`);

    } catch (error) {
      console.error('❌ [Matchmaking] Erro no broadcast da fila:', error);
    }
  }

  // Método para obter status da fila
  async getQueueStatus(): Promise<QueueStatus> {
    const playersInQueueList: QueuedPlayerInfo[] = this.queue.map(player => {
      // Extrair summonerName e tagLine do nome completo
      const fullName = player.summonerName;
      const nameParts = fullName.split('#');
      const summonerName = nameParts[0];
      const tagLine = nameParts.length > 1 ? nameParts[1] : undefined;
      
      return {
        summonerName: summonerName,
        tagLine: tagLine,
        primaryLane: player.preferences?.primaryLane || 'fill',
        secondaryLane: player.preferences?.secondaryLane || 'fill',
        primaryLaneDisplay: this.getLaneDisplayName(player.preferences?.primaryLane),
        secondaryLaneDisplay: this.getLaneDisplayName(player.preferences?.secondaryLane),
        mmr: player.currentMMR,
        queuePosition: player.queuePosition || 0,
        joinTime: player.joinTime
      };
    });

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
    if (this.queue.length < 10) {
      return null;
    }

    console.log(`🔍 [Matchmaking] Verificando matchmaking - ${this.queue.length} jogadores na fila`);

    // Filtrar jogadores que não acabaram de ter o draft cancelado (cooldown de 30 segundos)
    const now = Date.now();
    const cooldownMs = 30000; // 30 segundos de cooldown
    const eligiblePlayers = this.queue.filter(player => {
      const draftCancelledAt = (player as any).draftCancelledAt;
      if (!draftCancelledAt) return true; // Jogador nunca teve draft cancelado

      const timeSinceCancel = now - draftCancelledAt;
      const isEligible = timeSinceCancel > cooldownMs;

      if (!isEligible) {
        console.log(`⏳ [Matchmaking] ${player.summonerName} ainda em cooldown após cancelamento (${Math.floor(timeSinceCancel / 1000)}s restantes)`);
      }

      return isEligible;
    });

    if (eligiblePlayers.length < 10) {
      console.log(`⏳ [Matchmaking] Apenas ${eligiblePlayers.length} jogadores elegíveis (cooldown ativo para alguns)`);
      return null;
    }

    // Ordenar jogadores por MMR
    const sortedPlayers = eligiblePlayers.sort((a, b) => b.currentMMR - a.currentMMR);

    console.log(`📊 [Matchmaking] Jogadores ordenados por MMR:`, sortedPlayers.map(p => ({ name: p.summonerName, mmr: p.currentMMR })));

    // Formar times balanceados
    const team1: QueuedPlayer[] = [];
    const team2: QueuedPlayer[] = [];

    // Distribuir jogadores alternadamente para balancear MMR
    for (let i = 0; i < sortedPlayers.length; i++) {
      if (i % 2 === 0) {
        team1.push(sortedPlayers[i]);
      } else {
        team2.push(sortedPlayers[i]);
      }
    }

    console.log(`👥 [Matchmaking] Times formados:`, {
      team1: team1.map(p => ({ name: p.summonerName, mmr: p.currentMMR })),
      team2: team2.map(p => ({ name: p.summonerName, mmr: p.currentMMR }))
    });

    // Calcular MMR médio dos times
    const avgMMR1 = team1.reduce((sum, p) => sum + p.currentMMR, 0) / team1.length;
    const avgMMR2 = team2.reduce((sum, p) => sum + p.currentMMR, 0) / team2.length;
    const mmrDifference = Math.abs(avgMMR1 - avgMMR2);

    console.log(`📊 [Matchmaking] MMR médio: Team1=${Math.round(avgMMR1)}, Team2=${Math.round(avgMMR2)}, Diferença=${Math.round(mmrDifference)}`);

    // Verificar se a diferença de MMR é aceitável (máximo 500)
    if (mmrDifference > 500) {
      console.log(`⚠️ [Matchmaking] Diferença de MMR muito alta (${Math.round(mmrDifference)}), aguardando mais jogadores`);
      return null;
    }

    // Atribuir lanes baseado no MMR
    this.assignLanesByMMR(team1);
    this.assignLanesByMMR(team2);

    // Criar partida
    const match: Match = {
      id: 0, // Será definido quando salvar no banco
      team1,
      team2,
      createdAt: new Date(),
      status: 'waiting',
      averageMMR1: avgMMR1,
      averageMMR2: avgMMR2,
      acceptedPlayers: new Set()
    };

    console.log(`✅ [Matchmaking] Partida criada com sucesso!`);
    return match;
  }

  // ✅ CORREÇÃO: Método para atribuir lanes em ordem fixa
  private assignLanesByMMR(team: QueuedPlayer[]): void {
    console.log(`🎯 [AssignLanes] Atribuindo lanes para time com ${team.length} jogadores`);
    
    // ✅ CORREÇÃO: Ordem fixa de lanes (índice 0=top, 1=jungle, 2=mid, 3=adc, 4=support)
    const laneOrder = ['top', 'jungle', 'mid', 'adc', 'support'];
    
    console.log(`📊 [AssignLanes] Jogadores antes da ordenação:`, team.map((p, i) => ({
      index: i,
      name: p.summonerName,
      mmr: p.currentMMR,
      primary: p.preferences?.primaryLane,
      secondary: p.preferences?.secondaryLane
    })));

    // ✅ CORREÇÃO: Atribuir lanes baseado na posição no array, não no MMR
    team.forEach((player, index) => {
      const assignedLane = laneOrder[index] || 'fill';
      
      // Verificar se a lane atribuída corresponde às preferências
      const isPreferred = player.preferences?.primaryLane === assignedLane || 
                         player.preferences?.secondaryLane === assignedLane ||
                         (assignedLane === 'adc' && (player.preferences?.primaryLane === 'bot' || player.preferences?.secondaryLane === 'bot'));
      
      player.preferences = {
        ...player.preferences,
        assignedLane: assignedLane,
        isAutofill: !isPreferred
      };
      
      console.log(`✅ [AssignLanes] Jogador [${index}] ${player.summonerName} -> ${assignedLane} ${isPreferred ? '(preferência)' : '(autofill)'}`);
    });

    // Log final das atribuições
    console.log(`📋 [AssignLanes] Atribuições finais (ordem fixa):`, team.map((p, i) => ({
      index: i,
      name: p.summonerName,
      mmr: p.currentMMR,
      assignedLane: p.preferences?.assignedLane,
      isAutofill: p.preferences?.isAutofill,
      primary: p.preferences?.primaryLane,
      secondary: p.preferences?.secondaryLane
    })));
  }

  // Método para iniciar fase de draft
  private async startDraftPhase(matchId: number): Promise<void> {
    const match = this.activeMatches.get(matchId);
    if (!match) {
      console.log(`❌ [Draft] Partida ${matchId} não encontrada para iniciar draft`);
      return;
    }

    console.log(`🎯 [Draft] Iniciando fase de draft para partida ${matchId}`);
    console.log(`🎯 [Draft] Jogadores na partida:`, [...match.team1, ...match.team2].map(p => ({ id: p.id, name: p.summonerName })));

    // Atualizar status da partida
    match.status = 'in_progress';

    // Criar dados do draft com a estrutura correta que o frontend espera
    const draftData = {
      matchId: matchId,
      phase: 'draft',
      turnOrder: this.generateDraftTurnOrder(match),
      timeLimit: 30, // segundos por turno
      currentTurn: 0,
      // ✅ CORREÇÃO: Estrutura que o frontend espera com teamIndex correto
      team1: match.team1.map((p, index) => ({
        id: p.id,
        summonerName: p.summonerName,
        name: p.summonerName, // Frontend espera 'name' também
        mmr: p.currentMMR,
        primaryLane: p.preferences?.primaryLane || 'fill',
        secondaryLane: p.preferences?.secondaryLane || 'fill',
        assignedLane: p.preferences?.assignedLane || 'fill',
        lane: p.preferences?.assignedLane || 'fill', // ✅ NOVO: Frontend espera 'lane'
        isAutofill: p.preferences?.isAutofill || false,
        teamIndex: index, // ✅ CORREÇÃO: teamIndex baseado na posição no array (0-4)
        originalIndex: index // ✅ NOVO: Manter índice original
      })),
      team2: match.team2.map((p, index) => ({
        id: p.id,
        summonerName: p.summonerName,
        name: p.summonerName, // Frontend espera 'name' também
        mmr: p.currentMMR,
        primaryLane: p.preferences?.primaryLane || 'fill',
        secondaryLane: p.preferences?.secondaryLane || 'fill',
        assignedLane: p.preferences?.assignedLane || 'fill',
        lane: p.preferences?.assignedLane || 'fill', // ✅ NOVO: Frontend espera 'lane'
        isAutofill: p.preferences?.isAutofill || false,
        teamIndex: index, // ✅ CORREÇÃO: teamIndex baseado na posição no array (0-4)
        originalIndex: index // ✅ NOVO: Manter índice original
      })),
      // Dados adicionais para o draft
      averageMMR: {
        team1: match.averageMMR1,
        team2: match.averageMMR2
      },
      estimatedGameDuration: 25, // minutos
      acceptTimeout: 30 // segundos para aceitar
    };

    console.log(`🎯 [Draft] Dados do draft criados:`, {
      matchId: draftData.matchId,
      team1: draftData.team1.map(p => ({ index: p.teamIndex, name: p.summonerName, lane: p.lane })),
      team2: draftData.team2.map(p => ({ index: p.teamIndex, name: p.summonerName, lane: p.lane }))
    });

    // Notificar jogadores sobre o draft
    this.notifyDraftPhase(match, draftData);

    // Adicionar atividade
    this.addActivity('match_created', `Fase de draft iniciada para partida ${matchId}`);

    console.log(`✅ [Draft] Fase de draft iniciada com sucesso para partida ${matchId}`);
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

    console.log(`📡 [Draft] Notificando ${allPlayers.length} jogadores sobre o draft`);

    allPlayers.forEach(player => {
      if (player.websocket && player.id > 0) {
        try {
          const message = {
            type: 'draft_started',
            data: draftData
          };

          console.log(`📡 [Draft] Enviando mensagem para ${player.summonerName}:`, message);
          player.websocket.send(JSON.stringify(message));
          console.log(`✅ [Draft] Mensagem enviada com sucesso para ${player.summonerName}`);
        } catch (error) {
          console.error(`❌ [Draft] Erro ao notificar draft para ${player.summonerName}:`, error);
        }
      } else {
        console.log(`⚠️ [Draft] Pulando ${player.summonerName} (bot ou sem websocket):`, {
          id: player.id,
          hasWebSocket: !!player.websocket,
          isBot: player.id < 0
        });
      }
    });

    console.log(`📡 [Draft] Notificação de draft concluída`);
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

      // Construir o nome completo (gameName#tagLine)
      const fullSummonerName = `${requestData.gameName}#${requestData.tagLine}`;
      console.log('🔍 [Matchmaking] Nome completo para Discord:', fullSummonerName);
      console.log('🔍 [Matchmaking] Dados recebidos:', {
        discordId: requestData.discordId,
        gameName: requestData.gameName,
        tagLine: requestData.tagLine,
        lcuData: requestData.lcuData
      });

      // Buscar link Discord-LoL
      const discordLink = await this.dbManager.getDiscordLink(requestData.discordId);
      console.log('🔍 [Matchmaking] Link Discord encontrado:', discordLink);

      if (!discordLink) {
        console.log('❌ [Matchmaking] Link Discord não encontrado para ID:', requestData.discordId);
        throw new Error('Conta Discord não vinculada ao LoL');
      }

      console.log('✅ [Matchmaking] Link Discord encontrado:', {
        discordId: discordLink.discord_id,
        gameName: discordLink.game_name,
        tagLine: discordLink.tag_line,
        summonerName: discordLink.summoner_name
      });

      // Verificar se o link ainda é válido
      const isValid = await this.dbManager.verifyDiscordLink(
        requestData.discordId,
        requestData.gameName,
        requestData.tagLine
      );

      console.log('🔍 [Matchmaking] Verificação do link:', {
        discordId: requestData.discordId,
        gameName: requestData.gameName,
        tagLine: requestData.tagLine,
        isValid: isValid
      });

      if (!isValid) {
        // Tentar verificar com dados do link existente
        console.log('🔍 [Matchmaking] Link inválido, verificando dados do link existente:', {
          linkGameName: discordLink.game_name,
          linkTagLine: discordLink.tag_line,
          requestGameName: requestData.gameName,
          requestTagLine: requestData.tagLine
        });

        // Se os dados não batem, mas o link existe, usar os dados do link
        if (discordLink.game_name && discordLink.tag_line) {
          console.log('🔄 [Matchmaking] Usando dados do link existente em vez dos dados da requisição');
          requestData.gameName = discordLink.game_name;
          requestData.tagLine = discordLink.tag_line;

          // Reconstruir o nome completo
          const correctedFullName = `${discordLink.game_name}#${discordLink.tag_line}`;
          console.log('🔄 [Matchmaking] Nome corrigido:', correctedFullName);

          // Verificar novamente se agora é válido
          const isValidAfterCorrection = await this.dbManager.verifyDiscordLink(
            requestData.discordId,
            requestData.gameName,
            requestData.tagLine
          );

          if (!isValidAfterCorrection) {
            throw new Error('Dados do LoL não correspondem ao link Discord mesmo após correção');
          }

          console.log('✅ [Matchmaking] Link válido após correção dos dados');
        } else {
          throw new Error('Dados do LoL não correspondem ao link Discord');
        }
      }

      // VERIFICAÇÃO CRÍTICA: Verificar se o jogador está detectado pelo LCU
      const lcuData = requestData.lcuData;
      if (!lcuData || !lcuData.gameName || !lcuData.tagLine) {
        throw new Error('Jogador não detectado pelo LCU. Certifique-se de estar logado no LoL');
      }

      // Verificar se os dados do LCU correspondem aos dados do Discord
      const lcuFullName = `${lcuData.gameName}#${lcuData.tagLine}`;
      const discordFullName = `${requestData.gameName}#${requestData.tagLine}`;

      console.log('🔍 [Matchmaking] Comparando dados LCU vs Discord:', {
        lcuData: lcuData,
        lcuFullName: lcuFullName,
        discordData: {
          gameName: requestData.gameName,
          tagLine: requestData.tagLine
        },
        discordFullName: discordFullName,
        match: lcuFullName === discordFullName
      });

      // Se os dados não batem exatamente, mas temos um link Discord válido, usar os dados do Discord
      if (lcuFullName !== discordFullName) {
        console.log('⚠️ [Matchmaking] Dados do LCU e Discord não batem, mas link Discord é válido. Usando dados do Discord.');
        // Continuar com os dados do Discord, já que o link foi validado
      }

      console.log('✅ [Matchmaking] Jogador detectado pelo LCU e Discord:', lcuFullName);

      // Buscar jogador no banco usando o nome completo
      let player = await this.dbManager.getPlayerBySummonerName(discordFullName);
      if (!player) {
        // Se não encontrou pelo nome completo, tentar pelo nome do link
        player = await this.dbManager.getPlayerBySummonerName(discordLink.summoner_name);
        if (!player) {
          throw new Error('Jogador não encontrado no banco de dados');
        }
        // Atualizar o nome no banco para o formato completo
        await this.dbManager.updatePlayerSummonerName(player.id!, discordFullName);
        player.summoner_name = discordFullName;
        console.log('✅ [Matchmaking] Nome do jogador atualizado para formato completo:', discordFullName);
      }

      // PRIMEIRO: Verificar se já está na fila no MySQL
      const existingInDB = await this.dbManager.getActiveQueuePlayers();
      const isAlreadyInQueue = existingInDB.some(dbPlayer => 
        dbPlayer.summoner_name === discordFullName ||
        dbPlayer.player_id === player?.id
      );

      if (isAlreadyInQueue) {
        console.log(`⚠️ [Matchmaking] Jogador ${discordFullName} já está na fila (MySQL)`);
        const playerInQueue = existingInDB.find(p => 
          p.summoner_name === discordFullName || p.player_id === player?.id
        );
        websocket.send(JSON.stringify({
          type: 'queue_joined',
          data: {
            position: playerInQueue?.queue_position || 0,
            estimatedWait: this.calculateEstimatedWaitTime(),
            queueStatus: await this.getQueueStatus()
          }
        }));
        return;
      }

      // SEGUNDO: Verificar se já está na fila local (e atualizar websocket se necessário)
      const existingPlayerIndex = this.queue.findIndex(p => 
        p.summonerName === discordFullName || p.id === player?.id
      );
      
      if (existingPlayerIndex !== -1) {
        // Atualizar websocket se jogador reconectar
        this.queue[existingPlayerIndex].websocket = websocket;
        console.log('🔄 [Matchmaking] Jogador já na fila via Discord, atualizando WebSocket:', discordFullName);
        websocket.send(JSON.stringify({
          type: 'queue_joined',
          data: { 
            position: existingPlayerIndex + 1, 
            estimatedWait: this.calculateEstimatedWaitTime(),
            queueStatus: await this.getQueueStatus()
          }
        }));
        return;
      }

      // TERCEIRO: Adicionar ao MySQL PRIMEIRO
      await this.dbManager.addPlayerToQueue(
        player.id!,
        discordFullName, // Nome completo
        player.region,
        player.custom_lp || 0,
        requestData.preferences
      );

      // QUARTO: Adicionar à fila local
      const queuedPlayer: QueuedPlayer = {
        id: player.id!,
        summonerName: discordFullName, // Usar nome completo
        region: player.region,
        currentMMR: player.custom_lp || 0,
        joinTime: new Date(),
        websocket: websocket,
        queuePosition: this.queue.length + 1,
        preferences: requestData.preferences || { primaryLane: 'fill', secondaryLane: 'fill' }
      };

      console.log('🔍 [Matchmaking] Preferências do jogador:', {
        receivedPreferences: requestData.preferences,
        finalPreferences: queuedPlayer.preferences,
        primaryLane: queuedPlayer.preferences?.primaryLane,
        secondaryLane: queuedPlayer.preferences?.secondaryLane
      });

      this.queue.push(queuedPlayer);

      // QUINTO: Atualizar posições na fila após adicionar o jogador
      await this.updateQueuePositions();

      // SEXTO: Adicionar atividade
      const primaryLaneName = this.getLaneDisplayName(queuedPlayer.preferences?.primaryLane);
      this.addActivity(
        'player_joined',
        `${discordFullName} entrou na fila`,
        discordFullName,
        queuedPlayer.preferences?.primaryLane
      );

      // SÉTIMO: Notificar jogador
      websocket.send(JSON.stringify({
        type: 'queue_joined',
        data: {
          position: this.queue.length,
          estimatedWait: this.calculateEstimatedWaitTime(),
          queueStatus: await this.getQueueStatus()
        }
      }));

      // OITAVO: Broadcast atualização da fila (forçar imediatamente para entrada)
      await this.forceQueueUpdate();

      console.log(`✅ [Matchmaking] ${discordFullName} entrou na fila via Discord (MySQL + Local)`);

    } catch (error: any) {
      console.error('❌ [Matchmaking] Erro ao adicionar jogador à fila via Discord:', error);
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
  public async removePlayerFromQueueById(playerId?: number, summonerName?: string): Promise<boolean> {
    console.log(`🔍 [Matchmaking] Tentando remover jogador da fila:`, { playerId, summonerName });

    try {
      // PRIMEIRO: Remover do MySQL
      let removedFromDB = false;
      
      if (playerId) {
        await this.dbManager.removePlayerFromQueue(playerId);
        removedFromDB = true;
        console.log(`✅ [Matchmaking] Jogador ID ${playerId} removido do MySQL`);
      } else if (summonerName) {
        // Buscar o ID do jogador no banco primeiro
        const dbPlayers = await this.dbManager.getActiveQueuePlayers();
        const dbPlayer = dbPlayers.find(p => 
          p.summoner_name === summonerName ||
          // Também verificar se o summonerName fornecido é compatível (gameName#tagLine)
          (p.summoner_name.includes('#') && summonerName.includes('#') && 
           p.summoner_name === summonerName) ||
          // Verificar se é só o gameName sem tagLine
          (p.summoner_name.includes('#') && !summonerName.includes('#') &&
           p.summoner_name.startsWith(summonerName + '#'))
        );
        
        if (dbPlayer) {
          await this.dbManager.removePlayerFromQueue(dbPlayer.player_id);
          removedFromDB = true;
          console.log(`✅ [Matchmaking] Jogador ${summonerName} removido do MySQL (ID: ${dbPlayer.player_id})`);
        }
      }

      // SEGUNDO: Remover da fila local
      let playerIndex = -1;

      if (playerId) {
        playerIndex = this.queue.findIndex(p => p.id === playerId);
      } else if (summonerName) {
        playerIndex = this.queue.findIndex(p => 
          p.summonerName === summonerName ||
          // Também verificar se o summonerName fornecido é compatível (gameName#tagLine)
          (p.summonerName.includes('#') && summonerName.includes('#') && 
           p.summonerName === summonerName) ||
          // Verificar se é só o gameName sem tagLine
          (p.summonerName.includes('#') && !summonerName.includes('#') &&
           p.summonerName.startsWith(summonerName + '#'))
        );
      }

      if (playerIndex !== -1) {
        const player = this.queue[playerIndex];
        console.log(`✅ [Matchmaking] Removendo jogador da fila local:`, { id: player.id, name: player.summonerName });

        this.queue.splice(playerIndex, 1);

        // Adicionar atividade
        this.addActivity(
          'player_left',
          `${player.summonerName} saiu da fila`,
          player.summonerName
        );

        // Atualizar posições na fila
        await this.updateQueuePositions();

        // Broadcast atualização da fila
        await this.broadcastQueueUpdate();

        console.log(`➖ [Matchmaking] ${player.summonerName} removido da fila (MySQL + Local)`);
        return true;
      } else {
        console.log(`⚠️ [Matchmaking] Jogador não encontrado na fila local:`, { playerId, summonerName });
        return removedFromDB; // Retorna true se foi removido do MySQL mesmo que não estivesse na fila local
      }

    } catch (error) {
      console.error('❌ [Matchmaking] Erro ao remover jogador da fila:', error);
      return false;
    }
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

    // NOVO: Limpar intervalo de sincronização MySQL
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
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

  // Método para forçar atualização imediata (usado para ações críticas)
  public async forceQueueUpdate(): Promise<void> {
    console.log('🚀 [Matchmaking] Forçando atualização imediata da fila...');
    await this.broadcastQueueUpdate(true);
  }

  // Método para atualizar partida após picks/bans completados
  async updateMatchAfterDraft(matchId: number, draftData: any): Promise<void> {
    const match = this.activeMatches.get(matchId);
    if (!match) {
      throw new Error('Partida não encontrada');
    }

    console.log(`🎯 [Draft] Atualizando partida ${matchId} após draft completado`);

    try {
      // Atualizar partida no banco com dados do draft
      await this.dbManager.updateCustomMatch(matchId, {
        title: `Partida com Draft - ${new Date().toLocaleString()}`,
        description: `Draft completado - MMR médio: Time 1: ${Math.round(match.averageMMR1)}, Time 2: ${Math.round(match.averageMMR2)}`,
        status: 'draft_completed',
        draft_data: draftData // Salvar dados do draft
      });

      console.log(`✅ [Draft] Partida ${matchId} atualizada com dados do draft`);
    } catch (error) {
      console.error(`❌ [Draft] Erro ao atualizar partida ${matchId} após draft:`, error);
      throw error;
    }
  }

  // Método para finalizar partida após jogo completado (usando completeCustomMatch que já funciona)
  async completeMatchAfterGame(matchId: number, winnerTeam: number, gameData: any): Promise<void> {
    const match = this.activeMatches.get(matchId);
    if (!match) {
      throw new Error('Partida não encontrada');
    }

    console.log(`🏁 [Game] Finalizando partida ${matchId} após jogo completado - Vencedor: Time ${winnerTeam}`);

    try {
      // Usar o método completeCustomMatch que já funciona corretamente
      await this.dbManager.completeCustomMatch(matchId, winnerTeam, {
        duration: gameData.duration || 0,
        pickBanData: gameData.pickBanData || null,
        participantsData: gameData.participantsData || null,
        detectedByLCU: gameData.detectedByLCU || false,
        riotGameId: gameData.riotGameId || null,
        notes: `Partida finalizada via matchmaking - ${gameData.notes || 'Jogo completado'}`
      });

      // Remover da lista de partidas ativas
      this.activeMatches.delete(matchId);

      console.log(`✅ [Game] Partida ${matchId} finalizada com sucesso usando completeCustomMatch`);
    } catch (error) {
      console.error(`❌ [Game] Erro ao finalizar partida ${matchId}:`, error);
      throw error;
    }
  }

  // Método para cancelar draft e remover partida do banco
  async cancelDraft(matchId: number, reason: string): Promise<void> {
    const match = this.activeMatches.get(matchId);
    if (!match) {
      console.log(`⚠️ [CancelDraft] Partida ${matchId} não encontrada nas partidas ativas`);
      return;
    }

    console.log(`🎉 [CancelDraft] Draft da partida ${matchId} cancelado por ${reason}`);
    console.log(`🔍 [CancelDraft] Dados da partida:`, {
      matchId: matchId,
      matchIdInMatch: match.id,
      team1Size: match.team1.length,
      team2Size: match.team2.length,
      status: match.status
    });

    // Remover partida das ativas
    this.activeMatches.delete(matchId);

    // APAGAR partida do banco de dados se foi salva
    try {
      if (match.id) {
        console.log(`🗑️ [CancelDraft] Tentando apagar partida ${matchId} do banco (ID: ${match.id})`);
        await this.dbManager.deleteCustomMatch(match.id);
        console.log(`🗑️ [CancelDraft] Partida ${matchId} apagada do banco de dados (ID: ${match.id})`);
      } else {
        console.log(`⚠️ [CancelDraft] Partida ${matchId} não tem ID no banco para apagar`);
      }
    } catch (error) {
      console.error(`❌ [CancelDraft] Erro ao apagar partida ${matchId} do banco:`, error);
    }

    // CORREÇÃO: Apenas o jogador que cancelou sai da fila, os outros continuam
    const allPlayers = [...match.team1, ...match.team2];
    const removedPlayers: string[] = [];
    const returnedPlayers: string[] = [];

    // Identificar quem cancelou (assumindo que é o primeiro jogador real, não bot)
    const cancellingPlayer = allPlayers.find(p => p.id > 0); // Primeiro jogador real

    allPlayers.forEach(player => {
      if (player === cancellingPlayer) {
        // Apenas quem cancelou sai da fila
        const playerIndex = this.queue.findIndex(p => p.id === player.id);
        if (playerIndex !== -1) {
          this.queue.splice(playerIndex, 1);
          removedPlayers.push(player.summonerName);
          console.log(`🗑️ [CancelDraft] ${player.summonerName} removido da fila (cancelou o draft)`);
        }
      } else {
        // Os outros jogadores continuam na fila
        const playerIndex = this.queue.findIndex(p => p.id === player.id);
        if (playerIndex === -1) {
          // Se não está na fila, adicionar de volta
          player.websocket = null as any; // Resetar websocket
          this.queue.push(player);
          returnedPlayers.push(player.summonerName);
          console.log(`🔄 [CancelDraft] ${player.summonerName} retornou à fila (Bot: ${player.id < 0})`);
        } else {
          console.log(`✅ [CancelDraft] ${player.summonerName} já está na fila (Bot: ${player.id < 0})`);
        }
      }

      // Notificar jogador sobre o cancelamento do draft
      if (player.websocket && player.id > 0) { // Pular bots
        try {
          const message = {
            type: 'draft_cancelled',
            data: {
              matchId: matchId,
              reason: reason
            }
          };

          console.log(`📡 [CancelDraft] Enviando mensagem para ${player.summonerName}:`, JSON.stringify(message, null, 2));
          player.websocket.send(JSON.stringify(message));
          console.log(`✅ [CancelDraft] Mensagem enviada com sucesso para ${player.summonerName}`);
        } catch (error) {
          console.error(`❌ [CancelDraft] Erro ao notificar cancelamento do draft para ${player.summonerName}:`, error);
        }
      }
    });

    // Atualizar posições na fila
    this.queue.forEach((p, index) => {
      p.queuePosition = index + 1;
    });

    // Broadcast atualização da fila
    this.broadcastQueueUpdate();

    console.log(`✅ [CancelDraft] ${removedPlayers.length} jogador removido da fila:`, removedPlayers);
    console.log(`✅ [CancelDraft] ${returnedPlayers.length} jogadores retornaram à fila:`, returnedPlayers);
    this.addActivity('match_created', `Draft da partida ${matchId} cancelado por ${reason} - ${removedPlayers.length} jogador removido, ${returnedPlayers.length} retornaram à fila`);
  }

  // Método para cancelar partida em andamento (após o draft)
  async cancelGameInProgress(matchId: number, reason: string): Promise<void> {
    console.log(`🔍 [CancelGameInProgress] Iniciando cancelamento para matchId: ${matchId}`);
    console.log(`🔍 [CancelGameInProgress] Tipo do matchId: ${typeof matchId}`);
    console.log(`🔍 [CancelGameInProgress] Reason: ${reason}`);
    
    const match = this.activeMatches.get(matchId);
    if (!match) {
      console.log(`⚠️ [CancelGameInProgress] Partida ${matchId} não encontrada nas partidas ativas`);
      console.log(`🔍 [CancelGameInProgress] Partidas ativas disponíveis:`, Array.from(this.activeMatches.keys()));
      return;
    }

    console.log(`🎉 [CancelGameInProgress] Partida em andamento ${matchId} cancelada por ${reason}`);
    console.log(`🔍 [CancelGameInProgress] Dados da partida:`, {
      matchId: matchId,
      matchIdInMatch: match.id,
      team1Size: match.team1.length,
      team2Size: match.team2.length,
      status: match.status
    });

    // Remover partida das ativas
    this.activeMatches.delete(matchId);

    // APAGAR partida do banco de dados se foi salva
    try {
      if (match.id) {
        console.log(`🗑️ [CancelGameInProgress] Tentando apagar partida ${matchId} do banco (ID: ${match.id})`);
        await this.dbManager.deleteCustomMatch(match.id);
        console.log(`🗑️ [CancelGameInProgress] Partida ${matchId} apagada do banco de dados (ID: ${match.id})`);
      } else {
        console.log(`⚠️ [CancelGameInProgress] Partida ${matchId} não tem ID no banco para apagar`);
      }
    } catch (error) {
      console.error(`❌ [CancelGameInProgress] Erro ao apagar partida ${matchId} do banco:`, error);
    }

    // CORREÇÃO: Remover jogadores da fila ao invés de retorná-los
    const allPlayers = [...match.team1, ...match.team2];
    const removedPlayers: string[] = [];

    allPlayers.forEach(player => {
      // Remover jogador da fila
      const playerIndex = this.queue.findIndex(p => p.id === player.id);
      if (playerIndex !== -1) {
        this.queue.splice(playerIndex, 1);
        removedPlayers.push(player.summonerName);
        console.log(`🗑️ [CancelGameInProgress] ${player.summonerName} removido da fila após cancelamento da partida (Bot: ${player.id < 0})`);
      } else {
        console.log(`⚠️ [CancelGameInProgress] ${player.summonerName} não encontrado na fila para remoção`);
      }

      // Notificar jogador sobre o cancelamento da partida
      if (player.websocket && player.id > 0) { // Pular bots
        try {
          const message = {
            type: 'game_cancelled',
            data: {
              matchId: matchId,
              reason: reason
            }
          };

          console.log(`📡 [CancelGameInProgress] Enviando mensagem para ${player.summonerName}:`, JSON.stringify(message, null, 2));
          player.websocket.send(JSON.stringify(message));
          console.log(`✅ [CancelGameInProgress] Mensagem enviada com sucesso para ${player.summonerName}`);
        } catch (error) {
          console.error(`❌ [CancelGameInProgress] Erro ao notificar cancelamento da partida para ${player.summonerName}:`, error);
        }
      }
    });

    // Atualizar posições na fila
    this.queue.forEach((p, index) => {
      p.queuePosition = index + 1;
    });

    // Broadcast atualização da fila
    this.broadcastQueueUpdate();

    console.log(`✅ [CancelGameInProgress] ${removedPlayers.length} jogadores removidos da fila:`, removedPlayers);
    this.addActivity('match_created', `Partida em andamento ${matchId} cancelada por ${reason} - ${removedPlayers.length} jogadores removidos da fila`);
  }

  // NOVO: Iniciar intervalo de matchmaking
  private startMatchmakingInterval(): void {
    if (this.matchmakingInterval) {
      clearInterval(this.matchmakingInterval);
    }

    this.matchmakingInterval = setInterval(() => {
      this.processMatchmaking();
    }, 5000);

    console.log('🔄 [Matchmaking] Intervalo de matchmaking iniciado (5s)');
  }

  // NOVO: Iniciar intervalo de limpeza
  private startCleanupInterval(): void {
    console.log('⚠️ [Cleanup] Limpeza automática DESABILITADA para preservar dados');
    console.log('🔧 [Cleanup] Limpeza será executada apenas sob demanda ou em casos críticos');
    
    // ✅ DESABILITADO: Limpeza automática a cada 30 segundos
    // Motivo: Prevenir remoção não intencional de jogadores da fila
    /*
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }

    this.cleanupInterval = setInterval(() => {
      this.cleanupInactivePlayers();
    }, this.CLEANUP_INTERVAL_MS);

    console.log(`🔄 [Cleanup] Intervalo de limpeza iniciado (${this.CLEANUP_INTERVAL_MS}ms)`);
    */
  }

  private async createMatch(players: QueuedPlayer[]): Promise<void> {
    if (players.length !== 10) {
      console.log('⚠️ [Matchmaking] Tentativa de criar partida com número incorreto de jogadores:', players.length);
      return;
    }

    console.log('🎯 [Matchmaking] Criando partida com 10 jogadores...');

    try {
      // PRIMEIRO: Remover todos os jogadores do MySQL
      for (const player of players) {
        await this.dbManager.removePlayerFromQueue(player.id);
        console.log(`🗑️ [Matchmaking] Jogador ${player.summonerName} removido do MySQL (partida iniciada)`);
      }

      // SEGUNDO: Remover da fila local
      for (const player of players) {
        const playerIndex = this.queue.findIndex(p => p.id === player.id);
        if (playerIndex !== -1) {
          this.queue.splice(playerIndex, 1);
          console.log(`🗑️ [Matchmaking] Jogador ${player.summonerName} removido da fila local (partida iniciada)`);
        }
      }

      // TERCEIRO: Atualizar posições no MySQL
      await this.updateQueuePositions();

      // QUARTO: Criar a partida
      const matchId = this.nextMatchId++;
      
      // Dividir jogadores em duas equipes
      const team1 = players.slice(0, 5);
      const team2 = players.slice(5, 10);
      
      const match: Match = {
        id: matchId,
        team1: team1,
        team2: team2,
        status: 'waiting_accept',
        createdAt: new Date(),
        averageMMR1: team1.reduce((sum, p) => sum + p.currentMMR, 0) / team1.length,
        averageMMR2: team2.reduce((sum, p) => sum + p.currentMMR, 0) / team2.length,
        acceptedPlayers: new Set(),
        acceptTimeout: undefined
      };

      this.activeMatches.set(matchId, match);

      // QUINTO: Configurar timeout de aceitação
      match.acceptTimeout = setTimeout(() => {
        this.cancelMatch(matchId, 'Timeout de aceitação expirado');
      }, 30000); // 30 segundos

      // SEXTO: Notificar jogadores sobre a partida encontrada
      for (const player of players) {
        if (player.websocket && player.websocket.readyState === WebSocket.OPEN) {
          try {
            const matchData = {
              type: 'match_found',
              data: {
                matchId: matchId,
                players: players.map(p => ({
                  id: p.id,
                  summonerName: p.summonerName,
                  region: p.region,
                  currentMMR: p.currentMMR,
                  preferences: p.preferences
                })),
                timeout: 30
              }
            };

            player.websocket.send(JSON.stringify(matchData));
            console.log(`📡 [Matchmaking] Notificação de partida enviada para ${player.summonerName}`);
          } catch (error) {
            console.error(`❌ [Matchmaking] Erro ao notificar ${player.summonerName}:`, error);
          }
        }
      }

      // SÉTIMO: Adicionar atividade
      this.addActivity(
        'match_created',
        `Partida ${matchId} criada com ${players.length} jogadores`
      );

      // OITAVO: Broadcast atualização da fila
      await this.broadcastQueueUpdate();

      console.log(`✅ [Matchmaking] Partida ${matchId} criada com sucesso. Jogadores removidos da fila.`);

    } catch (error) {
      console.error('❌ [Matchmaking] Erro ao criar partida:', error);
    }
  }

  // ✅ NOVO: Método público para sincronização manual sob demanda
  public async forceMySQLSync(): Promise<void> {
    console.log('🔄 [MySQL Sync] Sincronização manual solicitada...');
    try {
      await this.syncQueueWithDatabase();
      console.log('✅ [MySQL Sync] Sincronização manual concluída');
    } catch (error) {
      console.error('❌ [MySQL Sync] Erro na sincronização manual:', error);
      throw error;
    }
  }
}