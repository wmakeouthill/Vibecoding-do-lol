import { Injectable, inject } from '@angular/core';
import { BehaviorSubject, Observable, Subject } from 'rxjs';
import { P2PManager } from './p2p-manager';
import { QueueStateService } from './queue-state';

interface DistributedQueuePlayer {
  peerId: string;
  summonerName: string;
  region: string;
  mmr: number;
  preferences: {
    primaryLane: string;
    secondaryLane: string;
    autoAccept?: boolean;
  };
  joinTime: Date;
  isLocal: boolean; // Se é o jogador local ou remoto
}

interface MatchProposal {
  id: string;
  proposerId: string;
  team1: DistributedQueuePlayer[];
  team2: DistributedQueuePlayer[];
  timestamp: Date;
  votes: Map<string, boolean>; // peerId -> voto (true = aceita, false = rejeita)
  status: 'pending' | 'approved' | 'rejected';
}

interface QueueStats {
  totalPlayers: number;
  averageMMR: number;
  averageWaitTime: number;
  laneDistribution: { [lane: string]: number };
}

@Injectable({
  providedIn: 'root'
})
export class DistributedQueueService {
  private localQueue: DistributedQueuePlayer[] = [];
  private networkQueue: Map<string, DistributedQueuePlayer> = new Map();
  private activeProposals: Map<string, MatchProposal> = new Map();
  private isInQueue = false;
  private queueJoinTime?: Date;

  // Subjects para comunicação reativa
  private queueStateSubject = new BehaviorSubject<DistributedQueuePlayer[]>([]);
  private queueStatsSubject = new BehaviorSubject<QueueStats>({
    totalPlayers: 0,
    averageMMR: 0,
    averageWaitTime: 0,
    laneDistribution: {}
  });
  private matchProposalSubject = new Subject<MatchProposal>();
  private matchFoundSubject = new Subject<MatchProposal>();

  // Observables públicos
  public queueState$ = this.queueStateSubject.asObservable();
  public queueStats$ = this.queueStatsSubject.asObservable();
  public matchProposal$ = this.matchProposalSubject.asObservable();
  public matchFound$ = this.matchFoundSubject.asObservable();
  constructor(private p2pManager: P2PManager) {
    this.setupP2PListeners();
  }

  private queueStateService = inject(QueueStateService);

