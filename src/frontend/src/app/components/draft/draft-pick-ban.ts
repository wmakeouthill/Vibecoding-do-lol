import { Component, Input, Output, EventEmitter, OnInit, OnDestroy, ChangeDetectorRef, ChangeDetectionStrategy, OnChanges, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ChampionService, Champion } from '../../services/champion.service';
import { BotService, PickBanPhase, CustomPickBanSession } from '../../services/bot.service';
import { DraftChampionModalComponent } from './draft-champion-modal';
import { DraftConfirmationModalComponent } from './draft-confirmation-modal';
import { interval, Subscription } from 'rxjs';
import { BannedChampionsPipe } from './banned-champions.pipe';
import { TeamBansPipe } from './team-bans.pipe';
import { TeamPicksPipe } from './team-picks.pipe';
import { PlayerPickPipe } from './player-pick.pipe';
import { LaneDisplayPipe } from './lane-display.pipe';
import { CurrentPhaseTextPipe } from './current-phase-text.pipe';
import { PhaseProgressPipe } from './phase-progress.pipe';
import { CurrentPlayerNamePipe } from './current-player-name.pipe';
import { CurrentActionTextPipe } from './current-action-text.pipe';
import { CurrentActionIconPipe } from './current-action-icon.pipe';

@Component({
    selector: 'app-draft-pick-ban',
    imports: [
        CommonModule,
        FormsModule,
        DraftChampionModalComponent,
        DraftConfirmationModalComponent,
        BannedChampionsPipe,
        TeamBansPipe,
        TeamPicksPipe,
        PlayerPickPipe,
        LaneDisplayPipe,
        CurrentPhaseTextPipe,
        PhaseProgressPipe,
        CurrentPlayerNamePipe,
        CurrentActionTextPipe,
        CurrentActionIconPipe
    ],
    templateUrl: './draft-pick-ban.html',
    styleUrl: './draft-pick-ban.scss',
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class DraftPickBanComponent implements OnInit, OnDestroy, OnChanges {
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
        console.log('🚀 [DraftPickBan] ngOnInit iniciado');
        console.log('🚀 [DraftPickBan] currentPlayer recebido:', this.currentPlayer);
        console.log('🚀 [DraftPickBan] matchData recebido:', this.matchData);

        this.loadChampions().then(() => {
            this.initializePickBanSession();
            this._lastRealActionTime = Date.now(); // Inicializar timestamp da última ação
        });
    }

    ngOnDestroy() {
        if (this.timer) {
            this.timer.unsubscribe();
        }
        if (this.botPickTimer) {
            this.botService.cancelScheduledAction(this.botPickTimer);
        }
    }

    ngOnChanges(changes: SimpleChanges) {
        // ✅ CORREÇÃO: Verificar se a mudança é real e não apenas referência
        if (changes['matchData']) {
            const currentValue = changes['matchData'].currentValue;
            const previousValue = changes['matchData'].previousValue;

            // Verificar se é uma mudança real de dados
            if (currentValue && previousValue) {
                const currentHash = JSON.stringify({
                    currentAction: currentValue.currentAction,
                    phases: currentValue.phases?.map((p: any) => ({
                        action: p.action,
                        team: p.team,
                        locked: p.locked,
                        championId: p.champion?.id
                    }))
                });

                const previousHash = JSON.stringify({
                    currentAction: previousValue.currentAction,
                    phases: previousValue.phases?.map((p: any) => ({
                        action: p.action,
                        team: p.team,
                        locked: p.locked,
                        championId: p.champion?.id
                    }))
                });

                if (currentHash === previousHash) {
                    return;
                }
            }

            this.session = currentValue;
            this.invalidateCache();
        }

        if (changes['currentPlayer']) {
            this.checkCurrentPlayerChange();
        }
    }

    private async loadChampions() {
        try {
            console.log('🔄 [loadChampions] Carregando campeões...');
            this.championService.getAllChampions().subscribe({
                next: (champions) => {
                    this.champions = champions;
                    console.log(`✅ [loadChampions] ${this.champions.length} campeões carregados`);
                    this.organizeChampionsByRole();
                },
                error: (error) => {
                    console.error('❌ [loadChampions] Erro ao carregar campeões:', error);
                }
            });
        } catch (error) {
            console.error('❌ [loadChampions] Erro ao carregar campeões:', error);
        }
    }

    private organizeChampionsByRole() {
        this.championService.getChampionsByRole().subscribe({
            next: (championsByRole) => {
                this.championsByRole = championsByRole;
            },
            error: (error) => {
                console.error('❌ [organizeChampionsByRole] Erro ao organizar campeões por role:', error);
                // Fallback manual se necessário
                this.championsByRole = {
                    top: this.champions.filter(c => c.tags?.includes('Fighter') || c.tags?.includes('Tank')),
                    jungle: this.champions.filter(c => c.tags?.includes('Fighter') || c.tags?.includes('Assassin')),
                    mid: this.champions.filter(c => c.tags?.includes('Mage') || c.tags?.includes('Assassin')),
                    adc: this.champions.filter(c => c.tags?.includes('Marksman')),
                    support: this.champions.filter(c => c.tags?.includes('Support'))
                };
            }
        });
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

                    // ✅ CORREÇÃO: Usar a lane baseada no índice para garantir ordem correta
                    // Se o jogador já tem uma lane atribuída, usar ela, senão usar baseada no índice
                    let lane = player.assignedLane || player.lane || this.getLaneForIndex(index);

                    // Mapear 'bot' para 'adc' para compatibilidade
                    if (lane === 'bot') {
                        lane = 'adc';
                    }

                    console.log(`🎯 [DraftPickBan] Lane final para jogador [${index}]: ${lane} (original: ${player.assignedLane}, fallback: ${this.getLaneForIndex(index)})`);

                    const processedPlayer = {
                        ...player,
                        summonerName: summonerName,
                        name: summonerName, // Manter compatibilidade
                        id: player.id || player.summonerId || Math.random().toString(),
                        lane: lane, // Usar lane baseada no índice para garantir ordem
                        originalIndex: index, // ✅ CORREÇÃO: Manter índice original do array
                        teamIndex: index // ✅ NOVO: Índice específico do time (0-4 para cada time)
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
                    originalIndex: index, // ✅ CORREÇÃO: Manter índice original
                    teamIndex: index // ✅ NOVO: Índice específico do time
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
            blueTeam: processedBlueTeam.map((p: any) => ({
                id: p.id,
                name: p.summonerName,
                lane: p.lane,
                teamIndex: p.teamIndex,
                isBot: this.botService.isBot(p)
            })),
            redTeam: processedRedTeam.map((p: any) => ({
                id: p.id,
                name: p.summonerName,
                lane: p.lane,
                teamIndex: p.teamIndex,
                isBot: this.botService.isBot(p)
            }))
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

        // ✅ CORREÇÃO: Usar teamIndex diretamente em vez de ordenação por lane
        const teamPlayers = currentPhase.team === 'blue' ? this.session.blueTeam : this.session.redTeam;
        
        // Garantir que temos exatamente 5 jogadores
        if (teamPlayers.length !== 5) {
            console.error(`❌ [updateCurrentTurn] Time ${currentPhase.team} não tem exatamente 5 jogadores: ${teamPlayers.length}`);
            console.error(`❌ [updateCurrentTurn] Jogadores:`, teamPlayers);
            return;
        }

        // ✅ CORREÇÃO: Usar o playerIndex pré-definido na fase diretamente no array do time
        const playerIndex = currentPhase.playerIndex ?? 0;
        const player = teamPlayers[playerIndex];

        console.log(`🎯 [updateCurrentTurn] PlayerIndex da fase: ${playerIndex}`);
        console.log(`🎯 [updateCurrentTurn] Jogadores do time ${currentPhase.team}:`, teamPlayers.map((p, i) => ({
            index: i,
            teamIndex: p.teamIndex,
            name: p.summonerName,
            lane: p.lane,
            id: p.id,
            isBot: this.botService.isBot(p)
        })));

        if (!player) {
            console.error(`❌ [updateCurrentTurn] Jogador não encontrado no índice ${playerIndex}`);
            return;
        }

        // ✅ CORREÇÃO: Adicionar logs detalhados para debug do playerId
        console.log(`🔍 [updateCurrentTurn] Debug do jogador:`, {
            id: player.id,
            summonerName: player.summonerName,
            name: player.name,
            teamIndex: player.teamIndex,
            isBot: this.botService.isBot(player)
        });

        // ✅ CORREÇÃO: Garantir que playerId seja definido corretamente
        // Priorizar o formato gameName#tagLine, depois summonerName, depois outros identificadores
        let playerIdReason = '';
        if (player?.gameName && player?.tagLine) {
            currentPhase.playerId = `${player.gameName}#${player.tagLine}`;
            playerIdReason = 'player.gameName#tagLine';
        } else if (player?.summonerName) {
            currentPhase.playerId = player.summonerName;
            playerIdReason = 'player.summonerName';
        } else if (player?.name) {
            currentPhase.playerId = player.name;
            playerIdReason = 'player.name';
        } else if (player?.id) {
            currentPhase.playerId = player.id.toString();
            playerIdReason = 'player.id';
        } else if (player?.summonerId) {
            currentPhase.playerId = player.summonerId.toString();
            playerIdReason = 'player.summonerId';
        } else {
            currentPhase.playerId = playerIndex.toString();
            playerIdReason = 'playerIndex (fallback)';
        }
        
        currentPhase.playerName = player?.summonerName || player?.name || `Jogador ${playerIndex}`;

        console.log(`🎯 [updateCurrentTurn] Ação ${this.session.currentAction + 1}: ${currentPhase.playerName} (${currentPhase.playerId}) - ${this.getLaneDisplayName(player.lane)}`);
        console.log(`🎯 [updateCurrentTurn] Índice do jogador: ${playerIndex} (teamIndex: ${player.teamIndex})`);
        console.log(`🎯 [updateCurrentTurn] É bot? ${this.botService.isBot(player)}`);
        console.log(`🎯 [updateCurrentTurn] Phase.playerId definido: ${currentPhase.playerId} (fonte: ${playerIdReason})`);
        console.log(`🎯 [updateCurrentTurn] Phase.playerIndex: ${currentPhase.playerIndex}`);

        this.checkForBotAutoAction(currentPhase);
        this.isMyTurn = this.checkIfMyTurn(currentPhase);

        console.log(`🎯 [updateCurrentTurn] Vez de: ${currentPhase.playerName || 'Jogador Desconhecido'}, É minha vez: ${this.isMyTurn}`);
        console.log(`🎯 [updateCurrentTurn] isMyTurn definido como: ${this.isMyTurn}`);
        console.log(`🎯 [updateCurrentTurn] currentPlayer:`, this.currentPlayer);
        
        // ✅ NOVO: Log detalhado para debug da ação 6
        if (this.session.currentAction === 5) { // Ação 6 (índice 5)
            console.log('🔍 [DEBUG AÇÃO 6] === DETALHES DA AÇÃO 6 ===');
            console.log('🔍 [DEBUG AÇÃO 6] currentPhase:', currentPhase);
            console.log('🔍 [DEBUG AÇÃO 6] currentPlayer:', this.currentPlayer);
            console.log('🔍 [DEBUG AÇÃO 6] isMyTurn:', this.isMyTurn);
            console.log('🔍 [DEBUG AÇÃO 6] Time do currentPlayer:', this.getPlayerTeam());
            console.log('🔍 [DEBUG AÇÃO 6] Time da fase:', currentPhase.team);
            console.log('🔍 [DEBUG AÇÃO 6] === FIM DOS DETALHES ===');
        }
        
        console.log(`🎯 [updateCurrentTurn] === FIM DA AÇÃO ${this.session.currentAction + 1} ===`);
        
        // ✅ NOVO: Forçar detecção de mudanças após atualizar isMyTurn
        this.cdr.markForCheck();
        
        // ✅ NOVO: Se é minha vez, abrir o modal automaticamente após um pequeno delay
        if (this.isMyTurn) {
            console.log('🎯 [updateCurrentTurn] É minha vez - agendando abertura do modal...');
            setTimeout(() => {
                // ✅ CORREÇÃO: Verificar se a sessão ainda é válida antes de abrir o modal
                if (this.isMyTurn && !this.showChampionModal && this.session && 
                    this.session.phase !== 'completed' && 
                    this.session.currentAction < this.session.phases.length) {
                    console.log('🎯 [updateCurrentTurn] Abrindo modal automaticamente...');
                    this.openChampionModal();
                }
            }, 100);
        }
        
        // ✅ NOVO: Log para verificar se está passando para a próxima ação
        console.log(`🎯 [updateCurrentTurn] Próxima ação será: ${this.session.currentAction + 1}`);
        if (this.session.currentAction + 1 < this.session.phases.length) {
            const nextPhase = this.session.phases[this.session.currentAction + 1];
            console.log(`🎯 [updateCurrentTurn] Próxima fase:`, nextPhase);
        }
    }

    private checkForBotAutoAction(phase: PickBanPhase) {
        if (!this.session) return;

        console.log(`🤖 [checkForBotAutoAction] === VERIFICANDO BOT PARA AÇÃO ${this.session.currentAction + 1} ===`);
        console.log(`🤖 [checkForBotAutoAction] Phase:`, phase);
        console.log(`🤖 [checkForBotAutoAction] Tipo de ação: ${phase.action} (${phase.action === 'pick' ? 'PICK' : 'BAN'})`);
        console.log(`🤖 [checkForBotAutoAction] Campeões disponíveis: ${this.champions.length}`);

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
            console.log(`🤖 [checkForBotAutoAction] Bot detectado para ${phase.action}, agendando ação automática...`);

            this.botPickTimer = this.botService.scheduleBotAction(
                phase,
                this.session,
                this.champions,
                () => {
                    // Callback executado após a ação do bot
                    console.log(`🤖 [checkForBotAutoAction] Ação do bot (${phase.action}) concluída, atualizando interface...`);
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

                    // Marcar para detecção de mudanças com OnPush
                    this.cdr.markForCheck();
                }
            );
            console.log(`🤖 [checkForBotAutoAction] Timer agendado: ${this.botPickTimer}`);
        } else {
            console.log(`🤖 [checkForBotAutoAction] Não é bot ou jogador não encontrado para ${phase.action}`);
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
        console.log('🎯 [checkIfMyTurn] === VERIFICANDO SE É MINHA VEZ ===');
        console.log('🎯 [checkIfMyTurn] currentPlayer:', this.currentPlayer);
        console.log('🎯 [checkIfMyTurn] phase:', phase);
        console.log('🎯 [checkIfMyTurn] phase.playerId:', phase.playerId);

        if (!this.currentPlayer) {
            console.log('❌ [checkIfMyTurn] currentPlayer é null/undefined');
            return false;
        }

        if (!phase.playerId) {
            console.log('❌ [checkIfMyTurn] phase.playerId é null/undefined');
            return false;
        }

        // ✅ NOVO: Verificar se o currentPlayer tem o formato correto
        const currentPlayerFormatted = this.currentPlayer.gameName && this.currentPlayer.tagLine
            ? `${this.currentPlayer.gameName}#${this.currentPlayer.tagLine}`
            : this.currentPlayer.summonerName || this.currentPlayer.name;

        console.log('🎯 [checkIfMyTurn] currentPlayer formatado para comparação:', currentPlayerFormatted);

        const isMyTurn = this.botService.comparePlayerWithId(this.currentPlayer, phase.playerId);

        console.log('🎯 [checkIfMyTurn] Resultado da comparação:', isMyTurn);
        console.log('🎯 [checkIfMyTurn] Detalhes da comparação:', {
            currentPlayerId: this.currentPlayer.id,
            currentPlayerName: this.currentPlayer.summonerName || this.currentPlayer.name,
            currentPlayerGameName: this.currentPlayer.gameName,
            currentPlayerTagLine: this.currentPlayer.tagLine,
            currentPlayerFormatted: currentPlayerFormatted,
            currentPlayerSummonerId: this.currentPlayer.summonerId,
            currentPlayerPuuid: this.currentPlayer.puuid,
            phasePlayerId: phase.playerId,
            phasePlayerName: phase.playerName,
            isMyTurn: isMyTurn
        });

        // ✅ NOVO: Log específico para ação 6
        if (this.session && this.session.currentAction === 5) {
            console.log('🔍 [DEBUG AÇÃO 6 - checkIfMyTurn] === DETALHES ESPECÍFICOS ===');
            console.log('🔍 [DEBUG AÇÃO 6 - checkIfMyTurn] currentPlayer:', this.currentPlayer);
            console.log('🔍 [DEBUG AÇÃO 6 - checkIfMyTurn] phase:', phase);
            console.log('🔍 [DEBUG AÇÃO 6 - checkIfMyTurn] isMyTurn:', isMyTurn);
            console.log('🔍 [DEBUG AÇÃO 6 - checkIfMyTurn] === FIM DOS DETALHES ===');
        }

        console.log('🎯 [checkIfMyTurn] === FIM DA VERIFICAÇÃO ===');

        return isMyTurn;
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

                // Com OnPush, precisamos marcar para detecção quando o timer muda
                this.cdr.markForCheck();
            } else {
                // Só executar timeout se não há ação de bot agendada
                if (!this.botPickTimer) {
                    this.handleTimeOut();
                } else {
                    console.log('⏰ [Timer] Timeout ignorado - bot já agendou ação');
                }
            }
        });
    }

    handleTimeOut() {
        if (!this.session) return;

        const currentPhase = this.session.phases[this.session.currentAction];
        if (!currentPhase) return;

        console.log('⏰ [handleTimeOut] === TIMEOUT EXECUTADO ===');
        console.log('⏰ [handleTimeOut] Fase atual:', currentPhase);
        console.log('⏰ [handleTimeOut] É minha vez?', this.isMyTurn);

        // ✅ CORREÇÃO: Executar ação automática para TODOS quando o timer acaba
        console.log('⏰ [handleTimeOut] Executando ação automática (timeout)');

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

        // Marcar para detecção de mudanças com OnPush
        this.cdr.markForCheck();
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

        // ✅ CORREÇÃO: Criar uma cópia do array para não modificar o original
        const playersCopy = [...players];

        const sortedPlayers = playersCopy.sort((a, b) => {
            const laneA = a.lane || 'unknown';
            const laneB = b.lane || 'unknown';

            const indexA = laneOrder.indexOf(laneA);
            const indexB = laneOrder.indexOf(laneB);

            if (indexA === -1 && indexB === -1) return 0;
            if (indexA === -1) return 1;
            if (indexB === -1) return -1;

            return indexA - indexB;
        });

        console.log('🎯 [sortPlayersByLane] Jogadores ordenados:', sortedPlayers.map((p, i) => ({
            index: i,
            teamIndex: p.teamIndex,
            name: p.summonerName,
            lane: p.lane
        })));

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

        // ✅ CORREÇÃO: Encontrar jogador pelo teamIndex em vez de posição no array
        const player = teamPlayers.find(p => p.teamIndex === pickIndex);

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

        // ✅ CORREÇÃO: Usar teamIndex diretamente em vez de ordenação por lane
        const teamPlayers = team === 'blue' ? this.session.blueTeam : this.session.redTeam;

        // Encontrar o jogador pelo ID ou nome
        const foundPlayer = teamPlayers.find(p => this.botService.comparePlayers(p, player));
        if (!foundPlayer) return null;

        // ✅ CORREÇÃO: Usar teamIndex do jogador encontrado
        const playerIndex = foundPlayer.teamIndex;

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
        console.log('🎯 [openChampionModal] === ABRINDO MODAL DE CAMPEÕES ===');
        console.log('🎯 [openChampionModal] isMyTurn:', this.isMyTurn);
        console.log('🎯 [openChampionModal] currentPlayer:', this.currentPlayer);
        console.log('🎯 [openChampionModal] session:', this.session);
        
        // ✅ CORREÇÃO: Verificar se a sessão está completada
        if (!this.session || this.session.phase === 'completed' || this.session.currentAction >= this.session.phases.length) {
            console.log('❌ [openChampionModal] Sessão completada ou inválida - não abrindo modal');
            return;
        }
        
        if (this.session) {
            const currentPhase = this.session.phases[this.session.currentAction];
            console.log('🎯 [openChampionModal] currentPhase:', currentPhase);
        }
        
        // ✅ CORREÇÃO: Garantir que o modal seja exibido
        this.showChampionModal = true;
        console.log('🎯 [openChampionModal] showChampionModal definido como true');
        
        // ✅ NOVO: Forçar detecção de mudanças
        this.cdr.markForCheck();
        
        console.log('🎯 [openChampionModal] === FIM DA ABERTURA DO MODAL ===');
    }

    openConfirmationModal(): void {
        console.log('🎯 [openConfirmationModal] Abrindo modal de confirmação');
        this.showConfirmationModal = true;
    }

    // MÉTODO PARA RECEBER SELEÇÃO DO MODAL
    onChampionSelected(champion: Champion): void {
        console.log('🎯 [onChampionSelected] === CAMPEÃO SELECIONADO ===');
        console.log('🎯 [onChampionSelected] Campeão selecionado:', champion.name);

        if (!this.session) {
            console.log('❌ [onChampionSelected] Session não existe');
            return;
        }

        const currentPhase = this.session.phases[this.session.currentAction];
        if (!currentPhase) {
            console.log('❌ [onChampionSelected] Fase atual não existe');
            return;
        }

        console.log('🎯 [onChampionSelected] Fase atual:', {
            currentAction: this.session.currentAction,
            team: currentPhase.team,
            action: currentPhase.action,
            playerIndex: currentPhase.playerIndex,
            playerId: currentPhase.playerId,
            playerName: currentPhase.playerName
        });

        // ✅ CORREÇÃO: Atualizar a fase corretamente
        currentPhase.champion = champion;
        currentPhase.locked = true;
        currentPhase.timeRemaining = 0;

        console.log('✅ [onChampionSelected] Fase atualizada com campeão:', champion.name);

        // ✅ CORREÇÃO: Invalidar cache IMEDIATAMENTE para forçar atualização da interface
        this.invalidateCache();
        
        // ✅ CORREÇÃO: Forçar detecção de mudanças ANTES de incrementar currentAction
        this.cdr.markForCheck();
        this.cdr.detectChanges();

        // ✅ CORREÇÃO: Incrementar currentAction
        this.session.currentAction++;

        console.log('✅ [onChampionSelected] currentAction incrementado para:', this.session.currentAction);

        // ✅ CORREÇÃO: Verificar se a sessão foi completada
        if (this.session.currentAction >= this.session.phases.length) {
            console.log('🎉 [onChampionSelected] Sessão completada!');
            this.session.phase = 'completed';
            this.stopTimer();
        } else {
            console.log('🔄 [onChampionSelected] Próxima ação:', this.session.currentAction);
            // ✅ CORREÇÃO: Atualizar o turno atual para mostrar o próximo jogador
            this.updateCurrentTurn();
        }

        // ✅ CORREÇÃO: Invalidar cache novamente após todas as mudanças
        this.invalidateCache();
        
        // ✅ CORREÇÃO: Forçar detecção de mudanças final
        this.cdr.markForCheck();
        this.cdr.detectChanges();

        console.log('✅ [onChampionSelected] Atualização completa - interface deve estar atualizada');
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
        // Se não há session, cache é inválido
        if (!this.session) return false;

        // Verificar se o cache expirou por tempo primeiro (mais rápido)
        const timeSinceLastAction = Date.now() - this._lastRealActionTime;
        const cacheExpired = Date.now() - this._lastCacheUpdate > this.CACHE_DURATION;

        if (cacheExpired && timeSinceLastAction > this.CACHE_DURATION) {
            return false;
        }

        // Só calcular hashes se o cache não expirou por tempo
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

        return true;
    }

    // Método otimizado para uso interno (não no template)
    private getSortedTeamByLaneInternal(team: 'blue' | 'red'): any[] {
        if (!this.session) return [];

        const teamPlayers = team === 'blue' ? this.session.blueTeam : this.session.redTeam;
        return this.sortPlayersByLane(teamPlayers);
    }

    // ✅ NOVO: Método para obter jogadores ordenados por lane para exibição
    getSortedTeamByLaneForDisplay(team: 'blue' | 'red'): any[] {
        if (!this.session) return [];

        const teamPlayers = team === 'blue' ? this.session.blueTeam : this.session.redTeam;
        
        // ✅ CORREÇÃO: Criar um mapeamento correto entre lane e teamIndex
        // Primeiro, criar um mapa de lane para teamIndex
        const laneToTeamIndexMap = new Map<string, number>();
        teamPlayers.forEach((player, index) => {
            const lane = player.lane || 'unknown';
            laneToTeamIndexMap.set(lane, player.teamIndex);
        });

        // Ordenar por lane
        const laneOrder = ['top', 'jungle', 'mid', 'adc', 'support'];
        const sortedPlayers = laneOrder
            .map(lane => {
                const teamIndex = laneToTeamIndexMap.get(lane);
                if (teamIndex !== undefined) {
                    return teamPlayers.find(p => p.teamIndex === teamIndex);
                }
                return null;
            })
            .filter(player => player !== null);
        
        return sortedPlayers;
    }

    // ✅ NOVO: Método para obter jogador por teamIndex
    getPlayerByTeamIndex(team: 'blue' | 'red', teamIndex: number): any {
        if (!this.session) return null;

        const teamPlayers = team === 'blue' ? this.session.blueTeam : this.session.redTeam;
        return teamPlayers.find(p => p.teamIndex === teamIndex) || null;
    }

    // ✅ NOVO: Método para obter jogador atual da fase
    getCurrentPhasePlayer(): any {
        if (!this.session) return null;

        const currentPhase = this.session.phases[this.session.currentAction];
        if (!currentPhase) return null;

        return this.getPlayerByTeamIndex(currentPhase.team, currentPhase.playerIndex || 0);
    }

    // ✅ NOVO: Método para forçar atualização do isMyTurn
    private forceUpdateMyTurn(): void {
        if (!this.session) return;

        const currentPhase = this.session.phases[this.session.currentAction];
        if (!currentPhase) return;

        const oldIsMyTurn = this.isMyTurn;
        this.isMyTurn = this.checkIfMyTurn(currentPhase);

        // Só logar se realmente mudou
        if (oldIsMyTurn !== this.isMyTurn) {
            console.log(`🔄 [forceUpdateMyTurn] isMyTurn mudou: ${oldIsMyTurn} -> ${this.isMyTurn}`);
        }

        // Forçar detecção de mudanças
        this.cdr.markForCheck();
    }

    // ✅ NOVO: Método para verificar se o currentPlayer mudou
    private checkCurrentPlayerChange(): void {
        // Se temos uma sessão ativa, forçar atualização do isMyTurn
        if (this.session && this.session.phase !== 'completed') {
            this.forceUpdateMyTurn();
        }
    }
} 