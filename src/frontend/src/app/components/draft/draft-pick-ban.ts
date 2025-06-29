import { Component, Input, Output, EventEmitter, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ChampionService, Champion } from '../../services/champion.service';
import { DraftChampionModalComponent } from './draft-champion-modal';
import { DraftConfirmationModalComponent } from './draft-confirmation-modal';

interface PickBanPhase {
    team: 'blue' | 'red';
    action: 'ban' | 'pick';
    champion?: Champion;
    playerId?: string;
    playerName?: string;
    locked: boolean;
    timeRemaining: number;
}

interface CustomPickBanSession {
    id: string;
    phase: 'bans' | 'picks' | 'completed';
    currentAction: number;
    extendedTime: number;
    phases: PickBanPhase[];
    blueTeam: any[];
    redTeam: any[];
    currentPlayerIndex: number;
}

@Component({
    selector: 'app-draft-pick-ban',
    imports: [CommonModule, FormsModule, DraftChampionModalComponent, DraftConfirmationModalComponent],
    templateUrl: './draft-pick-ban.html',
    styleUrl: './draft-pick-ban.scss'
})
export class DraftPickBanComponent implements OnInit, OnDestroy {
    @Input() matchData: any = null;
    @Input() isLeader: boolean = false;
    @Input() currentPlayer: any = null;
    @Output() onPickBanComplete = new EventEmitter<any>();
    @Output() onPickBanCancel = new EventEmitter<void>();
    @Output() onOpenChampionModal = new EventEmitter<void>();
    @Output() onOpenConfirmationModal = new EventEmitter<void>();

    session: CustomPickBanSession | null = null;
    champions: Champion[] = [];
    championsByRole: any = {};
    timeRemaining: number = 30;
    isMyTurn: boolean = false;

    // Controle de modais
    showChampionModal: boolean = false;
    showConfirmationModal: boolean = false;

    // PROPRIEDADES PARA CACHE E PERFORMANCE
    private _cachedSortedBlueTeam: any[] | null = null;
    private _cachedSortedRedTeam: any[] | null = null;
    private _cachedBannedChampions: Champion[] | null = null;
    private _cachedBlueTeamPicks: Champion[] | null = null;
    private _cachedRedTeamPicks: Champion[] | null = null;
    private _lastCacheUpdate: number = 0;
    private readonly CACHE_DURATION = 5000; // Aumentado para 5 segundos

    // SISTEMA DE CACHE INTELIGENTE
    private _sessionStateHash: string = '';
    private _currentActionHash: string = '';
    private _phaseHash: string = '';
    private _lastStateUpdate: number = 0;
    private _cacheInvalidationNeeded: boolean = false;
    private _lastActionHash: string = ''; // Hash da última ação realizada

    private timer: any = null;
    private botPickTimer: any = null;

    constructor(private championService: ChampionService) { }

    /**
     * Verifica se um jogador é bot
     */
    private isBot(player: any): boolean {
        if (!player) return false;

        const name = player.summonerName || player.name || '';
        const id = player.id;

        console.log(`🤖 [isBot] Verificando jogador: ${name} (ID: ${id})`);

        if (id < 0) {
            console.log(`🤖 [isBot] ID negativo detectado: ${id}`);
            return true;
        }

        if (typeof id === 'string') {
            const numericId = parseInt(id);
            if (!isNaN(numericId) && numericId < 0) {
                console.log(`🤖 [isBot] ID string negativo detectado: ${numericId}`);
                return true;
            }

            if (id.toLowerCase().includes('bot') || id.startsWith('-')) {
                console.log(`🤖 [isBot] ID contém 'bot' ou começa com '-': ${id}`);
                return true;
            }
        }

        const botPatterns = [
            /^bot\d+$/i,
            /^bot\s*\d+$/i,
            /^ai\s*bot$/i,
            /^computer\s*\d*$/i,
            /^bot\s*player$/i,
            /^ai\s*player$/i,
            /^bot$/i,
            /^ai$/i,
            /^popcornseller$/i,
            /^bot\s*[a-z]*$/i,
            /^ai\s*[a-z]*$/i,
            /^bot\s*\d+\s*[a-z]*$/i,
            /^ai\s*\d+\s*[a-z]*$/i,
            /^bot\d+[a-z]*$/i,
            /^ai\d+[a-z]*$/i
        ];

        for (const pattern of botPatterns) {
            if (pattern.test(name)) {
                console.log(`🤖 [isBot] Padrão de bot detectado: ${pattern.source}`);
                return true;
            }
        }

        if (name.toLowerCase().includes('bot')) {
            console.log(`🤖 [isBot] Nome contém 'bot': ${name}`);
            return true;
        }

        if (name.toLowerCase().includes('ai')) {
            console.log(`🤖 [isBot] Nome contém 'ai': ${name}`);
            return true;
        }

        if (/\d/.test(name) && (name.toLowerCase().includes('bot') || name.toLowerCase().includes('ai'))) {
            console.log(`🤖 [isBot] Nome com número e bot/ai: ${name}`);
            return true;
        }

        console.log(`🤖 [isBot] Jogador não é bot: ${name}`);
        return false;
    }

