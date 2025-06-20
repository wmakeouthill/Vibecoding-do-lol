import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';

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

  constructor() {}

  // Observable para componentes se inscreverem
  get queueState$(): Observable<QueueState> {
    return this.queueStateSubject.asObservable();
  }

  // Getter para o estado atual
  get currentState(): QueueState {
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

    // console.log('🔄 Estado da fila centralizada atualizado:', this.queueStateSubject.value);
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

    // console.log('🔗 Estado da fila P2P atualizado:', this.queueStateSubject.value);
  }

  // Resetar estado quando sair de qualquer fila
  resetQueue(): void {
    this.queueStateSubject.next({
      isInQueue: false,
      queueType: 'none',
      activeSystem: 'none'
    });

    // console.log('🔄 Estado da fila resetado');
  }

  // Verificar se está em alguma fila
  isInAnyQueue(): boolean {
    return this.queueStateSubject.value.isInQueue;
  }

  // Verificar qual sistema está ativo
  getActiveSystem(): 'centralized' | 'p2p' | 'none' {
    return this.queueStateSubject.value.activeSystem;
  }

  // Obter informações específicas de tempo de espera
  getWaitTime(): number {
    return this.queueStateSubject.value.waitTime || 0;
  }

  // Obter posição na fila
  getQueuePosition(): number {
    return this.queueStateSubject.value.position || 0;
  }
}
