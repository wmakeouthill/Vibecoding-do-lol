/**
 * Serviço centralizado para padronizar a identificação de jogadores e bots
 * Garante consistência entre frontend e backend
 */

export interface PlayerIdentifier {
    id: string;
    name: string;
    isBot: boolean;
    teamIndex: number;
    lane: string;
    gameName?: string;
    tagLine?: string;
    summonerName?: string;
}

export class PlayerIdentifierService {

    /**
     * Padroniza a identificação de um jogador
     * Usado tanto no frontend quanto no backend para garantir consistência
     */
    static normalizePlayerIdentifier(playerInfo: any): PlayerIdentifier {
        if (!playerInfo) {
            return {
                id: '',
                name: '',
                isBot: false,
                teamIndex: 0,
                lane: 'unknown'
            };
        }

        // Extrair nome do jogador com prioridade
        let name = '';
        let gameName = '';
        let tagLine = '';
        let summonerName = '';

        // Prioridade 1: gameName#tagLine (padrão Riot)
        if (playerInfo.gameName && playerInfo.tagLine) {
            gameName = playerInfo.gameName;
            tagLine = playerInfo.tagLine;
            name = `${gameName}#${tagLine}`;
        }
        // Prioridade 2: displayName (se já está no formato correto)
        else if (playerInfo.displayName && playerInfo.displayName.includes('#')) {
            name = playerInfo.displayName;
            const parts = name.split('#');
            gameName = parts[0];
            tagLine = parts[1] || '';
        }
        // Prioridade 3: summonerName (fallback)
        else if (playerInfo.summonerName) {
            summonerName = playerInfo.summonerName;
            name = summonerName;
        }
        // Prioridade 4: name (fallback)
        else if (playerInfo.name) {
            name = playerInfo.name;
        }

        // Normalizar nome para comparações
        const normalizedName = name.toLowerCase().trim();

        // Identificar se é bot usando padrão padronizado
        const isBot = this.isBotPlayer(normalizedName);

        return {
            id: playerInfo.id?.toString() || name,
            name: normalizedName,
            isBot,
            teamIndex: playerInfo.teamIndex || 0,
            lane: playerInfo.lane || playerInfo.assignedLane || 'unknown',
            gameName,
            tagLine,
            summonerName
        };
    }

    /**
 * Verifica se um jogador é bot baseado no nome
 * Padrão padronizado usado tanto no frontend quanto no backend
 * Bots têm nomes simples: Bot1, Bot2, Bot3, etc.
 */
    static isBotPlayer(playerName: string): boolean {
        if (!playerName) return false;

        const name = playerName.trim();

        // ✅ SIMPLIFICADO: Apenas padrão Bot1, Bot2, Bot3, etc.
        const botPattern = /^Bot\d+$/i;
        const isBot = botPattern.test(name);

        console.log(`🤖 [PlayerIdentifier] Verificando bot: "${name}" = ${isBot}`);
        return isBot;
    }

    /**
     * Compara dois jogadores para verificar se são o mesmo
     */
    static comparePlayers(player1: any, player2: any): boolean {
        if (!player1 || !player2) return false;

        const normalized1 = this.normalizePlayerIdentifier(player1);
        const normalized2 = this.normalizePlayerIdentifier(player2);

        // Comparar por ID se disponível
        if (normalized1.id && normalized2.id && normalized1.id === normalized2.id) {
            return true;
        }

        // Comparar por nome normalizado
        if (normalized1.name && normalized2.name && normalized1.name === normalized2.name) {
            return true;
        }

        // Comparar por gameName#tagLine se disponível
        if (normalized1.gameName && normalized1.tagLine &&
            normalized2.gameName && normalized2.tagLine) {
            return normalized1.gameName === normalized2.gameName &&
                normalized1.tagLine === normalized2.tagLine;
        }

        return false;
    }

    /**
     * Compara um jogador com um ID específico
     */
    static comparePlayerWithId(player: any, targetId: string): boolean {
        if (!player || !targetId) return false;

        const normalized = this.normalizePlayerIdentifier(player);
        const targetNormalized = targetId.toLowerCase().trim();

        return normalized.name === targetNormalized ||
            normalized.id === targetNormalized;
    }

    /**
     * Extrai informações de lane de um jogador
     */
    static getPlayerLaneInfo(player: any): { lane: string; isAutofill: boolean } {
        const normalized = this.normalizePlayerIdentifier(player);

        return {
            lane: normalized.lane,
            isAutofill: player.isAutofill || false
        };
    }