  private setupP2PListeners(): void {
    // Escutar atualizações da fila via P2P
    this.p2pManager.queueUpdate$.subscribe((update) => {
      this.handleQueueUpdate(update);
    });

    // Escutar propostas de match
    this.p2pManager.matchProposal$.subscribe((proposal) => {
      this.handleMatchProposal(proposal);
    });

    // Escutar quando peers se conectam/desconectam
    this.p2pManager.peerConnected$.subscribe((peerId) => {
      console.log(`🔗 Peer conectado: ${peerId}`);
      this.requestQueueSync(peerId);
    });

    this.p2pManager.peerDisconnected$.subscribe((peerId) => {
      console.log(`🔌 Peer desconectado: ${peerId}`);
      this.removePeerFromQueue(peerId);
    });
  }  // Entrar na fila distribuída
  joinQueue(preferences: { primaryLane: string; secondaryLane: string; autoAccept?: boolean }): void {
    if (this.isInQueue) {
      console.warn('⚠️ Já está na fila');
      return;
    }

    // Verificar se há peers conectados
    if (this.p2pManager.getPeerCount() === 0) {
      console.warn('⚠️ Nenhum peer conectado. Entrando na fila local apenas.');
    }

    console.log('🎮 Entrando na fila distribuída...');

    // Criar entrada local
    const localPlayer: DistributedQueuePlayer = {
      peerId: this.p2pManager.getLocalPeerId(),
      summonerName: this.extractSummonerName(this.p2pManager.getLocalPeerId()),
      region: 'BR1', // Buscar região real
      mmr: 1000, // Buscar MMR real
      preferences,
      joinTime: new Date(),
      isLocal: true
    };

    this.localQueue.push(localPlayer);
    this.networkQueue.set(localPlayer.peerId, localPlayer);
    this.isInQueue = true;
    this.queueJoinTime = new Date();    // Atualizar estado global da fila
    this.queueStateService.updateP2PQueue({
      isInQueue: true,
      position: this.getQueuePosition(),
      peersInQueue: this.networkQueue.size
    });

    // Só notificar a rede P2P se houver peers conectados
    if (this.p2pManager.getPeerCount() > 0) {
      this.p2pManager.joinDistributedQueue(preferences);
    }

    // Atualizar estado
    this.updateQueueState();

    // Só iniciar matchmaking se houver chance de encontrar outros jogadores
    if (this.p2pManager.getPeerCount() > 0) {
      this.startMatchmakingProcess();
    }

    console.log(`✅ Entrou na fila como ${preferences.primaryLane} (${this.p2pManager.getPeerCount()} peers conectados)`);
  }
  // Sair da fila distribuída
  leaveQueue(): void {
    if (!this.isInQueue) {
      console.warn('⚠️ Não está na fila');
      return;
    }

    console.log('👋 Saindo da fila distribuída...');

    // Remover da fila local
    const localPeerId = this.p2pManager.getLocalPeerId();
    this.localQueue = this.localQueue.filter(p => p.peerId !== localPeerId);
    this.networkQueue.delete(localPeerId);
    this.isInQueue = false;
    this.queueJoinTime = undefined;

    // Atualizar estado global da fila
    this.queueStateService.updateP2PQueue({
      isInQueue: false
    });

    // Notificar a rede P2P
    this.p2pManager.leaveDistributedQueue();

    // Atualizar estado
    this.updateQueueState();

    console.log('✅ Saiu da fila');
  }

  private handleQueueUpdate(update: any): void {
    const { action, peerId, data } = update;

    switch (action) {
      case 'join':
        this.addPeerToQueue(peerId, data);
        break;
      case 'leave':
        this.removePeerFromQueue(peerId);
        break;
    }

    this.updateQueueState();
  }

  private addPeerToQueue(peerId: string, data: any): void {
    if (this.networkQueue.has(peerId)) {
      console.log(`⚠️ Peer ${peerId} já está na fila`);
      return;
    }

    const player: DistributedQueuePlayer = {
      peerId,
      summonerName: data.playerInfo?.summonerName || this.extractSummonerName(peerId),
      region: data.playerInfo?.region || 'BR1',
      mmr: data.playerInfo?.mmr || 1000,
      preferences: data.preferences,
      joinTime: new Date(),
      isLocal: false
    };

    this.networkQueue.set(peerId, player);
    console.log(`👥 ${player.summonerName} entrou na fila distribuída`);
  }

  private removePeerFromQueue(peerId: string): void {
    const player = this.networkQueue.get(peerId);
    if (player) {
      this.networkQueue.delete(peerId);
      console.log(`👋 ${player.summonerName} saiu da fila distribuída`);
    }
  }

  private requestQueueSync(peerId: string): void {
    // Solicitar sincronização da fila para peer recém-conectado
    if (this.isInQueue) {
      // Reenviar nossa entrada na fila
      setTimeout(() => {
        const localPlayer = this.localQueue[0];
        if (localPlayer) {
          this.p2pManager.sendToPeer(peerId, {
            type: 'queue_join',
            data: {
              preferences: localPlayer.preferences,
              playerInfo: {
                peerId: localPlayer.peerId,
                summonerName: localPlayer.summonerName,
                mmr: localPlayer.mmr,
                region: localPlayer.region
              }
            }
          });
        }
      }, 1000);
    }
  }

  private startMatchmakingProcess(): void {
    // Iniciar processo de matchmaking distribuído
    const checkInterval = setInterval(() => {
      if (!this.isInQueue) {
        clearInterval(checkInterval);
        return;
      }

      this.attemptMatchmaking();
    }, 10000); // Verificar a cada 10 segundos
  }

