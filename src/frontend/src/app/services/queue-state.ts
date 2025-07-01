import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable, interval } from 'rxjs';
import { ApiService } from './api';

// Import interfaces from api.ts since they are now defined there
interface QueueStatus {
  playersInQueue: number;
  averageWaitTime: number;
  estimatedMatchTime: number;
  isActive: boolean;
  playersInQueueList?: QueuedPlayerInfo[];
  recentActivities?: QueueActivity[];
  activeMatches?: number;
  queuedPlayers?: any[];
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

export interface QueueState {
  // ✅ SIMPLIFICAÇÃO: Só existe fila Discord/MySQL
  isInQueue: boolean;
  position?: number;
  waitTime?: number;
  estimatedTime?: number;
  playersInQueue?: number;
  averageWaitTime?: number;
}

/**
 * Serviço para gerenciar o estado da fila baseado exclusivamente na tabela queue_players
 * como única fonte de verdade, seguindo as regras estabelecidas.
 */
@Injectable({
  providedIn: 'root'
})
export class QueueStateService {
  private queueStateSubject = new BehaviorSubject<QueueState>({
    isInQueue: false,
    position: undefined,
    waitTime: 0,
    estimatedTime: 0,
    playersInQueue: 0,
    averageWaitTime: 0
  });

  // Sistema de sincronização via polling para consultar a tabela queue_players
  private pollingInterval: any = null;
  private readonly POLLING_INTERVAL_MS = 3000; // Polling a cada 3 segundos
  private currentPlayerData: any = null;

  constructor(private apiService: ApiService) {
    console.log('🔄 QueueStateService inicializado com sincronização MySQL (tabela queue_players)');
  }

  /**
   * REGRA: Iniciar sincronização via polling para consultar a tabela queue_players
   * ✅ MUDANÇA: Só fazer polling se explicitamente solicitado
   */
  startMySQLSync(currentPlayer?: any): void {
    this.currentPlayerData = currentPlayer;
    
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
    }

    // Executar sincronização imediatamente
    this.syncQueueFromDatabase();

    // ✅ MUDANÇA: Só configurar polling se explicitamente habilitado
    // O controle de polling será feito pelo componente Queue
    console.log(`🔄 [QueueState] Sincronização MySQL iniciada (sem polling automático)`);
  }

  /**
   * ✅ NOVO: Método para iniciar polling manualmente
   */
  startPolling(): void {
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
    }

    // Configurar polling
    this.pollingInterval = setInterval(() => {
      this.syncQueueFromDatabase();
    }, this.POLLING_INTERVAL_MS);