    /**
     * Método auxiliar para comparar jogadores de forma consistente
     */
    private comparePlayers(player1: any, player2: any): boolean {
        if (!player1 || !player2) return false;

        const id1 = player1.id?.toString();
        const name1 = player1.summonerName || player1.name || '';
        const id2 = player2.id?.toString();
        const name2 = player2.summonerName || player2.name || '';

        if (id1 && id2 && id1 === id2) {
            return true;
        }

        if (name1 && name2 && name1 === name2) {
            return true;
        }

        if (name1 && name2 && name1.includes('#')) {
            const gameName1 = name1.split('#')[0];
            if (name2.includes('#')) {
                const gameName2 = name2.split('#')[0];
                if (gameName1 === gameName2) {
                    return true;
                }
            } else if (gameName1 === name2) {
                return true;
            }
        }

        if (name1 && name2 && name1.startsWith(name2 + '#')) {
            return true;
        }

        return false;
    }

    /**
     * Compara um jogador com um ID específico
     */
    private comparePlayerWithId(player: any, targetId: string): boolean {
        if (!player || !targetId) return false;

        const playerId = player.id?.toString();
        const playerName = player.summonerName || player.name || '';

        if (playerId === targetId) {
            return true;
        }

        if (playerName === targetId) {
            return true;
        }

        if (playerName.includes('#')) {
            const gameName = playerName.split('#')[0];
            if (gameName === targetId) {
                return true;
            }
        }

        return false;
    }

    ngOnInit() {
        this.loadChampions();
        this.initializePickBanSession();
    }

    ngOnDestroy() {
        if (this.timer) {
            clearInterval(this.timer);
        }
        if (this.botPickTimer) {
            clearTimeout(this.botPickTimer);
        }
    }

    private async loadChampions() {
        try {
            this.champions = await this.championService.getAllChampions();
            this.organizeChampionsByRole();
        } catch (error) {
            console.error('Erro ao carregar campeões:', error);
        }
    }

    private organizeChampionsByRole() {
        this.championsByRole = {
            top: this.champions.filter(c => c.tags?.includes('Fighter') || c.tags?.includes('Tank')),
            jungle: this.champions.filter(c => c.tags?.includes('Fighter') || c.tags?.includes('Assassin')),
            mid: this.champions.filter(c => c.tags?.includes('Mage') || c.tags?.includes('Assassin')),
            adc: this.champions.filter(c => c.tags?.includes('Marksman')),
            support: this.champions.filter(c => c.tags?.includes('Support'))
        };
    }