  private attemptMatchmaking(): void {
    const allPlayers = Array.from(this.networkQueue.values());

    if (allPlayers.length < 10) {
      console.log(`📊 Aguardando mais jogadores: ${allPlayers.length}/10`);
      return;
    }

    // Apenas o peer "líder" propõe matches (evitar propostas duplicadas)
    if (!this.shouldProposeMatch(allPlayers)) {
      return;
    }

    console.log('🎯 Tentando criar match com 10 jogadores...');

    const matchResult = this.findBestMatch(allPlayers);
    if (matchResult) {
      this.proposeMatch(matchResult.team1, matchResult.team2);
    }
  }

  private shouldProposeMatch(players: DistributedQueuePlayer[]): boolean {
    // Eleger "líder" baseado no peer com menor ID lexicográfico
    const sortedPeerIds = players.map(p => p.peerId).sort();
    const leaderId = sortedPeerIds[0];

    return leaderId === this.p2pManager.getLocalPeerId();
  }

  private findBestMatch(players: DistributedQueuePlayer[]): { team1: DistributedQueuePlayer[], team2: DistributedQueuePlayer[] } | null {
    if (players.length < 10) return null;

    // Pegar os 10 primeiros jogadores por tempo de entrada
    const candidatePlayers = players
      .sort((a, b) => a.joinTime.getTime() - b.joinTime.getTime())
      .slice(0, 10);

    return this.balanceTeams(candidatePlayers);
  }

  private balanceTeams(players: DistributedQueuePlayer[]): { team1: DistributedQueuePlayer[], team2: DistributedQueuePlayer[] } | null {
    // Algoritmo simples de balanceamento por MMR
    const sortedByMMR = [...players].sort((a, b) => b.mmr - a.mmr);

    const team1: DistributedQueuePlayer[] = [];
    const team2: DistributedQueuePlayer[] = [];

    // Distribuir alternadamente para balancear MMR
    for (let i = 0; i < sortedByMMR.length; i++) {
      if (i % 2 === 0) {
        team1.push(sortedByMMR[i]);
      } else {
        team2.push(sortedByMMR[i]);
      }
    }

    // Verificar se o balanceamento está aceitável
    const team1AvgMMR = team1.reduce((sum, p) => sum + p.mmr, 0) / team1.length;
    const team2AvgMMR = team2.reduce((sum, p) => sum + p.mmr, 0) / team2.length;
    const mmrDifference = Math.abs(team1AvgMMR - team2AvgMMR);

    const maxAllowedDifference = 200; // MMR máximo de diferença
    if (mmrDifference > maxAllowedDifference) {
      console.log(`⚠️ Diferença de MMR muito alta: ${mmrDifference}`);
      return null;
    }

    return { team1, team2 };
  }

  private proposeMatch(team1: DistributedQueuePlayer[], team2: DistributedQueuePlayer[]): void {
    const proposalId = this.generateProposalId();

    const proposal: MatchProposal = {
      id: proposalId,
      proposerId: this.p2pManager.getLocalPeerId(),
      team1,
      team2,
      timestamp: new Date(),
      votes: new Map(),
      status: 'pending'
    };

    this.activeProposals.set(proposalId, proposal);    // Enviar proposta para a rede
    this.p2pManager.proposeMatch([
      {
        proposalId,
        team1: team1.map(p => ({ peerId: p.peerId, summonerName: p.summonerName, mmr: p.mmr })),
        team2: team2.map(p => ({ peerId: p.peerId, summonerName: p.summonerName, mmr: p.mmr })),
        timestamp: proposal.timestamp.toISOString()
      }
    ]);

    // Auto-votar (proposer automaticamente aprova)
    this.voteOnMatch(proposalId, true);

    console.log(`🗳️ Proposta de match enviada: ${proposalId}`);
  }

