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
  // Estado global da fila (independente do sistema usado)
  isInQueue: boolean;
  queueType: 'centralized' | 'p2p' | 'none';
  position?: number;
  waitTime?: number;
  estimatedTime?: number;
  playersInQueue?: number;
  averageWaitTime?: number;
  // Sistema que está sendo usado atualmente
  activeSystem: 'centralized' | 'p2p' | 'none';
}

/**
 * Serviço para sincronizar o estado da fila entre o sistema centralizado (WebSocket)
 * e o sistema P2P distribuído, garantindo que a interface exiba o estado correto
 * independente de qual sistema está sendo usado.
 */
@Injectable({
  providedIn: 'root'
})
export class QueueStateService {
  private queueStateSubject = new BehaviorSubject<QueueState>({
    isInQueue: false,
    queueType: 'none',
    activeSystem: 'none'
  });

  // NOVO: Sistema de sincronização via polling
  private pollingInterval: any = null;
  private readonly POLLING_INTERVAL_MS = 3000; // Polling a cada 3 segundos
  private currentPlayerData: any = null;

  constructor(private apiService: ApiService) {
    console.log('🔄 QueueStateService inicializado com sincronização MySQL');
  }

  // NOVO: Iniciar sincronização via polling
  startMySQLSync(currentPlayer?: any): void {
    this.currentPlayerData = currentPlayer;
    
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
    }

    // Executar sincronização imediatamente
    this.syncQueueFromDatabase();

    // Configurar polling
    this.pollingInterval = setInterval(() => {
      this.syncQueueFromDatabase();
    }, this.POLLING_INTERVAL_MS);