    initializePickBanSession() {
        console.log('🚀 [DraftPickBan] initializePickBanSession iniciado');
        console.log('📊 [DraftPickBan] matchData:', this.matchData);
        console.log('👤 [DraftPickBan] currentPlayer:', this.currentPlayer);

        if (!this.matchData) {
            console.error('❌ [DraftPickBan] matchData não está disponível');
            return;
        }

        // Verificar se temos os times necessários
        if (!this.matchData.team1 && !this.matchData.blueTeam && !this.matchData.team2 && !this.matchData.redTeam) {
            console.error('❌ [DraftPickBan] Dados dos times não estão disponíveis no matchData');
            console.log('📊 [DraftPickBan] Propriedades disponíveis:', Object.keys(this.matchData));
            return;
        }

        const processTeamData = (teamData: any[]): any[] => {
            console.log('🔄 [DraftPickBan] Processando teamData:', teamData);
            
            return teamData.map((player, index) => {
                // Se já é um objeto com dados completos, usar como está
                if (typeof player === 'object' && player !== null) {
                    // Garantir que summonerName está no formato correto
                    let summonerName = player.summonerName || player.name || '';

                    // Se temos gameName e tagLine, formatar como gameName#tagLine
                    if (player.gameName && player.tagLine) {
                        summonerName = `${player.gameName}#${player.tagLine}`;
                    } else if (player.gameName && !player.tagLine) {
                        summonerName = player.gameName;
                    }

                    const processedPlayer = {
                        ...player,
                        summonerName: summonerName,
                        name: summonerName, // Manter compatibilidade
                        id: player.id || player.summonerId || Math.random().toString(),
                        lane: this.getLaneForIndex(index),
                        originalIndex: index
                    };

                    console.log(`✅ [DraftPickBan] Jogador processado [${index}]:`, processedPlayer);
                    return processedPlayer;
                }

                // Se é string, criar objeto básico
                const playerName = player.toString();
                const processedPlayer = {
                    id: playerName,
                    name: playerName,
                    summonerName: playerName,
                    lane: this.getLaneForIndex(index),
                    originalIndex: index
                };

                console.log(`✅ [DraftPickBan] Jogador string processado [${index}]:`, processedPlayer);
                return processedPlayer;
            });
        };

        // Usar team1/team2 ou blueTeam/redTeam conforme disponível
        const blueTeamData = this.matchData.team1 || this.matchData.blueTeam || [];
        const redTeamData = this.matchData.team2 || this.matchData.redTeam || [];

        console.log('🔵 [DraftPickBan] Blue team data:', blueTeamData);
        console.log('🔴 [DraftPickBan] Red team data:', redTeamData);

        const processedBlueTeam = processTeamData(blueTeamData);
        const processedRedTeam = processTeamData(redTeamData);

        console.log('✅ [DraftPickBan] Times processados:', {
            blueTeamSize: processedBlueTeam.length,
            redTeamSize: processedRedTeam.length,
            blueTeam: processedBlueTeam.map((p: any) => ({ id: p.id, name: p.summonerName, lane: p.lane, isBot: this.isBot(p) })),
            redTeam: processedRedTeam.map((p: any) => ({ id: p.id, name: p.summonerName, lane: p.lane, isBot: this.isBot(p) }))
        });

        this.session = {
            id: this.matchData.id || 'session-' + Date.now(),
            phase: 'bans',
            currentAction: 0,
            extendedTime: 0,
            phases: [],
            blueTeam: processedBlueTeam,
            redTeam: processedRedTeam,
            currentPlayerIndex: 0
        };

        this.generatePhases();
        this.updateCurrentTurn();
        this.startTimer();

        // Inicializar hashes para o sistema de cache inteligente
        this._sessionStateHash = this.generateSessionStateHash();
        this._lastActionHash = this.generateActionHash();
        this._lastStateUpdate = Date.now();

        console.log('✅ [DraftPickBan] Sessão criada:', {
            id: this.session.id,
            blueTeamSize: this.session.blueTeam.length,
            redTeamSize: this.session.redTeam.length,
            phasesCount: this.session.phases.length,
            currentAction: this.session.currentAction
        });
    }

    private getLaneForIndex(index: number): string {
        const lanes = ['top', 'jungle', 'mid', 'adc', 'support'];
        return lanes[index] || 'unknown';
    }

    private generatePhases() {
        if (!this.session) return;

        // Create the pick/ban sequence (seguindo exatamente o padrão do LoL)
        this.session.phases = [
            // 1ª Fase de Banimento (3 bans por time)
            { team: 'blue', action: 'ban', locked: false, timeRemaining: 30 },   // Ban 1 - Blue
            { team: 'red', action: 'ban', locked: false, timeRemaining: 30 },    // Ban 1 - Red
            { team: 'blue', action: 'ban', locked: false, timeRemaining: 30 },   // Ban 2 - Blue
            { team: 'red', action: 'ban', locked: false, timeRemaining: 30 },    // Ban 2 - Red
            { team: 'blue', action: 'ban', locked: false, timeRemaining: 30 },   // Ban 3 - Blue
            { team: 'red', action: 'ban', locked: false, timeRemaining: 30 },    // Ban 3 - Red

            // 1ª Fase de Picks (3 picks iniciais)
            { team: 'blue', action: 'pick', locked: false, timeRemaining: 30 },  // Pick 1 - Blue (primeiro pick)
            { team: 'red', action: 'pick', locked: false, timeRemaining: 30 },   // Pick 1 - Red
            { team: 'red', action: 'pick', locked: false, timeRemaining: 30 },   // Pick 2 - Red
            { team: 'blue', action: 'pick', locked: false, timeRemaining: 30 },  // Pick 2 - Blue
            { team: 'blue', action: 'pick', locked: false, timeRemaining: 30 },  // Pick 3 - Blue

            // 2ª Fase de Banimento (2 bans por time)
            { team: 'red', action: 'ban', locked: false, timeRemaining: 30 },    // Ban 4 - Red (começa o vermelho)
            { team: 'blue', action: 'ban', locked: false, timeRemaining: 30 },   // Ban 4 - Blue
            { team: 'red', action: 'ban', locked: false, timeRemaining: 30 },    // Ban 5 - Red
            { team: 'blue', action: 'ban', locked: false, timeRemaining: 30 },   // Ban 5 - Blue

            // 2ª Fase de Picks (2 picks finais)
            { team: 'red', action: 'pick', locked: false, timeRemaining: 30 },   // Pick 3 - Red
            { team: 'blue', action: 'pick', locked: false, timeRemaining: 30 },  // Pick 4 - Blue
            { team: 'red', action: 'pick', locked: false, timeRemaining: 30 },   // Pick 4 - Red
            { team: 'blue', action: 'pick', locked: false, timeRemaining: 30 },  // Pick 5 - Blue (último pick)
            { team: 'red', action: 'pick', locked: false, timeRemaining: 30 }    // Pick 5 - Red (último pick)
        ];

        console.log('✅ [generatePhases] Fases criadas:', this.session.phases.length);
    }

