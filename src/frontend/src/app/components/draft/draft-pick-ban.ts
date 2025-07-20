import { Component, Input, Output, EventEmitter, OnInit, OnDestroy, ChangeDetectorRef, ChangeDetectionStrategy, OnChanges, SimpleChanges, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient, HttpClientModule } from '@angular/common/http';
import { ChampionService, Champion } from '../../services/champion.service';
import { BotService, PickBanPhase, CustomPickBanSession } from '../../services/bot.service';
import { DraftChampionModalComponent } from './draft-champion-modal';
import { DraftConfirmationModalComponent } from './draft-confirmation-modal';
import { interval, Subscription } from 'rxjs';
import { ApiService } from '../../services/api';

@Component({
    selector: 'app-draft-pick-ban',
    imports: [
        CommonModule,
        FormsModule,
        HttpClientModule,
        DraftChampionModalComponent,
        DraftConfirmationModalComponent
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

    // ✅ NOVO: Controle de modo de edição
    isEditingMode: boolean = false;
    editingPhaseIndex: number = -1;

    public timer: Subscription | null = null;
    public botPickTimer: number | null = null;
    private realTimeSyncTimer: number | null = null;
    private syncErrorCount: number = 0;

    @ViewChild('confirmationModal') confirmationModal!: DraftConfirmationModalComponent;
    private baseUrl: string;

    constructor(
        public championService: ChampionService,
        public botService: BotService,
        public cdr: ChangeDetectorRef,
        private http: HttpClient,
        private apiService: ApiService
    ) {
        this.baseUrl = this.apiService.getBaseUrl();
    }

    ngOnInit() {
        console.log('🚀 [DraftPickBan] ngOnInit iniciado');
        console.log('🚀 [DraftPickBan] currentPlayer recebido:', this.currentPlayer);
        console.log('🚀 [DraftPickBan] currentPlayer detalhes:', {
            id: this.currentPlayer?.id,
            summonerName: this.currentPlayer?.summonerName,
            name: this.currentPlayer?.name,
            gameName: this.currentPlayer?.gameName,
            tagLine: this.currentPlayer?.tagLine,
            displayName: this.currentPlayer?.displayName
        });
        console.log('🚀 [DraftPickBan] matchData recebido:', this.matchData);

        this.loadChampions().then(() => {
            this.initializePickBanSession();
        });

        // ✅ NOVO: Iniciar polling automático de sincronização
        this.startAutoSync();
    }

    ngOnDestroy() {
        if (this.timer) {
            this.timer.unsubscribe();
        }
        if (this.botPickTimer) {
            this.botService.cancelScheduledAction(this.botPickTimer);
        }
        if (this.realTimeSyncTimer) {
            clearInterval(this.realTimeSyncTimer);
            console.log('🔄 [DraftPickBan] Timer de sincronização automática limpo');
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
        }

        if (changes['currentPlayer']) {
            console.log('🔄 [DraftPickBan] currentPlayer mudou:', {
                previousValue: changes['currentPlayer'].previousValue,
                currentValue: changes['currentPlayer'].currentValue,
                firstChange: changes['currentPlayer'].firstChange
            });
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

        const processTeamData = (teamData: any[], isRedTeam: boolean = false): any[] => {
            console.log('🔄 [DraftPickBan] Processando teamData:', teamData, 'isRedTeam:', isRedTeam);

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
                        secondaryLane: player.secondaryLane,
                        teamIndex: player.teamIndex
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

                    // ✅ CORREÇÃO: Usar teamIndex do jogador se disponível, senão calcular baseado no time
                    let teamIndex = player.teamIndex;
                    if (teamIndex === undefined) {
                        teamIndex = isRedTeam ? index + 5 : index; // Time vermelho: 5-9, Time azul: 0-4
                    }

                    console.log(`🎯 [DraftPickBan] Lane final para jogador [${index}]: ${lane} (original: ${player.assignedLane}, fallback: ${this.getLaneForIndex(index)})`);
                    console.log(`🎯 [DraftPickBan] TeamIndex para jogador [${index}]: ${teamIndex} (isRedTeam: ${isRedTeam})`);

                    const processedPlayer = {
                        ...player,
                        summonerName: summonerName,
                        name: summonerName, // Manter compatibilidade
                        id: player.id || player.summonerId || Math.random().toString(),
                        lane: lane, // Usar lane baseada no índice para garantir ordem
                        originalIndex: index, // ✅ CORREÇÃO: Manter índice original do array
                        teamIndex: teamIndex // ✅ CORREÇÃO: Índice específico do time (0-4 para azul, 5-9 para vermelho)
                    };

                    console.log(`✅ [DraftPickBan] Jogador processado [${index}]:`, processedPlayer);
                    return processedPlayer;
                }

                // Se é string, criar objeto básico
                const playerName = player.toString();
                const teamIndex = isRedTeam ? index + 5 : index; // Time vermelho: 5-9, Time azul: 0-4
                const processedPlayer = {
                    id: playerName,
                    name: playerName,
                    summonerName: playerName,
                    lane: this.getLaneForIndex(index), // Fallback apenas para strings
                    originalIndex: index, // ✅ CORREÇÃO: Manter índice original
                    teamIndex: teamIndex // ✅ CORREÇÃO: Índice específico do time
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

        const processedBlueTeam = processTeamData(blueTeamData, false); // Time azul: índices 0-4
        const processedRedTeam = processTeamData(redTeamData, true);   // Time vermelho: índices 5-9

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

        console.log('✅ [DraftPickBan] Sessão criada:', {
            id: this.session.id,
            blueTeamSize: this.session.blueTeam.length,
            redTeamSize: this.session.redTeam.length,
            phasesCount: this.session.phases.length,
            currentAction: this.session.currentAction
        });

        // ✅ NOVO: Carregar dados do MySQL para sincronizar picks e bans existentes
        console.log('🔄 [DraftPickBan] Carregando dados do MySQL para sincronização inicial...');
        this.forceMySQLSync();

        // ✅ NOVO: Iniciar polling frequente para detectar mudanças em tempo real
        // this.startRealTimeSync();
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
        // Para o time vermelho, mapear playerIndex 0-4 para teamIndex 5-9
        let playerIndex = currentPhase.playerIndex ?? 0;

        // Buscar o jogador correto baseado no teamIndex
        const targetTeamIndex = currentPhase.team === 'red' ? playerIndex + 5 : playerIndex;
        const player = teamPlayers.find(p => p.teamIndex === targetTeamIndex);

        if (!player) {
            console.error(`❌ [updateCurrentTurn] Jogador não encontrado no time ${currentPhase.team} com teamIndex ${targetTeamIndex}`);
            console.error(`❌ [updateCurrentTurn] Jogadores disponíveis:`, teamPlayers.map(p => ({ name: p.summonerName, teamIndex: p.teamIndex })));
            return;
        }

        console.log(`🎯 [updateCurrentTurn] Jogador encontrado no time ${currentPhase.team}: teamIndex ${targetTeamIndex} = ${player.summonerName}`);

        console.log(`🎯 [updateCurrentTurn] PlayerIndex da fase: ${playerIndex}, TargetTeamIndex: ${targetTeamIndex}`);
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
        console.log(`🎯 [updateCurrentTurn] Índice do jogador: ${playerIndex} -> teamIndex: ${player.teamIndex} (target: ${targetTeamIndex})`);
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

        // ✅ CORRIGIDO: Apenas marcar para detecção, sem forçar detectChanges imediatamente
        this.cdr.markForCheck();

        // ✅ NOVO: Se é minha vez, abrir o modal automaticamente após um pequeno delay
        if (this.isMyTurn && !this.isEditingMode) {
            console.log('🎯 [updateCurrentTurn] É minha vez - agendando abertura do modal...');
            setTimeout(() => {
                // ✅ CORREÇÃO: Verificar se a sessão ainda é válida antes de abrir o modal
                if (this.isMyTurn && !this.showChampionModal && this.session &&
                    this.session.phase !== 'completed' &&
                    this.session.currentAction < this.session.phases.length &&
                    !this.isEditingMode) {
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

        // ✅ NOVO: Log detalhado do currentPlayer
        console.log(`🤖 [checkForBotAutoAction] currentPlayer recebido:`, this.currentPlayer);
        console.log(`🤖 [checkForBotAutoAction] currentPlayer detalhes:`, {
            id: this.currentPlayer?.id,
            summonerName: this.currentPlayer?.summonerName,
            name: this.currentPlayer?.name,
            gameName: this.currentPlayer?.gameName,
            tagLine: this.currentPlayer?.tagLine,
            displayName: this.currentPlayer?.displayName
        });

        // Cancelar ação anterior se existir
        if (this.botPickTimer) {
            console.log(`🤖 [checkForBotAutoAction] Cancelando timer anterior: ${this.botPickTimer}`);
            this.botService.cancelScheduledAction(this.botPickTimer);
            this.botPickTimer = null;
        }

        // Verificar se deve executar ação de bot
        const shouldPerformAction = this.botService.shouldPerformBotAction(phase, this.session, this.currentPlayer);
        console.log(`🤖 [checkForBotAutoAction] shouldPerformBotAction retornou: ${shouldPerformAction}`);

        if (shouldPerformAction) {
            console.log(`🤖 [checkForBotAutoAction] Bot detectado para ${phase.action}, agendando ação automática...`);

            this.botPickTimer = this.botService.scheduleBotAction(
                phase,
                this.session,
                this.champions,
                async () => {
                    // Callback executado após a ação do bot
                    console.log(`🤖 [checkForBotAutoAction] Ação do bot (${phase.action}) concluída, sincronizando com MySQL...`);
                    console.log(`🤖 [checkForBotAutoAction] currentAction após bot: ${this.session?.currentAction}`);
                    console.log(`🤖 [checkForBotAutoAction] total de fases: ${this.session?.phases.length}`);

                    // ✅ NOVO: SEMPRE enviar ação de bot para backend (MySQL) se eu for special user
                    // Buscar a fase que acabou de ser completada (currentAction - 1)
                    if (this.session && this.session.currentAction > 0 && this.matchData?.id) {
                        const completedPhase = this.session.phases[this.session.currentAction - 1];
                        if (completedPhase && completedPhase.champion) {
                            console.log('🤖 [checkForBotAutoAction] Enviando ação de bot para MySQL (special user)');
                            console.log('🤖 [checkForBotAutoAction] Detalhes da ação:', {
                                champion: completedPhase.champion.name,
                                action: completedPhase.action,
                                matchId: this.matchData.id,
                                isSpecialUser: this.currentPlayer?.summonerName === 'popcorn seller'
                            });

                            try {
                                await this.sendDraftActionToBackend(completedPhase.champion, completedPhase.action);
                                console.log('✅ [checkForBotAutoAction] Ação de bot enviada para MySQL com sucesso');

                                // ✅ CORREÇÃO: Aguardar menos tempo e forçar sincronização com MySQL
                                setTimeout(async () => {
                                    this.forceInterfaceUpdate();
                                    this.forceMySQLSync();

                                    // ✅ NOVO: Notificar backend sobre sincronização
                                    await this.notifyBackendSync();

                                    console.log('🔄 [checkForBotAutoAction] Sincronização forçada após ação de bot');
                                }, 200);

                            } catch (error) {
                                console.error('❌ [checkForBotAutoAction] Erro ao enviar ação de bot para MySQL:', error);
                            }
                        }
                    }

                    if (this.session && this.session.currentAction >= this.session.phases.length) {
                        console.log('🤖 [checkForBotAutoAction] Sessão completada pelo bot');
                        this.session.phase = 'completed';
                        this.stopTimer();
                    } else {
                        console.log('🤖 [checkForBotAutoAction] Continuando para próxima ação...');
                        this.updateCurrentTurn();
                    }

                    // ✅ CORREÇÃO: Atualizar interface após sincronização
                    this.forceInterfaceUpdate();

                    console.log('✅ [checkForBotAutoAction] Interface atualizada após ação do bot');
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
            console.log('🔍 [DEBUG AÇÃO 6 - checkIfMyTurn] === DETALHES ESPECÍFICAS ===');
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

        // ✅ CORREÇÃO: Auto-pick/ban para o jogador atual usando o BotService
        // O BotService já configura a fase e incrementa currentAction
        this.botService.performBotAction(currentPhase, this.session, this.champions);

        // ✅ NOVO: SEMPRE enviar ação de timeout para backend (MySQL) se eu for special user
        if (currentPhase.champion && this.matchData?.id) {
            console.log('⏰ [handleTimeOut] Enviando ação de timeout para MySQL (special user)');
            console.log('⏰ [handleTimeOut] Detalhes da ação:', {
                champion: currentPhase.champion.name,
                action: currentPhase.action,
                matchId: this.matchData.id,
                isSpecialUser: this.currentPlayer?.summonerName === 'popcorn seller'
            });

            this.sendDraftActionToBackend(currentPhase.champion, currentPhase.action).then(() => {
                console.log('✅ [handleTimeOut] Ação de timeout enviada para MySQL com sucesso');

                // ✅ CORREÇÃO: Aguardar menos tempo e forçar sincronização com MySQL
                setTimeout(() => {
                    this.forceInterfaceUpdate();
                    this.forceMySQLSync();
                    console.log('🔄 [handleTimeOut] Sincronização forçada após timeout');
                }, 200);

            }).catch(error => {
                console.error('❌ [handleTimeOut] Erro ao enviar timeout para MySQL:', error);
            });
        }

        if (this.session.currentAction >= this.session.phases.length) {
            this.session.phase = 'completed';
            this.stopTimer();
        } else {
            this.updateCurrentTurn();
        }

        // ✅ CORRIGIDO: Uma única atualização da interface no final
        this.forceInterfaceUpdate();

        console.log('✅ [handleTimeOut] Interface atualizada após timeout');
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

    getBannedChampions(): Champion[] {
        // ✅ CORREÇÃO: Não usar cache para garantir atualização em tempo real
        if (!this.session) return [];

        const bannedChampions = this.session.phases
            .filter(phase => phase.action === 'ban' && phase.champion && phase.locked)
            .map(phase => phase.champion!)
            .filter((champion, index, self) =>
                index === self.findIndex(c => c.id === champion.id)
            );

        return bannedChampions;
    }

    getTeamPicks(team: 'blue' | 'red'): Champion[] {
        // ✅ CORREÇÃO: Não usar cache para garantir atualização em tempo real
        if (!this.session) return [];

        const teamPicks = this.session.phases
            .filter(phase => phase.team === team && phase.action === 'pick' && phase.champion && phase.locked)
            .map(phase => phase.champion!);

        return teamPicks;
    }

    getSortedTeamByLane(team: 'blue' | 'red'): any[] {
        if (!this.session) {
            return [];
        }

        const teamPlayers = team === 'blue' ? this.session.blueTeam : this.session.redTeam;
        const sortedPlayers = this.sortPlayersByLane(teamPlayers);

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
        // ✅ CORREÇÃO: Não usar cache para garantir atualização em tempo real
        if (!this.session) return [];

        return this.session.phases
            .filter(phase => phase.team === team && phase.action === 'ban' && phase.champion && phase.locked)
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

        // ✅ CORREÇÃO: Usar dados reais das fases em vez de lógica de posição
        const teamPlayers = team === 'blue' ? this.session.blueTeam : this.session.redTeam;

        // Encontrar o jogador pelo ID ou nome
        const foundPlayer = teamPlayers.find(p => this.botService.comparePlayers(p, player));
        if (!foundPlayer) return null;

        // ✅ NOVO: Buscar pick diretamente nas fases baseado no nome do jogador
        const playerName = foundPlayer.summonerName || foundPlayer.name;

        console.log(`🔍 [getPlayerPick] Buscando pick para ${team} team player:`, {
            playerName: playerName,
            teamIndex: foundPlayer.teamIndex,
            lane: foundPlayer.lane
        });

        // ✅ CORREÇÃO: Buscar nas fases de pick pelo nome do jogador
        const pickPhases = this.session.phases.filter(phase =>
            phase.action === 'pick' &&
            phase.team === team &&
            phase.champion &&
            phase.locked
        );

        console.log(`🔍 [getPlayerPick] Fases de pick encontradas para time ${team}:`,
            pickPhases.map(p => ({
                playerName: p.playerName,
                playerId: p.playerId,
                champion: p.champion?.name
            }))
        );

        // Buscar pick que corresponde ao jogador
        for (const pickPhase of pickPhases) {
            // Comparar usando o mesmo método do BotService
            const phasePlayerName = pickPhase.playerName || pickPhase.playerId || '';

            // Verificar se é o mesmo jogador
            if (phasePlayerName === playerName ||
                pickPhase.playerId === playerName ||
                this.botService.comparePlayerWithId(foundPlayer, pickPhase.playerId || '')) {

                console.log(`✅ [getPlayerPick] Pick encontrado para ${playerName}: ${pickPhase.champion?.name}`);
                return pickPhase.champion || null;
            }
        }

        console.log(`❌ [getPlayerPick] Nenhum pick encontrado para ${playerName} no time ${team}`);
        return null;
    }

    getCurrentPlayerName(): string {
        // ✅ CORREÇÃO: Sempre retornar o nome atualizado sem cache
        if (!this.session) return '';

        const currentPhase = this.session.phases[this.session.currentAction];
        if (!currentPhase) return '';

        // ✅ CORREÇÃO: Garantir que o nome seja atualizado corretamente
        return currentPhase.playerName || currentPhase.playerId || 'Jogador Desconhecido';
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
        // ✅ ATUALIZADO: Usar BotService que já foi atualizado para o novo padrão
        return this.botService.isBot(player);
    }

    onImageError(event: any, champion: Champion): void {
        event.target.src = 'assets/images/champion-placeholder.svg';
    }

    // MÉTODOS PARA COMUNICAÇÃO COM OS MODAIS
    openChampionModal(): void {
        console.log('🎯 [openChampionModal] === ABRINDO MODAL DE CAMPEÕES ===');
        console.log('🎯 [openChampionModal] isMyTurn:', this.isMyTurn);
        console.log('🎯 [openChampionModal] isEditingMode:', this.isEditingMode);
        console.log('🎯 [openChampionModal] showChampionModal atual:', this.showChampionModal);
        console.log('🎯 [openChampionModal] currentPlayer:', this.currentPlayer);
        console.log('🎯 [openChampionModal] session:', this.session);

        // ✅ CORREÇÃO: Verificar se a sessão está completada (exceto em modo de edição)
        if (!this.session) {
            console.log('❌ [openChampionModal] Session não existe - não abrindo modal');
            return;
        }

        // ✅ CORREÇÃO: Permitir abertura em modo de edição mesmo se sessão estiver "completed"
        if (!this.isEditingMode && (this.session.phase === 'completed' || this.session.currentAction >= this.session.phases.length)) {
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

        // ✅ CORRIGIDO: Apenas marcar para detecção, sem detectChanges direto
        this.cdr.markForCheck();

        console.log('🎯 [openChampionModal] === FIM DA ABERTURA DO MODAL ===');
    }

    openConfirmationModal(): void {
        console.log('🎯 [openConfirmationModal] === ABRINDO MODAL DE CONFIRMAÇÃO ===');
        console.log('🎯 [openConfirmationModal] currentPlayer:', this.currentPlayer);
        console.log('🎯 [openConfirmationModal] session:', this.session);
        console.log('🎯 [openConfirmationModal] session.phase:', this.session?.phase);

        this.showConfirmationModal = true;
        this.cdr.markForCheck();
    }

    // ✅ NOVO: Método para lidar com solicitação de edição do modal de confirmação
    onEditRequested(editData: { playerId: string, phaseIndex: number }): void {
        console.log('🎯 [onEditRequested] === SOLICITAÇÃO DE EDIÇÃO RECEBIDA ===');
        console.log('🎯 [onEditRequested] editData:', editData);
        console.log('🎯 [onEditRequested] currentPlayer:', this.currentPlayer);
        console.log('🎯 [onEditRequested] session.currentAction:', this.session?.currentAction);
        console.log('🎯 [onEditRequested] session.phase:', this.session?.phase);

        if (!this.session) {
            console.log('❌ [onEditRequested] Session não existe');
            return;
        }

        // Verificar se o jogador que está editando é o currentPlayer
        const phaseToEdit = this.session.phases[editData.phaseIndex];
        if (!phaseToEdit) {
            console.log('❌ [onEditRequested] Fase não encontrada para índice:', editData.phaseIndex);
            console.log('❌ [onEditRequested] Total de fases:', this.session.phases.length);
            return;
        }

        console.log('🎯 [onEditRequested] Fase encontrada:', {
            phaseIndex: editData.phaseIndex,
            team: phaseToEdit.team,
            action: phaseToEdit.action,
            playerId: phaseToEdit.playerId,
            playerName: phaseToEdit.playerName,
            champion: phaseToEdit.champion?.name,
            locked: phaseToEdit.locked
        });

        // Verificar se é o jogador atual tentando editar
        const isCurrentPlayerEdit = this.botService.comparePlayerWithId(this.currentPlayer, editData.playerId);
        console.log('🎯 [onEditRequested] Verificação de jogador:', {
            currentPlayerId: this.currentPlayer?.id,
            currentPlayerName: this.currentPlayer?.summonerName || this.currentPlayer?.name,
            editPlayerId: editData.playerId,
            phasePlayerId: phaseToEdit.playerId,
            isCurrentPlayerEdit: isCurrentPlayerEdit
        });

        if (!isCurrentPlayerEdit) {
            console.log('❌ [onEditRequested] Apenas o próprio jogador pode editar seu pick');
            return;
        }

        console.log('✅ [onEditRequested] Configurando edição para fase:', {
            phaseIndex: editData.phaseIndex,
            playerId: editData.playerId,
            currentChampion: phaseToEdit.champion?.name,
            action: phaseToEdit.action
        });

        // ✅ CORREÇÃO: Configurar modo de edição
        this.isEditingMode = true;
        this.editingPhaseIndex = editData.phaseIndex;

        // ✅ CORREÇÃO: Configurar o currentAction para a fase que está sendo editada
        this.session.currentAction = editData.phaseIndex;

        // ✅ CORREÇÃO: Resetar a fase para permitir nova seleção
        phaseToEdit.champion = undefined;
        phaseToEdit.locked = false;
        phaseToEdit.timeRemaining = 30;

        // Fechar modal de confirmação
        this.showConfirmationModal = false;

        console.log('🎯 [onEditRequested] Estado após configuração:', {
            isEditingMode: this.isEditingMode,
            editingPhaseIndex: this.editingPhaseIndex,
            sessionCurrentAction: this.session.currentAction,
            showConfirmationModal: this.showConfirmationModal,
            showChampionModal: this.showChampionModal
        });

        // Forçar atualização da interface
        this.forceInterfaceUpdate();

        // Atualizar o turno atual para mostrar o jogador correto
        this.updateCurrentTurn();

        // ✅ CORREÇÃO: Abrir modal de seleção de campeões para edição com delay maior
        setTimeout(() => {
            console.log('🎯 [onEditRequested] === TENTANDO ABRIR MODAL DE EDIÇÃO ===');
            console.log('🎯 [onEditRequested] isEditingMode:', this.isEditingMode);
            console.log('🎯 [onEditRequested] showChampionModal:', this.showChampionModal);
            console.log('🎯 [onEditRequested] session.phase:', this.session?.phase);
            console.log('🎯 [onEditRequested] session.currentAction:', this.session?.currentAction);

            if (this.isEditingMode && !this.showChampionModal) {
                console.log('🎯 [onEditRequested] Abrindo modal de edição...');
                this.openChampionModal();
            } else {
                console.log('❌ [onEditRequested] Condições não atendidas para abrir modal:', {
                    isEditingMode: this.isEditingMode,
                    showChampionModal: this.showChampionModal
                });
            }
        }, 200);

        console.log('🎯 [onEditRequested] === FIM DA CONFIGURAÇÃO DE EDIÇÃO ===');
    }

    // MÉTODO PARA RECEBER SELEÇÃO DO MODAL
    async onChampionSelected(champion: Champion): Promise<void> {
        console.log('🎯 [onChampionSelected] === CAMPEÃO SELECIONADO ===');
        console.log('🎯 [onChampionSelected] Campeão selecionado:', champion.name);
        console.log('🎯 [onChampionSelected] Detalhes completos do campeão:', {
            id: champion.id,
            name: champion.name,
            key: champion.key,
            title: champion.title
        });

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

        // ✅ CORREÇÃO: Atualizar a fase COMPLETAMENTE antes de qualquer detecção de mudanças
        currentPhase.champion = champion;
        currentPhase.locked = true;
        currentPhase.timeRemaining = 0;

        console.log('✅ [onChampionSelected] Fase atualizada com campeão:', champion.name);

        // ✅ CORREÇÃO: Fechar modal imediatamente para evitar interferência
        this.showChampionModal = false;

        // ✅ CORREÇÃO: ENVIAR PARA MYSQL APENAS UMA VEZ
        if (this.matchData?.id) {
            console.log('🎯 [onChampionSelected] Enviando ação para MySQL (única chamada)');
            console.log('🎯 [onChampionSelected] Detalhes da ação:', {
                champion: champion.name,
                championId: champion.id,
                action: currentPhase.action,
                playerName: this.currentPlayer?.summonerName || this.currentPlayer?.name,
                isBot: this.currentPlayer ? this.botService.isBot(this.currentPlayer) : false,
                isSpecialUser: this.currentPlayer ? this.currentPlayer.summonerName === 'popcorn seller' : false,
                matchId: this.matchData.id,
                reasoning: 'Ação única - sem duplicação'
            });

            try {
                await this.sendDraftActionToBackend(champion, currentPhase.action);
                console.log('✅ [onChampionSelected] Ação enviada para MySQL com sucesso');
            } catch (error) {
                console.error('❌ [onChampionSelected] Erro ao enviar para MySQL:', error);
                // Não interromper o fluxo local por erro de backend
            }
        } else {
            console.log('⚠️ [onChampionSelected] matchData.id não disponível - não enviando para MySQL');
        }

        // ✅ CORREÇÃO: Verificar se estamos em modo de edição ANTES de incrementar currentAction
        if (this.isEditingMode) {
            console.log('🎯 [Draft] Modo de edição - voltando para modal de confirmação');
            console.log('🎯 [Draft] Fase editada com sucesso:', {
                phaseIndex: this.editingPhaseIndex,
                newChampion: champion.name,
                currentAction: this.session.currentAction
            });

            // Resetar modo de edição
            this.isEditingMode = false;
            this.editingPhaseIndex = -1;

            // Voltar para o final do draft (SEM incrementar currentAction)
            this.session.currentAction = this.session.phases.length;
            this.session.phase = 'completed';

            // Forçar atualização
            this.forceInterfaceUpdate();

            // Abrir modal de confirmação após um pequeno delay
            setTimeout(() => {
                console.log('🔄 [Draft] Abrindo modal de confirmação após edição');
                console.log('🔄 [Draft] Session antes de abrir modal:', {
                    currentAction: this.session?.currentAction,
                    phase: this.session?.phase,
                    totalPhases: this.session?.phases.length
                });

                // ✅ NOVO: Forçar atualização do modal antes de abrir
                if (this.confirmationModal) {
                    console.log('🔄 [Draft] Forçando refresh do modal de confirmação');
                    this.confirmationModal.forceRefresh();
                }

                this.openConfirmationModal();
            }, 200);

            console.log('✅ [Draft] Voltando para modal de confirmação após edição');
            return;
        }

        // ✅ CORREÇÃO: Incrementar currentAction APENAS se NÃO estamos em modo de edição
        this.session.currentAction++;
        console.log('✅ [Draft] currentAction incrementado para:', this.session.currentAction);

        // ✅ CORREÇÃO: Verificar se a sessão foi completada (modo normal)
        if (this.session.currentAction >= this.session.phases.length) {
            console.log('🎉 [Draft] Sessão completada!');
            this.session.phase = 'completed';
            this.stopTimer();
        } else {
            console.log('🔄 [Draft] Próxima ação:', this.session.currentAction);
            // ✅ CORREÇÃO: Atualizar o turno atual para mostrar o próximo jogador
            this.updateCurrentTurn();
        }

        // ✅ CORREÇÃO: Forçar atualização final da interface
        this.forceInterfaceUpdate();

        console.log('✅ [Draft] Atualização completa - interface deve estar atualizada');
    }

    private stopTimer() {
        if (this.timer) {
            this.timer.unsubscribe();
            this.timer = null;
        }
    }

    // ✅ NOVO: Método para obter jogadores ordenados por lane para exibição
    getSortedTeamByLaneForDisplay(team: 'blue' | 'red'): any[] {
        if (!this.session) {
            console.warn('⚠️ [getSortedTeamByLaneForDisplay] Session não disponível');
            return [];
        }

        const teamPlayers = team === 'blue' ? this.session.blueTeam : this.session.redTeam;

        // ✅ CORREÇÃO: Verificar se teamPlayers existe e é array
        if (!teamPlayers || !Array.isArray(teamPlayers)) {
            console.warn(`⚠️ [getSortedTeamByLaneForDisplay] TeamPlayers inválido para time ${team}:`, teamPlayers);
            return [];
        }

        if (teamPlayers.length === 0) {
            console.warn(`⚠️ [getSortedTeamByLaneForDisplay] Nenhum jogador encontrado para time ${team}`);
            return [];
        }

        // ✅ CORREÇÃO: Usar método de ordenação por lane existente
        try {
            const sortedPlayers = this.sortPlayersByLane([...teamPlayers]);
            console.log(`✅ [getSortedTeamByLaneForDisplay] Time ${team} ordenado:`,
                sortedPlayers.map(p => ({ name: p.summonerName, lane: p.lane, teamIndex: p.teamIndex })));
            return sortedPlayers;
        } catch (error) {
            console.error(`❌ [getSortedTeamByLaneForDisplay] Erro ao ordenar time ${team}:`, error);
            return [];
        }
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

        // ✅ CORREÇÃO: Calcular teamIndex correto baseado no team e playerIndex
        const playerIndex = currentPhase.playerIndex || 0;
        const targetTeamIndex = currentPhase.team === 'red' ? playerIndex + 5 : playerIndex;

        const teamPlayers = currentPhase.team === 'blue' ? this.session.blueTeam : this.session.redTeam;
        return teamPlayers.find(p => p.teamIndex === targetTeamIndex) || null;
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

    // ✅ NOVO: Método para forçar atualização completa da interface
    private forceInterfaceUpdate(): void {
        // Marcar para detecção de mudanças uma única vez
        this.cdr.markForCheck();

        // ✅ REMOVIDO: setTimeout recursivo que causava stack overflow
        // Apenas uma marcação de mudança é suficiente com OnPush
        console.log('🔄 [forceInterfaceUpdate] Interface marcada para atualização');
    }

    // ✅ Métodos para substituir os pipes removidos
    getLaneDisplay(lane: string): string {
        const laneNames: { [key: string]: string } = {
            'top': 'Topo',
            'jungle': 'Selva',
            'mid': 'Meio',
            'bot': 'Atirador',
            'adc': 'Atirador',
            'support': 'Suporte',
            'fill': 'Qualquer'
        };
        return laneNames[lane?.toLowerCase()] || lane || 'Qualquer';
    }

    getCurrentPhaseText(session: any): string {
        if (!session) return 'Aguardando...';

        const phase = session.phases?.[session.currentAction];
        if (!phase) return 'Aguardando...';

        const teamName = phase.team === 'team1' ? 'Time Azul' : 'Time Vermelho';
        const actionText = phase.action === 'pick' ? 'escolhendo' : 'banindo';

        return `${teamName} ${actionText}`;
    }

    getPhaseProgress(session: any): number {
        if (!session || !session.phases) return 0;

        const totalPhases = session.phases.length;
        const currentPhase = session.currentAction;

        if (totalPhases === 0) return 0;

        return Math.round((currentPhase / totalPhases) * 100);
    }

    // ✅ OTIMIZADO: Método para enviar ação de draft para o backend com latência baixa
    private async sendDraftActionToBackend(champion: Champion, action: 'pick' | 'ban'): Promise<void> {
        if (!this.session || !this.matchData || !this.currentPlayer?.summonerName) {
            return;
        }

        const playerId = this.currentPlayer.summonerName;
        const requestKey = `${this.matchData.id}-${playerId}-${champion.id}-${action}`;

        // ✅ OTIMIZADO: Evitar duplicação
        if ((this as any).sentRequests?.has(requestKey)) {
            return;
        }

        if (!(this as any).sentRequests) {
            (this as any).sentRequests = new Set();
        }
        (this as any).sentRequests.add(requestKey);

        const requestData = {
            matchId: this.matchData.id,
            playerId: playerId,
            championId: parseInt(champion.id),
            action: action
        };

        try {
            const url = `${this.baseUrl}/match/draft-action`;

            // ✅ OTIMIZADO: Requisição HTTP com timeout baixo
            const response = await this.http.post(url, requestData, {
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                }
            }).toPromise();

            console.log(`✅ [Draft] Ação ${action} enviada: ${champion.name}`);
            (this as any).sentRequests.delete(requestKey);

        } catch (error: any) {
            console.error('❌ [Draft] Erro ao enviar ação:', error);
            (this as any).sentRequests.delete(requestKey);
        }
    }

    // ✅ NOVO: Método para obter bans de um jogador específico
    getPlayerBans(team: 'blue' | 'red', player: any): Champion[] {
        if (!this.session) return [];

        const teamPlayers = team === 'blue' ? this.session.blueTeam : this.session.redTeam;

        // Encontrar o jogador pelo ID ou nome
        const foundPlayer = teamPlayers.find(p => this.botService.comparePlayers(p, player));
        if (!foundPlayer) return [];

        const playerName = foundPlayer.summonerName || foundPlayer.name;

        console.log(`🔍 [getPlayerBans] Buscando bans para ${team} team player:`, {
            playerName: playerName,
            teamIndex: foundPlayer.teamIndex,
            lane: foundPlayer.lane
        });

        // ✅ CORREÇÃO: Buscar nas fases de ban pelo nome do jogador
        const banPhases = this.session.phases.filter(phase =>
            phase.action === 'ban' &&
            phase.team === team &&
            phase.champion &&
            phase.locked
        );

        const playerBans: Champion[] = [];

        // Buscar bans que correspondem ao jogador
        for (const banPhase of banPhases) {
            const phasePlayerName = banPhase.playerName || banPhase.playerId || '';

            // Verificar se é o mesmo jogador
            if (phasePlayerName === playerName ||
                banPhase.playerId === playerName ||
                this.botService.comparePlayerWithId(foundPlayer, banPhase.playerId || '')) {

                if (banPhase.champion) {
                    playerBans.push(banPhase.champion);
                    console.log(`✅ [getPlayerBans] Ban encontrado para ${playerName}: ${banPhase.champion.name}`);
                }
            }
        }

        console.log(`🔍 [getPlayerBans] Total de bans para ${playerName}: ${playerBans.length}`);
        return playerBans;
    }

    // ✅ SIMPLIFICADO: Sincronização com backend
    handleDraftDataSync(data: any): void {
        console.log('🔄 [DraftPickBan] Recebendo sincronização de dados:', data);

        if (!this.session) {
            console.log('⚠️ [DraftPickBan] Sincronização ignorada - sessão não inicializada');
            return;
        }

        // ✅ SIMPLIFICADO: Aceitar dados mesmo se pickBanData for vazio (draft inicial)
        if (!data.pickBanData && data.totalActions === 0) {
            console.log('⚠️ [DraftPickBan] Sincronização ignorada - dados inválidos');
            return;
        }

        // ✅ SIMPLIFICADO: Não sincronizar se o modal estiver aberto
        if (this.showChampionModal) {
            console.log('⚠️ [DraftPickBan] Modal aberto - ignorando sincronização para evitar interferência');
            return;
        }

        // ✅ SIMPLIFICADO: Verificar se realmente há mudanças antes de processar
        const currentTotalActions = this.session.phases?.filter(p => p.locked).length || 0;
        const newTotalActions = data.totalActions || 0;

        console.log('🔄 [DraftPickBan] Comparando ações:', {
            currentTotalActions,
            newTotalActions,
            hasPickBanData: !!data.pickBanData,
            actionsCount: data.pickBanData?.actions?.length || 0
        });

        if (currentTotalActions === newTotalActions && newTotalActions > 0) {
            console.log('🔄 [DraftPickBan] Nenhuma mudança detectada - ignorando sincronização');
            return;
        }

        // ✅ SIMPLIFICADO: Só sincronizar se houver mais ações no MySQL (não menos)
        if (newTotalActions < currentTotalActions && newTotalActions > 0) {
            console.log('🔄 [DraftPickBan] Ignorando sincronização - temos mais ações localmente');
            return;
        }

        console.log('🔄 [DraftPickBan] Aplicando sincronização:', {
            currentTotalActions,
            newTotalActions,
            lastAction: data.lastAction,
            hasActions: !!data.pickBanData?.actions
        });

        // ✅ SIMPLIFICADO: Aplicar picks e bans sincronizados nas fases
        if (data.pickBanData?.actions && Array.isArray(data.pickBanData.actions)) {
            console.log('🔄 [DraftPickBan] Aplicando ações do MySQL:', data.pickBanData.actions);
            this.applySyncedActions(data.pickBanData.actions);
        } else {
            console.log('🔄 [DraftPickBan] Nenhuma ação para aplicar (draft inicial ou sem ações)');
        }

        // ✅ SIMPLIFICADO: Atualizar currentAction baseado no número de ações aplicadas
        if (data.totalActions >= 0) {
            console.log(`🔄 [DraftPickBan] Atualizando currentAction de ${this.session.currentAction} para ${data.totalActions}`);
            this.session.currentAction = data.totalActions;
        }

        // ✅ SIMPLIFICADO: Forçar recálculo do turno atual e interface
        this.updateCurrentTurn();
        this.forceInterfaceUpdate();

        console.log('✅ [DraftPickBan] Sincronização aplicada com sucesso');
    }

    // ✅ OTIMIZADO: Forçar sincronização com MySQL para latência baixa
    private forceMySQLSync(): void {
        // ✅ OTIMIZADO: Não sincronizar se o modal estiver aberto
        if (this.showChampionModal) {
            return;
        }

        // ✅ OTIMIZADO: Buscar dados atualizados do MySQL via polling
        if (this.currentPlayer?.summonerName) {
            this.apiService.checkSyncStatus(this.currentPlayer.summonerName).subscribe({
                next: (response) => {
                    // ✅ OTIMIZADO: Processar apenas se for draft e houver dados
                    if (response.status === 'draft' && (response.pick_ban_data || response.totalActions > 0)) {
                        let pickBanData = response.pick_ban_data || { actions: [] };

                        if (typeof pickBanData === 'string') {
                            try {
                                pickBanData = JSON.parse(pickBanData);
                            } catch (error) {
                                console.error('❌ [Draft] Erro ao parsear pick_ban_data:', error);
                                return;
                            }
                        }

                        if (!pickBanData.actions) {
                            pickBanData.actions = [];
                        }

                        // ✅ OTIMIZADO: Aplicar sincronização apenas se houver mudanças
                        const currentActions = this.session?.phases?.filter(p => p.locked).length || 0;
                        const newActions = response.totalActions || pickBanData.actions?.length || 0;

                        if (newActions > currentActions) {
                            console.log(`🔄 [Draft] Sincronizando: ${currentActions} → ${newActions} ações`);
                            this.handleDraftDataSync({
                                pickBanData: pickBanData,
                                totalActions: newActions,
                                lastAction: response.lastAction || pickBanData.actions?.[pickBanData.actions.length - 1]
                            });
                        }
                    }
                },
                error: (error) => {
                    // ✅ OTIMIZADO: Logs de erro reduzidos para evitar spam
                    if (!this.syncErrorCount) this.syncErrorCount = 0;
                    this.syncErrorCount++;

                    if (this.syncErrorCount <= 3) {
                        console.error('❌ [Draft] Erro na sincronização:', error);
                    }
                }
            });
        }
    }

    // ✅ SIMPLIFICADO: Aplicar ações sincronizadas do MySQL nas fases locais
    private applySyncedActions(actions: any[]): void {
        console.log('🔄 [DraftPickBan] Aplicando ações sincronizadas:', actions);

        if (!this.session?.phases) {
            console.error('❌ [DraftPickBan] Fases não inicializadas');
            return;
        }

        // ✅ SIMPLIFICADO: Verificar se há uma seleção em andamento
        if (this.showChampionModal) {
            console.log('⚠️ [DraftPickBan] Modal aberto - não aplicando sincronização para evitar interferência');
            return;
        }

        // ✅ SIMPLIFICADO: Aplicar ações uma por uma na ordem sequencial
        for (let i = 0; i < actions.length && i < this.session.phases.length; i++) {
            const action = actions[i];
            const phase = this.session.phases[i];

            // ✅ SIMPLIFICADO: Não sobrescrever fases que já estão com campeão definido
            if (phase.champion && phase.locked) {
                console.log(`⚠️ [DraftPickBan] Fase ${i} já tem campeão definido (${phase.champion.name}) - pulando`);
                continue;
            }

            // ✅ SIMPLIFICADO: Aplicar ação do MySQL na fase local
            if (action.championId && action.action) {
                // Encontrar o campeão pelo ID
                const champion = this.champions.find(c => c.id === action.championId.toString());
                if (champion) {
                    console.log(`✅ [DraftPickBan] Aplicando ação ${action.action} para ${champion.name} na fase ${i}`);

                    // Aplicar ação na fase
                    phase.champion = champion;
                    phase.locked = true;
                    phase.playerName = action.playerName || action.playerId || 'Unknown';

                    console.log(`✅ [DraftPickBan] Ação aplicada com sucesso na fase ${i}`);
                } else {
                    console.warn(`⚠️ [DraftPickBan] Campeão não encontrado para ID ${action.championId}`);
                }
            }
        }

        console.log('✅ [DraftPickBan] Todas as ações sincronizadas aplicadas');
    }

    // ✅ OTIMIZADO: Iniciar sincronização automática com latência baixa
    private startAutoSync(): void {
        console.log('🔄 [DraftPickBan] Iniciando sincronização automática');

        // ✅ OTIMIZADO: Sincronização a cada 500ms para latência baixa
        this.realTimeSyncTimer = window.setInterval(() => {
            this.forceMySQLSync();
        }, 500);

        console.log('✅ [DraftPickBan] Sincronização automática iniciada (500ms)');
    }

    // ✅ SIMPLIFICADO: Parar sincronização automática
    private stopAutoSync(): void {
        if (this.realTimeSyncTimer) {
            clearInterval(this.realTimeSyncTimer);
            this.realTimeSyncTimer = null;
            console.log('🛑 [DraftPickBan] Sincronização automática parada');
        }
    }

    // ✅ NOVO: Método para notificar backend sobre sincronização
    private async notifyBackendSync(): Promise<void> {
        console.log('🔄 [notifyBackendSync] Notificando backend sobre sincronização');

        if (!this.currentPlayer?.summonerName || !this.matchData?.id) {
            console.log('⚠️ [notifyBackendSync] Dados insuficientes para notificação');
            return;
        }

        try {
            const url = `${this.baseUrl}/api/draft/sync`;
            const requestData = {
                matchId: this.matchData.id,
                playerId: this.normalizePlayerIdentifier(this.currentPlayer),
                timestamp: new Date().toISOString()
            };

            await new Promise((resolve, reject) => {
                this.http.post(url, requestData, {
                    headers: {
                        'Content-Type': 'application/json',
                        'Accept': 'application/json'
                    }
                }).subscribe({
                    next: (response) => {
                        console.log('✅ [notifyBackendSync] Notificação enviada com sucesso:', response);
                        resolve(response);
                    },
                    error: (error) => {
                        console.error('❌ [notifyBackendSync] Erro ao notificar backend:', error);
                        reject(error);
                    }
                });
            });
        } catch (error) {
            console.error('❌ [notifyBackendSync] Erro na notificação:', error);
        }
    }

    // ✅ NOVO: Método para normalizar identificador do jogador
    private normalizePlayerIdentifier(playerInfo: any): string {
        if (!playerInfo) return '';

        // Prioridade 1: gameName#tagLine (padrão)
        if (playerInfo.gameName && playerInfo.tagLine) {
            return `${playerInfo.gameName}#${playerInfo.tagLine}`.toLowerCase().trim();
        }

        // Prioridade 2: displayName (se já está no formato correto)
        if (playerInfo.displayName && playerInfo.displayName.includes('#')) {
            return playerInfo.displayName.toLowerCase().trim();
        }

        // Prioridade 3: summonerName (fallback)
        if (playerInfo.summonerName) {
            return playerInfo.summonerName.toLowerCase().trim();
        }

        // Prioridade 4: name (fallback)
        if (playerInfo.name) {
            return playerInfo.name.toLowerCase().trim();
        }

        // Prioridade 5: id (último fallback)
        if (playerInfo.id) {
            return playerInfo.id.toString().toLowerCase().trim();
        }

        return '';
    }
}