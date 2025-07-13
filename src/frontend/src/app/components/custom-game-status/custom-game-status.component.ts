import { Component, Input, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { CustomGameService, CustomGameData, CustomGamePlayer } from '../../services/custom-game.service';
import { ApiService } from '../../services/api';
import { Subscription } from 'rxjs';

@Component({
    selector: 'app-custom-game-status',
    standalone: true,
    imports: [CommonModule],
    template: `
    <div class="custom-game-status" *ngIf="matchId">
      <div class="status-card" [ngClass]="'status-' + (gameData?.status || 'unknown')">
        <div class="status-header">
          <h3>🎮 Partida Customizada</h3>
          <span class="status-badge" [ngClass]="'badge-' + getStatusColor()">
            {{ getStatusText() }}
          </span>
        </div>

        <div class="status-content" *ngIf="gameData">
          <div class="game-info">
            <p><strong>Nome:</strong> {{ gameData.gameName }}</p>
            <p><strong>Match ID:</strong> {{ gameData.matchId }}</p>
            <p><strong>Criado em:</strong> {{ gameData.createdAt | date:'short' }}</p>
            <p *ngIf="gameData.lobbyId"><strong>Lobby ID:</strong> {{ gameData.lobbyId }}</p>
          </div>

          <div class="instructions">
            <h4>📋 Instruções</h4>
            <p>{{ getInstructions() }}</p>
          </div>

          <div class="players-list" *ngIf="gameData.players.length > 0">
            <h4>👥 Jogadores ({{ gameData.players.length }}/10)</h4>
            <div class="players-grid">
              <div 
                *ngFor="let player of gameData.players" 
                class="player-card"
                [ngClass]="{
                  'is-leader': player.isLeader,
                  'is-current': isCurrentPlayer(player.riotId)
                }"
              >
                <div class="player-info">
                  <div class="player-name">{{ player.riotId }}</div>
                  <div class="player-details">
                    <span class="team-index">Posição: {{ player.teamIndex }}</span>
                    <span class="lane">{{ player.assignedLane }}</span>
                    <span *ngIf="player.championId" class="champion">Campeão: {{ player.championId }}</span>
                  </div>
                  <div class="player-badges">
                    <span *ngIf="player.isLeader" class="badge-leader">👑 Líder</span>
                    <span *ngIf="isCurrentPlayer(player.riotId)" class="badge-current">👤 Você</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div class="status-content" *ngIf="!gameData">
          <div class="no-data">
            <p>Nenhuma partida customizada encontrada para este match.</p>
            <button 
              class="btn btn-primary" 
              (click)="startCustomGame()"
              [disabled]="isStarting"
            >
              {{ isStarting ? 'Iniciando...' : '🎮 Iniciar Partida Customizada' }}
            </button>
          </div>
        </div>

        <div class="error-message" *ngIf="errorMessage">
          <p class="text-danger">❌ {{ errorMessage }}</p>
        </div>
      </div>
    </div>
  `,
    styles: [`
    .custom-game-status {
      margin: 20px 0;
    }

    .status-card {
      background: #1a1a1a;
      border-radius: 12px;
      padding: 20px;
      border: 2px solid #333;
      transition: all 0.3s ease;
    }

    .status-card.status-creating {
      border-color: #ffc107;
      background: linear-gradient(135deg, #1a1a1a 0%, #2a2a1a 100%);
    }

    .status-card.status-waiting {
      border-color: #17a2b8;
      background: linear-gradient(135deg, #1a1a1a 0%, #1a2a2a 100%);
    }

    .status-card.status-in_progress {
      border-color: #28a745;
      background: linear-gradient(135deg, #1a1a1a 0%, #1a2a1a 100%);
    }

    .status-card.status-completed {
      border-color: #007bff;
      background: linear-gradient(135deg, #1a1a1a 0%, #1a1a2a 100%);
    }

    .status-card.status-cancelled {
      border-color: #dc3545;
      background: linear-gradient(135deg, #1a1a1a 0%, #2a1a1a 100%);
    }

    .status-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 20px;
      padding-bottom: 15px;
      border-bottom: 1px solid #333;
    }

    .status-header h3 {
      margin: 0;
      color: #fff;
      font-size: 1.5rem;
    }

    .status-badge {
      padding: 6px 12px;
      border-radius: 20px;
      font-size: 0.875rem;
      font-weight: 600;
      text-transform: uppercase;
    }

    .badge-warning {
      background: #ffc107;
      color: #000;
    }

    .badge-info {
      background: #17a2b8;
      color: #fff;
    }

    .badge-success {
      background: #28a745;
      color: #fff;
    }

    .badge-primary {
      background: #007bff;
      color: #fff;
    }

    .badge-danger {
      background: #dc3545;
      color: #fff;
    }

    .badge-secondary {
      background: #6c757d;
      color: #fff;
    }

    .status-content {
      color: #ccc;
    }

    .game-info {
      margin-bottom: 20px;
    }

    .game-info p {
      margin: 8px 0;
      font-size: 0.95rem;
    }

    .game-info strong {
      color: #fff;
    }

    .instructions {
      background: #2a2a2a;
      padding: 15px;
      border-radius: 8px;
      margin-bottom: 20px;
      border-left: 4px solid #007bff;
    }

    .instructions h4 {
      margin: 0 0 10px 0;
      color: #fff;
      font-size: 1.1rem;
    }

    .instructions p {
      margin: 0;
      line-height: 1.5;
    }

    .players-list h4 {
      margin: 0 0 15px 0;
      color: #fff;
      font-size: 1.1rem;
    }

    .players-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
      gap: 15px;
    }

    .player-card {
      background: #2a2a2a;
      border-radius: 8px;
      padding: 15px;
      border: 1px solid #444;
      transition: all 0.3s ease;
    }

    .player-card.is-leader {
      border-color: #ffc107;
      background: linear-gradient(135deg, #2a2a2a 0%, #3a3a2a 100%);
    }

    .player-card.is-current {
      border-color: #007bff;
      background: linear-gradient(135deg, #2a2a2a 0%, #2a2a3a 100%);
    }

    .player-card.is-leader.is-current {
      border-color: #ffc107;
      background: linear-gradient(135deg, #3a3a2a 0%, #3a3a3a 100%);
    }

    .player-name {
      font-weight: 600;
      color: #fff;
      font-size: 1rem;
      margin-bottom: 8px;
    }

    .player-details {
      display: flex;
      flex-direction: column;
      gap: 4px;
      margin-bottom: 10px;
    }

    .player-details span {
      font-size: 0.875rem;
      color: #ccc;
    }

    .team-index {
      color: #17a2b8 !important;
    }

    .lane {
      color: #28a745 !important;
      text-transform: capitalize;
    }

    .champion {
      color: #ffc107 !important;
    }

    .player-badges {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
    }

    .badge-leader, .badge-current {
      padding: 4px 8px;
      border-radius: 12px;
      font-size: 0.75rem;
      font-weight: 600;
    }

    .badge-leader {
      background: #ffc107;
      color: #000;
    }

    .badge-current {
      background: #007bff;
      color: #fff;
    }

    .no-data {
      text-align: center;
      padding: 40px 20px;
    }

    .no-data p {
      margin-bottom: 20px;
      color: #ccc;
      font-size: 1.1rem;
    }

    .btn {
      padding: 12px 24px;
      border: none;
      border-radius: 8px;
      font-size: 1rem;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.3s ease;
      text-decoration: none;
      display: inline-block;
    }

    .btn-primary {
      background: #007bff;
      color: #fff;
    }

    .btn-primary:hover:not(:disabled) {
      background: #0056b3;
      transform: translateY(-2px);
    }

    .btn-primary:disabled {
      background: #6c757d;
      cursor: not-allowed;
      transform: none;
    }

    .error-message {
      margin-top: 15px;
      padding: 15px;
      background: #2a1a1a;
      border-radius: 8px;
      border-left: 4px solid #dc3545;
    }

    .text-danger {
      color: #dc3545;
      margin: 0;
    }

    @media (max-width: 768px) {
      .players-grid {
        grid-template-columns: 1fr;
      }

      .status-header {
        flex-direction: column;
        gap: 10px;
        align-items: flex-start;
      }

      .status-header h3 {
        font-size: 1.3rem;
      }
    }
  `]
})
export class CustomGameStatusComponent implements OnInit, OnDestroy {
    @Input() matchId!: number;

    gameData?: CustomGameData;
    errorMessage: string = '';
    isStarting: boolean = false;
    currentRiotId: string = '';

    private subscription = new Subscription();

    constructor(
        private customGameService: CustomGameService,
        private apiService: ApiService
    ) { }

    ngOnInit(): void {
        if (this.matchId) {
            this.loadCurrentPlayer();
            this.loadCustomGameStatus();
            this.setupEventListeners();
        }
    }

    ngOnDestroy(): void {
        this.subscription.unsubscribe();
    }

    private loadCurrentPlayer(): void {
        // Buscar jogador atual do ApiService
        this.apiService.getCurrentPlayer().subscribe({
            next: (player) => {
                if (player && player.displayName) {
                    this.currentRiotId = player.displayName;
                    console.log('🎮 [CustomGame] Jogador atual:', this.currentRiotId);
                }
            },
            error: (error) => {
                console.error('❌ [CustomGame] Erro ao carregar jogador atual:', error);
            }
        });
    }

    private loadCustomGameStatus(): void {
        this.customGameService.getCustomGameStatus(this.matchId);
    }

    private setupEventListeners(): void {
        this.subscription.add(
            this.customGameService.getCustomGameEvents().subscribe((event) => {
                console.log('🎮 [CustomGame] Evento recebido:', event);

                switch (event.type) {
                    case 'creation_started':
                        this.handleCreationStarted(event.data);
                        break;
                    case 'lobby_created':
                        this.handleLobbyCreated(event.data);
                        break;
                    case 'started':
                        this.handleGameStarted(event.data);
                        break;
                    case 'status':
                        this.handleStatusUpdate(event.data);
                        break;
                    case 'error':
                        this.handleError(event.data);
                        break;
                }
            })
        );
    }

    private handleCreationStarted(data: any): void {
        this.gameData = data.gameData;
        this.errorMessage = '';
        this.isStarting = false;
        console.log('🎮 [CustomGame] Criação iniciada:', this.gameData);
    }

    private handleLobbyCreated(data: any): void {
        if (this.gameData) {
            this.gameData.status = 'waiting';
            this.gameData.lobbyId = data.lobbyId;
        }
        console.log('🎮 [CustomGame] Lobby criado:', data);
    }

    private handleGameStarted(data: any): void {
        if (this.gameData) {
            this.gameData.status = 'in_progress';
        }
        console.log('🎮 [CustomGame] Jogo iniciado:', data);
    }

    private handleStatusUpdate(data: any): void {
        this.gameData = data.gameData;
        console.log('🎮 [CustomGame] Status atualizado:', this.gameData);
    }

    private handleError(data: any): void {
        this.errorMessage = data.error || 'Erro desconhecido na partida customizada';
        this.isStarting = false;
        console.error('❌ [CustomGame] Erro:', this.errorMessage);
    }

    startCustomGame(): void {
        if (!this.matchId) return;

        this.isStarting = true;
        this.errorMessage = '';

        console.log(`🎮 [CustomGame] Iniciando partida customizada para match ${this.matchId}`);

        this.customGameService.startCustomGameCreation(this.matchId);
    }

    getStatusText(): string {
        return this.customGameService.getStatusText(this.gameData?.status || 'unknown');
    }

    getStatusColor(): string {
        return this.customGameService.getStatusColor(this.gameData?.status || 'unknown');
    }

    getInstructions(): string {
        if (!this.gameData) return 'Clique em "Iniciar Partida Customizada" para começar.';
        return this.customGameService.getInstructions(this.gameData, this.currentRiotId);
    }

    isCurrentPlayer(riotId: string): boolean {
        return riotId === this.currentRiotId;
    }
} 