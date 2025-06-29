import { Component, Input, Output, EventEmitter, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ChampionService, Champion } from '../../services/champion.service';

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
    imports: [CommonModule, FormsModule],
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

    // PROPRIEDADES PARA CACHE E PERFORMANCE
    private _cachedSortedBlueTeam: any[] | null = null;
    private _cachedSortedRedTeam: any[] | null = null;
    private _cachedBannedChampions: Champion[] | null = null;
    private _cachedBlueTeamPicks: Champion[] | null = null;
    private _cachedRedTeamPicks: Champion[] | null = null;
    private _lastCacheUpdate: number = 0;
    private readonly CACHE_DURATION = 100;

    // SISTEMA DE CACHE INTELIGENTE
    private _sessionStateHash: string = '';
    private _currentActionHash: string = '';
    private _phaseHash: string = '';
    private _lastStateUpdate: number = 0;
    private _cacheInvalidationNeeded: boolean = false;

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

        if (id < 0) {
            return true;
        }

        if (typeof id === 'string') {
            const numericId = parseInt(id);
            if (!isNaN(numericId) && numericId < 0) {
                return true;
            }

            if (id.toLowerCase().includes('bot') || id.startsWith('-')) {
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
                return true;
            }
        }

        if (name.toLowerCase().includes('bot')) {
            return true;
        }

        if (name.toLowerCase().includes('ai')) {
            return true;
        }

        if (/\d/.test(name) && (name.toLowerCase().includes('bot') || name.toLowerCase().includes('ai'))) {
            return true;
        }

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
        if (!this.matchData) return;

        const processTeamData = (teamData: any[]): any[] => {
            return teamData.map((player, index) => ({
                ...player,
                lane: this.getLaneForIndex(index),
                originalIndex: index
            }));
        };

        this.session = {
            id: this.matchData.id || 'session-' + Date.now(),
            phase: 'bans',
            currentAction: 0,
            extendedTime: 0,
            phases: [],
            blueTeam: processTeamData(this.matchData.blueTeam || []),
            redTeam: processTeamData(this.matchData.redTeam || []),
            currentPlayerIndex: 0
        };

        this.generatePhases();
        this.updateCurrentTurn();
        this.startTimer();
    }

    private getLaneForIndex(index: number): string {
        const lanes = ['top', 'jungle', 'mid', 'adc', 'support'];
        return lanes[index] || 'unknown';
    }

    private generatePhases() {
        if (!this.session) return;

        this.session.phases = [];

        // Fase de bans (3 bans por time)
        for (let i = 0; i < 6; i++) {
            this.session.phases.push({
                team: i % 2 === 0 ? 'blue' : 'red',
                action: 'ban',
                locked: false,
                timeRemaining: 30
            });
        }

        // Fase de picks (5 picks por time, alternando)
        for (let i = 0; i < 10; i++) {
            this.session.phases.push({
                team: i % 2 === 0 ? 'blue' : 'red',
                action: 'pick',
                locked: false,
                timeRemaining: 30
            });
        }
    }

    updateCurrentTurn() {
        if (!this.session) return;

        const currentPhase = this.session.phases[this.session.currentAction];
        if (!currentPhase) return;

        const currentTeam = currentPhase.team;
        const teamPlayers = currentTeam === 'blue' ? this.session.blueTeam : this.session.redTeam;

        if (currentPhase.action === 'ban') {
            // Para bans, usar o líder do time
            const teamLeader = teamPlayers[0];
            currentPhase.playerId = teamLeader?.id?.toString() || teamLeader?.summonerName;
            currentPhase.playerName = teamLeader?.summonerName || teamLeader?.name;
        } else {
            // Para picks, alternar entre jogadores do time
            const pickIndex = Math.floor(this.session.currentAction / 2) - 3; // -3 porque os primeiros 6 são bans
            const playerIndex = pickIndex % 5;
            const player = teamPlayers[playerIndex];
            currentPhase.playerId = player?.id?.toString() || player?.summonerName;
            currentPhase.playerName = player?.summonerName || player?.name;
        }

        this.checkForBotAutoAction(currentPhase);
        this.isMyTurn = this.checkIfMyTurn(currentPhase);
    }

    private checkForBotAutoAction(phase: PickBanPhase) {
        if (!phase.playerId) return;

        const currentTeam = phase.team;
        const teamPlayers = currentTeam === 'blue' ? this.session!.blueTeam : this.session!.redTeam;
        const currentPlayer = teamPlayers.find(p => this.comparePlayerWithId(p, phase.playerId!));

        if (currentPlayer && this.isBot(currentPlayer)) {
            this.botPickTimer = setTimeout(() => {
                this.performBotAction(phase);
            }, 2000 + Math.random() * 3000);
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
        if (!this.session) return;

        const availableChampions = this.champions.filter(c =>
            !this.isChampionBanned(c) && !this.isChampionPicked(c)
        );

        if (availableChampions.length === 0) return;

        const randomChampion = availableChampions[Math.floor(Math.random() * availableChampions.length)];

        phase.champion = randomChampion;
        phase.locked = true;
        phase.timeRemaining = 0;

        this.session.currentAction++;

        if (this.session.currentAction >= this.session.phases.length) {
            this.session.phase = 'completed';
            this.stopTimer();
        } else {
            this.updateCurrentTurn();
        }
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
        this._cachedSortedBlueTeam = null;
        this._cachedSortedRedTeam = null;
        this._cachedBannedChampions = null;
        this._cachedBlueTeamPicks = null;
        this._cachedRedTeamPicks = null;
        this._lastCacheUpdate = Date.now();
    }

    private isCacheValid(): boolean {
        return Date.now() - this._lastCacheUpdate < this.CACHE_DURATION;
    }

    getBannedChampions(): Champion[] {
        if (this.isCacheValid() && this._cachedBannedChampions) {
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
        if (team === 'blue' && this.isCacheValid() && this._cachedBlueTeamPicks) {
            return this._cachedBlueTeamPicks;
        }
        if (team === 'red' && this.isCacheValid() && this._cachedRedTeamPicks) {
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
        if (team === 'blue' && this.isCacheValid() && this._cachedSortedBlueTeam) {
            return this._cachedSortedBlueTeam;
        }
        if (team === 'red' && this.isCacheValid() && this._cachedSortedRedTeam) {
            return this._cachedSortedRedTeam;
        }

        if (!this.session) return [];

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
        this.onOpenChampionModal.emit();
    }

    openConfirmationModal(): void {
        this.onOpenConfirmationModal.emit();
    }

    // MÉTODO PARA RECEBER SELEÇÃO DO MODAL
    onChampionSelected(champion: Champion): void {
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

        return JSON.stringify({
            currentAction: this.session.currentAction,
            phase: this.session.phase,
            phases: this.session.phases.map(p => ({
                action: p.action,
                team: p.team,
                locked: p.locked,
                championId: p.champion?.id
            }))
        });
    }

    private checkStateChange(): boolean {
        const newHash = this.generateSessionStateHash();
        const hasChanged = newHash !== this._sessionStateHash;

        if (hasChanged) {
            this._sessionStateHash = newHash;
            this._lastStateUpdate = Date.now();
            this.invalidateCache();
        }

        return hasChanged;
    }

    private forceCacheInvalidation(): void {
        this._cacheInvalidationNeeded = true;
        this.invalidateCache();
    }
} 