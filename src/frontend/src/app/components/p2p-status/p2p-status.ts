import { Component, OnInit, OnDestroy, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Subscription } from 'rxjs';
import { P2PManager } from '../../services/p2p-manager';
import { DistributedQueueService } from '../../services/distributed-queue';
import { WebsocketService } from '../../services/websocket';
import { QueueStateService, QueueState } from '../../services/queue-state';

@Component({
  selector: 'app-p2p-status',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="p2p-status-container">      <div class="p2p-header">
        <h3>🔗 Rede P2P</h3>
        <div class="status-indicator" [class.connected]="isP2PConnected" [class.waiting]="isP2PInitialized && !isP2PConnected">
          {{ getP2PStatusText() }}
        </div>
      </div>

      <div class="p2p-info">
        <div class="info-row">
          <span class="label">Peer ID:</span>
          <span class="value">{{ localPeerId }}</span>
        </div>

        <div class="info-row">
          <span class="label">Peers Conectados:</span>
          <span class="value">{{ connectedPeers.length }}</span>
        </div>        <div class="info-row">
          <span class="label">Status da Fila:</span>
          <span class="value" [class.in-queue]="globalQueueState.isInQueue">
            {{ getQueueStatusText() }}
          </span>
        </div>

        <div class="info-row" *ngIf="globalQueueState.isInQueue && globalQueueState.queueType">
          <span class="label">Sistema:</span>
          <span class="value">{{ getQueueSystemText() }}</span>
        </div>

        <div class="info-row" *ngIf="globalQueueState.isInQueue && globalQueueState.position">
          <span class="label">Posição na Fila:</span>
          <span class="value">#{{ globalQueueState.position }}</span>
        </div>

        <div class="info-row" *ngIf="globalQueueState.isInQueue && globalQueueState.waitTime">
          <span class="label">Tempo de Espera:</span>
          <span class="value">{{ formatTime(globalQueueState.waitTime) }}</span>
        </div>
      </div>

      <div class="peers-list" *ngIf="connectedPeers.length > 0">
        <h4>Peers Conectados:</h4>
        <div class="peer-item" *ngFor="let peer of connectedPeers">
          <span class="peer-id">{{ extractPeerName(peer) }}</span>
          <span class="peer-status">🟢</span>
        </div>
      </div>

      <div class="queue-stats" *ngIf="queueStats">
        <h4>Estatísticas da Fila:</h4>
        <div class="stats-grid">
          <div class="stat-item">
            <span class="stat-value">{{ queueStats.totalPlayers }}</span>
            <span class="stat-label">Total Jogadores</span>
          </div>
          <div class="stat-item">
            <span class="stat-value">{{ queueStats.averageMMR | number:'1.0-0' }}</span>
            <span class="stat-label">MMR Médio</span>
          </div>
          <div class="stat-item">
            <span class="stat-value">{{ formatTime(queueStats.averageWaitTime) }}</span>
            <span class="stat-label">Tempo Médio</span>
          </div>
        </div>

        <div class="lane-distribution" *ngIf="queueStats.laneDistribution">
          <h5>Distribuição por Lane:</h5>
          <div class="lane-grid">
            <div class="lane-item" *ngFor="let lane of getLaneEntries()">
              <span class="lane-name">{{ lane.name }}</span>
              <span class="lane-count">{{ lane.count }}</span>
            </div>
          </div>
        </div>
      </div>      <div class="queue-actions">
        <button
          class="btn btn-primary"
          *ngIf="!globalQueueState.isInQueue && isP2PConnected"
          (click)="joinQueue()">
          Entrar na Fila P2P
        </button>

        <button
          class="btn btn-danger"
          *ngIf="globalQueueState.isInQueue"
          (click)="leaveQueue()">
          Sair da Fila
        </button>        <button
          class="btn btn-secondary"
          *ngIf="!isP2PInitialized"
          (click)="initializeP2P()">
          Conectar à Rede P2P
        </button>

        <div class="warning-message" *ngIf="isP2PInitialized && connectedPeers.length === 0">
          <p>🔗 P2P inicializado e aguardando outros peers.</p>
          <p>Para testar completamente, abra múltiplas instâncias do aplicativo ou conecte-se a outros usuários.</p>
        </div>

        <div class="info-message" *ngIf="globalQueueState.isInQueue && globalQueueState.queueType === 'centralized'">
          <p>ℹ️ Você está na fila do servidor central.</p>
          <p>Para usar a fila P2P, saia da fila atual primeiro.</p>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .p2p-status-container {
      background: linear-gradient(135deg, #1e3c72 0%, #2a5298 100%);
      border-radius: 12px;
      padding: 20px;
      color: white;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
      margin: 20px 0;
    }

    .p2p-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 20px;
      padding-bottom: 15px;
      border-bottom: 1px solid rgba(255, 255, 255, 0.2);
    }

    .p2p-header h3 {
      margin: 0;
      font-size: 1.4rem;
      font-weight: 600;
    }    .status-indicator {
      background: #dc3545;
      color: white;
      padding: 4px 12px;
      border-radius: 20px;
      font-size: 0.85rem;
      font-weight: 500;
      transition: all 0.3s ease;
    }

    .status-indicator.connected {
      background: #28a745;
    }

    .status-indicator.waiting {
      background: #ffc107;
      color: #212529;
    }

    .p2p-info {
      margin-bottom: 20px;
    }

    .info-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 8px 0;
      border-bottom: 1px solid rgba(255, 255, 255, 0.1);
    }

    .info-row:last-child {
      border-bottom: none;
    }

    .label {
      font-weight: 500;
      opacity: 0.9;
    }

    .value {
      font-weight: 600;
      color: #ffd700;
    }

    .value.in-queue {
      color: #28a745;
    }

    .peers-list {
      margin-bottom: 20px;
    }

    .peers-list h4 {
      margin: 0 0 10px 0;
      font-size: 1.1rem;
      color: #ffd700;
    }

    .peer-item {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 6px 0;
      font-size: 0.9rem;
    }

    .peer-id {
      font-weight: 500;
    }

    .queue-stats {
      margin-bottom: 20px;
    }

    .queue-stats h4 {
      margin: 0 0 15px 0;
      font-size: 1.1rem;
      color: #ffd700;
    }

    .stats-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 15px;
      margin-bottom: 15px;
    }

    .stat-item {
      text-align: center;
      background: rgba(255, 255, 255, 0.1);
      padding: 12px;
      border-radius: 8px;
    }

    .stat-value {
      display: block;
      font-size: 1.5rem;
      font-weight: 700;
      color: #ffd700;
      margin-bottom: 4px;
    }

    .stat-label {
      font-size: 0.8rem;
      opacity: 0.8;
    }

    .lane-distribution h5 {
      margin: 0 0 10px 0;
      font-size: 1rem;
      color: #ffd700;
    }

    .lane-grid {
      display: grid;
      grid-template-columns: repeat(5, 1fr);
      gap: 8px;
    }

    .lane-item {
      text-align: center;
      background: rgba(255, 255, 255, 0.1);
      padding: 8px;
      border-radius: 6px;
      font-size: 0.85rem;
    }

    .lane-name {
      display: block;
      font-weight: 500;
      text-transform: capitalize;
      margin-bottom: 2px;
    }

    .lane-count {
      display: block;
      font-weight: 700;
      color: #ffd700;
    }

    .queue-actions {
      margin-top: 20px;
      padding-top: 15px;
      border-top: 1px solid rgba(255, 255, 255, 0.2);
    }

    .btn {
      width: 100%;
      padding: 12px;
      border: none;
      border-radius: 8px;
      font-weight: 600;
      font-size: 1rem;
      cursor: pointer;
      transition: all 0.3s ease;
      margin-bottom: 10px;
    }

    .btn:last-child {
      margin-bottom: 0;
    }

    .btn-primary {
      background: #28a745;
      color: white;
    }

    .btn-primary:hover {
      background: #218838;
      transform: translateY(-2px);
    }

    .btn-danger {
      background: #dc3545;
      color: white;
    }

    .btn-danger:hover {
      background: #c82333;
      transform: translateY(-2px);
    }

    .btn-secondary {
      background: #6c757d;
      color: white;
    }    .btn-secondary:hover {
      background: #545b62;
      transform: translateY(-2px);
    }    .warning-message {
      background: rgba(255, 193, 7, 0.2);
      border: 1px solid #ffc107;
      border-radius: 8px;
      padding: 15px;
      margin-top: 15px;
      text-align: center;
    }

    .warning-message p {
      margin: 5px 0;
      font-size: 0.9rem;
    }

    .warning-message p:first-child {
      font-weight: 600;
      color: #ffc107;
    }

    .info-message {
      background: rgba(23, 162, 184, 0.2);
      border: 1px solid #17a2b8;
      border-radius: 8px;
      padding: 15px;
      margin-top: 15px;
      text-align: center;
    }

    .info-message p {
      margin: 5px 0;
      font-size: 0.9rem;
    }

    .info-message p:first-child {
      font-weight: 600;
      color: #17a2b8;
    }

    @media (max-width: 768px) {
      .stats-grid {
        grid-template-columns: repeat(2, 1fr);
      }

      .lane-grid {
        grid-template-columns: repeat(3, 1fr);
      }
    }
  `]
})
export class P2PStatusComponent implements OnInit, OnDestroy {
  isP2PConnected = false;
  isP2PInitialized = false;
  localPeerId = '';
  connectedPeers: string[] = [];
  isInQueue = false;
  queuePosition = 0;
  waitTime = 0;
  queueStats: any = null;
  globalQueueState: QueueState = {
    isInQueue: false,
    queueType: 'none',
    activeSystem: 'none'
  };

  private subscriptions: Subscription[] = [];
  // Injeção de dependências usando inject()
  private p2pManager = inject(P2PManager);
  private distributedQueue = inject(DistributedQueueService);
  private websocketService = inject(WebsocketService);
  private queueStateService = inject(QueueStateService);

  ngOnInit(): void {
    this.setupSubscriptions();
    this.updateStatus();
  }

  ngOnDestroy(): void {
    this.subscriptions.forEach(sub => sub.unsubscribe());
  }
  private setupSubscriptions(): void {
    // Estado global da fila (centralizada + P2P)
    this.subscriptions.push(
      this.queueStateService.queueState$.subscribe((state: QueueState) => {
        this.globalQueueState = state;
        // console.log('🔄 Estado global da fila atualizado no P2P:', state);
      })
    );    // Estado dos peers conectados
    this.subscriptions.push(
      this.p2pManager.connectedPeers$.subscribe((peers: string[]) => {
        this.connectedPeers = peers;
        // Só considerar conectado se há peers reais com data channels ativos
        this.isP2PConnected = this.p2pManager.isConnected() && peers.length > 0;
        // Considerar inicializado se há peer ID, mesmo sem peers conectados
        this.isP2PInitialized = !!this.p2pManager.getLocalPeerId();
      })
    );

    // Estado da fila distribuída
    this.subscriptions.push(
      this.distributedQueue.queueStats$.subscribe((stats: any) => {
        this.queueStats = stats;
      })
    );    // P2P pronto
    this.subscriptions.push(
      this.p2pManager.p2pReady$.subscribe(() => {
        // P2P está inicializado, mas só marca como conectado se há peers reais
        this.isP2PInitialized = true;
        console.log('🔗 P2P sistema pronto, aguardando peers...');
      })
    );

    // Atualizar status a cada segundo
    setInterval(() => {
      this.updateStatus();
    }, 1000);
  }
  private updateStatus(): void {
    this.localPeerId = this.p2pManager.getLocalPeerId();
    this.isP2PInitialized = !!this.localPeerId;
    this.isInQueue = this.distributedQueue.isPlayerInQueue();
    this.queuePosition = this.distributedQueue.getQueuePosition();
    this.waitTime = this.distributedQueue.getWaitTime();
  }

  async initializeP2P(): Promise<void> {
    try {
      // Simular dados do jogador - em implementação real viria do PlayerService
      const playerData = {
        summonerName: 'TestPlayer',
        region: 'BR1',
        mmr: 1000
      };

      await this.p2pManager.initialize(playerData);
      console.log('✅ P2P inicializado via componente');
    } catch (error) {
      console.error('❌ Erro ao inicializar P2P:', error);
    }
  }
  joinQueue(): void {
    const preferences = {
      primaryLane: 'mid',
      secondaryLane: 'bot',
      autoAccept: true
    };

    this.distributedQueue.joinQueue(preferences);
    // Atualizar estado compartilhado para fila P2P
    this.queueStateService.updateP2PQueue({
      isInQueue: true
    });
  }

  leaveQueue(): void {
    this.distributedQueue.leaveQueue();
    // Resetar estado se saindo da fila P2P
    if (this.globalQueueState.queueType === 'p2p') {
      this.queueStateService.resetQueue();
    }
  }

  getP2PStatusText(): string {
    if (this.isP2PConnected) {
      return 'Conectado';
    } else if (this.isP2PInitialized) {
      return 'Aguardando peers';
    } else {
      return 'Desconectado';
    }
  }

  getQueueStatusText(): string {
    if (!this.globalQueueState.isInQueue) {
      return 'Fora da fila';
    }

    switch (this.globalQueueState.queueType) {
      case 'centralized':
        return 'Na fila (Central)';
      case 'p2p':
        return 'Na fila (P2P)';
      default:
        return 'Na fila';
    }
  }

  getQueueSystemText(): string {
    switch (this.globalQueueState.queueType) {
      case 'centralized':
        return '🌐 Servidor Central';
      case 'p2p':
        return '🔗 Rede P2P';
      default:
        return '❓ Desconhecido';
    }
  }

  extractPeerName(peerId: string): string {
    const parts = peerId.split('_');
    return parts[0] || 'Unknown';
  }

  formatTime(seconds: number): string {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }

  getLaneEntries(): { name: string; count: number }[] {
    if (!this.queueStats?.laneDistribution) return [];

    return Object.entries(this.queueStats.laneDistribution)
      .map(([name, count]) => ({ name, count: count as number }));
  }
}