    updateCurrentTurn() {
        if (!this.session || this.session.currentAction >= this.session.phases.length) {
            console.log('🎯 [updateCurrentTurn] Sessão completada, finalizando...');
            this.completePickBan();
            return;
        }

        const currentPhase = this.session.phases[this.session.currentAction];
        if (!currentPhase) return;

        // Update phase status baseado na ação atual
        if (this.session.currentAction < 6) {
            this.session.phase = 'bans'; // Primeira fase de bans (0-5)
        } else if (this.session.currentAction >= 6 && this.session.currentAction < 11) {
            this.session.phase = 'picks'; // Primeira fase de picks (6-10)
        } else if (this.session.currentAction >= 11 && this.session.currentAction < 15) {
            this.session.phase = 'bans'; // Segunda fase de bans (11-14)
        } else {
            this.session.phase = 'picks'; // Segunda fase de picks (15-19)
        }

        console.log(`🎯 [updateCurrentTurn] Ação ${this.session.currentAction}: ${currentPhase.team} - ${currentPhase.action}`);
        console.log(`🎯 [updateCurrentTurn] Fase atual: ${this.session.phase}`);

        // Obter jogadores ordenados por lane (top, jungle, mid, adc, support)
        const sortedPlayers = this.getSortedTeamByLane(currentPhase.team);
        
        // Garantir que temos exatamente 5 jogadores
        if (sortedPlayers.length !== 5) {
            console.error(`❌ [updateCurrentTurn] Time ${currentPhase.team} não tem exatamente 5 jogadores: ${sortedPlayers.length}`);
            return;
        }

        // Mapeamento baseado na ordem padrão do LoL e na ação atual
        let playerIndex = 0;
        const actionIndex = this.session.currentAction;

        // Distribuição seguindo a ordem padrão do LoL:
        // - Bans: distribuídos entre os 5 jogadores de forma rotativa
        // - Picks: cada jogador faz exatamente 1 pick na ordem de suas lanes

        if (actionIndex < 6) {
            // Primeira fase de bans (0-5): distribuir entre todos os 5 players
            // Blue: 0, 2, 4 | Red: 1, 3, 5
            const teamBanIndex = actionIndex % 2 === 0 ? actionIndex / 2 : (actionIndex - 1) / 2;
            playerIndex = teamBanIndex % 5;
        } else if (actionIndex >= 6 && actionIndex < 11) {
            // Primeira fase de picks (6-10): cada jogador faz 1 pick
            // Blue: 6, 9, 10 | Red: 7, 8
            if (currentPhase.team === 'blue') {
                // Blue team picks: 6, 9, 10
                if (actionIndex === 6) playerIndex = 0; // Primeiro pick - Top
                else if (actionIndex === 9) playerIndex = 1; // Segundo pick - Jungle  
                else if (actionIndex === 10) playerIndex = 2; // Terceiro pick - Mid
            } else {
                // Red team picks: 7, 8
                if (actionIndex === 7) playerIndex = 0; // Primeiro pick - Top
                else if (actionIndex === 8) playerIndex = 1; // Segundo pick - Jungle
            }
        } else if (actionIndex >= 11 && actionIndex < 15) {
            // Segunda fase de bans (11-14): usar jogadores que ainda não fizeram ban
            // Blue: 12, 14 | Red: 11, 13
            if (currentPhase.team === 'blue') {
                // Blue team bans: 12, 14
                if (actionIndex === 12) playerIndex = 3; // ADC
                else if (actionIndex === 14) playerIndex = 4; // Support
            } else {
                // Red team bans: 11, 13
                if (actionIndex === 11) playerIndex = 2; // Mid
                else if (actionIndex === 13) playerIndex = 3; // ADC
            }
        } else {
            // Segunda fase de picks (15-19): jogadores restantes fazem seus picks
            // Blue: 16, 18 | Red: 15, 17, 19
            if (currentPhase.team === 'blue') {
                // Blue team picks: 16, 18
                if (actionIndex === 16) playerIndex = 3; // ADC
                else if (actionIndex === 18) playerIndex = 4; // Support
            } else {
                // Red team picks: 15, 17, 19
                if (actionIndex === 15) playerIndex = 2; // Mid
                else if (actionIndex === 17) playerIndex = 3; // ADC
                else if (actionIndex === 19) playerIndex = 4; // Support
            }
        }

        const player = sortedPlayers[playerIndex];
        currentPhase.playerId = player?.id?.toString() || player?.summonerName;
        currentPhase.playerName = player?.summonerName || player?.name;

        console.log(`🎯 [updateCurrentTurn] Jogador selecionado: ${currentPhase.playerName} (${currentPhase.playerId})`);
        console.log(`🎯 [updateCurrentTurn] Índice do jogador: ${playerIndex}`);

        this.checkForBotAutoAction(currentPhase);
        this.isMyTurn = this.checkIfMyTurn(currentPhase);

        console.log(`🎯 [updateCurrentTurn] Vez de: ${this.getCurrentPlayerName()}, É minha vez: ${this.isMyTurn}`);
    }