    console.log(`🔄 [QueueState] Polling MySQL iniciado a cada ${this.POLLING_INTERVAL_MS}ms`);
  }

  stopMySQLSync(): void {
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
      this.pollingInterval = null;
      console.log('🛑 [QueueState] Sincronização MySQL parada');
    }
  }

  /**
   * REGRA: Forçar sincronização imediata com a tabela queue_players
   */
  forceSync(): void {
    console.log('🔄 [QueueState] Forçando sincronização imediata com tabela queue_players...');
    
    // Chamar sincronização MySQL no backend (read-only)
    this.apiService.forceMySQLSync().subscribe({
      next: (response) => {
        console.log('✅ [QueueState] Sincronização MySQL backend concluída:', response);
        
        // Sincronizar dados do frontend com o backend atualizado
        this.syncQueueFromDatabase();
      },
      error: (error) => {
        console.error('❌ [QueueState] Erro na sincronização MySQL backend:', error);
        
        // FALLBACK: Mesmo com erro no backend, tentar sincronizar frontend
        this.syncQueueFromDatabase();
      }
    });
  }

  /**
   * REGRA: Sincronizar estado local com a tabela queue_players (única fonte de verdade)
   */
  private async syncQueueFromDatabase(): Promise<void> {
    try {
      // SEMPRE buscar dados DIRETAMENTE da tabela queue_players via API
      const queueStatus = await this.apiService.getQueueStatus().toPromise();
      
      // ✅ REMOÇÃO DE VALIDAÇÃO: A fila deve ser exibida SEMPRE, mesmo se vazia
      console.log('📊 [QueueState] Status da fila obtido - exibindo independente de validações:', {
        hasData: !!queueStatus,
        playersInQueue: queueStatus?.playersInQueue || 0,
        hasPlayersList: !!queueStatus?.playersInQueueList,
        playersListLength: queueStatus?.playersInQueueList?.length || 0
      });

      // Se não há resposta da API, criar estado vazio mas ainda assim exibir
      if (!queueStatus) {
        console.log('⚠️ [QueueState] Resposta nula da API - criando estado vazio para exibição');
        const emptyState: QueueState = {
          isInQueue: false,
          position: undefined,
          waitTime: 0,
          estimatedTime: 0,
          playersInQueue: 0,
          averageWaitTime: 0
        };
        this.queueStateSubject.next(emptyState);
        return;
      }

      console.log('📊 [QueueState] Dados da fila obtidos da tabela queue_players:', {
        playersInQueue: queueStatus.playersInQueue,
        hasPlayersList: !!queueStatus.playersInQueueList,
        playersListLength: queueStatus.playersInQueueList?.length || 0,
        playerNames: queueStatus.playersInQueueList?.map(p => p.summonerName) || []
      });

      // REGRA: Verificar se fila está vazia (contagem direta da tabela)
      const isQueueEmpty = !queueStatus.playersInQueue || queueStatus.playersInQueue === 0;
      
      if (isQueueEmpty) {
        console.log('📭 [QueueState] Fila está vazia na tabela queue_players');
        
        // Estado vazio confirmado pela tabela
        const emptyState: QueueState = {
          isInQueue: false,
          position: undefined,
          waitTime: queueStatus.averageWaitTime || 0,
          estimatedTime: queueStatus.estimatedMatchTime || 0,
          playersInQueue: 0,
          averageWaitTime: queueStatus.averageWaitTime || 0
        };
        
        console.log('🔄 [QueueState] Estado atualizado para fila vazia:', emptyState);
        this.queueStateSubject.next(emptyState);
        return;
      }

      // REGRA: Verificar se o usuário atual está na fila (baseado na tabela queue_players)
      let isUserInQueue = false;
      let userPosition = 0;
      let queuedPlayer: any = null;

      if (this.currentPlayerData) {
        // Construir diferentes formatos de identificação possíveis
        const identifiers = this.buildPlayerIdentifiers(this.currentPlayerData);
        
        console.log('🔍 [QueueState] Identificadores do jogador atual:', identifiers);

        // Buscar na lista de jogadores da fila (dados vindos da tabela queue_players)
        if (queueStatus.playersInQueueList && queueStatus.playersInQueueList.length > 0) {
          queuedPlayer = queueStatus.playersInQueueList.find((player: any) => {
            return this.matchPlayerIdentifiers(player, identifiers);
          });

          if (queuedPlayer) {
            isUserInQueue = true;
            userPosition = queuedPlayer.queuePosition || 0;
            console.log(`✅ [QueueState] Usuário encontrado na tabela queue_players: ${JSON.stringify(queuedPlayer)} (posição: ${userPosition})`);
          } else {
            console.log('❌ [QueueState] Usuário não encontrado na tabela queue_players');
          }
        }
      }

      // Atualizar estado baseado nos dados da tabela queue_players
      const newState: QueueState = {
        isInQueue: isUserInQueue,
        position: userPosition,
        waitTime: queueStatus.averageWaitTime || 0,
        estimatedTime: queueStatus.estimatedMatchTime || 0,
        playersInQueue: queueStatus.playersInQueue,
        averageWaitTime: queueStatus.averageWaitTime || 0
      };

      console.log('🔄 [QueueState] Estado atualizado baseado na tabela queue_players:', newState);
      this.queueStateSubject.next(newState);

    } catch (error: any) {
      console.error('❌ [QueueState] Erro ao sincronizar com tabela queue_players:', error);
      console.error('❌ [QueueState] Detalhes do erro:', {
        message: error?.message || 'N/A',
        stack: error?.stack || 'N/A',
        url: error?.url || 'N/A'
      });
      
      // ✅ CORREÇÃO: Verificar se erro é relacionado a URL incorreta
      if (error?.message && error.message.includes('/api/api/')) {
        console.error('🚨 [QueueState] DETECTADO ERRO DE URL DUPLICADA /api/api/ - isso não deveria acontecer após correções!');
        console.error('🔍 [QueueState] Verifique se o rebuild foi feito corretamente');
      }
      
      // Em caso de erro, definir estado vazio mas funcional para não travar interface
      const errorState: QueueState = {
        isInQueue: false,
        position: undefined,
        waitTime: 0,
        estimatedTime: 0,
        playersInQueue: 0,
        averageWaitTime: 0
      };
      
      console.log('🔄 [QueueState] Estado definido como vazio (erro):', errorState);
      this.queueStateSubject.next(errorState);
    }
  }

  /**
   * Construir identificadores possíveis para o jogador atual
   */
  private buildPlayerIdentifiers(playerData: any): string[] {
    const identifiers: string[] = [];
    
    // Nome completo do summoner se disponível
    if (playerData.summonerName) {
      identifiers.push(playerData.summonerName);
    }
    
    // Formato gameName#tagLine se disponível
    if (playerData.gameName && playerData.tagLine) {
      identifiers.push(`${playerData.gameName}#${playerData.tagLine}`);
    }
    
    // Apenas gameName se disponível
    if (playerData.gameName) {
      identifiers.push(playerData.gameName);
    }
    
    // Formato de display name se disponível
    if (playerData.displayName) {
      identifiers.push(playerData.displayName);
    }
    
    console.log('🔍 [QueueState] Identificadores construídos:', identifiers);
    return identifiers.filter(Boolean); // Remover valores vazios
  }

  /**
   * Verificar se um jogador da fila corresponde aos identificadores do usuário atual
   */
  private matchPlayerIdentifiers(queuePlayer: any, identifiers: string[]): boolean {
    if (!queuePlayer || !identifiers.length) return false;
    
    // Nome completo do jogador na fila
    const queuePlayerName = queuePlayer.summonerName;
    
    // Verificar correspondência exata
    for (const identifier of identifiers) {
      if (queuePlayerName === identifier) {
        console.log(`✅ [QueueState] Correspondência exata encontrada: ${queuePlayerName} === ${identifier}`);
        return true;
      }
      
      // Verificar correspondência por base name (ignorando tag)
      const queueBaseName = queuePlayerName.split('#')[0];
      const identifierBaseName = identifier.split('#')[0];
      
      if (queueBaseName === identifierBaseName) {
        console.log(`✅ [QueueState] Correspondência por base name: ${queueBaseName} === ${identifierBaseName}`);
        return true;
      }
    }
    
    return false;
  }

  updateCurrentPlayer(playerData: any): void {
    this.currentPlayerData = playerData;
    console.log('🔄 [QueueState] Dados do jogador atual atualizados:', playerData);
  }

  getQueueState(): Observable<QueueState> {
    return this.queueStateSubject.asObservable();
  }

  getCurrentState(): QueueState {
    return this.queueStateSubject.value;
  }

  /**
   * REMOVIDO: updateCentralizedQueue e updateP2PQueue
   * Agora apenas a tabela queue_players é a fonte de verdade
   */

  resetState(): void {
    const resetState: QueueState = {
      isInQueue: false,
      position: undefined,
      waitTime: 0,
      estimatedTime: 0,
      playersInQueue: 0,
      averageWaitTime: 0
    };
    this.queueStateSubject.next(resetState);
    console.log('🔄 [QueueState] Estado resetado');
  }

  getActiveSystem(): 'centralized' | 'none' {
    return 'centralized'; // Assuming centralized system
  }

  isInQueue(): boolean {
    return this.queueStateSubject.value.isInQueue;
  }

  getQueuePosition(): number | undefined {
    return this.queueStateSubject.value.position;
  }

  getPlayersInQueue(): number | undefined {
    return this.queueStateSubject.value.playersInQueue;
  }
}

