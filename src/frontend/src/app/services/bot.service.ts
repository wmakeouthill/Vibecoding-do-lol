import { Injectable } from '@angular/core';
import { Champion } from './champion.service';

export interface PickBanPhase {
    team: 'blue' | 'red';
    action: 'ban' | 'pick';
    champion?: Champion;
    playerId?: string;
    playerName?: string;
    playerIndex?: number;
    locked: boolean;
    timeRemaining: number;
}

export interface CustomPickBanSession {
    id: string;
    phase: 'bans' | 'picks' | 'completed';
    currentAction: number;
    extendedTime: number;
    phases: PickBanPhase[];
    blueTeam: any[];
    redTeam: any[];
    currentPlayerIndex: number;
}

@Injectable({
    providedIn: 'root'
})
export class BotService {

    constructor() { }

    /**
     * Verifica se um jogador é bot
     */
    isBot(player: any): boolean {
        if (!player) return false;

        const name = player.summonerName || player.name || '';
        const id = player.id;

        console.log(`🤖 [BotService] Verificando jogador: ${name} (ID: ${id})`);

        if (id < 0) {
            console.log(`🤖 [BotService] ID negativo detectado: ${id}`);
            return true;
        }

        if (typeof id === 'string') {
            const numericId = parseInt(id);
            if (!isNaN(numericId) && numericId < 0) {
                console.log(`🤖 [BotService] ID string negativo detectado: ${numericId}`);
                return true;
            }

            if (id.toLowerCase().includes('bot') || id.startsWith('-')) {
                console.log(`🤖 [BotService] ID contém 'bot' ou começa com '-': ${id}`);
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
                console.log(`🤖 [BotService] Padrão de bot detectado: ${pattern.source}`);
                return true;
            }
        }

        if (name.toLowerCase().includes('bot')) {
            console.log(`🤖 [BotService] Nome contém 'bot': ${name}`);
            return true;
        }

        if (name.toLowerCase().includes('ai')) {
            console.log(`🤖 [BotService] Nome contém 'ai': ${name}`);
            return true;
        }

        if (/\d/.test(name) && (name.toLowerCase().includes('bot') || name.toLowerCase().includes('ai'))) {
            console.log(`🤖 [BotService] Nome com número e bot/ai: ${name}`);
            return true;
        }

        console.log(`🤖 [BotService] Jogador não é bot: ${name}`);
        return false;
    }