    private checkForBotAutoAction(phase: PickBanPhase) {
        console.log('🤖 [checkForBotAutoAction] Verificando ação automática para fase:', phase);
        
        if (!phase.playerId) {
            console.log('⚠️ [checkForBotAutoAction] Phase não tem playerId');
            return;
        }

        const currentTeam = phase.team;
        const teamPlayers = currentTeam === 'blue' ? this.session!.blueTeam : this.session!.redTeam;
        const currentPlayer = teamPlayers.find(p => this.comparePlayerWithId(p, phase.playerId!));

        console.log('🤖 [checkForBotAutoAction] Current player encontrado:', currentPlayer);
        console.log('🤖 [checkForBotAutoAction] É bot?', currentPlayer ? this.isBot(currentPlayer) : false);

        if (currentPlayer && this.isBot(currentPlayer)) {
            console.log('🤖 [checkForBotAutoAction] Bot detectado, agendando ação automática...');
            this.botPickTimer = setTimeout(() => {
                console.log('🤖 [checkForBotAutoAction] Executando ação do bot...');
                this.performBotAction(phase);
            }, 2000 + Math.random() * 3000);
        } else {
            console.log('🤖 [checkForBotAutoAction] Não é bot ou jogador não encontrado');
        }
    }

    private getCurrentPlayer(): any {
        if (!this.session) return null;

        const currentPhase = this.session.phases[this.session.currentAction];
        if (!currentPhase) return null;

        const currentTeam = currentPhase.team;
        const teamPlayers = currentTeam === 'blue' ? this.session.blueTeam : this.session.redTeam;

        return teamPlayers.find(p => this.comparePlayerWithId(p, currentPhase.playerId!));
    }

    private performBotAction(phase: PickBanPhase) {
        console.log('🤖 [performBotAction] Executando ação do bot para fase:', phase);
        
        if (!this.session) {
            console.log('⚠️ [performBotAction] Session não existe');
            return;
        }

        const availableChampions = this.champions.filter(c =>
            !this.isChampionBanned(c) && !this.isChampionPicked(c)
        );

        console.log('🤖 [performBotAction] Campeões disponíveis:', availableChampions.length);

        if (availableChampions.length === 0) {
            console.log('⚠️ [performBotAction] Nenhum campeão disponível');
            return;
        }

        const randomChampion = availableChampions[Math.floor(Math.random() * availableChampions.length)];
        console.log('🤖 [performBotAction] Campeão selecionado:', randomChampion.name);

        phase.champion = randomChampion;
        phase.locked = true;
        phase.timeRemaining = 0;

        this.session.currentAction++;

        console.log('🤖 [performBotAction] Próxima ação:', this.session.currentAction);

        if (this.session.currentAction >= this.session.phases.length) {
            console.log('🤖 [performBotAction] Sessão completada');
            this.session.phase = 'completed';
            this.stopTimer();
        } else {
            console.log('🤖 [performBotAction] Atualizando próximo turno');
            this.updateCurrentTurn();
        }

        // Invalidar cache apenas quando há uma ação real (pick/ban do bot)
        console.log('🔄 [performBotAction] Invalidando cache devido a ação real do bot');
        this.invalidateCache();
    }

