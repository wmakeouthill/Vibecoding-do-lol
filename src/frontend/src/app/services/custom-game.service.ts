import { Injectable } from '@angular/core';
import { ApiService } from './api';
import { Observable, Subject } from 'rxjs';

export interface CustomGamePlayer {
    summonerName: string;
    tagLine: string;
    riotId: string;
    teamIndex: number;
    assignedLane: string;
    championId?: number;
    isLeader: boolean;
}

export interface CustomGameData {
    matchId: number;
    gameName: string;
    players: CustomGamePlayer[];
    status: 'creating' | 'waiting' | 'in_progress' | 'completed' | 'cancelled';
    createdAt: Date;
    gameId?: string;
    lobbyId?: string;
}

@Injectable({
    providedIn: 'root'
})
export class CustomGameService {
    private customGameEvents = new Subject<any>();

    constructor(private apiService: ApiService) {
        this.setupWebSocketListeners();
    }

    private setupWebSocketListeners(): void {
        // Listener para início de criação de partida customizada
        this.apiService.onWebSocketMessage().subscribe((message: any) => {
            if (message.type === 'custom_game_creation_started') {
                console.log('🎮 [CustomGame] Criação de partida customizada iniciada:', message);
                this.customGameEvents.next({
                    type: 'creation_started',
                    data: message.data
                });
            } else if (message.type === 'custom_game_lobby_created') {
                console.log('🎮 [CustomGame] Lobby de partida customizada criado:', message);
                this.customGameEvents.next({
                    type: 'lobby_created',
                    data: message.data
                });
            } else if (message.type === 'custom_game_error') {
                console.error('❌ [CustomGame] Erro na partida customizada:', message);
                this.customGameEvents.next({
                    type: 'error',
                    data: message.data
                });
            } else if (message.type === 'custom_game_started') {
                console.log('🎮 [CustomGame] Partida customizada iniciada:', message);
                this.customGameEvents.next({
                    type: 'started',
                    data: message.data
                });
            } else if (message.type === 'custom_game_status') {
                console.log('🎮 [CustomGame] Status da partida customizada:', message);
                this.customGameEvents.next({
                    type: 'status',
                    data: message.data
                });
            }
        });
    }

    // ✅ Iniciar criação de partida customizada
    startCustomGameCreation(matchId: number): void {
        console.log(`🎮 [CustomGame] Solicitando criação de partida customizada para match ${matchId}`);

        this.apiService.sendWebSocketMessage({
            type: 'start_custom_game',
            matchId: matchId
        });
    }

    // ✅ Buscar status da partida customizada
    getCustomGameStatus(matchId: number): void {
        console.log(`🎮 [CustomGame] Solicitando status da partida customizada ${matchId}`);

        this.apiService.sendWebSocketMessage({
            type: 'get_custom_game_status',
            matchId: matchId
        });
    }

    // ✅ Observable para eventos da partida customizada
    getCustomGameEvents(): Observable<any> {
        return this.customGameEvents.asObservable();
    }

    // ✅ Métodos HTTP para backup
    async startCustomGameCreationHTTP(matchId: number): Promise<any> {
        try {
            const response = await fetch(`/api/custom-game/start/${matchId}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                }
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            return await response.json();
        } catch (error) {
            console.error('❌ [CustomGame] Erro HTTP ao iniciar partida customizada:', error);
            throw error;
        }
    }

    async getCustomGameStatusHTTP(matchId: number): Promise<any> {
        try {
            const response = await fetch(`/api/custom-game/status/${matchId}`, {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json'
                }
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            return await response.json();
        } catch (error) {
            console.error('❌ [CustomGame] Erro HTTP ao buscar status da partida customizada:', error);
            throw error;
        }
    }

    async getActiveCustomGamesHTTP(): Promise<any> {
        try {
            const response = await fetch('/api/custom-game/active', {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json'
                }
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            return await response.json();
        } catch (error) {
            console.error('❌ [CustomGame] Erro HTTP ao buscar partidas customizadas ativas:', error);
            throw error;
        }
    }

    // ✅ Utilitários
    getStatusText(status: string): string {
        switch (status) {
            case 'creating':
                return 'Criando partida...';
            case 'waiting':
                return 'Aguardando jogadores...';
            case 'in_progress':
                return 'Em andamento';
            case 'completed':
                return 'Concluída';
            case 'cancelled':
                return 'Cancelada';
            default:
                return 'Desconhecido';
        }
    }

    getStatusColor(status: string): string {
        switch (status) {
            case 'creating':
                return 'warning';
            case 'waiting':
                return 'info';
            case 'in_progress':
                return 'success';
            case 'completed':
                return 'primary';
            case 'cancelled':
                return 'danger';
            default:
                return 'secondary';
        }
    }

    // ✅ Verificar se o jogador atual é o líder
    isCurrentPlayerLeader(gameData: CustomGameData, currentRiotId: string): boolean {
        const leader = gameData.players.find(p => p.isLeader);
        return leader?.riotId === currentRiotId;
    }

    // ✅ Obter jogador atual da partida
    getCurrentPlayer(gameData: CustomGameData, currentRiotId: string): CustomGamePlayer | undefined {
        return gameData.players.find(p => p.riotId === currentRiotId);
    }

    // ✅ Obter instruções baseadas no status
    getInstructions(gameData: CustomGameData, currentRiotId: string): string {
        const isLeader = this.isCurrentPlayerLeader(gameData, currentRiotId);
        const currentPlayer = this.getCurrentPlayer(gameData, currentRiotId);

        switch (gameData.status) {
            case 'creating':
                if (isLeader) {
                    return 'Você é o líder! Crie a partida customizada "PERSON DOS CRIA ORDEM INHOUSE" no League of Legends.';
                } else {
                    return 'Aguardando o líder criar a partida customizada...';
                }
            case 'waiting':
                if (isLeader) {
                    return 'Partida criada! Aguardando outros jogadores entrarem no lobby.';
                } else {
                    return 'Entre no lobby da partida customizada criada pelo líder.';
                }
            case 'in_progress':
                if (currentPlayer?.championId) {
                    return `Sua vez de escolher! Selecione o campeão ${currentPlayer.championId} (escolhido no draft).`;
                } else {
                    return 'Partida em andamento! Aguarde sua vez de escolher o campeão.';
                }
            case 'completed':
                return 'Partida concluída!';
            case 'cancelled':
                return 'Partida cancelada.';
            default:
                return 'Status desconhecido.';
        }
    }
} 