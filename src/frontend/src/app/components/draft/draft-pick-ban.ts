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

function logDraft(...args: any[]) {
    const fs = (window as any).electronAPI?.fs;
    const path = (window as any).electronAPI?.path;
    const process = (window as any).electronAPI?.process;
    const logPath = path && process ? path.join(process.cwd(), 'frontend.log') : '';
    const logLine = `[${new Date().toISOString()}] [DraftPickBan] ` + args.map(a => (typeof a === 'object' ? JSON.stringify(a) : a)).join(' ') + '\n';
    if (fs && logPath) {
        fs.appendFile(logPath, logLine, (err: any) => { });
    }
    console.log('[DraftPickBan]', ...args);
}

@Component({
    selector: 'app-draft-pick-ban',
    standalone: true,
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
    // Flag para evitar loop do modal enquanto aguarda backend
    isWaitingBackend: boolean = false;

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
    // NOVO: Guardar matchId localmente para nunca perder
    private matchId: string | null = null;

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
        logDraft('🚀 [DraftPickBan] ngOnInit iniciado');
        logDraft('🚀 [DraftPickBan] currentPlayer recebido:', this.currentPlayer);
        logDraft('🚀 [DraftPickBan] currentPlayer detalhes:', {
            id: this.currentPlayer?.id,
            summonerName: this.currentPlayer?.summonerName,
            name: this.currentPlayer?.name,
            gameName: this.currentPlayer?.gameName,
            tagLine: this.currentPlayer?.tagLine,
            displayName: this.currentPlayer?.displayName
        });
        logDraft('🚀 [DraftPickBan] matchData recebido:', this.matchData);

        this.loadChampions();
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
            logDraft('🔄 [DraftPickBan] Timer de sincronização automática limpo');
        }
    }

    ngOnChanges(changes: SimpleChanges) {
        if (changes['matchData']) {
            const currentValue = changes['matchData'].currentValue;
            const previousValue = changes['matchData'].previousValue;

            logDraft('[DraftPickBan] 🔍 Dados recebidos no ngOnChanges:', {
                hasCurrentValue: !!currentValue,
                hasPreviousValue: !!previousValue,
                currentValueKeys: currentValue ? Object.keys(currentValue) : [],
                blueTeamLength: currentValue?.blueTeam?.length || 0,
                redTeamLength: currentValue?.redTeam?.length || 0,
                phasesLength: currentValue?.phases?.length || 0,
                currentAction: currentValue?.currentAction || 0,
                currentMatchId: currentValue?.id,
                storedMatchId: this.matchId
            });

            // NOVO: Guardar matchId se disponível
            if (currentValue?.id) {
                this.matchId = currentValue.id;
                logDraft('[DraftPickBan] ✅ matchId guardado:', this.matchId);
            } else if (this.matchId) {
                logDraft('[DraftPickBan] ⚠️ matchData.id não disponível, usando matchId guardado:', this.matchId);
            } else {
                logDraft('[DraftPickBan] ❌ matchData.id não disponível e nenhum matchId guardado');
            }

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
                    logDraft('[DraftPickBan] ⚠️ Mudança ignorada - dados idênticos');
                    return;
                }
            }

            this.session = currentValue;
            if (this.session) {
                logDraft('[DraftPickBan] 🔍 Dados da sessão antes da normalização:', {
                    blueTeam: this.session.blueTeam,
                    redTeam: this.session.redTeam,
                    phases: this.session.phases,
                    currentAction: this.session.currentAction
                });
                this.session.blueTeam = this.normalizeTeamPlayers(this.session.blueTeam || []);
                this.session.redTeam = this.normalizeTeamPlayers(this.session.redTeam || []);
                logDraft('[DEBUG] blueTeam após normalização:', this.session.blueTeam);
                logDraft('[DEBUG] redTeam após normalização:', this.session.redTeam);
                logDraft('[DraftPickBan] ✅ Sessão inicializada com sucesso:', {
                    blueTeamCount: this.session.blueTeam.length,
                    redTeamCount: this.session.redTeam.length,
                    phasesCount: this.session.phases?.length || 0,
                    currentAction: this.session.currentAction
                });
            } else {
                logDraft('[DraftPickBan] ❌ Sessão não inicializada - currentValue é null/undefined');
            }
        }

        if (changes['currentPlayer']) {
            logDraft('🔄 [DraftPickBan] currentPlayer mudou:', {
                previousValue: changes['currentPlayer'].previousValue,
                currentValue: changes['currentPlayer'].currentValue,
                firstChange: changes['currentPlayer'].firstChange
            });
            this.checkCurrentPlayerChange();
        }
    }

    private async loadChampions() {
        try {
            logDraft('🔄 [loadChampions] Carregando campeões...');
            this.championService.getAllChampions().subscribe({
                next: (champions) => {
                    this.champions = champions;
                    logDraft(`✅ [loadChampions] ${this.champions.length} campeões carregados`);
                    this.organizeChampionsByRole();
                },
                error: (error) => {
                    logDraft('❌ [loadChampions] Erro ao carregar campeões:', error);
                }
            });
        } catch (error) {
            logDraft('❌ [loadChampions] Erro ao carregar campeões:', error);
        }
    }

    private organizeChampionsByRole() {
        this.championService.getChampionsByRole().subscribe({
            next: (championsByRole) => {
                this.championsByRole = championsByRole;
            },
            error: (error) => {
                logDraft('❌ [organizeChampionsByRole] Erro ao organizar campeões por role:', error);
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

    private getLaneForIndex(index: number): string {
        const lanes = ['top', 'jungle', 'mid', 'adc', 'support'];
        return lanes[index] || 'unknown';
    }

    // Remover métodos de lógica local do draft:
    // - generatePhases
    // - updateCurrentTurn
    // - startTimer
    // - handleTimeOut
    // - checkForBotAutoAction
    // - qualquer avanço de fase local

    private getCurrentPlayer(): any {
        if (!this.session) return null;

        const currentPhase = this.session.phases[this.session.currentAction];
        if (!currentPhase) return null;

        const currentTeam = currentPhase.team;
        const teamPlayers = currentTeam === 'blue' ? this.session.blueTeam : this.session.redTeam;

        return teamPlayers.find(p => this.botService.comparePlayerWithId(p, currentPhase.playerId!));
    }

    checkIfMyTurn(phase: PickBanPhase): boolean {
        logDraft('🎯 [checkIfMyTurn] === VERIFICANDO SE É MINHA VEZ ===');
        logDraft('🎯 [checkIfMyTurn] currentPlayer:', this.currentPlayer);
        logDraft('🎯 [checkIfMyTurn] phase:', phase);
        logDraft('🎯 [checkIfMyTurn] phase.playerId:', phase.playerId);

        if (!this.currentPlayer) {
            logDraft('❌ [checkIfMyTurn] currentPlayer é null/undefined');
            return false;
        }

        // ✅ MELHORADO: Verificar se phase.playerId existe, senão usar playerName ou playerIndex
        let expectedPlayerId = phase.playerId;

        if (!expectedPlayerId) {
            logDraft('⚠️ [checkIfMyTurn] phase.playerId é null/undefined, tentando fallback');

            // ✅ NOVO: Fallback para quando playerId não está definido
            if (phase.playerName) {
                expectedPlayerId = phase.playerName;
                logDraft('✅ [checkIfMyTurn] Usando phase.playerName como fallback:', expectedPlayerId);
            } else if (phase.playerIndex !== undefined && this.session) {
                // ✅ NOVO: Usar playerIndex para identificar o jogador
                const team = phase.team === 'blue' ? this.session.blueTeam : this.session.redTeam;
                const player = team?.[phase.playerIndex];
                expectedPlayerId = player?.summonerName || player?.name || `player_${phase.team}_${phase.playerIndex}`;
                logDraft('✅ [checkIfMyTurn] Usando playerIndex como fallback:', expectedPlayerId);
            }
        }

        if (!expectedPlayerId) {
            logDraft('❌ [checkIfMyTurn] Não foi possível identificar o jogador esperado');
            return false;
        }

        // ✅ MELHORADO: Comparar usando lógica específica para bots vs jogadores reais
        let isMyTurn = false;

        // ✅ CORREÇÃO: Verificar se o jogador esperado é um bot
        const isExpectedPlayerBot = expectedPlayerId.toLowerCase().startsWith('bot');
        const isCurrentPlayerBot = this.botService.isBot(this.currentPlayer);

        if (isExpectedPlayerBot && isCurrentPlayerBot) {
            // ✅ Para bots: comparar por nome
            isMyTurn = expectedPlayerId === this.currentPlayer.summonerName ||
                expectedPlayerId === this.currentPlayer.name ||
                expectedPlayerId === this.currentPlayer.gameName;
        } else if (!isExpectedPlayerBot && !isCurrentPlayerBot) {
            // ✅ Para jogadores reais: comparar por puuid ou summonerName
            isMyTurn = expectedPlayerId === this.currentPlayer.puuid ||
                expectedPlayerId === this.currentPlayer.summonerName ||
                expectedPlayerId === `${this.currentPlayer.gameName}#${this.currentPlayer.tagLine}` ||
                this.botService.comparePlayerWithId(this.currentPlayer, expectedPlayerId);
        }

        // ✅ FALLBACK: Usar método genérico se a lógica específica não funcionar
        if (!isMyTurn) {
            isMyTurn = this.botService.comparePlayerWithId(this.currentPlayer, expectedPlayerId);
        }

        logDraft('🎯 [checkIfMyTurn] Resultado da comparação:', isMyTurn);
        logDraft('🎯 [checkIfMyTurn] Detalhes da comparação:', {
            expectedPlayerId,
            currentPlayerId: this.currentPlayer.id,
            currentPlayerName: this.currentPlayer.summonerName || this.currentPlayer.name,
            currentPlayerGameName: this.currentPlayer.gameName,
            currentPlayerTagLine: this.currentPlayer.tagLine,
            currentPlayerSummonerId: this.currentPlayer.summonerId,
            currentPlayerPuuid: this.currentPlayer.puuid,
            phasePlayerId: phase.playerId,
            phasePlayerName: phase.playerName,
            phasePlayerIndex: phase.playerIndex,
            isMyTurn: isMyTurn
        });

        // ✅ NOVO: Log específico para ação 6
        if (this.session && this.session.currentAction === 5) {
            logDraft('🔍 [DEBUG AÇÃO 6 - checkIfMyTurn] === DETALHES ESPECÍFICAS ===');
            logDraft('🔍 [DEBUG AÇÃO 6 - checkIfMyTurn] currentPlayer:', this.currentPlayer);
            logDraft('🔍 [DEBUG AÇÃO 6 - checkIfMyTurn] phase:', phase);
            logDraft('🔍 [DEBUG AÇÃO 6 - checkIfMyTurn] expectedPlayerId:', expectedPlayerId);
            logDraft('🔍 [DEBUG AÇÃO 6 - checkIfMyTurn] isMyTurn:', isMyTurn);
            logDraft('🔍 [DEBUG AÇÃO 6 - checkIfMyTurn] === FIM DOS DETALHES ===');
        }

        logDraft('🎯 [checkIfMyTurn] === FIM DA VERIFICAÇÃO ===');

        return isMyTurn;
    }

    getPlayerTeam(): 'blue' | 'red' {
        if (!this.currentPlayer || !this.session) return 'blue';

        const blueTeamPlayer = this.session.blueTeam.find(p => this.botService.comparePlayers(p, this.currentPlayer));
        return blueTeamPlayer ? 'blue' : 'red';
    }

    // Remover métodos de lógica local do draft:
    // - startTimer
    // - handleTimeOut

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

        logDraft('🎯 [sortPlayersByLane] Jogadores ordenados:', sortedPlayers.map((p, i) => ({
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
        if (!foundPlayer) {
            logDraft(`⚠️ [getPlayerPick] Jogador não encontrado no time ${team}:`, player);
            return null;
        }

        // ✅ CORREÇÃO: Buscar pick diretamente nas fases baseado no nome do jogador
        const playerName = foundPlayer.summonerName || foundPlayer.name;

        logDraft(`🔍 [getPlayerPick] Buscando pick para ${team} team player:`, {
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

        logDraft(`🔍 [getPlayerPick] Fases de pick encontradas para time ${team}:`,
            pickPhases.map(p => ({
                playerName: p.playerName,
                playerId: p.playerId,
                champion: p.champion?.name,
                playerIndex: p.playerIndex
            }))
        );

        // ✅ MELHORADO: Buscar pick que corresponde ao jogador usando múltiplos critérios
        for (const pickPhase of pickPhases) {
            const phasePlayerName = pickPhase.playerName || pickPhase.playerId || '';

            // ✅ CRITÉRIO 1: Comparar por nome exato
            if (phasePlayerName === playerName) {
                logDraft(`✅ [getPlayerPick] Pick encontrado por nome exato para ${playerName}: ${pickPhase.champion?.name}`);
                return pickPhase.champion || null;
            }

            // ✅ CRITÉRIO 2: Comparar usando BotService
            if (this.botService.comparePlayerWithId(foundPlayer, pickPhase.playerId || '')) {
                logDraft(`✅ [getPlayerPick] Pick encontrado por BotService para ${playerName}: ${pickPhase.champion?.name}`);
                return pickPhase.champion || null;
            }

            // ✅ CRITÉRIO 3: Comparar por playerIndex se disponível
            if (pickPhase.playerIndex !== undefined && foundPlayer.teamIndex === pickPhase.playerIndex) {
                logDraft(`✅ [getPlayerPick] Pick encontrado por playerIndex para ${playerName}: ${pickPhase.champion?.name}`);
                return pickPhase.champion || null;
            }
        }

        logDraft(`❌ [getPlayerPick] Nenhum pick encontrado para ${playerName} no time ${team}`);
        return null;
    }

    getCurrentPlayerName(): string {
        if (!this.session) return '';

        const currentPhase = this.session.phases[this.session.currentAction];
        if (!currentPhase) return '';

        // ✅ CORREÇÃO: Buscar o jogador diretamente no array do time usando playerIndex
        const teamPlayers = currentPhase.team === 'blue' ? this.session.blueTeam : this.session.redTeam;

        // ✅ CORREÇÃO: Verificar se playerIndex existe antes de usar como índice
        if (currentPhase.playerIndex !== undefined && teamPlayers[currentPhase.playerIndex]) {
            const player = teamPlayers[currentPhase.playerIndex];
            // ✅ PRIORIDADE: Usar summonerName, depois name, depois id
            return player.summonerName || player.name || player.id || 'Jogador Desconhecido';
        }

        // ✅ FALLBACK: Se não encontrou pelo playerIndex, tentar pelo playerName/playerId da fase
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
        logDraft('🎯 [openChampionModal] === ABRINDO MODAL DE CAMPEÕES ===');
        logDraft('🎯 [openChampionModal] isMyTurn:', this.isMyTurn);
        logDraft('🎯 [openChampionModal] isEditingMode:', this.isEditingMode);
        logDraft('🎯 [openChampionModal] showChampionModal atual:', this.showChampionModal);
        logDraft('🎯 [openChampionModal] currentPlayer:', this.currentPlayer);
        logDraft('🎯 [openChampionModal] session:', this.session);

        // ✅ CORREÇÃO: Verificar se a sessão está completada (exceto em modo de edição)
        if (!this.session) {
            logDraft('❌ [openChampionModal] Session não existe - não abrindo modal');
            return;
        }

        // ✅ CORREÇÃO: Permitir abertura em modo de edição mesmo se sessão estiver "completed"
        if (!this.isEditingMode && (this.session.phase === 'completed' || this.session.currentAction >= this.session.phases.length)) {
            logDraft('❌ [openChampionModal] Sessão completada ou inválida - não abrindo modal');
            return;
        }

        if (this.session) {
            const currentPhase = this.session.phases[this.session.currentAction];
            logDraft('🎯 [openChampionModal] currentPhase:', currentPhase);
        }

        // ✅ CORREÇÃO: Garantir que o modal seja exibido
        this.showChampionModal = true;
        logDraft('🎯 [openChampionModal] showChampionModal definido como true');

        // ✅ CORRIGIDO: Apenas marcar para detecção, sem detectChanges direto
        this.cdr.markForCheck();

        logDraft('🎯 [openChampionModal] === FIM DA ABERTURA DO MODAL ===');
    }

    openConfirmationModal(): void {
        logDraft('🎯 [openConfirmationModal] === ABRINDO MODAL DE CONFIRMAÇÃO ===');
        logDraft('🎯 [openConfirmationModal] currentPlayer:', this.currentPlayer);
        logDraft('🎯 [openConfirmationModal] session:', this.session);
        logDraft('🎯 [openConfirmationModal] session.phase:', this.session?.phase);

        this.showConfirmationModal = true;
        this.cdr.markForCheck();
    }

    // ✅ NOVO: Método para lidar com solicitação de edição do modal de confirmação
    onEditRequested(editData: { playerId: string, phaseIndex: number }): void {
        logDraft('🎯 [onEditRequested] === SOLICITAÇÃO DE EDIÇÃO RECEBIDA ===');
        logDraft('🎯 [onEditRequested] editData:', editData);
        logDraft('🎯 [onEditRequested] currentPlayer:', this.currentPlayer);
        logDraft('🎯 [onEditRequested] session.currentAction:', this.session?.currentAction);
        logDraft('🎯 [onEditRequested] session.phase:', this.session?.phase);

        if (!this.session) {
            logDraft('❌ [onEditRequested] Session não existe');
            return;
        }

        // Verificar se o jogador que está editando é o currentPlayer
        const phaseToEdit = this.session.phases[editData.phaseIndex];
        if (!phaseToEdit) {
            logDraft('❌ [onEditRequested] Fase não encontrada para índice:', editData.phaseIndex);
            logDraft('❌ [onEditRequested] Total de fases:', this.session.phases.length);
            return;
        }

        logDraft('🎯 [onEditRequested] Fase encontrada:', {
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
        logDraft('🎯 [onEditRequested] Verificação de jogador:', {
            currentPlayerId: this.currentPlayer?.id,
            currentPlayerName: this.currentPlayer?.summonerName || this.currentPlayer?.name,
            editPlayerId: editData.playerId,
            phasePlayerId: phaseToEdit.playerId,
            isCurrentPlayerEdit: isCurrentPlayerEdit
        });

        if (!isCurrentPlayerEdit) {
            logDraft('❌ [onEditRequested] Apenas o próprio jogador pode editar seu pick');
            return;
        }

        logDraft('✅ [onEditRequested] Configurando edição para fase:', {
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

        logDraft('🎯 [onEditRequested] Estado após configuração:', {
            isEditingMode: this.isEditingMode,
            editingPhaseIndex: this.editingPhaseIndex,
            sessionCurrentAction: this.session.currentAction,
            showConfirmationModal: this.showConfirmationModal,
            showChampionModal: this.showChampionModal
        });

        // Forçar atualização da interface
        this.forceInterfaceUpdate();

        // ✅ CORREÇÃO: Abrir modal de seleção de campeões para edição com delay maior
        setTimeout(() => {
            logDraft('🎯 [onEditRequested] === TENTANDO ABRIR MODAL DE EDIÇÃO ===');
            logDraft('🎯 [onEditRequested] isEditingMode:', this.isEditingMode);
            logDraft('🎯 [onEditRequested] showChampionModal:', this.showChampionModal);
            logDraft('🎯 [onEditRequested] session.phase:', this.session?.phase);
            logDraft('🎯 [onEditRequested] session.currentAction:', this.session?.currentAction);

            if (this.isEditingMode && !this.showChampionModal) {
                logDraft('🎯 [onEditRequested] Abrindo modal de edição...');
                this.openChampionModal();
            } else {
                logDraft('❌ [onEditRequested] Condições não atendidas para abrir modal:', {
                    isEditingMode: this.isEditingMode,
                    showChampionModal: this.showChampionModal
                });
            }
        }, 200);

        logDraft('🎯 [onEditRequested] === FIM DA CONFIGURAÇÃO DE EDIÇÃO ===');
    }

    // MÉTODO PARA RECEBER SELEÇÃO DO MODAL
    async onChampionSelected(champion: Champion): Promise<void> {
        logDraft('🎯 [onChampionSelected] === CAMPEÃO SELECIONADO ===');
        logDraft('🎯 [onChampionSelected] Campeão selecionado:', champion.name);
        logDraft('🎯 [onChampionSelected] Detalhes completos do campeão:', {
            id: champion.id,
            name: champion.name,
            key: champion.key,
            title: champion.title
        });

        if (!this.session) {
            logDraft('❌ [onChampionSelected] Session não existe');
            return;
        }

        const currentPhase = this.session.phases[this.session.currentAction];
        if (!currentPhase) {
            logDraft('❌ [onChampionSelected] Fase atual não existe');
            return;
        }

        // Logar dados do jogador real
        if (this.currentPlayer && !this.botService.isBot(this.currentPlayer)) {
            logDraft('🟦 [onChampionSelected] Jogador real identificado:', {
                playerId: this.currentPlayer.puuid,
                summonerName: this.currentPlayer.summonerName,
                gameName: this.currentPlayer.gameName,
                tagLine: this.currentPlayer.tagLine,
                puuid: this.currentPlayer.puuid
            });
        }

        logDraft('🎯 [onChampionSelected] Fase atual:', {
            currentAction: this.session.currentAction,
            team: currentPhase.team,
            action: currentPhase.action,
            playerIndex: currentPhase.playerIndex,
            playerId: currentPhase.playerId,
            playerName: currentPhase.playerName
        });

        currentPhase.champion = champion;
        currentPhase.locked = true;
        currentPhase.timeRemaining = 0;
        this.showChampionModal = false;

        // NOVO: Sinalizar que está aguardando backend (apenas para jogador real)
        if (!this.botService.isBot(this.currentPlayer)) {
            this.isWaitingBackend = true;
        }

        if (this.isEditingMode) {
            this.checkForBotAutoAction();
            return;
        }

        // NOVO: Usar matchId guardado como fallback
        const effectiveMatchId = this.matchData?.id || this.matchId;
        if (effectiveMatchId) {
            logDraft('🎯 [onChampionSelected] Enviando ação para MySQL e aguardando confirmação...');
            logDraft('🟦 [onChampionSelected] Usando matchId:', effectiveMatchId);
            try {
                logDraft('🟦 [onChampionSelected] Enviando para backend:', {
                    matchId: effectiveMatchId,
                    playerId: this.currentPlayer?.puuid,
                    championId: champion.id,
                    action: currentPhase.action
                });
                await this.sendDraftActionToBackend(champion, currentPhase.action, this.currentPlayer?.puuid);
                logDraft('✅ [onChampionSelected] Ação enviada para MySQL com sucesso (aguardando sync)');
                // Forçar sync imediatamente após ação
                this.forceMySQLSync();
                for (let i = 0; i < 3; i++) {
                    setTimeout(() => {
                        this.forceMySQLSync();
                        logDraft(`🔄 [onChampionSelected] Sincronização ${i + 1}/3 forçada`);
                    }, (i + 1) * 200);
                }
                setTimeout(() => {
                    logDraft('🔄 [onChampionSelected] Continuando após sincronização...');
                    this.forceInterfaceUpdate();
                }, 800);
            } catch (error) {
                logDraft('❌ [onChampionSelected] Erro ao enviar para MySQL:', error);
            }
        } else {
            logDraft('❌ [onChampionSelected] Nenhum matchId disponível - não enviando para MySQL');
            logDraft('❌ [onChampionSelected] matchData.id:', this.matchData?.id);
            logDraft('❌ [onChampionSelected] matchId guardado:', this.matchId);
        }
        this.checkForBotAutoAction();
        logDraft('✅ [Draft] Atualização completa - aguardando sincronização do MySQL');
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
            logDraft('⚠️ [getSortedTeamByLaneForDisplay] Session não disponível');
            return [];
        }

        const teamPlayers = team === 'blue' ? this.session.blueTeam : this.session.redTeam;

        // ✅ CORREÇÃO: Verificar se teamPlayers existe e é array
        if (!teamPlayers || !Array.isArray(teamPlayers)) {
            logDraft(`⚠️ [getSortedTeamByLaneForDisplay] TeamPlayers inválido para time ${team}:`, teamPlayers);
            return [];
        }

        if (teamPlayers.length === 0) {
            logDraft(`⚠️ [getSortedTeamByLaneForDisplay] Nenhum jogador encontrado para time ${team}`);
            return [];
        }

        // ✅ CORREÇÃO: Usar método de ordenação por lane existente
        try {
            const sortedPlayers = this.sortPlayersByLane([...teamPlayers]);
            logDraft(`✅ [getSortedTeamByLaneForDisplay] Time ${team} ordenado:`,
                sortedPlayers.map(p => ({ name: p.summonerName, lane: p.lane, teamIndex: p.teamIndex })));
            return sortedPlayers;
        } catch (error) {
            logDraft(`❌ [getSortedTeamByLaneForDisplay] Erro ao ordenar time ${team}:`, error);
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
            logDraft(`🔄 [forceUpdateMyTurn] isMyTurn mudou: ${oldIsMyTurn} -> ${this.isMyTurn}`);
        }

        // NOVO: Só abrir modal se não estiver aguardando backend
        if (
            this.isMyTurn &&
            !this.showChampionModal &&
            !this.botService.isBot(this.currentPlayer) &&
            !currentPhase.locked &&
            !this.isWaitingBackend &&
            (currentPhase.action === 'pick' || currentPhase.action === 'ban')
        ) {
            logDraft('🎯 [forceUpdateMyTurn] É a vez do jogador real, abrindo modal de seleção de campeão automaticamente');
            this.openChampionModal();
        }

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
        // ✅ NOVO: Forçar atualização do isMyTurn
        this.forceUpdateMyTurn();

        // Marcar para detecção de mudanças uma única vez
        this.cdr.markForCheck();

        // ✅ REMOVIDO: setTimeout recursivo que causava stack overflow
        // Apenas uma marcação de mudança é suficiente com OnPush
        logDraft('🔄 [forceInterfaceUpdate] Interface marcada para atualização');
    }

    // ✅ Métodos para substituir os pipes removidos
    getLaneDisplay(lane: string | undefined): string {
        const laneNames: { [key: string]: string } = {
            'top': 'Topo',
            'jungle': 'Selva',
            'mid': 'Meio',
            'bot': 'Atirador',
            'adc': 'Atirador',
            'support': 'Suporte',
            'fill': 'Qualquer'
        };
        if (!lane) return 'Qualquer';
        return laneNames[lane.toLowerCase()] || lane || 'Qualquer';
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
    private async sendDraftActionToBackend(champion: Champion, action: 'pick' | 'ban', forcePlayerId?: string): Promise<void> {
        // NOVO: Usar matchId guardado como fallback
        const effectiveMatchId = this.matchData?.id || this.matchId;

        if (!this.session || !effectiveMatchId || !this.currentPlayer) {
            logDraft('❌ [sendDraftActionToBackend] Dados insuficientes:', {
                hasSession: !!this.session,
                hasMatchData: !!this.matchData,
                hasMatchId: !!this.matchId,
                effectiveMatchId: effectiveMatchId,
                hasCurrentPlayer: !!this.currentPlayer
            });
            return;
        }

        const currentPhase = this.session.phases[this.session.currentAction];
        if (!currentPhase || !currentPhase.playerId) {
            logDraft('❌ [sendDraftActionToBackend] Fase atual ou playerId não encontrado:', {
                currentAction: this.session.currentAction,
                currentPhase: currentPhase,
                playerId: currentPhase?.playerId
            });
            return;
        }

        // ✅ CORREÇÃO: Lógica simplificada - bots usam nome, jogadores reais usam puuid
        let playerId = '';

        // ✅ CORREÇÃO: Verificar se o currentPlayer é um bot
        const isCurrentPlayerBot = this.botService.isBot(this.currentPlayer);

        if (isCurrentPlayerBot) {
            // ✅ Para bots: usar o nome do bot
            playerId = this.currentPlayer.summonerName || this.currentPlayer.name || this.currentPlayer.gameName || '';
        } else {
            // ✅ Para jogadores reais: usar puuid
            playerId = this.currentPlayer.puuid || this.currentPlayer.summonerName || '';
        }

        // ✅ FALLBACK: Se não conseguiu determinar, usar o playerId da fase
        if (!playerId) {
            playerId = currentPhase.playerId || currentPhase.playerName || '';
        }
        logDraft('🎯 [sendDraftActionToBackend] playerId determinado:', { playerId, isCurrentPlayerBot, forcePlayerId });

        const requestKey = `${effectiveMatchId}-${playerId}-${champion.id}-${action}`;
        if ((this as any).sentRequests?.has(requestKey)) {
            logDraft(`⚠️ [sendDraftActionToBackend] Ação já enviada: ${requestKey}`);
            return;
        }
        if (!(this as any).sentRequests) {
            (this as any).sentRequests = new Set();
        }
        (this as any).sentRequests.add(requestKey);

        const requestData = {
            matchId: effectiveMatchId,
            playerId: playerId,
            championId: parseInt(champion.id),
            action: action
        };

        logDraft('🎯 [sendDraftActionToBackend] Enviando ação:', requestData);
        try {
            const url = `${this.baseUrl}/api/match/draft-action`;
            const response = await this.http.post(url, requestData, {
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                }
            }).toPromise();
            logDraft('✅ [sendDraftActionToBackend] Resposta do backend:', response);
            (this as any).sentRequests.delete(requestKey);
        } catch (error: any) {
            logDraft('❌ [sendDraftActionToBackend] Erro ao enviar ação:', error);
            (this as any).sentRequests.delete(requestKey);
            throw error;
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

        logDraft(`🔍 [getPlayerBans] Buscando bans para ${team} team player:`, {
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
                    logDraft(`✅ [getPlayerBans] Ban encontrado para ${playerName}: ${banPhase.champion.name}`);
                }
            }
        }

        logDraft(`🔍 [getPlayerBans] Total de bans para ${playerName}: ${playerBans.length}`);
        return playerBans;
    }

    // ✅ CORRIGIDO: Sincronização com backend - Proteção total contra conflitos
    handleDraftDataSync(data: any): void {
        logDraft('🔄 [DraftPickBan] Recebendo sincronização de dados:', data);

        if (!this.session) {
            logDraft('⚠️ [DraftPickBan] Sincronização ignorada - sessão não inicializada');
            return;
        }

        // ✅ CORRIGIDO: Não sincronizar se o modal estiver aberto
        if (this.showChampionModal) {
            logDraft('⚠️ [DraftPickBan] Modal aberto - ignorando sincronização para evitar interferência');
            return;
        }

        // ✅ CORRIGIDO: Verificar se realmente há mudanças antes de processar
        const currentTotalActions = this.session.phases?.filter(p => p.locked).length || 0;
        const newTotalActions = data.totalActions || 0;

        logDraft('🔄 [DraftPickBan] Comparando ações:', {
            currentTotalActions,
            newTotalActions,
            hasPickBanData: !!data.pickBanData,
            actionsCount: data.pickBanData?.actions?.length || 0
        });

        // ✅ CORRIGIDO: Não sincronizar se não há mudanças reais
        if (currentTotalActions === newTotalActions && newTotalActions > 0) {
            logDraft('🔄 [DraftPickBan] Nenhuma mudança detectada - ignorando sincronização');
            return;
        }

        // ✅ CORRIGIDO: Proteção contra regressão de ações
        if (newTotalActions < currentTotalActions && currentTotalActions > 0) {
            logDraft(`⚠️ [DraftPickBan] Ignorando sincronização - MySQL tem ${newTotalActions} ações mas localmente temos ${currentTotalActions}`);
            return;
        }

        logDraft('🔄 [DraftPickBan] Aplicando sincronização:', {
            currentTotalActions,
            newTotalActions,
            lastAction: data.lastAction,
            hasActions: !!data.pickBanData?.actions
        });

        // ✅ CORRIGIDO: Aplicar picks e bans sincronizados nas fases
        if (data.pickBanData?.actions && Array.isArray(data.pickBanData.actions)) {
            logDraft('🔄 [DraftPickBan] Aplicando ações do MySQL:', data.pickBanData.actions);
            this.applySyncedActions(data.pickBanData.actions);
        } else {
            logDraft('🔄 [DraftPickBan] Nenhuma ação para aplicar (draft inicial ou sem ações)');
        }

        // ✅ CORRIGIDO: NÃO atualizar currentAction aqui - deixar para applySyncedActions
        // O currentAction será atualizado apenas quando ações forem aplicadas com sucesso

        // ✅ NOVO: Verificar se a sessão foi completada
        if (this.session.currentAction >= this.session.phases.length) {
            logDraft('🎉 [DraftPickBan] Sessão completada após sincronização!');
            this.session.phase = 'completed';
            this.stopTimer();
            this.stopAutoSync();
        }

        // ✅ SIMPLIFICADO: Forçar recálculo do turno atual e interface
        this.forceInterfaceUpdate();

        logDraft('✅ [DraftPickBan] Sincronização aplicada com sucesso');
    }

    // ✅ CORRIGIDO: Forçar sincronização com MySQL para latência baixa
    private forceMySQLSync(): void {
        if (this.showChampionModal) {
            return;
        }

        if (!this.currentPlayer?.summonerName) {
            logDraft('⚠️ [DraftPickBan] currentPlayer.summonerName não disponível para sincronização');
            return;
        }

        this.apiService.checkSyncStatus(this.currentPlayer.summonerName).subscribe({
            next: (response) => {
                logDraft('🔄 [DraftPickBan] Resposta da sincronização MySQL:', {
                    status: response.status,
                    hasPickBanData: !!response.pick_ban_data,
                    totalActions: response.totalActions,
                    currentAction: response.currentAction
                });

                if (response.status === 'draft' && (response.pick_ban_data || response.totalActions > 0)) {
                    let pickBanData = response.pick_ban_data || { actions: [] };

                    // ✅ Parsear pick_ban_data se for string
                    if (typeof pickBanData === 'string') {
                        try {
                            pickBanData = JSON.parse(pickBanData);
                            logDraft('✅ [DraftPickBan] pick_ban_data parseado com sucesso');
                        } catch (error) {
                            logDraft('❌ [DraftPickBan] Erro ao parsear pick_ban_data:', error);
                            return;
                        }
                    }

                    // ✅ Garantir que actions seja um array
                    if (!pickBanData.actions) {
                        pickBanData.actions = [];
                    }

                    // ✅ Mapear team1/team2 para blueTeam/redTeam (CORRIGIDO: garantir alinhamento com backend)
                    let blueTeam = pickBanData.team1 || response.team1 || [];
                    let redTeam = pickBanData.team2 || response.team2 || [];

                    // Validação extra: se os nomes dos jogadores de blueTeam estão com teamIndex >= 5, provavelmente está invertido
                    if (blueTeam.length > 0 && blueTeam[0].teamIndex >= 5) {
                        // Inverter para garantir alinhamento
                        logDraft('[DraftPickBan] ⚠️ Detected blueTeam com teamIndex >= 5, invertendo times para alinhar com backend!');
                        const temp = blueTeam;
                        blueTeam = redTeam;
                        redTeam = temp;
                    }

                    const phases = pickBanData.phases || [];
                    const currentAction = pickBanData.currentAction ?? response.currentAction ?? 0;

                    // ✅ Sobrescrever completamente o estado local
                    this.session = {
                        ...this.session,
                        ...response,
                        blueTeam,
                        redTeam,
                        phases,
                        currentAction,
                        actions: pickBanData.actions || [],
                        phase: pickBanData.phase || 'bans',
                        team1Picks: pickBanData.team1Picks || [],
                        team1Bans: pickBanData.team1Bans || [],
                        team2Picks: pickBanData.team2Picks || [],
                        team2Bans: pickBanData.team2Bans || []
                    };

                    logDraft('🔄 [DraftPickBan] Estado local sobrescrito com dados do backend (após validação de times):', {
                        blueTeam: (this.session?.blueTeam || []).map(p => ({ name: p.summonerName, teamIndex: p.teamIndex })),
                        redTeam: (this.session?.redTeam || []).map(p => ({ name: p.summonerName, teamIndex: p.teamIndex })),
                        phasesLength: phases.length,
                        actionsLength: pickBanData.actions.length,
                        currentAction: currentAction
                    });

                    // ✅ Aplicar ações sincronizadas se houver
                    if (pickBanData.actions && pickBanData.actions.length > 0) {
                        logDraft('🔄 [DraftPickBan] Aplicando ações sincronizadas do MySQL');
                        this.applySyncedActions(pickBanData.actions);
                    }

                    // ✅ Forçar atualização da interface
                    this.forceInterfaceUpdate();

                    logDraft('✅ [DraftPickBan] Sincronização MySQL aplicada com sucesso');
                } else {
                    logDraft('⚠️ [DraftPickBan] Status não é draft ou não há dados para sincronizar');
                }
                // NOVO: Se estava aguardando backend e avançou a ação, libera o modal
                if (this.isWaitingBackend) {
                    const currentPhase = this.session?.phases?.[this.session?.currentAction];
                    if (!currentPhase || !this.isMyTurn || currentPhase.locked) {
                        logDraft('✅ [DraftPickBan] Backend confirmou ação, liberando modal');
                        this.isWaitingBackend = false;
                    }
                }
            },
            error: (error) => {
                logDraft('❌ [DraftPickBan] Erro na sincronização MySQL:', error);
                this.syncErrorCount++;
                if (this.syncErrorCount > 5) {
                    logDraft('⚠️ [DraftPickBan] Muitos erros de sincronização, tentando reconectar...');
                    this.syncErrorCount = 0;
                }
            }
        });
    }

    // ✅ CORRIGIDO: Aplicar ações sincronizadas do MySQL nas fases locais na ordem correta
    private applySyncedActions(actions: any[]): void {
        logDraft('🔄 [DraftPickBan] Aplicando ações sincronizadas:', actions);

        // ✅ NOVO: Garantir que os campeões estejam carregados antes de aplicar ações
        if (!this.champions || this.champions.length === 0) {
            logDraft('⚠️ [applySyncedActions] Campeões ainda não carregados, agendando retry...');
            setTimeout(() => this.applySyncedActions(actions), 200);
            return;
        }

        if (!this.session?.phases) {
            logDraft('❌ [DraftPickBan] Fases não inicializadas');
            return;
        }

        // ✅ NOVO: Sempre sobrescrever as fases locais com os dados do backend
        let maxActionIndex = -1;
        let actionsApplied = 0;
        for (const action of actions) {
            const actionIndex = action.actionIndex || 0;
            maxActionIndex = Math.max(maxActionIndex, actionIndex);
            const phase = this.session.phases[actionIndex];
            if (!phase) {
                logDraft(`❌ [DraftPickBan] Fase ${actionIndex} não encontrada`);
                continue;
            }
            // Encontrar o campeão pelo ID
            const champion = this.champions.find(c => c.id === action.championId?.toString());
            if (champion) {
                // Sobrescrever SEMPRE os dados da fase
                phase.champion = champion;
                phase.locked = true;
                phase.playerName = action.playerName || action.playerId || 'Unknown';
                phase.playerId = action.playerName || action.playerId || 'Unknown';
                if (action.teamIndex) {
                    phase.team = action.teamIndex === 1 ? 'blue' : 'red';
                }
                if (action.playerIndex !== undefined) {
                    phase.playerIndex = action.playerIndex;
                }
                actionsApplied++;
                logDraft(`✅ [DraftPickBan] Fase ${actionIndex} sobrescrita com ação do backend:`, {
                    playerName: phase.playerName,
                    playerId: phase.playerId,
                    champion: champion.name,
                    team: phase.team,
                    playerIndex: phase.playerIndex
                });
            } else {
                logDraft(`⚠️ [DraftPickBan] Campeão não encontrado para ID ${action.championId}`);
            }
        }
        // Atualizar currentAction para o maior actionIndex + 1
        if (maxActionIndex + 1 !== this.session.currentAction) {
            logDraft(`🔄 [DraftPickBan] Atualizando currentAction de ${this.session.currentAction} para ${maxActionIndex + 1}`);
            this.session.currentAction = maxActionIndex + 1;
        }
        logDraft(`✅ [DraftPickBan] Sincronização aplicada. Ações aplicadas: ${actionsApplied}, CurrentAction final: ${this.session.currentAction}`);
        this.forceInterfaceUpdate();
        this.checkForBotAutoAction();
    }

    // ✅ OTIMIZADO: Iniciar sincronização automática com latência baixa
    private startAutoSync(): void {
        logDraft('🔄 [DraftPickBan] Iniciando sincronização automática');

        // ✅ OTIMIZADO: Sincronização a cada 500ms para latência baixa
        this.realTimeSyncTimer = window.setInterval(() => {
            this.forceMySQLSync();
        }, 500);

        logDraft('✅ [DraftPickBan] Sincronização automática iniciada (500ms)');
    }

    // ✅ SIMPLIFICADO: Parar sincronização automática
    private stopAutoSync(): void {
        if (this.realTimeSyncTimer) {
            clearInterval(this.realTimeSyncTimer);
            this.realTimeSyncTimer = null;
            logDraft('🛑 [DraftPickBan] Sincronização automática parada');
        }
    }

    // ✅ NOVO: Método para notificar backend sobre sincronização
    private async notifyBackendSync(): Promise<void> {
        logDraft('🔄 [notifyBackendSync] Notificando backend sobre sincronização');

        if (!this.currentPlayer?.summonerName || !this.matchData?.id) {
            logDraft('⚠️ [notifyBackendSync] Dados insuficientes para notificação');
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
                        logDraft('✅ [notifyBackendSync] Notificação enviada com sucesso:', response);
                        resolve(response);
                    },
                    error: (error) => {
                        logDraft('❌ [notifyBackendSync] Erro ao notificar backend:', error);
                        reject(error);
                    }
                });
            });
        } catch (error) {
            logDraft('❌ [notifyBackendSync] Erro na notificação:', error);
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

    // ✅ NOVO: Função para normalizar jogadores dos times
    private normalizeTeamPlayers(team: any[]): any[] {
        // Apenas retorna o array original, sem sobrescrever nada
        return team ? team.map(player => ({ ...player })) : [];
    }

    // ✅ NOVO: Função para acionar bots automaticamente se for o turno deles
    private checkForBotAutoAction(): void {
        if (!this.session) return;
        const currentPhase = this.session.phases[this.session.currentAction];
        if (!currentPhase) return;
        const teamPlayers = currentPhase.team === 'blue' ? this.session.blueTeam : this.session.redTeam;
        const phasePlayer = teamPlayers.find(p => this.botService.comparePlayerWithId(p, currentPhase.playerId || ''));
        if (phasePlayer && phasePlayer.isBot) {
            logDraft('[Bot] É turno de bot, agendando ação automática...');
            // Agendar ação do bot (delay máximo 1.5s)
            if (this.botPickTimer) {
                this.botService.cancelScheduledAction(this.botPickTimer);
            }
            this.botPickTimer = this.botService.scheduleBotAction(
                currentPhase,
                this.session,
                this.champions,
                async () => {
                    logDraft('[Bot] Executando ação automática do bot, enviando ao backend...');
                    // Enviar ação do bot ao backend
                    if (currentPhase.champion) {
                        await this.sendDraftActionToBackend(currentPhase.champion, currentPhase.action, currentPhase.playerId);
                        // Forçar sync imediatamente
                        this.forceMySQLSync();
                    } else {
                        logDraft('[Bot] Erro: currentPhase.champion está indefinido, não enviando ao backend.');
                    }
                }
            );
        }
    }

    // ✅ NOVO: Método para verificar se um jogador é autofill
    isPlayerAutofill(player: any): boolean {
        return player.isAutofill === true;
    }

    // ✅ NOVO: Método para obter texto de lane com autofill
    getLaneDisplayWithAutofill(player: any): string {
        const lane = this.getLaneDisplay(player.lane || player.assignedLane);
        const autofillText = this.isPlayerAutofill(player) ? ' (Autofill)' : '';
        return lane + autofillText;
    }

    // ✅ NOVO: Método para obter classe CSS baseada no autofill
    getAutofillClass(player: any): string {
        return this.isPlayerAutofill(player) ? 'autofill-player' : '';
    }

    // ✅ NOVO: Métodos trackBy para otimizar ngFor
    trackByPlayer(index: number, player: any): string {
        return player.summonerName || player.name || index.toString();
    }

    trackByChampion(index: number, champion: Champion): string {
        return champion.id || champion.key || index.toString();
    }
}