    checkIfMyTurn(phase: PickBanPhase): boolean {
        if (!this.currentPlayer) return false;

        return this.comparePlayerWithId(this.currentPlayer, phase.playerId!);
    }

    getPlayerTeam(): 'blue' | 'red' {
        if (!this.currentPlayer || !this.session) return 'blue';

        const blueTeamPlayer = this.session.blueTeam.find(p => this.comparePlayers(p, this.currentPlayer));
        return blueTeamPlayer ? 'blue' : 'red';
    }

    startTimer() {
        if (this.timer) {
            clearInterval(this.timer);
        }

        this.timer = setInterval(() => {
            if (!this.session) return;

            const currentPhase = this.session.phases[this.session.currentAction];
            if (!currentPhase) return;

            if (currentPhase.timeRemaining > 0) {
                currentPhase.timeRemaining--;
                this.timeRemaining = currentPhase.timeRemaining;
                
                // NÃO invalidar cache aqui - apenas atualizar o timer
                // O cache só deve ser invalidado quando há mudanças reais nos dados
            } else {
                this.handleTimeOut();
            }
        }, 1000);
    }

    handleTimeOut() {
        if (!this.session) return;

        const currentPhase = this.session.phases[this.session.currentAction];
        if (!currentPhase) return;

        // Auto-pick/ban para o jogador atual
        this.performBotAction(currentPhase);
    }

    completePickBan() {
        this.onPickBanComplete.emit({
            session: this.session,
            blueTeam: this.session?.blueTeam,
            redTeam: this.session?.redTeam
        });
    }

    cancelPickBan() {
        this.onPickBanCancel.emit();
    }

    getCurrentPhaseText(): string {
        if (!this.session) return '';

        if (this.session.phase === 'completed') {
            return 'Seleção Completa';
        }

        const currentPhase = this.session.phases[this.session.currentAction];
        if (!currentPhase) return '';

        const phaseNumber = this.session.currentAction + 1;
        const totalPhases = this.session.phases.length;

        if (currentPhase.action === 'ban') {
            return `Ban ${Math.ceil(phaseNumber / 2)} de 3`;
        } else {
            const pickNumber = phaseNumber - 6; // -6 porque os primeiros 6 são bans
            return `Pick ${Math.ceil(pickNumber / 2)} de 5`;
        }
    }

    getPhaseProgress(): number {
        if (!this.session) return 0;

        if (this.session.phase === 'completed') {
            return 100;
        }

        return (this.session.currentAction / this.session.phases.length) * 100;
    }

    private invalidateCache(): void {
        console.log('🗑️ [Cache] Invalidando cache manualmente');
        this._cachedSortedBlueTeam = null;
        this._cachedSortedRedTeam = null;
        this._cachedBannedChampions = null;
        this._cachedBlueTeamPicks = null;
        this._cachedRedTeamPicks = null;
        this._lastCacheUpdate = Date.now();
    }

    private isCacheValid(): boolean {
        // Verificar se há mudanças reais que requerem invalidação
        if (this.checkStateChange()) {
            return false;
        }

        // Verificar se o cache expirou por tempo
        return Date.now() - this._lastCacheUpdate < this.CACHE_DURATION;
    }

    getBannedChampions(): Champion[] {
        // Verificar se o cache é válido antes de usar
        if (!this.shouldInvalidateCache() && this._cachedBannedChampions) {
            return this._cachedBannedChampions;
        }

        if (!this.session) return [];

        const bannedChampions = this.session.phases
            .filter(phase => phase.action === 'ban' && phase.champion)
            .map(phase => phase.champion!)
            .filter((champion, index, self) =>
                index === self.findIndex(c => c.id === champion.id)
            );

        this._cachedBannedChampions = bannedChampions;
        this._lastCacheUpdate = Date.now();

        return bannedChampions;
    }

