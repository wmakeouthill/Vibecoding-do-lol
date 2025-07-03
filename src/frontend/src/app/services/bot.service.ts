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
     * ✅ NOVO: Verifica se deve aceitar partida automaticamente
     */
    shouldAutoAcceptMatch(currentPlayer: any): boolean {
        if (!currentPlayer) {
            return false;
        }

        const isBotPlayer = this.isBot(currentPlayer);
        console.log(`🤖 [BotService] shouldAutoAcceptMatch:`, {
            playerName: currentPlayer.summonerName || currentPlayer.gameName,
            isBot: isBotPlayer
        });

        return isBotPlayer;
    }

    /**
     * Verifica se um jogador é um bot
     */
    isBot(player: any): boolean {
        if (!player) {
            console.log('🤖 [BotService] isBot: player é null/undefined');
            return false;
        }

        // Verificar se é um bot baseado no nome
        const playerName = player.name || player.summonerName || '';
        const isBotPlayer = playerName.toLowerCase().includes('bot') || 
                           playerName.toLowerCase().includes('ai') ||
                           playerName.toLowerCase().includes('computer') ||
                           playerName.toLowerCase().includes('cpu');

        console.log(`🤖 [BotService] isBot check:`, {
            playerName: playerName,
            isBot: isBotPlayer,
            id: player.id,
            summonerName: player.summonerName,
            name: player.name
        });

        return isBotPlayer;
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
        if (!player || !targetId) {
            console.log(`🤖 [comparePlayerWithId] Dados inválidos - player: ${!!player}, targetId: ${targetId}`);
            return false;
        }

        const playerId = player.id?.toString();
        const playerName = player.summonerName || player.name || '';
        const playerGameName = player.gameName || '';
        const playerTagLine = player.tagLine || '';

        console.log(`🤖 [comparePlayerWithId] Comparando:`, {
            playerId: playerId,
            playerName: playerName,
            playerGameName: playerGameName,
            playerTagLine: playerTagLine,
            targetId: targetId,
            player: player
        });

        // ✅ CORREÇÃO: Priorizar comparação por summonerName (gameName#tagLine)
        if (playerName === targetId) {
            console.log(`🤖 [comparePlayerWithId] Match por summonerName: ${playerName} === ${targetId}`);
            return true;
        }

        // ✅ CORREÇÃO: Match por Riot ID completo (gameName#tagLine)
        if (playerGameName && playerTagLine) {
            const fullRiotId = `${playerGameName}#${playerTagLine}`;
            if (fullRiotId === targetId) {
                console.log(`🤖 [comparePlayerWithId] Match por Riot ID completo: ${fullRiotId} === ${targetId}`);
                return true;
            }
        }

        // ✅ CORREÇÃO: Match por gameName quando targetId tem tag (quando currentPlayer tem só gameName, mas phase tem gameName#tagLine)
        if (targetId.includes('#')) {
            const targetGameName = targetId.split('#')[0];
            if (playerGameName === targetGameName) {
                console.log(`🤖 [comparePlayerWithId] Match por gameName quando targetId tem tag: ${playerGameName} === ${targetGameName}`);
                return true;
            }
        }

        // ✅ CORREÇÃO: Match por nome quando targetId tem tag (quando currentPlayer tem só name, mas phase tem gameName#tagLine)
        if (targetId.includes('#')) {
            const targetGameName = targetId.split('#')[0];
            if (playerName === targetGameName) {
                console.log(`🤖 [comparePlayerWithId] Match por nome quando targetId tem tag: ${playerName} === ${targetGameName}`);
                return true;
            }
        }

        // ✅ CORREÇÃO: Match por gameName apenas
        if (playerGameName === targetId) {
            console.log(`🤖 [comparePlayerWithId] Match por gameName: ${playerGameName} === ${targetId}`);
            return true;
        }

        // ✅ CORREÇÃO: Match por nome com tag (quando currentPlayer tem nome sem tag, mas phase tem nome com tag)
        if (playerName.includes('#')) {
            const gameName = playerName.split('#')[0];
            if (gameName === targetId) {
                console.log(`🤖 [comparePlayerWithId] Match por gameName do nome: ${gameName} === ${targetId}`);
                return true;
            }
        }

        // ✅ CORREÇÃO: Match por ID (fallback)
        if (playerId === targetId) {
            console.log(`🤖 [comparePlayerWithId] Match por ID: ${playerId} === ${targetId}`);
            return true;
        }

        // ✅ CORREÇÃO: Match por teamIndex (fallback)
        if (player.teamIndex !== undefined && player.teamIndex !== null) {
            const teamIndexStr = player.teamIndex.toString();
            if (teamIndexStr === targetId) {
                console.log(`🤖 [comparePlayerWithId] Match por teamIndex: ${teamIndexStr} === ${targetId}`);
                return true;
            }
        }

        // ✅ CORREÇÃO: Match por summonerId (fallback)
        if (player.summonerId) {
            const summonerIdStr = player.summonerId.toString();
            if (summonerIdStr === targetId) {
                console.log(`🤖 [comparePlayerWithId] Match por summonerId: ${summonerIdStr} === ${targetId}`);
                return true;
            }
        }

        // ✅ CORREÇÃO: Match por puuid (fallback)
        if (player.puuid && player.puuid === targetId) {
            console.log(`🤖 [comparePlayerWithId] Match por puuid: ${player.puuid} === ${targetId}`);
            return true;
        }

        console.log(`🤖 [comparePlayerWithId] Nenhum match encontrado`);
        return false;
    }

    /**
     * Verifica se uma fase deve ter ação automática de bot
     */
    shouldPerformBotAction(phase: PickBanPhase, session: CustomPickBanSession): boolean {
        console.log('🤖 [BotService] === VERIFICANDO AÇÃO AUTOMÁTICA ===');
        console.log('🤖 [BotService] Phase:', phase);
        console.log('🤖 [BotService] Tipo de ação:', phase.action);
        console.log('🤖 [BotService] Session currentAction:', session.currentAction);

        const currentTeam = phase.team;
        const teamPlayers = currentTeam === 'blue' ? session.blueTeam : session.redTeam;
        
        console.log(`🤖 [BotService] Time atual: ${currentTeam}`);
        console.log(`🤖 [BotService] Jogadores do time:`, teamPlayers.map(p => ({
            id: p.id,
            name: p.summonerName,
            lane: p.lane,
            teamIndex: p.teamIndex,
            isBot: this.isBot(p)
        })));

        let currentPlayer = null;

        // ✅ CORREÇÃO: Primeiro tentar pelo playerId se existir
        if (phase.playerId) {
            console.log(`🤖 [BotService] Procurando por playerId: ${phase.playerId}`);
            currentPlayer = teamPlayers.find(p => this.comparePlayerWithId(p, phase.playerId!));
        }

        // ✅ CORREÇÃO: Se não encontrou por playerId, tentar pelo teamIndex
        if (!currentPlayer && phase.playerIndex !== undefined) {
            console.log(`🤖 [BotService] Tentando encontrar por teamIndex: ${phase.playerIndex}`);
            currentPlayer = teamPlayers.find(p => p.teamIndex === phase.playerIndex);
        }

        // ✅ CORREÇÃO: Se ainda não encontrou, tentar pelo índice do array
        if (!currentPlayer && phase.playerIndex !== undefined) {
            console.log(`🤖 [BotService] Tentando encontrar por índice do array: ${phase.playerIndex}`);
            currentPlayer = teamPlayers[phase.playerIndex];
        }

        console.log('🤖 [BotService] Current player encontrado:', currentPlayer);
        
        if (currentPlayer) {
            const isBotPlayer = this.isBot(currentPlayer);
            console.log('🤖 [BotService] É bot?', isBotPlayer);
            console.log('🤖 [BotService] Detalhes do jogador:', {
                id: currentPlayer.id,
                name: currentPlayer.summonerName,
                teamIndex: currentPlayer.teamIndex,
                isBot: isBotPlayer,
                action: phase.action
            });
            return isBotPlayer;
        } else {
            console.log('⚠️ [BotService] Jogador não encontrado!');
            console.log('🤖 [BotService] Phase.playerId:', phase.playerId);
            console.log('🤖 [BotService] Phase.playerIndex:', phase.playerIndex);
            console.log('🤖 [BotService] Todos os jogadores do time:', teamPlayers);
            return false;
        }
    }

    /**
     * Executa ação automática do bot
     */
    performBotAction(phase: PickBanPhase, session: CustomPickBanSession, champions: Champion[]): void {
        console.log('🤖 [BotService] === EXECUTANDO AÇÃO DO BOT ===');
        console.log('🤖 [BotService] Executando ação do bot para fase:', phase);
        console.log('🤖 [BotService] Tipo de ação:', phase.action);
        console.log(`🤖 [BotService] currentAction antes: ${session.currentAction}`);
        console.log(`🤖 [BotService] total de fases: ${session.phases.length}`);

        if (!session) {
            console.log('⚠️ [BotService] Session não existe');
            return;
        }

        if (!phase) {
            console.log('⚠️ [BotService] Phase não existe');
            return;
        }

        const availableChampions = champions.filter(c =>
            !this.isChampionBanned(c, session) && !this.isChampionPicked(c, session)
        );

        console.log('🤖 [BotService] Campeões disponíveis:', availableChampions.length);
        console.log('🤖 [BotService] Primeiros 5 campeões disponíveis:', availableChampions.slice(0, 5).map(c => c.name));

        if (availableChampions.length === 0) {
            console.log('⚠️ [BotService] Nenhum campeão disponível');
            return;
        }

        const randomChampion = availableChampions[Math.floor(Math.random() * availableChampions.length)];
        console.log(`🤖 [BotService] Campeão selecionado para ${phase.action}:`, randomChampion.name);

        // ✅ CORREÇÃO: Garantir que a fase seja atualizada corretamente
        phase.champion = randomChampion;
        phase.locked = true;
        phase.timeRemaining = 0;

        // ✅ NOVO: Clonar o array de fases para garantir detecção de mudança
        session.phases = [...session.phases];

        console.log('🤖 [BotService] Fase atualizada:', {
            team: phase.team,
            action: phase.action,
            champion: phase.champion?.name,
            locked: phase.locked,
            timeRemaining: phase.timeRemaining
        });

        // ✅ CORREÇÃO: Incrementar currentAction
        session.currentAction++;

        console.log(`🤖 [BotService] currentAction após incremento: ${session.currentAction}`);
        console.log(`🤖 [BotService] total de fases: ${session.phases.length}`);

        if (session.currentAction >= session.phases.length) {
            console.log('🤖 [BotService] Sessão completada');
            session.phase = 'completed';
        } else {
            console.log(`🤖 [BotService] Próxima ação será: ${session.currentAction + 1}`);
            console.log(`🤖 [BotService] Próxima fase:`, session.phases[session.currentAction]);
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
     * Agenda uma ação automática do bot
     */
    scheduleBotAction(
        phase: PickBanPhase,
        session: CustomPickBanSession,
        champions: Champion[],
        callback: () => void
    ): number {
        console.log('🤖 [BotService] === AGENDANDO AÇÃO DO BOT ===');
        console.log('🤖 [BotService] Agendando ação para fase:', phase);
        console.log('🤖 [BotService] Tipo de ação:', phase.action);
        console.log('🤖 [BotService] currentAction:', session.currentAction);

        const delay = Math.random() * 2000 + 1000; // 1-3 segundos
        console.log(`🤖 [BotService] Delay agendado: ${delay}ms`);

        const timerId = setTimeout(() => {
            console.log(`🤖 [BotService] === EXECUTANDO AÇÃO AGENDADA (${phase.action}) ===`);
            console.log(`🤖 [BotService] Timer ${timerId} executando para ação ${session.currentAction + 1}`);
            
            this.performBotAction(phase, session, champions);
            
            console.log(`🤖 [BotService] Ação agendada concluída, executando callback`);
            callback();
            
            console.log(`🤖 [BotService] === FIM DA AÇÃO AGENDADA ===`);
        }, delay);

        console.log(`🤖 [BotService] Timer agendado: ${timerId}`);
        console.log(`🤖 [BotService] === FIM DO AGENDAMENTO ===`);
        
        return timerId;
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