    console.log(`🔄 [QueueState] Sincronização MySQL iniciada a cada ${this.POLLING_INTERVAL_MS}ms`);
  }

  // NOVO: Parar sincronização
  stopMySQLSync(): void {
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
      this.pollingInterval = null;
      console.log('🛑 [QueueState] Sincronização MySQL parada');
    }
  }

  // NOVO: Forçar sincronização imediata
  forceSync(): void {
    console.log('🔄 [QueueState] Forçando sincronização imediata...');
    
    // ✅ PRIMEIRO: Chamar sincronização MySQL no backend (read-only)
    this.apiService.forceMySQLSync().subscribe({
      next: (response) => {
        console.log('✅ [QueueState] Sincronização MySQL backend concluída:', response);
        
        // ✅ SEGUNDO: Sincronizar dados do frontend com o backend atualizado
        this.syncQueueFromDatabase();
      },
      error: (error) => {
        console.error('❌ [QueueState] Erro na sincronização MySQL backend:', error);
        
        // ✅ FALLBACK: Mesmo com erro no backend, tentar sincronizar frontend
        this.syncQueueFromDatabase();
      }
    });
  }

  private async syncQueueFromDatabase(): Promise<void> {
    try {
      // SEMPRE buscar dados do MySQL - não usar cache
      const queueStatus = await this.apiService.getQueueStatus().toPromise();
      
      if (!queueStatus) {
        console.log('⚠️ [QueueState] Não foi possível obter status da fila do MySQL');
        return;
      }

      console.log('📊 [QueueState] Dados da fila obtidos do MySQL:', {
        playersInQueue: queueStatus.playersInQueue,
        hasPlayersList: !!queueStatus.playersInQueueList,
        playersListLength: queueStatus.playersInQueueList?.length || 0,
        playerNames: queueStatus.playersInQueueList?.map(p => p.summonerName) || []
      });

      // Verificar se o usuário atual está na fila
      let isUserInQueue = false;
      let userPosition = 0;
      let queuedPlayer: any = null;

      if (this.currentPlayerData) {
        // Construir diferentes formatos de identificação possíveis
        const identifiers = this.buildPlayerIdentifiers(this.currentPlayerData);
        
        console.log('🔍 [QueueState] Identificadores do jogador atual:', identifiers);

        // Buscar na lista de jogadores da fila
        if (queueStatus.playersInQueueList) {
          queuedPlayer = queueStatus.playersInQueueList.find((player: any) => {
            return this.matchPlayerIdentifiers(player, identifiers);
          });

          if (queuedPlayer) {
            isUserInQueue = true;
            userPosition = queuedPlayer.queuePosition || 0;
            console.log(`✅ [QueueState] Usuário encontrado na fila: ${JSON.stringify(queuedPlayer)} (posição: ${userPosition})`);
          } else {
            console.log(`❌ [QueueState] Usuário não encontrado na fila`);
            console.log('🔍 [QueueState] Jogadores na fila:', queueStatus.playersInQueueList.map((p: any) => ({
              summonerName: p.summonerName,
              tagLine: p.tagLine,
              fullName: p.tagLine ? `${p.summonerName}#${p.tagLine}` : p.summonerName
            })));
          }
        }
      } else {
        console.log('⚠️ [QueueState] Nenhum dado do jogador atual disponível para verificação');
      }

      // Atualizar estado baseado nos dados do banco
      const newState: QueueState = {
        isInQueue: isUserInQueue,
        queueType: isUserInQueue ? 'centralized' : 'none',
        position: isUserInQueue ? userPosition : undefined,
        waitTime: queueStatus.averageWaitTime,
        estimatedTime: queueStatus.estimatedMatchTime || 0,
        playersInQueue: queueStatus.playersInQueue,
        averageWaitTime: queueStatus.averageWaitTime,
        activeSystem: isUserInQueue ? 'centralized' : 'none'
      };

      // SEMPRE atualizar o estado - não verificar se mudou
      console.log('🔄 [QueueState] Estado atualizado via MySQL:', newState);
      this.queueStateSubject.next(newState);

      // Retornar informações adicionais para debug
      return {
        queueStatus,
        isUserInQueue,
        userPosition,
        queuedPlayer
      } as any;

    } catch (error) {
      console.error('❌ [QueueState] Erro ao sincronizar com banco:', error);
    }
  }

  // Novo método para construir identificadores do jogador
  private buildPlayerIdentifiers(playerData: any): string[] {
    const identifiers: string[] = [];
    
    // Formato completo gameName#tagLine (preferencial)
    if (playerData.gameName && playerData.tagLine) {
      identifiers.push(`${playerData.gameName}#${playerData.tagLine}`);
    }
    
    // summonerName se disponível
    if (playerData.summonerName) {
      identifiers.push(playerData.summonerName);
    }
    
    // gameName sozinho (fallback)
    if (playerData.gameName) {
      identifiers.push(playerData.gameName);
    }

    return identifiers.filter(Boolean);
  }

  // Novo método para verificar se um jogador na fila corresponde aos identificadores
  private matchPlayerIdentifiers(queuePlayer: any, identifiers: string[]): boolean {
    // Construir possíveis nomes do jogador na fila
    const queuePlayerNames: string[] = [];
    
    // Nome completo se tiver tagLine
    if (queuePlayer.summonerName && queuePlayer.tagLine) {
      queuePlayerNames.push(`${queuePlayer.summonerName}#${queuePlayer.tagLine}`);
    }
    
    // summonerName direto
    if (queuePlayer.summonerName) {
      queuePlayerNames.push(queuePlayer.summonerName);
    }

    // Verificar correspondência (case-insensitive)
    const match = identifiers.some(identifier => 
      queuePlayerNames.some(queueName => 
        identifier.toLowerCase() === queueName.toLowerCase()
      )
    );

    if (match) {
      console.log(`🎯 [QueueState] Match encontrado:`, {
        identifiers,
        queuePlayerNames,
        matched: true
      });
    }

    return match;
  }

  // Método para atualizar dados do jogador atual
  updateCurrentPlayer(playerData: any): void {
    this.currentPlayerData = playerData;
    console.log('👤 [QueueState] Dados do jogador atual atualizados:', playerData?.summonerName);
  }

  // Método para obter estado atual
  getQueueState(): Observable<QueueState> {
    return this.queueStateSubject.asObservable();
  }

  // Método para obter estado atual (síncrono)
  getCurrentState(): QueueState {
    return this.queueStateSubject.value;
  }

  // Atualizar estado da fila centralizada (WebSocket)
  updateCentralizedQueue(data: {
    isInQueue: boolean;
    position?: number;
    waitTime?: number;
    estimatedTime?: number;
    playersInQueue?: number;
    averageWaitTime?: number;
  }): void {
    const currentState = this.queueStateSubject.value;

    this.queueStateSubject.next({
      ...currentState,
      isInQueue: data.isInQueue,
      queueType: data.isInQueue ? 'centralized' : 'none',
      position: data.position,
      waitTime: data.waitTime,
      estimatedTime: data.estimatedTime,
      playersInQueue: data.playersInQueue,
      averageWaitTime: data.averageWaitTime,
      activeSystem: data.isInQueue ? 'centralized' : currentState.activeSystem
    });
  }

  // Atualizar estado da fila P2P
  updateP2PQueue(data: {
    isInQueue: boolean;
    position?: number;
    waitTime?: number;
    peersInQueue?: number;
  }): void {
    const currentState = this.queueStateSubject.value;

    this.queueStateSubject.next({
      ...currentState,
      isInQueue: data.isInQueue,
      queueType: data.isInQueue ? 'p2p' : 'none',
      position: data.position,
      waitTime: data.waitTime,
      playersInQueue: data.peersInQueue,
      activeSystem: data.isInQueue ? 'p2p' : currentState.activeSystem
    });
  }

  // Resetar estado
  resetState(): void {
    this.queueStateSubject.next({
      isInQueue: false,
      queueType: 'none',
      activeSystem: 'none'
    });
  }

  // Verificar qual sistema está ativo
  getActiveSystem(): 'centralized' | 'p2p' | 'none' {
    return this.queueStateSubject.value.activeSystem;
  }

  // Verificar se está na fila
  isInQueue(): boolean {
    return this.queueStateSubject.value.isInQueue;
  }

  // Obter posição na fila
  getQueuePosition(): number | undefined {
    return this.queueStateSubject.value.position;
  }

  // Obter número de jogadores na fila
  getPlayersInQueue(): number | undefined {
    return this.queueStateSubject.value.playersInQueue;
  }
}
