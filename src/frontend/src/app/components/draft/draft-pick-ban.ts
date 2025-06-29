import { Component, Input, Output, EventEmitter, OnInit, OnDestroy, ChangeDetectorRef, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ChampionService, Champion } from '../../services/champion.service';
import { BotService, PickBanPhase, CustomPickBanSession } from '../../services/bot.service';
import { DraftChampionModalComponent } from './draft-champion-modal';
import { DraftConfirmationModalComponent } from './draft-confirmation-modal';
import { interval, Subscription } from 'rxjs';
import { SortedTeamByLanePipe } from './sorted-team-by-lane.pipe';
import { BannedChampionsPipe } from './banned-champions.pipe';
import { TeamBansPipe } from './team-bans.pipe';
import { TeamPicksPipe } from './team-picks.pipe';
import { PlayerPickPipe } from './player-pick.pipe';
import { LaneDisplayPipe } from './lane-display.pipe';

@Component({
    selector: 'app-draft-pick-ban',
    imports: [
        CommonModule, 
        FormsModule, 
        DraftChampionModalComponent, 
        DraftConfirmationModalComponent, 
        SortedTeamByLanePipe,
        BannedChampionsPipe,
        TeamBansPipe,
        TeamPicksPipe,
        PlayerPickPipe,
        LaneDisplayPipe
    ],
    templateUrl: './draft-pick-ban.html',
    styleUrl: './draft-pick-ban.scss',
    changeDetection: ChangeDetectionStrategy.OnPush
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
    public _cachedSortedBlueTeam: any[] | null = null;
    public _cachedSortedRedTeam: any[] | null = null;
    public _cachedBannedChampions: Champion[] | null = null;
    public _cachedBlueTeamPicks: Champion[] | null = null;
    public _cachedRedTeamPicks: Champion[] | null = null;
    public _lastCacheUpdate: number = 0;
    public readonly CACHE_DURATION = 5000; // Aumentado para 5 segundos

    // SISTEMA DE CACHE INTELIGENTE
    public _sessionStateHash: string = '';
    public _currentActionHash: string = '';
    public _phaseHash: string = '';
    public _lastStateUpdate: number = 0;
    public _cacheInvalidationNeeded: boolean = false;
    public _lastActionHash: string = ''; // Hash da última ação realizada
    public _lastRealActionTime: number = 0; // Timestamp da última ação real (pick/ban)

    public timer: Subscription | null = null;
    public botPickTimer: number | null = null;

    constructor(
        public championService: ChampionService,
        public botService: BotService,
        public cdr: ChangeDetectorRef
    ) { }

    ngOnInit() {
        this.loadChampions();
        this.initializePickBanSession();
        this._lastRealActionTime = Date.now(); // Inicializar timestamp da última ação
    }

    ngOnDestroy() {
        if (this.timer) {
            this.timer.unsubscribe();
        }
        if (this.botPickTimer) {
            this.botService.cancelScheduledAction(this.botPickTimer);
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
                    console.log(`🔍 [DraftPickBan] Processando jogador [${index}]:`, {
                        id: player.id,
                        name: player.name,
                        summonerName: player.summonerName,
                        assignedLane: player.assignedLane,
                        lane: player.lane,
                        primaryLane: player.primaryLane,
                        secondaryLane: player.secondaryLane
                    });

                    // Garantir que summonerName está no formato correto
                    let summonerName = player.summonerName || player.name || '';

                    // Se temos gameName e tagLine, formatar como gameName#tagLine
                    if (player.gameName && player.tagLine) {
                        summonerName = `${player.gameName}#${player.tagLine}`;
                    } else if (player.gameName && !player.tagLine) {
                        summonerName = player.gameName;
                    }

                    // Preservar a lane original do jogador (assignedLane do matchmaking)
                    let lane = player.assignedLane || player.lane || this.getLaneForIndex(index);

                    // Mapear 'bot' para 'adc' para compatibilidade
                    if (lane === 'bot') {
                        lane = 'adc';
                    }

                    console.log(`🎯 [DraftPickBan] Lane final para jogador [${index}]: ${lane} (original: ${player.assignedLane})`);

                    const processedPlayer = {
                        ...player,
                        summonerName: summonerName,
                        name: summonerName, // Manter compatibilidade
                        id: player.id || player.summonerId || Math.random().toString(),
                        lane: lane, // Usar lane original preservada
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
                    lane: this.getLaneForIndex(index), // Fallback apenas para strings
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
            blueTeam: processedBlueTeam.map((p: any) => ({ id: p.id, name: p.summonerName, lane: p.lane, isBot: this.botService.isBot(p) })),
            redTeam: processedRedTeam.map((p: any) => ({ id: p.id, name: p.summonerName, lane: p.lane, isBot: this.botService.isBot(p) }))
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

        // Create the pick/ban sequence (seguindo exatamente o padrão da partida ranqueada do LoL)
        this.session.phases = [
            // Primeira Fase de Banimento (6 bans - 3 por time)
            { team: 'blue', action: 'ban', locked: false, timeRemaining: 30, playerIndex: 0 },   // Ação 1: Jogador 1 Blue (Top)
            { team: 'red', action: 'ban', locked: false, timeRemaining: 30, playerIndex: 0 },    // Ação 2: Jogador 1 Red (Top)
            { team: 'blue', action: 'ban', locked: false, timeRemaining: 30, playerIndex: 1 },   // Ação 3: Jogador 2 Blue (Jungle)
            { team: 'red', action: 'ban', locked: false, timeRemaining: 30, playerIndex: 1 },    // Ação 4: Jogador 2 Red (Jungle)
            { team: 'blue', action: 'ban', locked: false, timeRemaining: 30, playerIndex: 2 },   // Ação 5: Jogador 3 Blue (Mid)
            { team: 'red', action: 'ban', locked: false, timeRemaining: 30, playerIndex: 2 },    // Ação 6: Jogador 3 Red (Mid)

            // Primeira Fase de Picks (6 picks - 3 por time)
            { team: 'blue', action: 'pick', locked: false, timeRemaining: 30, playerIndex: 0 },  // Ação 7: Jogador 1 Blue (Top) - First Pick
            { team: 'red', action: 'pick', locked: false, timeRemaining: 30, playerIndex: 0 },   // Ação 8: Jogador 1 Red (Top)
            { team: 'red', action: 'pick', locked: false, timeRemaining: 30, playerIndex: 1 },   // Ação 9: Jogador 2 Red (Jungle)
            { team: 'blue', action: 'pick', locked: false, timeRemaining: 30, playerIndex: 1 },  // Ação 10: Jogador 2 Blue (Jungle)
            { team: 'blue', action: 'pick', locked: false, timeRemaining: 30, playerIndex: 2 },  // Ação 11: Jogador 3 Blue (Mid)
            { team: 'red', action: 'pick', locked: false, timeRemaining: 30, playerIndex: 2 },   // Ação 12: Jogador 3 Red (Mid)

            // Segunda Fase de Banimento (4 bans - 2 por time)
            { team: 'red', action: 'ban', locked: false, timeRemaining: 30, playerIndex: 3 },    // Ação 13: Jogador 4 Red (ADC)
            { team: 'blue', action: 'ban', locked: false, timeRemaining: 30, playerIndex: 3 },   // Ação 14: Jogador 4 Blue (ADC)
            { team: 'red', action: 'ban', locked: false, timeRemaining: 30, playerIndex: 4 },    // Ação 15: Jogador 5 Red (Support)
            { team: 'blue', action: 'ban', locked: false, timeRemaining: 30, playerIndex: 4 },   // Ação 16: Jogador 5 Blue (Support)

            // Segunda Fase de Picks (4 picks - 2 por time)
            { team: 'red', action: 'pick', locked: false, timeRemaining: 30, playerIndex: 3 },   // Ação 17: Jogador 4 Red (ADC)
            { team: 'blue', action: 'pick', locked: false, timeRemaining: 30, playerIndex: 3 },  // Ação 18: Jogador 4 Blue (ADC)
            { team: 'blue', action: 'pick', locked: false, timeRemaining: 30, playerIndex: 4 },  // Ação 19: Jogador 5 Blue (Support)
            { team: 'red', action: 'pick', locked: false, timeRemaining: 30, playerIndex: 4 }    // Ação 20: Jogador 5 Red (Support) - Last Pick
        ];

        console.log('✅ [generatePhases] Fases criadas seguindo fluxo ranqueado:', this.session.phases.length);
    }

    updateCurrentTurn() {
        if (!this.session || this.session.currentAction >= this.session.phases.length) {
            console.log('🎯 [updateCurrentTurn] Sessão completada, finalizando...');
            this.completePickBan();
            return;
        }

        const currentPhase = this.session.phases[this.session.currentAction];
        if (!currentPhase) return;

        console.log(`🎯 [updateCurrentTurn] === INÍCIO DA AÇÃO ${this.session.currentAction + 1} ===`);
        console.log(`🎯 [updateCurrentTurn] Fase atual:`, currentPhase);

        // Update phase status baseado na ação atual
        if (this.session.currentAction < 6) {
            this.session.phase = 'bans'; // Primeira fase de bans (0-5)
        } else if (this.session.currentAction >= 6 && this.session.currentAction < 12) {
            this.session.phase = 'picks'; // Primeira fase de picks (6-11)
        } else if (this.session.currentAction >= 12 && this.session.currentAction < 16) {
            this.session.phase = 'bans'; // Segunda fase de bans (12-15)
        } else {
            this.session.phase = 'picks'; // Segunda fase de picks (16-19)
        }

        console.log(`🎯 [updateCurrentTurn] Ação ${this.session.currentAction + 1}: ${currentPhase.team} - ${currentPhase.action}`);
        console.log(`🎯 [updateCurrentTurn] Fase atual: ${this.session.phase}`);

        // Obter jogadores ordenados por lane (top, jungle, mid, adc, support)
        const sortedPlayers = this.getSortedTeamByLane(currentPhase.team);

        // Garantir que temos exatamente 5 jogadores
        if (sortedPlayers.length !== 5) {
            console.error(`❌ [updateCurrentTurn] Time ${currentPhase.team} não tem exatamente 5 jogadores: ${sortedPlayers.length}`);
            console.error(`❌ [updateCurrentTurn] Jogadores:`, sortedPlayers);
            return;
        }

        // Usar o playerIndex pré-definido na fase
        const playerIndex = currentPhase.playerIndex ?? 0;
        const player = sortedPlayers[playerIndex];

        console.log(`🎯 [updateCurrentTurn] PlayerIndex da fase: ${playerIndex}`);
        console.log(`🎯 [updateCurrentTurn] Jogadores ordenados:`, sortedPlayers.map((p, i) => ({
            index: i,
            name: p.summonerName,
            lane: p.lane,
            id: p.id,
            isBot: this.botService.isBot(p)
        })));

        if (!player) {
            console.error(`❌ [updateCurrentTurn] Jogador não encontrado no índice ${playerIndex}`);
            return;
        }

        currentPhase.playerId = player?.id?.toString() || player?.summonerName;
        currentPhase.playerName = player?.summonerName || player?.name;

        console.log(`🎯 [updateCurrentTurn] Ação ${this.session.currentAction + 1}: ${currentPhase.playerName} (${currentPhase.playerId}) - ${this.getLaneDisplayName(player.lane)}`);
        console.log(`🎯 [updateCurrentTurn] Índice do jogador: ${playerIndex}`);
        console.log(`🎯 [updateCurrentTurn] É bot? ${this.botService.isBot(player)}`);

        this.checkForBotAutoAction(currentPhase);
        this.isMyTurn = this.checkIfMyTurn(currentPhase);

        console.log(`🎯 [updateCurrentTurn] Vez de: ${this.getCurrentPlayerName()}, É minha vez: ${this.isMyTurn}`);
        console.log(`🎯 [updateCurrentTurn] === FIM DA AÇÃO ${this.session.currentAction + 1} ===`);
    }

    private checkForBotAutoAction(phase: PickBanPhase) {
        if (!this.session) return;

        console.log(`🤖 [checkForBotAutoAction] === VERIFICANDO BOT PARA AÇÃO ${this.session.currentAction + 1} ===`);
        console.log(`🤖 [checkForBotAutoAction] Phase:`, phase);

        // Cancelar ação anterior se existir
        if (this.botPickTimer) {
            console.log(`🤖 [checkForBotAutoAction] Cancelando timer anterior: ${this.botPickTimer}`);
            this.botService.cancelScheduledAction(this.botPickTimer);
            this.botPickTimer = null;
        }

        // Verificar se deve executar ação de bot
        const shouldPerformAction = this.botService.shouldPerformBotAction(phase, this.session);
        console.log(`🤖 [checkForBotAutoAction] shouldPerformBotAction retornou: ${shouldPerformAction}`);

        if (shouldPerformAction) {
            console.log('🤖 [checkForBotAutoAction] Bot detectado, agendando ação automática...');

            this.botPickTimer = this.botService.scheduleBotAction(
                phase,
                this.session,
                this.champions,
                () => {
                    // Callback executado após a ação do bot
                    console.log('🤖 [checkForBotAutoAction] Ação do bot concluída, atualizando interface...');
                    console.log(`🤖 [checkForBotAutoAction] currentAction após bot: ${this.session?.currentAction}`);
                    console.log(`🤖 [checkForBotAutoAction] total de fases: ${this.session?.phases.length}`);

                    if (this.session && this.session.currentAction >= this.session.phases.length) {
                        console.log('🤖 [checkForBotAutoAction] Sessão completada pelo bot');
                        this.session.phase = 'completed';
                        this.stopTimer();
                    } else {
                        console.log('🤖 [checkForBotAutoAction] Continuando para próxima ação...');
                        this.updateCurrentTurn();
                    }

                    // Invalidar cache apenas quando há uma ação real (pick/ban do bot)
                    console.log('🔄 [checkForBotAutoAction] Invalidando cache devido a ação real do bot');
                    this.invalidateCache();
                }
            );
            console.log(`🤖 [checkForBotAutoAction] Timer agendado: ${this.botPickTimer}`);
        } else {
            console.log('🤖 [checkForBotAutoAction] Não é bot ou jogador não encontrado');
        }

        console.log(`🤖 [checkForBotAutoAction] === FIM DA VERIFICAÇÃO DE BOT ===`);
    }

    private getCurrentPlayer(): any {
        if (!this.session) return null;

        const currentPhase = this.session.phases[this.session.currentAction];
        if (!currentPhase) return null;

        const currentTeam = currentPhase.team;
        const teamPlayers = currentTeam === 'blue' ? this.session.blueTeam : this.session.redTeam;

        return teamPlayers.find(p => this.botService.comparePlayerWithId(p, currentPhase.playerId!));
    }

    checkIfMyTurn(phase: PickBanPhase): boolean {
        if (!this.currentPlayer) return false;

        return this.botService.comparePlayerWithId(this.currentPlayer, phase.playerId!);
    }

    getPlayerTeam(): 'blue' | 'red' {
        if (!this.currentPlayer || !this.session) return 'blue';

        const blueTeamPlayer = this.session.blueTeam.find(p => this.botService.comparePlayers(p, this.currentPlayer));
        return blueTeamPlayer ? 'blue' : 'red';
    }

    startTimer() {
        if (this.timer) {
            this.timer.unsubscribe();
        }

        // Timer único para lógica e display
        this.timer = interval(1000).subscribe(() => {
            if (!this.session) return;

            const currentPhase = this.session.phases[this.session.currentAction];
            if (!currentPhase) return;

            if (currentPhase.timeRemaining > 0) {
                currentPhase.timeRemaining--;
                this.timeRemaining = currentPhase.timeRemaining;
                
                // NÃO marcar para detecção a cada segundo
                // O timer será atualizado automaticamente pelo Angular
                // Apenas marcar quando há mudanças reais nos dados
            } else {
                this.handleTimeOut();
            }
        });
    }

    handleTimeOut() {
        if (!this.session) return;

        const currentPhase = this.session.phases[this.session.currentAction];
        if (!currentPhase) return;

        // Auto-pick/ban para o jogador atual usando o BotService
        this.botService.performBotAction(currentPhase, this.session, this.champions);

        this.session.currentAction++;

        if (this.session.currentAction >= this.session.phases.length) {
            this.session.phase = 'completed';
            this.stopTimer();
        } else {
            this.updateCurrentTurn();
        }

        // Invalidar cache apenas quando há uma ação real (timeout)
        console.log('🔄 [handleTimeOut] Invalidando cache devido a timeout');
        this.invalidateCache();
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

        const actionIndex = this.session.currentAction + 1; // +1 para mostrar ação 1-20

        if (currentPhase.action === 'ban') {
            if (actionIndex <= 6) {
                // Primeira fase de bans (1-6)
                const banNumber = actionIndex;
                return `Ban ${banNumber} de 6 (1ª Fase)`;
            } else {
                // Segunda fase de bans (13-16)
                const banNumber = actionIndex - 6;
                return `Ban ${banNumber} de 4 (2ª Fase)`;
            }
        } else {
            if (actionIndex >= 7 && actionIndex <= 12) {
                // Primeira fase de picks (7-12)
                const pickNumber = actionIndex - 6;
                return `Pick ${pickNumber} de 6 (1ª Fase)`;
            } else {
                // Segunda fase de picks (17-20)
                const pickNumber = actionIndex - 12;
                return `Pick ${pickNumber} de 4 (2ª Fase)`;
            }
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

    public isCacheValid(): boolean {
        // Verificar se há mudanças reais que requerem invalidação
        if (this.checkStateChange()) {
            return false;
        }

        // Verificar se o cache expirou por tempo
        return Date.now() - this._lastCacheUpdate < this.CACHE_DURATION;
    }

    getBannedChampions(): Champion[] {
        // Verificar se o cache é válido antes de usar
        if (this.isCacheValidForDisplay() && this._cachedBannedChampions) {
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
        if (team === 'blue' && this.isCacheValidForDisplay() && this._cachedBlueTeamPicks) {
            return this._cachedBlueTeamPicks;
        }
        if (team === 'red' && this.isCacheValidForDisplay() && this._cachedRedTeamPicks) {
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
        // Verificar se o cache é válido antes de usar
        if (team === 'blue' && this.isCacheValidForDisplay() && this._cachedSortedBlueTeam) {
            return this._cachedSortedBlueTeam;
        }
        if (team === 'red' && this.isCacheValidForDisplay() && this._cachedSortedRedTeam) {
            return this._cachedSortedRedTeam;
        }

        if (!this.session) {
            return [];
        }

        const teamPlayers = team === 'blue' ? this.session.blueTeam : this.session.redTeam;
        const sortedPlayers = this.sortPlayersByLane(teamPlayers);

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

        console.log('🔄 [sortPlayersByLane] Ordenando jogadores por lane:', players.map(p => ({ name: p.summonerName, lane: p.lane })));

        const sortedPlayers = players.sort((a, b) => {
            const laneA = a.lane || 'unknown';
            const laneB = b.lane || 'unknown';

            const indexA = laneOrder.indexOf(laneA);
            const indexB = laneOrder.indexOf(laneB);

            if (indexA === -1 && indexB === -1) return 0;
            if (indexA === -1) return 1;
            if (indexB === -1) return -1;

            return indexA - indexB;
        });

        console.log('✅ [sortPlayersByLane] Jogadores ordenados:', sortedPlayers.map(p => ({ name: p.summonerName, lane: p.lane })));

        return sortedPlayers;
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
        return this.botService.comparePlayers(this.currentPlayer, player);
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

        return player ? this.botService.comparePlayers(this.currentPlayer, player) : false;
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

        // Obter jogadores ordenados por lane
        const sortedPlayers = this.getSortedTeamByLane(team);

        // Encontrar o índice do jogador no time ordenado
        const playerIndex = sortedPlayers.findIndex(p => this.botService.comparePlayers(p, player));
        if (playerIndex === -1) return null;

        // Mapear o índice do jogador para as fases de pick correspondentes
        // Baseado no novo fluxo da partida ranqueada
        if (team === 'blue') {
            // Blue team picks: ações 7, 10, 11, 18, 19
            const bluePickActions = [6, 9, 10, 17, 18]; // -1 porque currentAction é 0-based
            const playerPickAction = bluePickActions[playerIndex];

            if (playerPickAction !== undefined) {
                const pickPhase = this.session.phases[playerPickAction];
                return pickPhase?.champion || null;
            }
        } else {
            // Red team picks: ações 8, 9, 12, 17, 20
            const redPickActions = [7, 8, 11, 16, 19]; // -1 porque currentAction é 0-based
            const playerPickAction = redPickActions[playerIndex];

            if (playerPickAction !== undefined) {
                const pickPhase = this.session.phases[playerPickAction];
                return pickPhase?.champion || null;
            }
        }

        return null;
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
        return this.botService.isBot(player);
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
            this.timer.unsubscribe();
            this.timer = null;
        }
    }

    private generateSessionStateHash(): string {
        if (!this.session) return '';

        // Gerar hash baseado apenas nos dados que afetam a interface
        // NÃO incluir timeRemaining pois muda a cada segundo
        const stateData = {
            currentAction: this.session.currentAction,
            phase: this.session.phase,
            phases: this.session.phases.map(p => ({
                action: p.action,
                team: p.team,
                locked: p.locked,
                championId: p.champion?.id,
                playerId: p.playerId
                // NÃO incluir timeRemaining aqui
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
        // Verificar se há mudanças reais nos dados (não timer)
        if (this.checkStateChange()) {
            console.log('🔄 [Cache] Mudança real detectada - invalidando cache');
            this._lastRealActionTime = Date.now();
            return true;
        }

        // Verificar se o cache expirou por tempo (apenas como fallback)
        // Mas apenas se não houve ação real recente
        const timeSinceLastAction = Date.now() - this._lastRealActionTime;
        const cacheExpired = Date.now() - this._lastCacheUpdate > this.CACHE_DURATION;

        if (cacheExpired && timeSinceLastAction > this.CACHE_DURATION) {
            console.log('⏰ [Cache] Cache expirado por tempo (sem ações recentes)');
            return true;
        }

        return false;
    }

    // Método otimizado para verificar cache sem logs desnecessários
    private isCacheValidForDisplay(): boolean {
        // Verificar se há mudanças reais nos dados (não timer)
        const newStateHash = this.generateSessionStateHash();
        const newActionHash = this.generateActionHash();

        const stateChanged = newStateHash !== this._sessionStateHash;
        const actionChanged = newActionHash !== this._lastActionHash;

        if (stateChanged || actionChanged) {
            this._sessionStateHash = newStateHash;
            this._lastActionHash = newActionHash;
            this._lastStateUpdate = Date.now();
            this._lastRealActionTime = Date.now();
            return false;
        }

        // Verificar se o cache expirou por tempo (apenas como fallback)
        const timeSinceLastAction = Date.now() - this._lastRealActionTime;
        const cacheExpired = Date.now() - this._lastCacheUpdate > this.CACHE_DURATION;

        if (cacheExpired && timeSinceLastAction > this.CACHE_DURATION) {
            return false;
        }

        return true;
    }
} 