    /**
     * Valida se um jogador pode executar uma ação específica no draft
     * ✅ MELHORADO: Agora valida turno específico baseado no fluxo do draft
     */
    static validateDraftAction(
        match: any,
        playerId: string,
        action: 'pick' | 'ban',
        currentActionIndex: number
    ): { valid: boolean; reason?: string } {

        console.log(`🔍 [PlayerIdentifier] Validando ação ${action} para ${playerId} na posição ${currentActionIndex}`);

        // Extrair pick_ban_data
        let pickBanData: any = {};
        if (match.pick_ban_data) {
            pickBanData = typeof match.pick_ban_data === 'string' ? JSON.parse(match.pick_ban_data) : match.pick_ban_data;
        }

        // Extrair fase atual
        const phase = pickBanData.phases && Array.isArray(pickBanData.phases)
            ? pickBanData.phases[currentActionIndex]
            : null;
        if (!phase) {
            console.log(`❌ [PlayerIdentifier] Fase ${currentActionIndex} não encontrada no fluxo do draft`);
            return {
                valid: false,
                reason: `Fase ${currentActionIndex} não encontrada no fluxo do draft`
            };
        }

        // Buscar jogador esperado pelo playerIndex e team
        const teamArr = phase.team === 1 ? pickBanData.team1 : pickBanData.team2;
        const expectedPlayerObj = teamArr && teamArr[phase.playerIndex];
        if (!expectedPlayerObj) {
            console.log(`❌ [PlayerIdentifier] Jogador esperado não encontrado para team=${phase.team}, playerIndex=${phase.playerIndex}`);
            return {
                valid: false,
                reason: `Jogador esperado não encontrado para team=${phase.team}, playerIndex=${phase.playerIndex}`
            };
        }
        const expectedPlayerName = expectedPlayerObj.summonerName;
        // Permitir também gameName#tagLine se disponível
        const expectedRiotId = expectedPlayerObj.riotId || expectedPlayerObj.gameName && expectedPlayerObj.tagLine ? `${expectedPlayerObj.gameName}#${expectedPlayerObj.tagLine}` : null;

        // Validar se playerId bate com o esperado
        if (playerId !== expectedPlayerName && (!expectedRiotId || playerId !== expectedRiotId)) {
            console.log(`❌ [PlayerIdentifier] Não é o turno de ${playerId}. Esperado: ${expectedPlayerName}${expectedRiotId ? ' ou ' + expectedRiotId : ''}`);
            return {
                valid: false,
                reason: `Não é o turno de ${playerId}. Esperado: ${expectedPlayerName}${expectedRiotId ? ' ou ' + expectedRiotId : ''}`
            };
        }

        console.log(`✅ [PlayerIdentifier] Validação aprovada para ${playerId} na ação ${currentActionIndex}`);
        return { valid: true };
    }

    /**
     * ✅ NOVO: Obtém o jogador esperado para uma ação específica baseado no fluxo do draft
     */
    private static getExpectedPlayerForAction(match: any, actionIndex: number): string | null {
        try {
            const draftFlow = this.generateDraftFlow(match);
            const expectedPlayer = draftFlow[actionIndex];

            console.log(`🔍 [PlayerIdentifier] Ação ${actionIndex}: esperado ${expectedPlayer}`);
            return expectedPlayer || null;
        } catch (error) {
            console.error(`❌ [PlayerIdentifier] Erro ao obter jogador esperado para ação ${actionIndex}:`, error);
            return null;
        }
    }

