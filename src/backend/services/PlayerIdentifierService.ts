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
     */
    static validateDraftAction(
        match: any,
        playerId: string,
        action: 'pick' | 'ban',
        currentActionIndex: number
    ): { valid: boolean; reason?: string } {

        // Extrair jogadores dos times
        const team1Players = typeof match.team1_players === 'string'
            ? JSON.parse(match.team1_players)
            : (match.team1_players || []);

        const team2Players = typeof match.team2_players === 'string'
            ? JSON.parse(match.team2_players)
            : (match.team2_players || []);

        // Verificar se jogador está em algum dos times
        const allPlayers = [...team1Players, ...team2Players];
        const playerInMatch = allPlayers.some(p =>
            this.comparePlayerWithId({ summonerName: p }, playerId)
        );

        if (!playerInMatch) {
            return {
                valid: false,
                reason: `Jogador ${playerId} não encontrado na partida`
            };
        }

        // TODO: Implementar validação de turno específico
        // Por enquanto, aceitar qualquer jogador do time
        return { valid: true };
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