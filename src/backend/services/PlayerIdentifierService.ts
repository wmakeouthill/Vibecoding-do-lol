/**
 * Serviço centralizado para padronizar identificação de jogadores
 * Usado por todos os serviços do backend para garantir consistência
 */
export class PlayerIdentifierService {

    // Constante para o special user - centralizada para fácil manutenção
    private static readonly SPECIAL_USER_ID = 'popcorn seller#coup';
    /**
     * Padroniza identificador do jogador (igual em backend e frontend)
     * SEMPRE retorna lowercase para consistência
     * Retorna null se não conseguir normalizar (padronizado)
     */
    static normalizePlayerIdentifier(playerInfo: any): string | null {
        // Validação robusta de entrada
        if (!playerInfo || typeof playerInfo !== 'object') {
            console.warn('⚠️ [PlayerIdentifier] playerInfo inválido:', playerInfo);
            return null;
        }

        // Prioridade 1: gameName#tagLine (padrão) - COM VALIDAÇÃO
        if (playerInfo.gameName && playerInfo.tagLine) {
            const gameName = playerInfo.gameName.toString().trim();
            const tagLine = playerInfo.tagLine.toString().trim();

            // Validação: ambos devem ter conteúdo
            if (gameName.length > 0 && tagLine.length > 0) {
                const identifier = `${gameName}#${tagLine}`.toLowerCase();
                console.log(`🔍 [PlayerIdentifier] Normalizado gameName#tagLine: ${identifier}`);
                return identifier;
            }
        }

        // Prioridade 2displayName (se já está no formato correto gameName#tagLine)
        if (playerInfo.displayName && typeof playerInfo.displayName === 'string') {
            const displayName = playerInfo.displayName.trim();
            if (displayName.includes('#')) {
                const parts = displayName.split('#');
                // Validação: deve ter exatamente 2 partes e ambas com conteúdo
                if (parts.length === 2 && parts[0].trim().length > 0 && parts[1].trim().length > 0) {
                    const identifier = displayName.toLowerCase();
                    console.log(`🔍 [PlayerIdentifier] Normalizado displayName: ${identifier}`);
                    return identifier;
                }
            }
        }

        // Prioridade3summonerName (fallback) - COM VALIDAÇÃO
        if (playerInfo.summonerName && typeof playerInfo.summonerName === 'string') {
            const summonerName = playerInfo.summonerName.trim();
            if (summonerName.length > 0) {
                const identifier = summonerName.toLowerCase();
                console.log(`🔍 [PlayerIdentifier] Normalizado summonerName: ${identifier}`);
                return identifier;
            }
        }

        // Prioridade 4 name (fallback) - COM VALIDAÇÃO
        if (playerInfo.name && typeof playerInfo.name === 'string') {
            const name = playerInfo.name.trim();
            if (name.length > 0) {
                const identifier = name.toLowerCase();
                console.log(`🔍 [PlayerIdentifier] Normalizado name: ${identifier}`);
                return identifier;
            }
        }

        console.warn('⚠️ [PlayerIdentifier] Nenhum identificador válido encontrado:', playerInfo);
        return null;
    }

    /**
     * Verifica se um jogador está na partida
     * COMPARAÇÃO EXATA APENAS - sem fallbacks problemáticos
     */
    static isPlayerInMatch(playerInfo: any, playersInMatch: string[]): boolean {
        // Validação robusta
        if (!playerInfo || !Array.isArray(playersInMatch) || playersInMatch.length === 0) {
            console.warn('⚠️ [PlayerIdentifier] Parâmetros inválidos para isPlayerInMatch:', { playerInfo, playersInMatch });
            return false;
        }

        const playerIdentifier = this.normalizePlayerIdentifier(playerInfo);
        if (!playerIdentifier) {
            console.warn('⚠️ [PlayerIdentifier] Não foi possível obter identificador do jogador:', playerInfo);
            return false;
        }

        // Normalizar todos os playersInMatch para comparação consistente
        const normalizedMatchPlayers = playersInMatch
            .filter(p => p && typeof p === 'string')
            .map(p => p.toLowerCase().trim())
            .filter(p => p.length > 0);

        // Comparação exata apenas
        const isInMatch = normalizedMatchPlayers.includes(playerIdentifier);

        if (isInMatch) {
            console.log(`✅ [PlayerIdentifier] Match exato encontrado: ${playerIdentifier}`);
        } else {
            console.log(`❌ [PlayerIdentifier] Nenhum match exato para: ${playerIdentifier}`);
            console.log(`📋 [PlayerIdentifier] Players na partida:`, normalizedMatchPlayers);
        }

        return isInMatch;
    }