    /**
     * Método auxiliar para comparar jogadores de forma consistente
     */
    comparePlayers(player1: any, player2: any): boolean {
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
    comparePlayerWithId(player: any, targetId: string): boolean {
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

    /**
     * Verifica se uma fase deve ter ação automática de bot
     */
    shouldPerformBotAction(phase: PickBanPhase, session: CustomPickBanSession): boolean {
        console.log('🤖 [BotService] === VERIFICANDO AÇÃO AUTOMÁTICA ===');
        console.log('🤖 [BotService] Phase:', phase);

        if (!phase.playerId) {
            console.log('⚠️ [BotService] Phase não tem playerId');
            return false;
        }

        const currentTeam = phase.team;
        const teamPlayers = currentTeam === 'blue' ? session.blueTeam : session.redTeam;
        
        console.log(`🤖 [BotService] Time atual: ${currentTeam}`);
        console.log(`🤖 [BotService] Jogadores do time:`, teamPlayers.map(p => ({
            id: p.id,
            name: p.summonerName,
            lane: p.lane,
            isBot: this.isBot(p)
        })));
        console.log(`🤖 [BotService] Procurando playerId: ${phase.playerId}`);

        const currentPlayer = teamPlayers.find(p => this.comparePlayerWithId(p, phase.playerId!));

        console.log('🤖 [BotService] Current player encontrado:', currentPlayer);
        console.log('🤖 [BotService] É bot?', currentPlayer ? this.isBot(currentPlayer) : false);

        const result = currentPlayer ? this.isBot(currentPlayer) : false;
        console.log(`🤖 [BotService] Resultado final: ${result}`);
        console.log('🤖 [BotService] === FIM DA VERIFICAÇÃO ===');

        return result;
    }

    /**
     * Executa ação automática do bot
     */
    performBotAction(phase: PickBanPhase, session: CustomPickBanSession, champions: Champion[]): void {
        console.log('🤖 [BotService] === EXECUTANDO AÇÃO DO BOT ===');
        console.log('🤖 [BotService] Executando ação do bot para fase:', phase);
        console.log(`🤖 [BotService] currentAction antes: ${session.currentAction}`);

        if (!session) {
            console.log('⚠️ [BotService] Session não existe');
            return;
        }

        const availableChampions = champions.filter(c =>
            !this.isChampionBanned(c, session) && !this.isChampionPicked(c, session)
        );

        console.log('🤖 [BotService] Campeões disponíveis:', availableChampions.length);

        if (availableChampions.length === 0) {
            console.log('⚠️ [BotService] Nenhum campeão disponível');
            return;
        }

        const randomChampion = availableChampions[Math.floor(Math.random() * availableChampions.length)];
        console.log('🤖 [BotService] Campeão selecionado:', randomChampion.name);

        phase.champion = randomChampion;
        phase.locked = true;
        phase.timeRemaining = 0;

        session.currentAction++;

        console.log(`🤖 [BotService] currentAction após incremento: ${session.currentAction}`);
        console.log(`🤖 [BotService] total de fases: ${session.phases.length}`);

        if (session.currentAction >= session.phases.length) {
            console.log('🤖 [BotService] Sessão completada');
            session.phase = 'completed';
        } else {
            console.log(`🤖 [BotService] Próxima ação será: ${session.currentAction + 1}`);
        }

        console.log('🤖 [BotService] === FIM DA AÇÃO DO BOT ===');
    }

    /**
     * Verifica se um campeão está banido
     */
    private isChampionBanned(champion: Champion, session: CustomPickBanSession): boolean {
        return session.phases
            .filter(phase => phase.action === 'ban' && phase.champion)
            .some(phase => phase.champion!.id === champion.id);
    }

    /**
     * Verifica se um campeão foi escolhido
     */
    private isChampionPicked(champion: Champion, session: CustomPickBanSession): boolean {
        return session.phases
            .filter(phase => phase.action === 'pick' && phase.champion)
            .some(phase => phase.champion!.id === champion.id);
    }

    /**
     * Agenda uma ação automática do bot com delay
     */
    scheduleBotAction(
        phase: PickBanPhase,
        session: CustomPickBanSession,
        champions: Champion[],
        callback: () => void
    ): number {
        console.log('🤖 [BotService] Agendando ação do bot...');

        const delay = 2000 + Math.random() * 3000; // 2-5 segundos

        return window.setTimeout(() => {
            console.log('🤖 [BotService] Executando ação do bot agendada...');
            this.performBotAction(phase, session, champions);
            callback(); // Callback para atualizar a interface
        }, delay);
    }

    /**
     * Cancela uma ação agendada do bot
     */
    cancelScheduledAction(timerId: number): void {
        if (timerId) {
            clearTimeout(timerId);
            console.log('🤖 [BotService] Ação agendada cancelada');
        }
    }

    /**
     * Verifica se um jogador específico é bot
     */
    isPlayerBot(player: any): boolean {
        return this.isBot(player);
    }

    /**
     * Obtém informações sobre bots em um time
     */
    getBotInfo(team: any[]): { botCount: number, botPlayers: any[] } {
        const botPlayers = team.filter(player => this.isBot(player));
        return {
            botCount: botPlayers.length,
            botPlayers: botPlayers
        };
    }

    /**
     * Verifica se um time tem bots
     */
    hasBots(team: any[]): boolean {
        return team.some(player => this.isBot(player));
    }

    /**
     * Obtém estatísticas de bots na sessão
     */
    getSessionBotStats(session: CustomPickBanSession): {
        blueTeamBots: number;
        redTeamBots: number;
        totalBots: number;
        botPercentage: number;
    } {
        const blueBots = this.getBotInfo(session.blueTeam);
        const redBots = this.getBotInfo(session.redTeam);
        const totalPlayers = session.blueTeam.length + session.redTeam.length;
        const totalBots = blueBots.botCount + redBots.botCount;

        return {
            blueTeamBots: blueBots.botCount,
            redTeamBots: redBots.botCount,
            totalBots: totalBots,
            botPercentage: totalPlayers > 0 ? (totalBots / totalPlayers) * 100 : 0
        };
    }
} 