    getTeamPicks(team: 'blue' | 'red'): Champion[] {
        // Verificar se o cache é válido antes de usar
        if (team === 'blue' && !this.shouldInvalidateCache() && this._cachedBlueTeamPicks) {
            return this._cachedBlueTeamPicks;
        }
        if (team === 'red' && !this.shouldInvalidateCache() && this._cachedRedTeamPicks) {
            return this._cachedRedTeamPicks;
        }

        if (!this.session) return [];

        const teamPicks = this.session.phases
            .filter(phase => phase.team === team && phase.action === 'pick' && phase.champion)
            .map(phase => phase.champion!);

        if (team === 'blue') {
            this._cachedBlueTeamPicks = teamPicks;
        } else {
            this._cachedRedTeamPicks = teamPicks;
        }
        this._lastCacheUpdate = Date.now();

        return teamPicks;
    }

    getSortedTeamByLane(team: 'blue' | 'red'): any[] {
        console.log(`🔍 [getSortedTeamByLane] Chamado para time: ${team}`);
        console.log(`🔍 [getSortedTeamByLane] Session existe:`, !!this.session);
        
        // Verificar se o cache é válido antes de usar
        if (team === 'blue' && !this.shouldInvalidateCache() && this._cachedSortedBlueTeam) {
            console.log(`🔍 [getSortedTeamByLane] Retornando cache para blue team:`, this._cachedSortedBlueTeam);
            return this._cachedSortedBlueTeam;
        }
        if (team === 'red' && !this.shouldInvalidateCache() && this._cachedSortedRedTeam) {
            console.log(`🔍 [getSortedTeamByLane] Retornando cache para red team:`, this._cachedSortedRedTeam);
            return this._cachedSortedRedTeam;
        }

        if (!this.session) {
            console.warn(`⚠️ [getSortedTeamByLane] Session não existe para time ${team}`);
            return [];
        }

        const teamPlayers = team === 'blue' ? this.session.blueTeam : this.session.redTeam;
        console.log(`🔍 [getSortedTeamByLane] Team players para ${team}:`, teamPlayers);
        
        const sortedPlayers = this.sortPlayersByLane(teamPlayers);
        console.log(`🔍 [getSortedTeamByLane] Players ordenados para ${team}:`, sortedPlayers);

        if (team === 'blue') {
            this._cachedSortedBlueTeam = sortedPlayers;
        } else {
            this._cachedSortedRedTeam = sortedPlayers;
        }
        this._lastCacheUpdate = Date.now();

        return sortedPlayers;
    }

    private sortPlayersByLane(players: any[]): any[] {
        const laneOrder = ['top', 'jungle', 'mid', 'adc', 'support'];

        return players.sort((a, b) => {
            const laneA = a.lane || 'unknown';
            const laneB = b.lane || 'unknown';

            const indexA = laneOrder.indexOf(laneA);
            const indexB = laneOrder.indexOf(laneB);

            if (indexA === -1 && indexB === -1) return 0;
            if (indexA === -1) return 1;
            if (indexB === -1) return -1;

            return indexA - indexB;
        });
    }

    getPlayerLaneDisplayForPlayer(player: any): string {
        const lane = player.lane || 'unknown';
        return this.getLaneDisplayName(lane);
    }

    getLaneDisplayName(lane: string): string {
        const laneNames: { [key: string]: string } = {
            'top': '🛡️ Top',
            'jungle': '🌲 Jungle',
            'mid': '⚡ Mid',
            'adc': '🏹 ADC',
            'support': '💎 Support',
            'unknown': '❓ Unknown'
        };
        return laneNames[lane] || laneNames['unknown'];
    }

    isCurrentPlayer(player: any): boolean {
        if (!this.currentPlayer || !player) return false;
        return this.comparePlayers(this.currentPlayer, player);
    }

    getTeamBans(team: 'blue' | 'red'): Champion[] {
        if (!this.session) return [];

        return this.session.phases
            .filter(phase => phase.team === team && phase.action === 'ban' && phase.champion)
            .map(phase => phase.champion!);
    }

    isCurrentPlayerForPick(team: 'blue' | 'red', pickIndex: number): boolean {
        if (!this.currentPlayer || !this.session) return false;

        const teamPlayers = team === 'blue' ? this.session.blueTeam : this.session.redTeam;
        const player = teamPlayers[pickIndex];

        return player ? this.comparePlayers(this.currentPlayer, player) : false;
    }

    isChampionBanned(champion: Champion): boolean {
        return this.getBannedChampions().some(c => c.id === champion.id);
    }

    isChampionPicked(champion: Champion): boolean {
        const bluePicks = this.getTeamPicks('blue');
        const redPicks = this.getTeamPicks('red');

        return [...bluePicks, ...redPicks].some(c => c.id === champion.id);
    }