    /**
     * ✅ NOVO: Gera o fluxo completo do draft baseado nos jogadores da partida
     * Segue exatamente o padrão da partida ranqueada do LoL
     */
    private static generateDraftFlow(match: any): string[] {
        const team1Players = typeof match.team1_players === 'string'
            ? JSON.parse(match.team1_players)
            : (match.team1_players || []);

        const team2Players = typeof match.team2_players === 'string'
            ? JSON.parse(match.team2_players)
            : (match.team2_players || []);

        // Garantir que temos exatamente 5 jogadores por time
        if (team1Players.length !== 5 || team2Players.length !== 5) {
            console.error(`❌ [PlayerIdentifier] Times inválidos: Blue=${team1Players.length}, Red=${team2Players.length}`);
            return [];
        }

        // ✅ FLUXO DO DRAFT RANQUEADO (20 ações):
        // Ações 0-5: Primeira fase de bans (3 por time)
        // Ações 6-11: Primeira fase de picks (3 por time)  
        // Ações 12-15: Segunda fase de bans (2 por time)
        // Ações 16-19: Segunda fase de picks (2 por time)

        const draftFlow = [
            // Primeira Fase de Banimento (6 bans - 3 por time)
            team1Players[0], // Ação 0: Jogador 1 Blue (Top) - Ban
            team2Players[0], // Ação 1: Jogador 1 Red (Top) - Ban
            team1Players[1], // Ação 2: Jogador 2 Blue (Jungle) - Ban
            team2Players[1], // Ação 3: Jogador 2 Red (Jungle) - Ban
            team1Players[2], // Ação 4: Jogador 3 Blue (Mid) - Ban
            team2Players[2], // Ação 5: Jogador 3 Red (Mid) - Ban

            // Primeira Fase de Picks (6 picks - 3 por time)
            team1Players[0], // Ação 6: Jogador 1 Blue (Top) - Pick (First Pick)
            team2Players[0], // Ação 7: Jogador 1 Red (Top) - Pick
            team2Players[1], // Ação 8: Jogador 2 Red (Jungle) - Pick
            team1Players[1], // Ação 9: Jogador 2 Blue (Jungle) - Pick
            team1Players[2], // Ação 10: Jogador 3 Blue (Mid) - Pick
            team2Players[2], // Ação 11: Jogador 3 Red (Mid) - Pick

            // Segunda Fase de Banimento (4 bans - 2 por time)
            team2Players[3], // Ação 12: Jogador 4 Red (ADC) - Ban
            team1Players[3], // Ação 13: Jogador 4 Blue (ADC) - Ban
            team2Players[4], // Ação 14: Jogador 5 Red (Support) - Ban
            team1Players[4], // Ação 15: Jogador 5 Blue (Support) - Ban

            // Segunda Fase de Picks (4 picks - 2 por time)
            team2Players[3], // Ação 16: Jogador 4 Red (ADC) - Pick
            team1Players[3], // Ação 17: Jogador 4 Blue (ADC) - Pick
            team1Players[4], // Ação 18: Jogador 5 Blue (Support) - Pick
            team2Players[4]  // Ação 19: Jogador 5 Red (Support) - Pick (Last Pick)
        ];

        console.log(`✅ [PlayerIdentifier] Fluxo do draft gerado: ${draftFlow.length} ações`);
        console.log(`🔍 [PlayerIdentifier] Primeiras 5 ações:`, draftFlow.slice(0, 5));
        console.log(`🔍 [PlayerIdentifier] Últimas 5 ações:`, draftFlow.slice(-5));

        return draftFlow;
    }

    /**
     * Gera um identificador único para uma ação de draft
     */
    static generateDraftActionKey(
        matchId: number,
        playerId: string,
        championId: number,
        action: 'pick' | 'ban'
    ): string {
        return `${matchId}-${playerId}-${championId}-${action}`;
    }

    /**
     * Loga informações de debug sobre identificação de jogadores
     */
    static logPlayerIdentification(player: any, context: string = ''): void {
        const normalized = this.normalizePlayerIdentifier(player);

        console.log(`🔍 [PlayerIdentifier] ${context}:`, {
            original: {
                id: player.id,
                name: player.name,
                summonerName: player.summonerName,
                gameName: player.gameName,
                tagLine: player.tagLine,
                displayName: player.displayName
            },
            normalized: {
                id: normalized.id,
                name: normalized.name,
                isBot: normalized.isBot,
                teamIndex: normalized.teamIndex,
                lane: normalized.lane
            }
        });
    }

    /**
     * Obtém o identificador único de um jogador
     * Usado para comparações e validações
     */
    static getPlayerIdentifier(playerInfo: any): string | null {
        if (!playerInfo) return null;

        const normalized = this.normalizePlayerIdentifier(playerInfo);

        // Priorizar gameName#tagLine se disponível
        if (normalized.gameName && normalized.tagLine) {
            return `${normalized.gameName}#${normalized.tagLine}`;
        }

        // Fallback para nome normalizado
        return normalized.name || null;
    }

    /**
     * Verifica se um jogador está na lista de jogadores da partida
     * Usado para validação de notificações
     */
    static isPlayerInMatch(playerInfo: any, playersInMatch: string[]): boolean {
        if (!playerInfo || !playersInMatch || playersInMatch.length === 0) {
            return false;
        }

        const playerIdentifier = this.getPlayerIdentifier(playerInfo);
        if (!playerIdentifier) return false;

        // Normalizar identificador do jogador
        const normalizedPlayerId = playerIdentifier.toLowerCase().trim();

        // Verificar se está na lista de jogadores da partida
        return playersInMatch.some(matchPlayer => {
            const normalizedMatchPlayer = matchPlayer.toLowerCase().trim();
            return normalizedMatchPlayer === normalizedPlayerId;
        });
    }
} 