  private handleMatchProposal(proposalData: any): void {
    const { proposerId, proposal } = proposalData;

    console.log(`📥 Proposta de match recebida de ${proposerId}`);

    // Verificar se a proposta inclui o jogador local
    const localPeerId = this.p2pManager.getLocalPeerId();
    const allPlayers = [...proposal.team1, ...proposal.team2];
    const includesLocalPlayer = allPlayers.some((p: any) => p.peerId === localPeerId);

    if (includesLocalPlayer) {
      this.matchProposalSubject.next({
        id: proposal.proposalId,
        proposerId,
        team1: proposal.team1,
        team2: proposal.team2,
        timestamp: new Date(proposal.timestamp),
        votes: new Map(),
        status: 'pending'
      });

      // Auto-aceitar por enquanto (em implementação real, seria UI)
      setTimeout(() => {
        this.voteOnMatch(proposal.proposalId, true);
      }, 2000);
    }
  }

  voteOnMatch(proposalId: string, accept: boolean): void {
    console.log(`🗳️ Votando ${accept ? 'SIM' : 'NÃO'} na proposta ${proposalId}`);

    // Enviar voto via P2P
    this.p2pManager.broadcastToNetwork({
      type: 'match_vote',
      data: {
        proposalId,
        vote: accept,
        voterId: this.p2pManager.getLocalPeerId()
      }
    });
  }

  private updateQueueState(): void {
    const allPlayers = Array.from(this.networkQueue.values());
    this.queueStateSubject.next(allPlayers);

    // Calcular estatísticas
    const stats: QueueStats = {
      totalPlayers: allPlayers.length,
      averageMMR: allPlayers.length > 0 ?
        allPlayers.reduce((sum, p) => sum + p.mmr, 0) / allPlayers.length : 0,
      averageWaitTime: this.calculateAverageWaitTime(allPlayers),
      laneDistribution: this.calculateLaneDistribution(allPlayers)
    };

    this.queueStatsSubject.next(stats);
  }

  private calculateAverageWaitTime(players: DistributedQueuePlayer[]): number {
    if (players.length === 0) return 0;

    const now = new Date();
    const totalWaitTime = players.reduce((sum, player) => {
      return sum + (now.getTime() - player.joinTime.getTime());
    }, 0);

    return totalWaitTime / players.length / 1000; // em segundos
  }

  private calculateLaneDistribution(players: DistributedQueuePlayer[]): { [lane: string]: number } {
    const distribution: { [lane: string]: number } = {
      top: 0,
      jungle: 0,
      mid: 0,
      bot: 0,
      support: 0
    };

    players.forEach(player => {
      const lane = player.preferences.primaryLane.toLowerCase();
      if (distribution.hasOwnProperty(lane)) {
        distribution[lane]++;
      }
    });

    return distribution;
  }

  private extractSummonerName(peerId: string): string {
    return peerId.split('_')[0] || 'Unknown';
  }

  private generateProposalId(): string {
    return `match_${Date.now()}_${Math.random().toString(36).substring(7)}`;
  }

  // Getters públicos
  isPlayerInQueue(): boolean {
    return this.isInQueue;
  }

  getQueuePosition(): number {
    if (!this.isInQueue) return -1;

    const localPeerId = this.p2pManager.getLocalPeerId();
    const allPlayers = Array.from(this.networkQueue.values())
      .sort((a, b) => a.joinTime.getTime() - b.joinTime.getTime());

    return allPlayers.findIndex(p => p.peerId === localPeerId) + 1;
  }

  getWaitTime(): number {
    if (!this.queueJoinTime) return 0;
    return (Date.now() - this.queueJoinTime.getTime()) / 1000;
  }

  // Cleanup
  destroy(): void {
    console.log('🧹 Destruindo Distributed Queue Service...');

    if (this.isInQueue) {
      this.leaveQueue();
    }

    this.localQueue = [];
    this.networkQueue.clear();
    this.activeProposals.clear();

    console.log('✅ Distributed Queue Service destruído');
  }
}