    getPlayerPick(team: 'blue' | 'red', player: any): Champion | null {
        if (!this.session) return null;

        const teamPicks = this.getTeamPicks(team);
        const teamPlayers = team === 'blue' ? this.session.blueTeam : this.session.redTeam;

        // Encontrar o índice do jogador no time
        const playerIndex = teamPlayers.findIndex(p => this.comparePlayers(p, player));
        if (playerIndex === -1) return null;

        // Retornar o pick correspondente ao índice do jogador
        return teamPicks[playerIndex] || null;
    }

    getCurrentPlayerName(): string {
        if (!this.session) return '';

        const currentPhase = this.session.phases[this.session.currentAction];
        if (!currentPhase) return '';

        return currentPhase.playerName || 'Jogador Desconhecido';
    }

    getCurrentActionText(): string {
        if (!this.session) return '';

        const currentPhase = this.session.phases[this.session.currentAction];
        if (!currentPhase) return '';

        return currentPhase.action === 'ban' ? 'Banir Campeão' : 'Escolher Campeão';
    }

    getCurrentActionIcon(): string {
        if (!this.session) return '';

        const currentPhase = this.session.phases[this.session.currentAction];
        if (!currentPhase) return '';

        return currentPhase.action === 'ban' ? '🚫' : '⭐';
    }

    isPlayerBot(player: any): boolean {
        return this.isBot(player);
    }

    onImageError(event: any, champion: Champion): void {
        event.target.src = 'assets/images/champion-placeholder.svg';
    }

    // MÉTODOS PARA COMUNICAÇÃO COM OS MODAIS
    openChampionModal(): void {
        this.showChampionModal = true;
    }

    openConfirmationModal(): void {
        this.showConfirmationModal = true;
    }

    // MÉTODO PARA RECEBER SELEÇÃO DO MODAL
    onChampionSelected(champion: Champion): void {
        console.log('🎯 [onChampionSelected] Campeão selecionado:', champion.name);
        
        if (!this.session) return;

        const currentPhase = this.session.phases[this.session.currentAction];
        if (!currentPhase) return;

        currentPhase.champion = champion;
        currentPhase.locked = true;
        currentPhase.timeRemaining = 0;

        this.session.currentAction++;

        if (this.session.currentAction >= this.session.phases.length) {
            this.session.phase = 'completed';
            this.stopTimer();
        } else {
            this.updateCurrentTurn();
        }

        // Invalidar cache apenas quando há uma ação real (pick/ban)
        console.log('🔄 [onChampionSelected] Invalidando cache devido a ação real');
        this.invalidateCache();
    }

    private stopTimer() {
        if (this.timer) {
            clearInterval(this.timer);
            this.timer = null;
        }
    }

    private generateSessionStateHash(): string {
        if (!this.session) return '';

        // Gerar hash baseado apenas nos dados que afetam a interface
        const stateData = {
            currentAction: this.session.currentAction,
            phase: this.session.phase,
            phases: this.session.phases.map(p => ({
                action: p.action,
                team: p.team,
                locked: p.locked,
                championId: p.champion?.id,
                playerId: p.playerId
            }))
        };

        return JSON.stringify(stateData);
    }

    private generateActionHash(): string {
        if (!this.session) return '';

        // Hash específico para ações (picks/bans realizados)
        const actionData = this.session.phases
            .filter(p => p.locked && p.champion)
            .map(p => ({
                action: p.action,
                team: p.team,
                championId: p.champion?.id,
                playerId: p.playerId
            }));

        return JSON.stringify(actionData);
    }

    private checkStateChange(): boolean {
        const newStateHash = this.generateSessionStateHash();
        const newActionHash = this.generateActionHash();
        
        const stateChanged = newStateHash !== this._sessionStateHash;
        const actionChanged = newActionHash !== this._lastActionHash;

        if (stateChanged || actionChanged) {
            console.log('🔄 [Cache] Mudança detectada - invalidando cache');
            console.log('🔄 [Cache] State changed:', stateChanged);
            console.log('🔄 [Cache] Action changed:', actionChanged);
            
            this._sessionStateHash = newStateHash;
            this._lastActionHash = newActionHash;
            this._lastStateUpdate = Date.now();
            return true;
        }

        return false;
    }

    private shouldInvalidateCache(): boolean {
        // Verificar se há mudanças reais nos dados
        if (this.checkStateChange()) {
            return true;
        }

        // Verificar se o cache expirou por tempo
        const cacheExpired = Date.now() - this._lastCacheUpdate > this.CACHE_DURATION;
        
        if (cacheExpired) {
            console.log('⏰ [Cache] Cache expirado por tempo');
            return true;
        }

        return false;
    }
} 