    /**
     * Verifica se é o special user autorizado
     * COMPARAÇÃO EXATA E SEGURA
     */
    static isSpecialUser(playerInfo: any): boolean {
        if (!playerInfo) return false;

        const normalizedId = this.normalizePlayerIdentifier(playerInfo);
        if (!normalizedId) return false;

        // Comparação exata e case-insensitive
        const isSpecial = normalizedId === this.SPECIAL_USER_ID.toLowerCase();

        console.log('🔐 [PlayerIdentifier] Verificação de special user:', {
            normalizedId,
            isSpecial,
            expected: this.SPECIAL_USER_ID.toLowerCase()
        });

        return isSpecial;
    }

    /**
     * Compara dois jogadores
     */
    static comparePlayers(player1: any, player2: any): boolean {
        if (!player1 || !player2) return false;

        const id1 = this.normalizePlayerIdentifier(player1);
        const id2 = this.normalizePlayerIdentifier(player2);

        if (!id1 || !id2) return false;

        const isEqual = id1 === id2;
        console.log(`🔄 [PlayerIdentifier] Comparação de jogadores: ${id1} === ${id2} = ${isEqual}`);

        return isEqual;
    }

    /**
     * Compara jogador com ID específico
     */
    static comparePlayerWithId(player: any, targetId: string): boolean {
        if (!player || !targetId || typeof targetId !== 'string') return false;

        const playerNormalized = this.normalizePlayerIdentifier(player);
        const targetNormalized = targetId.toLowerCase().trim();

        if (!playerNormalized || !targetNormalized) return false;

        const isEqual = playerNormalized === targetNormalized;
        console.log(`🎯 [PlayerIdentifier] Comparação com ID: ${playerNormalized} === ${targetNormalized} = ${isEqual}`);

        return isEqual;
    }

    /**
     * Obtém identificador único do jogador para logs
     * SEMPRE retorna lowercase para consistência com normalizePlayerIdentifier
     * @deprecated Use normalizePlayerIdentifier diretamente
     */
    static getPlayerIdentifier(playerInfo: any): string | null {
        // Método mantido para compatibilidade, mas agora apenas chama normalizePlayerIdentifier
        return this.normalizePlayerIdentifier(playerInfo);
    }

    /**
     * Valida se um identificador está no formato correto
     */
    static isValidPlayerIdentifier(identifier: string): boolean {
        if (!identifier || typeof identifier !== 'string') return false;

        // Deve ter pelo menos1aractere e não ser só espaços
        const trimmed = identifier.trim();
        if (trimmed.length === 0) return false;

        // Se contém #, deve ter formato gameName#tagLine
        if (trimmed.includes('#')) {
            const parts = trimmed.split('#');
            if (parts.length !== 2 || parts[0].trim().length === 0 || parts[1].trim().length === 0) {
                return false;
            }
        }

        return true;
    }

    /**
     * Valida se um objeto playerInfo tem dados suficientes para identificação
     */
    static hasValidPlayerData(playerInfo: any): boolean {
        if (!playerInfo || typeof playerInfo !== 'object') return false;

        // Verifica se tem pelo menos um dos campos necessários
        const hasGameNameTagLine = playerInfo.gameName && playerInfo.tagLine;
        const hasDisplayName = playerInfo.displayName && typeof playerInfo.displayName === 'string' && playerInfo.displayName.trim().length > 0;
        const hasSummonerName = playerInfo.summonerName && typeof playerInfo.summonerName === 'string' && playerInfo.summonerName.trim().length > 0;
        const hasName = playerInfo.name && typeof playerInfo.name === 'string' && playerInfo.name.trim().length > 0;
        return hasGameNameTagLine || hasDisplayName || hasSummonerName || hasName;
    }
} 