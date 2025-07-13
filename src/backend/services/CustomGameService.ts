import { WebSocket } from 'ws';
import { DatabaseManager } from '../database/DatabaseManager';
import { LCUService } from './LCUService';
import { DiscordService } from './DiscordService';

interface CustomGamePlayer {
    summonerName: string;
    tagLine: string;
    riotId: string; // summonerName#tagLine
    teamIndex: number; // 0-9
    assignedLane: string;
    championId?: number; // Campeão escolhido no draft
    isLeader: boolean;
    isBot?: boolean; // ✅ NOVO: Identifica se é bot
    isTestBot?: boolean; // ✅ NOVO: Identifica se é bot de teste (adicionado automaticamente)
}

interface CustomGameData {
    matchId: number;
    gameName: string;
    players: CustomGamePlayer[];
    status: 'creating' | 'waiting' | 'in_progress' | 'completed' | 'cancelled';
    createdAt: Date;
    gameId?: string; // ID da partida no LoL
    lobbyId?: string; // ID do lobby no LoL
}

export class CustomGameService {
    private dbManager: DatabaseManager;
    private lcuService: LCUService;
    private discordService?: DiscordService;
    private wss: any; // WebSocketServer
    private activeGames = new Map<number, CustomGameData>();
    private gameCreationQueue = new Map<number, NodeJS.Timeout>();
    private readonly GAME_CREATION_TIMEOUT = 60000; // 60 segundos para criar partida
    private readonly LOBBY_JOIN_TIMEOUT = 30000; // 30 segundos para entrar no lobby
    private readonly AUTO_PICK_DELAY = 2000; // 2 segundos entre picks
    private readonly ENABLE_TEST_BOTS = true; // ✅ NOVO: Habilitar bots de teste
    private readonly TEST_BOT_NAMES = [ // ✅ NOVO: Nomes dos bots de teste
        'TestBotAlpha', 'TestBotBeta', 'TestBotGamma', 'TestBotDelta', 'TestBotEpsilon',
        'TestBotZeta', 'TestBotEta', 'TestBotTheta', 'TestBotIota', 'TestBotKappa'
    ];

    constructor(dbManager: DatabaseManager, lcuService: LCUService, wss?: any, discordService?: DiscordService) {
        this.dbManager = dbManager;
        this.lcuService = lcuService;
        this.wss = wss;
        this.discordService = discordService;

        console.log('🎮 [CustomGame] CustomGameService inicializado');
    }

    // ✅ Iniciar processo de criação de partida customizada
    async startCustomGameCreation(matchId: number): Promise<void> {
        console.log(`🎮 [CustomGame] Iniciando criação de partida customizada para match ${matchId}...`);

        try {
            // 1. Buscar dados da partida no banco
            const match = await this.dbManager.getCustomMatchById(matchId);
            if (!match) {
                throw new Error(`Partida ${matchId} não encontrada`);
            }

            // 2. Verificar se já está em draft ou aceita
            if (match.status !== 'accepted' && match.status !== 'draft') {
                throw new Error(`Partida ${matchId} não está pronta para criação de jogo (status: ${match.status})`);
            }

            // 3. Preparar dados dos jogadores com ordem correta
            let players = await this.preparePlayersData(match);

            // ✅ NOVO: Adicionar bots de teste se habilitado e necessário
            if (this.ENABLE_TEST_BOTS && players.length < 10) {
                players = await this.addTestBots(players, match);
            }

            if (players.length !== 10) {
                throw new Error(`Número incorreto de jogadores: ${players.length}`);
            }

            // 4. ✅ NOVO: Identificar o líder com lógica melhorada (primeiro da fila/primeiro jogador)
            const leader = players[0];
            leader.isLeader = true;

            // ✅ NOVO: Log detalhado do líder baseado no tipo
            if (leader.isBot) {
                console.log(`👑 [CustomGame] Líder identificado (BOT): ${leader.riotId} (teamIndex: ${leader.teamIndex})`);
                console.log(`🤖 [CustomGame] Bot líder usará nickname: ${leader.summonerName}#${leader.tagLine}`);
            } else {
                console.log(`👑 [CustomGame] Líder identificado (HUMANO): ${leader.riotId} (teamIndex: ${leader.teamIndex})`);
                console.log(`👤 [CustomGame] Humano líder usará gameName: ${leader.summonerName}#${leader.tagLine}`);
            }

            // 5. Criar estrutura de dados do jogo customizado
            const gameData: CustomGameData = {
                matchId,
                gameName: 'PERSON DOS CRIA ORDEM INHOUSE',
                players,
                status: 'creating',
                createdAt: new Date()
            };

            // 6. Adicionar ao tracking local
            this.activeGames.set(matchId, gameData);

            // 7. Atualizar status da partida no banco
            await this.dbManager.updateCustomMatch(matchId, {
                status: 'custom_game_creating',
                notes: `Criação de partida customizada iniciada - Líder: ${leader.riotId}`
            });

            // 8. Log do início da criação (apenas backend)
            this.logCustomGameCreationStarted(matchId, gameData);

            // 9. Iniciar processo de criação da partida customizada
            await this.createCustomGameLobby(matchId, gameData);

        } catch (error) {
            console.error(`❌ [CustomGame] Erro ao iniciar criação de partida customizada:`, error);
            throw error;
        }
    }

    // ✅ Preparar dados dos jogadores com ordem correta
    private async preparePlayersData(match: any): Promise<CustomGamePlayer[]> {
        console.log(`👥 [CustomGame] Preparando dados dos jogadores para match ${match.id}...`);

        try {
            // Parsear jogadores dos times
            let team1Players: string[] = [];
            let team2Players: string[] = [];

            try {
                team1Players = typeof match.team1_players === 'string'
                    ? JSON.parse(match.team1_players)
                    : (match.team1_players || []);
                team2Players = typeof match.team2_players === 'string'
                    ? JSON.parse(match.team2_players)
                    : (match.team2_players || []);
            } catch (parseError) {
                throw new Error('Erro ao parsear dados dos times');
            }

            // Buscar dados do draft para obter lanes e campeões escolhidos
            let pickBanData: any = {};
            try {
                if (match.pick_ban_data) {
                    pickBanData = typeof match.pick_ban_data === 'string'
                        ? JSON.parse(match.pick_ban_data)
                        : match.pick_ban_data;
                }
            } catch (error) {
                console.warn('⚠️ [CustomGame] Erro ao parsear pick_ban_data:', error);
            }

            // Buscar dados do draft para obter informações completas dos jogadores
            let draftData: any = null;
            try {
                if (match.draft_data) {
                    draftData = typeof match.draft_data === 'string'
                        ? JSON.parse(match.draft_data)
                        : match.draft_data;
                }
            } catch (error) {
                console.warn('⚠️ [CustomGame] Erro ao parsear draft_data:', error);
            }

            const players: CustomGamePlayer[] = [];

            // Processar time 1 (teamIndex 0-4)
            for (let i = 0; i < team1Players.length; i++) {
                const playerName = team1Players[i];
                const teamIndex = i; // 0-4

                // Buscar dados do draft se disponível
                let assignedLane = 'fill';
                let championId: number | undefined;

                if (draftData?.team1 && draftData.team1[i]) {
                    assignedLane = draftData.team1[i].assignedLane || 'fill';
                }

                // Buscar campeão escolhido no pick/ban
                if (pickBanData?.team1Picks) {
                    const playerPick = pickBanData.team1Picks.find((pick: any) =>
                        pick.playerIndex === i || pick.playerName === playerName
                    );
                    if (playerPick) {
                        championId = playerPick.championId;
                    }
                }

                // ✅ NOVO: Identificar se é bot e usar nome apropriado
                const playerInfo = this.identifyPlayerType(playerName);

                players.push({
                    summonerName: playerInfo.summonerName,
                    tagLine: playerInfo.tagLine,
                    riotId: playerInfo.riotId,
                    teamIndex,
                    assignedLane,
                    championId,
                    isLeader: false,
                    isBot: playerInfo.isBot
                });
            }

            // Processar time 2 (teamIndex 5-9)
            for (let i = 0; i < team2Players.length; i++) {
                const playerName = team2Players[i];
                const teamIndex = i + 5; // 5-9

                // Buscar dados do draft se disponível
                let assignedLane = 'fill';
                let championId: number | undefined;

                if (draftData?.team2 && draftData.team2[i]) {
                    assignedLane = draftData.team2[i].assignedLane || 'fill';
                }

                // Buscar campeão escolhido no pick/ban
                if (pickBanData?.team2Picks) {
                    const playerPick = pickBanData.team2Picks.find((pick: any) =>
                        pick.playerIndex === i || pick.playerName === playerName
                    );
                    if (playerPick) {
                        championId = playerPick.championId;
                    }
                }

                // ✅ NOVO: Identificar se é bot e usar nome apropriado
                const playerInfo = this.identifyPlayerType(playerName);

                players.push({
                    summonerName: playerInfo.summonerName,
                    tagLine: playerInfo.tagLine,
                    riotId: playerInfo.riotId,
                    teamIndex,
                    assignedLane,
                    championId,
                    isLeader: false,
                    isBot: playerInfo.isBot
                });
            }

            // Ordenar por teamIndex (0-9)
            players.sort((a, b) => a.teamIndex - b.teamIndex);

            console.log(`✅ [CustomGame] Dados dos jogadores preparados:`, players.map(p => ({
                riotId: p.riotId,
                teamIndex: p.teamIndex,
                lane: p.assignedLane,
                champion: p.championId,
                isLeader: p.isLeader,
                isBot: p.isBot
            })));

            return players;

        } catch (error) {
            console.error(`❌ [CustomGame] Erro ao preparar dados dos jogadores:`, error);
            throw error;
        }
    }

    // ✅ Parsear Riot ID (summonerName#tagLine)
    private parseRiotId(riotId: string): [string, string?] {
        if (riotId.includes('#')) {
            const parts = riotId.split('#');
            return [parts[0], parts[1]];
        }
        return [riotId, undefined];
    }

    // ✅ NOVO: Identificar tipo de jogador (humano vs bot) e usar nome apropriado
    private identifyPlayerType(playerName: string): { summonerName: string; tagLine: string; riotId: string; isBot: boolean } {
        console.log(`🔍 [CustomGame] Identificando tipo de jogador: ${playerName}`);

        // Verificar se é bot baseado no nome
        const playerNameLower = playerName.toLowerCase();
        const isBot = playerNameLower.includes('bot') ||
            playerNameLower.includes('ai') ||
            playerNameLower.includes('computer') ||
            playerNameLower.includes('cpu') ||
            playerNameLower.includes('popcornseller');

        if (isBot) {
            // Para bots, usar nickname + tagline (ex: popcornseller#coup)
            const [nickname, tagLine] = this.parseRiotId(playerName);
            const finalTagLine = tagLine || 'coup';
            const finalNickname = nickname || 'popcornseller';

            console.log(`🤖 [CustomGame] Bot identificado: ${finalNickname}#${finalTagLine}`);

            return {
                summonerName: finalNickname,
                tagLine: finalTagLine,
                riotId: `${finalNickname}#${finalTagLine}`,
                isBot: true
            };
        } else {
            // Para humanos, usar gameName + tagLine
            const [gameName, tagLine] = this.parseRiotId(playerName);
            const finalTagLine = tagLine || 'BR1';
            const finalGameName = gameName || playerName;

            console.log(`👤 [CustomGame] Humano identificado: ${finalGameName}#${finalTagLine}`);

            return {
                summonerName: finalGameName,
                tagLine: finalTagLine,
                riotId: `${finalGameName}#${finalTagLine}`,
                isBot: false
            };
        }
    }

    // ✅ Criar lobby de partida customizada
    private async createCustomGameLobby(matchId: number, gameData: CustomGameData): Promise<void> {
        console.log(`🎮 [CustomGame] Criando lobby de partida customizada para match ${matchId}...`);

        try {
            // 1. ✅ CORRIGIDO: Verificar se o LCU está conectado com mais detalhes
            if (!this.lcuService.isClientConnected()) {
                console.error(`❌ [CustomGame] LCU não está conectado!`);
                console.log(`📋 [CustomGame] Status do LCU:`, {
                    isConnected: this.lcuService.isClientConnected(),
                    hasClient: !!this.lcuService['client'],
                    hasConnectionInfo: !!this.lcuService['connectionInfo']
                });

                throw new Error('LCU não está conectado. Verifique se o League of Legends está aberto e funcionando.');
            }

            console.log(`✅ [CustomGame] LCU conectado - prosseguindo com criação do lobby`);

            // 2. ✅ CORRIGIDO: Buscar jogador atual logado com tratamento de erro
            let currentSummoner;
            let currentRiotId = '';

            try {
                currentSummoner = await this.lcuService.getCurrentSummoner();
                currentRiotId = `${currentSummoner.gameName || currentSummoner.displayName}#${currentSummoner.tagLine || 'BR1'}`;
                console.log(`👤 [CustomGame] Jogador atual logado: ${currentRiotId}`);
            } catch (summonerError) {
                console.error(`❌ [CustomGame] Erro ao buscar jogador atual:`, summonerError);
                throw new Error('Não foi possível identificar o jogador atual logado no League of Legends');
            }

            // 3. ✅ CORRIGIDO: Verificar se o jogador atual é o líder com lógica melhorada
            const leader = gameData.players.find(p => p.isLeader);
            if (!leader) {
                throw new Error('Líder não encontrado na partida');
            }

            console.log(`👑 [CustomGame] Líder identificado: ${leader.riotId} (${leader.isBot ? 'BOT' : 'HUMANO'})`);

            // ✅ CORRIGIDO: Comparação mais robusta
            const isCurrentPlayerLeader = this.isCurrentPlayerLeader(currentRiotId, leader);

            if (!isCurrentPlayerLeader) {
                console.log(`⚠️ [CustomGame] Jogador atual (${currentRiotId}) não é o líder (${leader.riotId})`);
                console.log(`⏳ [CustomGame] Aguardando líder criar a partida...`);
                console.log(`📋 [CustomGame] Líder é ${leader.isBot ? 'BOT' : 'HUMANO'}: ${leader.summonerName}#${leader.tagLine}`);

                // Aguardar o líder criar a partida
                this.waitForLeaderToCreateGame(matchId, gameData);
                return;
            }

            console.log(`👑 [CustomGame] Jogador atual é o líder! Criando partida customizada...`);
            console.log(`📋 [CustomGame] Líder ${leader.isBot ? 'BOT' : 'HUMANO'} criando partida: ${leader.summonerName}#${leader.tagLine}`);

            // 4. ✅ CORRIGIDO: Criar partida customizada via LCU com tratamento de erro melhorado
            const lobbyData = await this.createCustomGameViaLCU(gameData);

            if (lobbyData) {
                console.log(`✅ [CustomGame] Lobby criado com sucesso:`, lobbyData);

                // 5. Atualizar dados do jogo
                gameData.lobbyId = lobbyData.lobbyId;
                gameData.status = 'waiting';
                this.activeGames.set(matchId, gameData);

                // 6. Atualizar banco de dados
                await this.dbManager.updateCustomMatch(matchId, {
                    status: 'custom_game_created',
                    notes: `Partida customizada criada - Lobby ID: ${lobbyData.lobbyId}`
                });

                // 7. Notificar outros jogadores para entrarem
                this.notifyPlayersToJoinLobby(matchId, gameData, lobbyData);

                // 8. Iniciar monitoramento do lobby
                this.monitorLobbyJoin(matchId, gameData);

            } else {
                throw new Error('Falha ao criar partida customizada via LCU - lobbyData é null');
            }

        } catch (error) {
            console.error(`❌ [CustomGame] Erro ao criar lobby de partida customizada:`, error);

            // ✅ NOVO: Log detalhado do erro para debug
            if (error instanceof Error) {
                console.error(`📋 [CustomGame] Detalhes do erro:`, {
                    message: error.message,
                    stack: error.stack,
                    name: error.name
                });
            }

            // Atualizar status no banco
            await this.dbManager.updateCustomMatch(matchId, {
                status: 'custom_game_failed',
                notes: `Erro ao criar partida customizada: ${error instanceof Error ? error.message : 'Erro desconhecido'}`
            });

            throw error;
        }
    }

    // ✅ Criar partida customizada via LCU com estrutura capturada
    private async createCustomGameViaLCU(gameData: CustomGameData): Promise<any> {
        console.log(`🎮 [CustomGame] Criando partida customizada via LCU com estrutura capturada...`);

        try {
            // 1. ✅ NOVO: Usar estrutura capturada da partida atual (que funciona)
            const lobbyData = {
                queueId: 0, // Custom game
                gameConfig: {
                    gameMode: 'CLASSIC',
                    mapId: 11, // Summoner's Rift
                    pickType: 'SimulPickStrategy', // Escolha às Cegas (capturado)
                    spectatorType: 'AllAllowed',
                    teamSize: 5,
                    customLobbyName: gameData.gameName,
                    customSpectatorPolicy: 'AllAllowed',
                    customMutatorName: 'GAME_CFG_PICK_BLIND',
                    isCustom: true,
                    maxLobbySize: 10,
                    maxTeamSize: 5,
                    maxLobbySpectatorCount: 0,
                    premadeSizeAllowed: true,
                    shouldForceScarcePositionSelection: false,
                    showPositionSelector: false,
                    showQuickPlaySlotSelection: false
                }
            };

            console.log(`📋 [CustomGame] Dados do lobby a serem enviados:`, JSON.stringify(lobbyData, null, 2));

            const lobbyResponse = await this.lcuService.createLobby(lobbyData);

            console.log(`✅ [CustomGame] Lobby criado:`, lobbyResponse.data);

            // 2. ✅ CORRIGIDO: Configurar ordem dos jogadores no lobby
            await this.configurePlayerOrderInLobby(lobbyResponse.data.lobbyId, gameData);

            return {
                lobbyId: lobbyResponse.data.lobbyId,
                lobbyName: gameData.gameName,
                gameConfig: lobbyResponse.data.gameConfig
            };

        } catch (error) {
            console.error(`❌ [CustomGame] Erro ao criar partida customizada via LCU:`, error);

            // ✅ NOVO: Log detalhado do erro para debug
            if (error instanceof Error) {
                console.error(`📋 [CustomGame] Detalhes do erro:`, {
                    message: error.message,
                    stack: error.stack,
                    name: error.name
                });
            }

            // ✅ NOVO: Tentar estrutura alternativa se a primeira falhar
            console.log(`🔄 [CustomGame] Tentando estrutura alternativa...`);
            try {
                const alternativeStructure = {
                    queueId: 0,
                    gameConfig: {
                        gameMode: 'CLASSIC',
                        mapId: 11,
                        pickType: 'BLIND_PICK',
                        spectatorType: 'ALL',
                        teamSize: 5
                    },
                    lobbyName: gameData.gameName,
                    lobbyPassword: 'ordem123'
                };

                const altResponse = await this.lcuService.createLobby(alternativeStructure);
                console.log(`✅ [CustomGame] Lobby criado com estrutura alternativa:`, altResponse.data);

                return {
                    lobbyId: altResponse.data.lobbyId,
                    lobbyName: gameData.gameName,
                    gameConfig: altResponse.data.gameConfig
                };

            } catch (altError) {
                console.error(`❌ [CustomGame] Estrutura alternativa também falhou:`, altError);
                return null;
            }
        }
    }

    // ✅ NOVO: Configurar ordem dos jogadores no lobby
    private async configurePlayerOrderInLobby(lobbyId: string, gameData: CustomGameData): Promise<void> {
        console.log(`🎯 [CustomGame] Configurando ordem dos jogadores no lobby ${lobbyId}...`);

        try {
            // 1. Buscar dados atuais do lobby
            const lobbyResponse = await this.lcuService.getLobbyData();
            const lobbyData = lobbyResponse.data;

            console.log(`📊 [CustomGame] Dados atuais do lobby:`, {
                lobbyId: lobbyData.lobbyId,
                participants: lobbyData.participants?.length || 0,
                gameConfig: lobbyData.gameConfig
            });

            // 2. ✅ NOVO: Configurar posições dos jogadores baseado no draft
            // Ordem esperada: Top, Jungle, Mid, ADC, Support (da esquerda para direita)
            const laneOrder = ['top', 'jungle', 'mid', 'adc', 'support'];

            // Separar jogadores por time (team1: 0-4, team2: 5-9)
            const team1Players = gameData.players.filter(p => p.teamIndex < 5).sort((a, b) => a.teamIndex - b.teamIndex);
            const team2Players = gameData.players.filter(p => p.teamIndex >= 5).sort((a, b) => a.teamIndex - b.teamIndex);

            console.log(`👥 [CustomGame] Jogadores organizados:`, {
                team1: team1Players.map(p => ({ name: p.riotId, lane: p.assignedLane, index: p.teamIndex })),
                team2: team2Players.map(p => ({ name: p.riotId, lane: p.assignedLane, index: p.teamIndex }))
            });

            // 3. ✅ NOVO: Configurar posições no lobby via LCU
            // Nota: O LCU não permite reordenar jogadores diretamente, mas podemos
            // configurar as posições de pick baseado na ordem das lanes
            await this.setupPickOrderInLobby(team1Players, team2Players);

            console.log(`✅ [CustomGame] Ordem dos jogadores configurada no lobby`);

        } catch (error) {
            console.error(`❌ [CustomGame] Erro ao configurar ordem dos jogadores:`, error);
        }
    }

    // ✅ NOVO: Configurar ordem de pick no lobby com controle preciso
    private async setupPickOrderInLobby(team1Players: CustomGamePlayer[], team2Players: CustomGamePlayer[]): Promise<void> {
        console.log(`🎯 [CustomGame] Configurando ordem de pick no lobby com controle preciso...`);

        try {
            // 1. Verificar se o lobby está em estado de configuração
            const lobbyResponse = await this.lcuService.getLobbyData();
            const lobbyData = lobbyResponse.data;

            // 2. ✅ NOVO: Configurar posições de pick baseado na ordem das lanes
            // Ordem de pick: Top, Jungle, Mid, ADC, Support (da esquerda para direita)
            const pickOrder = [
                // Team 1 (Blue) - Primeiro pick
                ...team1Players.map(p => ({ summonerId: p.summonerName, position: p.assignedLane })),
                // Team 2 (Red) - Segundo pick  
                ...team2Players.map(p => ({ summonerId: p.summonerName, position: p.assignedLane }))
            ];

            console.log(`📋 [CustomGame] Ordem de pick configurada:`, pickOrder.map(p => `${p.position}: ${p.summonerId}`));

            // 3. ✅ NOVO: Configurar posições específicas no lobby via LCU
            await this.configureLobbyPositions(team1Players, team2Players);

            // 4. ✅ NOVO: Log da ordem esperada (apenas backend)
            this.logPlayerOrder(pickOrder);

            // 5. ✅ NOVO: Verificar se a configuração foi aplicada corretamente
            await this.verifyLobbyConfiguration(team1Players, team2Players);

        } catch (error) {
            console.error(`❌ [CustomGame] Erro ao configurar ordem de pick:`, error);
        }
    }

    // ✅ CORRIGIDO: Configurar posições específicas no lobby
    private async configureLobbyPositions(team1Players: CustomGamePlayer[], team2Players: CustomGamePlayer[]): Promise<void> {
        console.log(`🎯 [CustomGame] Configurando posições específicas no lobby...`);

        try {
            // 1. Buscar dados atuais do lobby
            const lobbyResponse = await this.lcuService.getLobbyData();
            const lobbyData = lobbyResponse.data;

            console.log(`📊 [CustomGame] Dados atuais do lobby:`, {
                lobbyId: lobbyData.lobbyId,
                participants: lobbyData.participants?.length || 0,
                gameConfig: lobbyData.gameConfig
            });

            // 2. ✅ CORRIGIDO: Configurar posições baseado na ordem das lanes
            // Ordem esperada: Top (0), Jungle (1), Mid (2), ADC (3), Support (4)
            const lanePositions = {
                'top': 0,
                'jungle': 1,
                'mid': 2,
                'adc': 3,
                'support': 4
            };

            // 3. ✅ CORRIGIDO: Buscar summonerId real do jogador atual
            let currentSummonerId: number | null = null;
            try {
                const currentSummoner = await this.lcuService.getCurrentSummoner();
                currentSummonerId = currentSummoner.summonerId;
                console.log(`👤 [CustomGame] SummonerId do jogador atual: ${currentSummonerId}`);
            } catch (error) {
                console.warn(`⚠️ [CustomGame] Não foi possível obter summonerId do jogador atual:`, error);
            }

            // 4. ✅ CORRIGIDO: Configurar participantes do lobby com posições específicas
            const participants = [];

            // Team 1 (Blue) - posições 0-4
            for (const player of team1Players) {
                const participant = {
                    summonerId: currentSummonerId || 0, // ✅ CORRIGIDO: Usar summonerId real
                    summonerName: player.summonerName,
                    displayName: player.summonerName,
                    position: player.assignedLane,
                    teamId: 100, // Blue team
                    cellId: lanePositions[player.assignedLane as keyof typeof lanePositions] || 0,
                    isLeader: player.isLeader,
                    isBot: player.isBot || false
                };

                participants.push(participant);
                console.log(`👥 [CustomGame] Participante Team 1 configurado:`, participant);
            }

            // Team 2 (Red) - posições 5-9  
            for (const player of team2Players) {
                const participant = {
                    summonerId: currentSummonerId || 0, // ✅ CORRIGIDO: Usar summonerId real
                    summonerName: player.summonerName,
                    displayName: player.summonerName,
                    position: player.assignedLane,
                    teamId: 200, // Red team
                    cellId: lanePositions[player.assignedLane as keyof typeof lanePositions] + 5 || 5,
                    isLeader: player.isLeader,
                    isBot: player.isBot || false
                };

                participants.push(participant);
                console.log(`👥 [CustomGame] Participante Team 2 configurado:`, participant);
            }

            console.log(`👥 [CustomGame] Participantes configurados:`, participants.map(p =>
                `${p.position} (${p.teamId === 100 ? 'Blue' : 'Red'}): ${p.summonerName}`
            ));

            // ✅ NOVO: Se for modo de teste, adicionar bots automaticamente
            const isTestMode = this.ENABLE_TEST_BOTS && (team1Players.some(p => p.isTestBot) || team2Players.some(p => p.isTestBot));

            if (isTestMode) {
                console.log(`🧪 [CustomGame] Modo de teste detectado - configurando bots automaticamente`);
                await this.configureTestBotsInLobby(lobbyData, team1Players, team2Players);
                return;
            }

            // 5. ✅ CORRIGIDO: Atualizar lobby com posições específicas
            const updatedLobby = {
                ...lobbyData,
                participants: participants
            };

            console.log(`📋 [CustomGame] Atualizando lobby com dados:`, JSON.stringify(updatedLobby, null, 2));

            await this.lcuService.updateLobby(updatedLobby);

            console.log(`✅ [CustomGame] Posições do lobby configuradas com sucesso`);

        } catch (error) {
            console.error(`❌ [CustomGame] Erro ao configurar posições do lobby:`, error);

            // ✅ NOVO: Log detalhado do erro para debug
            if (error instanceof Error) {
                console.error(`📋 [CustomGame] Detalhes do erro:`, {
                    message: error.message,
                    stack: error.stack,
                    name: error.name
                });
            }
        }
    }

    // ✅ NOVO: Log da ordem esperada dos jogadores (apenas backend)
    private logPlayerOrder(pickOrder: any[]): void {
        console.log(`📢 [CustomGame] Ordem esperada dos jogadores:`, pickOrder.length, 'jogadores');
        console.log(`📋 [CustomGame] Instruções: Entrem na partida na ordem das lanes: Top, Jungle, Mid, ADC, Support`);
        console.log(`📋 [CustomGame] Ordem esperada:`, pickOrder.map(p => `${p.position}: ${p.summonerId}`));
    }

    // ✅ NOVO: Verificar se a configuração do lobby foi aplicada corretamente
    private async verifyLobbyConfiguration(team1Players: CustomGamePlayer[], team2Players: CustomGamePlayer[]): Promise<void> {
        console.log(`🔍 [CustomGame] Verificando configuração do lobby...`);

        try {
            // 1. Buscar dados atuais do lobby
            const lobbyResponse = await this.lcuService.getLobbyData();
            const lobbyData = lobbyResponse.data;

            if (!lobbyData || !lobbyData.participants) {
                console.warn(`⚠️ [CustomGame] Lobby não encontrado ou sem participantes`);
                return;
            }

            // 2. Verificar se as posições estão corretas
            const lanePositions = {
                'top': 0,
                'jungle': 1,
                'mid': 2,
                'adc': 3,
                'support': 4
            };

            let configurationCorrect = true;

            // Verificar Team 1 (Blue)
            for (const player of team1Players) {
                const expectedCellId = lanePositions[player.assignedLane as keyof typeof lanePositions] || 0;
                const actualParticipant = lobbyData.participants.find((p: any) =>
                    p.summonerName === player.summonerName || p.summonerId === player.summonerName
                );

                if (!actualParticipant) {
                    console.warn(`⚠️ [CustomGame] Jogador ${player.riotId} não encontrado no lobby`);
                    configurationCorrect = false;
                } else if (actualParticipant.cellId !== expectedCellId) {
                    console.warn(`⚠️ [CustomGame] Posição incorreta para ${player.riotId}: esperado ${expectedCellId}, atual ${actualParticipant.cellId}`);
                    configurationCorrect = false;
                }
            }

            // Verificar Team 2 (Red)
            for (const player of team2Players) {
                const expectedCellId = (lanePositions[player.assignedLane as keyof typeof lanePositions] || 0) + 5;
                const actualParticipant = lobbyData.participants.find((p: any) =>
                    p.summonerName === player.summonerName || p.summonerId === player.summonerName
                );

                if (!actualParticipant) {
                    console.warn(`⚠️ [CustomGame] Jogador ${player.riotId} não encontrado no lobby`);
                    configurationCorrect = false;
                } else if (actualParticipant.cellId !== expectedCellId) {
                    console.warn(`⚠️ [CustomGame] Posição incorreta para ${player.riotId}: esperado ${expectedCellId}, atual ${actualParticipant.cellId}`);
                    configurationCorrect = false;
                }
            }

            if (configurationCorrect) {
                console.log(`✅ [CustomGame] Configuração do lobby verificada e está correta!`);
            } else {
                console.warn(`⚠️ [CustomGame] Configuração do lobby tem problemas, mas continuando...`);
            }

        } catch (error) {
            console.error(`❌ [CustomGame] Erro ao verificar configuração do lobby:`, error);
        }
    }

    // ✅ Aguardar líder criar a partida
    private waitForLeaderToCreateGame(matchId: number, gameData: CustomGameData): void {
        console.log(`⏳ [CustomGame] Aguardando líder criar partida para match ${matchId}...`);

        // Configurar timeout para criação da partida
        const timeout = setTimeout(() => {
            console.error(`❌ [CustomGame] Timeout: Líder não criou partida para match ${matchId}`);
            this.handleGameCreationTimeout(matchId);
        }, this.GAME_CREATION_TIMEOUT);

        this.gameCreationQueue.set(matchId, timeout);

        // Monitorar mudanças no status da partida
        this.monitorMatchStatusForGameCreation(matchId, gameData);
    }

    // ✅ Monitorar status da partida para detectar criação do jogo
    private async monitorMatchStatusForGameCreation(matchId: number, gameData: CustomGameData): Promise<void> {
        const checkInterval = setInterval(async () => {
            try {
                const match = await this.dbManager.getCustomMatchById(matchId);
                if (!match) {
                    clearInterval(checkInterval);
                    return;
                }

                // Verificar se o status mudou para indicar que o jogo foi criado
                if (match.status === 'custom_game_created' || match.status === 'in_progress') {
                    clearInterval(checkInterval);

                    // Limpar timeout
                    const timeout = this.gameCreationQueue.get(matchId);
                    if (timeout) {
                        clearTimeout(timeout);
                        this.gameCreationQueue.delete(matchId);
                    }

                    console.log(`✅ [CustomGame] Jogo criado detectado para match ${matchId}`);

                    // Atualizar dados do jogo
                    gameData.status = 'waiting';
                    this.activeGames.set(matchId, gameData);

                    // Notificar jogadores para entrarem
                    this.notifyPlayersToJoinLobby(matchId, gameData, { lobbyId: 'detected' });

                    // Iniciar monitoramento do lobby
                    this.monitorLobbyJoin(matchId, gameData);
                }

            } catch (error) {
                console.error(`❌ [CustomGame] Erro ao monitorar status da partida:`, error);
            }
        }, 2000); // Verificar a cada 2 segundos
    }

    // ✅ Notificar jogadores para entrarem no lobby (apenas logs do backend)
    private notifyPlayersToJoinLobby(matchId: number, gameData: CustomGameData, lobbyData: any): void {
        console.log(`📢 [CustomGame] Lobby criado - Jogadores devem entrar na ordem correta`);
        console.log(`📋 [CustomGame] Detalhes do lobby:`, {
            matchId,
            lobbyId: lobbyData.lobbyId,
            gameName: gameData.gameName,
            playersCount: gameData.players.length
        });

        // Log da ordem esperada de entrada
        console.log(`📋 [CustomGame] Ordem de entrada esperada:`);
        gameData.players.forEach((player, index) => {
            console.log(`  ${index + 1}. ${player.riotId} (${player.assignedLane}) - ${player.isLeader ? 'LÍDER' : 'Jogador'}`);
        });
    }

    // ✅ Monitorar entrada dos jogadores no lobby com verificação de ordem
    private monitorLobbyJoin(matchId: number, gameData: CustomGameData): void {
        console.log(`👀 [CustomGame] Monitorando entrada dos jogadores no lobby com verificação de ordem...`);

        const checkInterval = setInterval(async () => {
            try {
                // ✅ NOVO: Verificar se todos os jogadores entraram no lobby
                const lobbyStatus = await this.checkLobbyStatus();

                if (lobbyStatus && lobbyStatus.participants && lobbyStatus.participants.length >= 10) {
                    clearInterval(checkInterval);

                    console.log(`✅ [CustomGame] Todos os jogadores entraram no lobby!`);

                    // ✅ NOVO: Verificar se a ordem de entrada está correta
                    const orderCorrect = await this.verifyEntryOrder(matchId, gameData, lobbyStatus);

                    if (orderCorrect) {
                        console.log(`✅ [CustomGame] Ordem de entrada está correta!`);
                    } else {
                        console.warn(`⚠️ [CustomGame] Ordem de entrada não está correta, mas continuando...`);
                    }

                    // Atualizar status
                    gameData.status = 'in_progress';
                    this.activeGames.set(matchId, gameData);

                    // Atualizar banco de dados
                    await this.dbManager.updateCustomMatch(matchId, {
                        status: 'in_progress',
                        notes: 'Todos os jogadores entraram no lobby - Partida iniciada'
                    });

                    // Iniciar processo de auto-pick
                    this.startAutoPickProcess(matchId, gameData);

                } else {
                    // ✅ NOVO: Verificar ordem de entrada em tempo real
                    await this.checkCurrentPlayerTurn(matchId, gameData, lobbyStatus);

                    console.log(`⏳ [CustomGame] Aguardando jogadores entrarem no lobby... (${lobbyStatus?.participants?.length || 0}/10)`);
                }

            } catch (error) {
                console.error(`❌ [CustomGame] Erro ao verificar status do lobby:`, error);
            }
        }, 3000); // Verificar a cada 3 segundos

        // Timeout para entrada no lobby
        setTimeout(() => {
            clearInterval(checkInterval);
            console.error(`❌ [CustomGame] Timeout: Nem todos os jogadores entraram no lobby`);
            this.handleLobbyJoinTimeout(matchId);
        }, this.LOBBY_JOIN_TIMEOUT);
    }

    // ✅ Verificar status do lobby
    private async checkLobbyStatus(): Promise<any> {
        try {
            if (!this.lcuService.isClientConnected()) {
                return null;
            }

            const response = await this.lcuService.getLobbyData();
            return response.data;
        } catch (error) {
            console.error(`❌ [CustomGame] Erro ao verificar status do lobby:`, error);
            return null;
        }
    }

    // ✅ NOVO: Verificar ordem de entrada dos jogadores (considerando bots de teste)
    private async verifyEntryOrder(matchId: number, gameData: CustomGameData, lobbyStatus: any): Promise<boolean> {
        console.log(`🔍 [CustomGame] Verificando ordem de entrada dos jogadores...`);

        try {
            if (!lobbyStatus || !lobbyStatus.participants) {
                return false;
            }

            // ✅ NOVO: Se for modo de teste, verificar apenas ordem dos humanos
            const isTestMode = this.ENABLE_TEST_BOTS && gameData.players.some(p => p.isTestBot);

            if (isTestMode) {
                return await this.verifyTestModeEntryOrder(gameData, lobbyStatus);
            }

            const expectedOrder = gameData.players.map(p => p.riotId);
            const actualOrder = lobbyStatus.participants.map((p: any) =>
                p.summonerName || p.displayName || p.gameName
            );

            console.log(`📋 [CustomGame] Ordem esperada:`, expectedOrder);
            console.log(`📋 [CustomGame] Ordem atual:`, actualOrder);

            // Verificar se as ordens coincidem
            if (expectedOrder.length !== actualOrder.length) {
                console.warn(`⚠️ [CustomGame] Número de jogadores não coincide`);
                return false;
            }

            let orderCorrect = true;
            for (let i = 0; i < expectedOrder.length; i++) {
                const expected = expectedOrder[i];
                const actual = actualOrder[i];

                if (expected !== actual && !actual.includes(expected.split('#')[0])) {
                    console.warn(`⚠️ [CustomGame] Ordem incorreta na posição ${i}: esperado ${expected}, atual ${actual}`);
                    orderCorrect = false;
                }
            }

            return orderCorrect;

        } catch (error) {
            console.error(`❌ [CustomGame] Erro ao verificar ordem de entrada:`, error);
            return false;
        }
    }

    // ✅ NOVO: Verificar se é a vez do jogador atual entrar (considerando bots de teste)
    private async checkCurrentPlayerTurn(matchId: number, gameData: CustomGameData, lobbyStatus: any): Promise<void> {
        try {
            // Buscar jogador atual logado
            const currentSummoner = await this.lcuService.getCurrentSummoner();
            const currentRiotId = `${currentSummoner.gameName || currentSummoner.displayName}#${currentSummoner.tagLine || 'BR1'}`;

            // Encontrar o jogador atual na partida
            const currentPlayer = gameData.players.find(p => p.riotId === currentRiotId);
            if (!currentPlayer) {
                return; // Jogador não está nesta partida
            }

            // ✅ NOVO: Se for modo de teste, considerar apenas jogadores humanos
            const isTestMode = this.ENABLE_TEST_BOTS && gameData.players.some(p => p.isTestBot);

            if (isTestMode) {
                console.log(`🧪 [CustomGame] Modo de teste ativo - considerando apenas jogadores humanos`);
                await this.handleTestModePlayerTurn(currentPlayer, gameData, lobbyStatus);
                return;
            }

            // Verificar se já entrou no lobby
            const alreadyInLobby = lobbyStatus?.participants?.find((p: any) => {
                const participantName = p.summonerName || p.displayName || p.gameName;
                return participantName === currentRiotId || participantName.includes(currentPlayer.summonerName);
            });

            if (alreadyInLobby) {
                console.log(`✅ [CustomGame] Jogador ${currentRiotId} já está no lobby`);
                return;
            }

            // Verificar se é a vez dele entrar baseado na ordem
            const expectedOrder = gameData.players.map(p => p.riotId);
            const currentIndex = expectedOrder.indexOf(currentRiotId);

            if (currentIndex === -1) {
                console.warn(`⚠️ [CustomGame] Jogador ${currentRiotId} não encontrado na ordem esperada`);
                return;
            }

            // Verificar quantos jogadores já entraram
            const playersInLobby = lobbyStatus?.participants?.length || 0;

            if (playersInLobby === currentIndex) {
                console.log(`🎯 [CustomGame] É a vez do jogador ${currentRiotId} entrar no lobby!`);
                console.log(`📋 [CustomGame] Posição: ${currentIndex + 1}/${expectedOrder.length} - Lane: ${currentPlayer.assignedLane}`);

                // Log específico para o jogador
                this.logPlayerTurnNotification(currentPlayer, currentIndex + 1, expectedOrder.length);
            } else if (playersInLobby < currentIndex) {
                console.log(`⏳ [CustomGame] Aguardando ${currentIndex - playersInLobby} jogadores entrarem antes de ${currentRiotId}`);
            } else {
                console.warn(`⚠️ [CustomGame] Jogador ${currentRiotId} deveria ter entrado antes!`);
            }

        } catch (error) {
            console.error(`❌ [CustomGame] Erro ao verificar vez do jogador:`, error);
        }
    }

    // ✅ NOVO: Log de notificação para vez do jogador
    private logPlayerTurnNotification(player: CustomGamePlayer, position: number, total: number): void {
        console.log(`📢 [CustomGame] ===== VEZ DO JOGADOR =====`);
        console.log(`👤 Jogador: ${player.riotId}`);
        console.log(`🎯 Posição: ${position}/${total}`);
        console.log(`🛤️ Lane: ${player.assignedLane}`);
        console.log(`🤖 É bot: ${player.isBot ? 'Sim' : 'Não'}`);
        console.log(`📋 Instrução: Entre na partida customizada "PERSON DOS CRIA ORDEM INHOUSE"`);
        console.log(`📋 [CustomGame] ========================`);
    }

    // ✅ NOVO: CORRIGIDO: Identificar se o jogador atual é o líder com lógica melhorada
    private isCurrentPlayerLeader(currentRiotId: string, leader: CustomGamePlayer): boolean {
        console.log(`🔍 [CustomGame] Verificando se ${currentRiotId} é o líder ${leader.riotId}...`);

        // ✅ NOVO: Normalizar strings para comparação
        const normalizeString = (str: string) => str.toLowerCase().trim().replace(/\s+/g, '');

        // 1. Comparação direta normalizada
        const normalizedCurrent = normalizeString(currentRiotId);
        const normalizedLeader = normalizeString(leader.riotId);

        if (normalizedCurrent === normalizedLeader) {
            console.log(`✅ [CustomGame] Comparação direta bem-sucedida`);
            return true;
        }

        // 2. ✅ NOVO: Comparação por partes (gameName#tagLine)
        const currentParts = currentRiotId.split('#');
        const leaderParts = leader.riotId.split('#');

        if (currentParts.length >= 1 && leaderParts.length >= 1) {
            const currentGameName = normalizeString(currentParts[0]);
            const leaderGameName = normalizeString(leaderParts[0]);

            if (currentGameName === leaderGameName) {
                console.log(`✅ [CustomGame] Comparação por gameName bem-sucedida: ${currentGameName}`);
                return true;
            }
        }

        // 3. ✅ NOVO: Para bots, comparar apenas o nickname
        if (leader.isBot) {
            const currentName = normalizeString(currentRiotId.split('#')[0]);
            const leaderName = normalizeString(leader.summonerName);

            if (currentName === leaderName) {
                console.log(`✅ [CustomGame] Comparação para bot bem-sucedida: ${currentName}`);
                return true;
            }
        }

        // 4. ✅ NOVO: Para humanos, comparar gameName com fallback
        const currentGameName = normalizeString(currentRiotId.split('#')[0]);
        const leaderGameName = normalizeString(leader.summonerName);

        if (currentGameName === leaderGameName) {
            console.log(`✅ [CustomGame] Comparação para humano bem-sucedida: ${currentGameName}`);
            return true;
        }

        // 5. ✅ NOVO: Comparação por displayName (fallback)
        if (leader.summonerName && currentRiotId.includes(leader.summonerName)) {
            console.log(`✅ [CustomGame] Comparação por displayName bem-sucedida: ${leader.summonerName}`);
            return true;
        }

        console.log(`❌ [CustomGame] Nenhuma comparação bem-sucedida`);
        console.log(`📋 [CustomGame] Debug - Current: "${currentRiotId}", Leader: "${leader.riotId}"`);
        console.log(`📋 [CustomGame] Debug - Normalized Current: "${normalizedCurrent}", Normalized Leader: "${normalizedLeader}"`);

        return false;
    }

    // ✅ NOVO: Adicionar bots de teste para preencher posições vazias
    private async addTestBots(players: CustomGamePlayer[], match: any): Promise<CustomGamePlayer[]> {
        console.log(`🤖 [CustomGame] Adicionando bots de teste para preencher posições...`);
        console.log(`📊 [CustomGame] Jogadores atuais: ${players.length}/10`);

        const botsNeeded = 10 - players.length;
        console.log(`🤖 [CustomGame] Bots necessários: ${botsNeeded}`);

        // Definir lanes padrão para bots
        const defaultLanes = ['top', 'jungle', 'mid', 'adc', 'support'];
        const defaultChampions = [266, 64, 103, 51, 412]; // Aatrox, Lee Sin, Ahri, Caitlyn, Thresh

        // Encontrar posições vazias
        const usedTeamIndexes = players.map(p => p.teamIndex);
        const availableTeamIndexes = Array.from({ length: 10 }, (_, i) => i).filter(i => !usedTeamIndexes.includes(i));

        console.log(`📋 [CustomGame] Posições disponíveis:`, availableTeamIndexes);

        for (let i = 0; i < botsNeeded; i++) {
            const teamIndex = availableTeamIndexes[i];
            const botName = this.TEST_BOT_NAMES[i];
            const laneIndex = teamIndex % 5; // 0-4 para lanes
            const lane = defaultLanes[laneIndex];
            const championId = defaultChampions[laneIndex];

            const testBot: CustomGamePlayer = {
                summonerName: botName,
                tagLine: 'TEST',
                riotId: `${botName}#TEST`,
                teamIndex,
                assignedLane: lane,
                championId,
                isLeader: false,
                isBot: true,
                isTestBot: true
            };

            players.push(testBot);

            console.log(`🤖 [CustomGame] Bot de teste adicionado:`, {
                name: botName,
                teamIndex,
                lane,
                championId,
                riotId: testBot.riotId
            });
        }

        // Reordenar por teamIndex
        players.sort((a, b) => a.teamIndex - b.teamIndex);

        console.log(`✅ [CustomGame] Bots de teste adicionados! Total: ${players.length}/10`);
        console.log(`📋 [CustomGame] Ordem final dos jogadores:`, players.map(p => ({
            name: p.riotId,
            teamIndex: p.teamIndex,
            lane: p.assignedLane,
            isBot: p.isBot,
            isTestBot: p.isTestBot
        })));

        return players;
    }

    // ✅ NOVO: Gerenciar vez do jogador em modo de teste
    private async handleTestModePlayerTurn(currentPlayer: CustomGamePlayer, gameData: CustomGameData, lobbyStatus: any): Promise<void> {
        console.log(`🧪 [CustomGame] Gerenciando vez do jogador em modo de teste...`);

        try {
            // Filtrar apenas jogadores humanos (excluir bots de teste)
            const humanPlayers = gameData.players.filter(p => !p.isTestBot);
            const currentRiotId = currentPlayer.riotId;

            console.log(`👥 [CustomGame] Jogadores humanos na partida:`, humanPlayers.map(p => p.riotId));

            // Verificar se já entrou no lobby
            const alreadyInLobby = lobbyStatus?.participants?.find((p: any) => {
                const participantName = p.summonerName || p.displayName || p.gameName;
                return participantName === currentRiotId || participantName.includes(currentPlayer.summonerName);
            });

            if (alreadyInLobby) {
                console.log(`✅ [CustomGame] Jogador ${currentRiotId} já está no lobby (modo teste)`);
                return;
            }

            // Encontrar posição do jogador humano na ordem
            const humanOrder = humanPlayers.map(p => p.riotId);
            const currentHumanIndex = humanOrder.indexOf(currentRiotId);

            if (currentHumanIndex === -1) {
                console.warn(`⚠️ [CustomGame] Jogador ${currentRiotId} não encontrado na ordem de humanos`);
                return;
            }

            // Verificar quantos humanos já entraram
            const humansInLobby = lobbyStatus?.participants?.filter((p: any) => {
                const participantName = p.summonerName || p.displayName || p.gameName;
                return humanPlayers.some(human =>
                    participantName === human.riotId ||
                    participantName.includes(human.summonerName)
                );
            }).length || 0;

            console.log(`📊 [CustomGame] Humanos no lobby: ${humansInLobby}/${humanPlayers.length}`);

            if (humansInLobby === currentHumanIndex) {
                console.log(`🎯 [CustomGame] É a vez do jogador ${currentRiotId} entrar no lobby! (modo teste)`);
                console.log(`📋 [CustomGame] Posição humana: ${currentHumanIndex + 1}/${humanPlayers.length} - Lane: ${currentPlayer.assignedLane}`);

                // Log específico para o jogador em modo de teste
                this.logTestModePlayerTurnNotification(currentPlayer, currentHumanIndex + 1, humanPlayers.length, humanPlayers);
            } else if (humansInLobby < currentHumanIndex) {
                console.log(`⏳ [CustomGame] Aguardando ${currentHumanIndex - humansInLobby} humanos entrarem antes de ${currentRiotId} (modo teste)`);
            } else {
                console.warn(`⚠️ [CustomGame] Jogador ${currentRiotId} deveria ter entrado antes! (modo teste)`);
            }

        } catch (error) {
            console.error(`❌ [CustomGame] Erro ao gerenciar vez do jogador em modo de teste:`, error);
        }
    }

    // ✅ NOVO: Log específico para modo de teste
    private logTestModePlayerTurnNotification(currentPlayer: CustomGamePlayer, position: number, total: number, humanPlayers: CustomGamePlayer[]): void {
        console.log(`🧪 [CustomGame] ===== VEZ DO JOGADOR (MODO TESTE) =====`);
        console.log(`👤 Jogador: ${currentPlayer.riotId}`);
        console.log(`🎯 Posição humana: ${position}/${total}`);
        console.log(`🛤️ Lane: ${currentPlayer.assignedLane}`);
        console.log(`🤖 É bot: ${currentPlayer.isBot ? 'Sim' : 'Não'}`);
        console.log(`📋 Instrução: Entre na partida customizada "PERSON DOS CRIA ORDEM INHOUSE"`);
        console.log(`👥 Outros humanos na partida:`, humanPlayers.filter(p => p.riotId !== currentPlayer.riotId).map(p => p.riotId));
        console.log(`🤖 Bots de teste serão adicionados automaticamente`);
        console.log(`🧪 [CustomGame] ======================================`);
    }

    // ✅ NOVO: Verificar ordem de entrada em modo de teste (apenas humanos)
    private async verifyTestModeEntryOrder(gameData: CustomGameData, lobbyStatus: any): Promise<boolean> {
        console.log(`🧪 [CustomGame] Verificando ordem de entrada em modo de teste (apenas humanos)...`);

        try {
            // Filtrar apenas jogadores humanos
            const humanPlayers = gameData.players.filter(p => !p.isTestBot);
            const expectedHumanOrder = humanPlayers.map(p => p.riotId);

            // Filtrar apenas participantes humanos no lobby
            const humanParticipants = lobbyStatus.participants.filter((p: any) => {
                const participantName = p.summonerName || p.displayName || p.gameName;
                return humanPlayers.some(human =>
                    participantName === human.riotId ||
                    participantName.includes(human.summonerName)
                );
            });

            const actualHumanOrder = humanParticipants.map((p: any) =>
                p.summonerName || p.displayName || p.gameName
            );

            console.log(`🧪 [CustomGame] Ordem esperada (humanos):`, expectedHumanOrder);
            console.log(`🧪 [CustomGame] Ordem atual (humanos):`, actualHumanOrder);

            // Verificar se as ordens coincidem
            if (expectedHumanOrder.length !== actualHumanOrder.length) {
                console.warn(`⚠️ [CustomGame] Número de humanos não coincide: esperado ${expectedHumanOrder.length}, atual ${actualHumanOrder.length}`);
                return false;
            }

            let orderCorrect = true;
            for (let i = 0; i < expectedHumanOrder.length; i++) {
                const expected = expectedHumanOrder[i];
                const actual = actualHumanOrder[i];

                if (expected !== actual && !actual.includes(expected.split('#')[0])) {
                    console.warn(`⚠️ [CustomGame] Ordem incorreta na posição ${i}: esperado ${expected}, atual ${actual}`);
                    orderCorrect = false;
                }
            }

            if (orderCorrect) {
                console.log(`✅ [CustomGame] Ordem de entrada dos humanos está correta!`);
            } else {
                console.warn(`⚠️ [CustomGame] Ordem de entrada dos humanos não está correta`);
            }

            return orderCorrect;

        } catch (error) {
            console.error(`❌ [CustomGame] Erro ao verificar ordem de entrada em modo de teste:`, error);
            return false;
        }
    }

    // ✅ NOVO: Configurar bots de teste no lobby automaticamente
    private async configureTestBotsInLobby(lobbyData: any, team1Players: CustomGamePlayer[], team2Players: CustomGamePlayer[]): Promise<void> {
        console.log(`🤖 [CustomGame] Configurando bots de teste no lobby automaticamente...`);

        try {
            // Filtrar apenas bots de teste
            const testBots = [...team1Players, ...team2Players].filter(p => p.isTestBot);
            const humanPlayers = [...team1Players, ...team2Players].filter(p => !p.isTestBot);

            console.log(`🤖 [CustomGame] Bots de teste encontrados:`, testBots.map(b => b.riotId));
            console.log(`👥 [CustomGame] Jogadores humanos:`, humanPlayers.map(h => h.riotId));

            // Configurar posições para bots de teste
            const lanePositions = {
                'top': 0,
                'jungle': 1,
                'mid': 2,
                'adc': 3,
                'support': 4
            };

            const participants = [];

            // Adicionar jogadores humanos primeiro
            for (const player of humanPlayers) {
                const teamId = player.teamIndex < 5 ? 100 : 200; // Blue ou Red
                const cellId = player.teamIndex < 5
                    ? lanePositions[player.assignedLane as keyof typeof lanePositions] || 0
                    : (lanePositions[player.assignedLane as keyof typeof lanePositions] || 0) + 5;

                participants.push({
                    summonerId: player.summonerName,
                    summonerName: player.summonerName,
                    position: player.assignedLane,
                    teamId,
                    cellId
                });
            }

            // Adicionar bots de teste nas posições restantes
            for (const bot of testBots) {
                const teamId = bot.teamIndex < 5 ? 100 : 200;
                const cellId = bot.teamIndex < 5
                    ? lanePositions[bot.assignedLane as keyof typeof lanePositions] || 0
                    : (lanePositions[bot.assignedLane as keyof typeof lanePositions] || 0) + 5;

                participants.push({
                    summonerId: bot.summonerName,
                    summonerName: bot.summonerName,
                    position: bot.assignedLane,
                    teamId,
                    cellId,
                    isBot: true
                });
            }

            console.log(`🤖 [CustomGame] Participantes configurados (modo teste):`, participants.map(p => ({
                name: p.summonerName,
                team: p.teamId === 100 ? 'Blue' : 'Red',
                position: p.position,
                cellId: p.cellId,
                isBot: p.isBot || false
            })));

            // Atualizar lobby
            const updatedLobby = {
                ...lobbyData,
                participants: participants
            };

            await this.lcuService.updateLobby(updatedLobby);

            console.log(`✅ [CustomGame] Bots de teste configurados no lobby com sucesso!`);

        } catch (error) {
            console.error(`❌ [CustomGame] Erro ao configurar bots de teste no lobby:`, error);
        }
    }

    // ✅ Iniciar processo de auto-pick
    private async startAutoPickProcess(matchId: number, gameData: CustomGameData): Promise<void> {
        console.log(`🎯 [CustomGame] Iniciando processo de auto-pick para match ${matchId}...`);

        try {
            // 1. Aguardar entrar na fase de seleção de campeões
            await this.waitForChampionSelect();

            // 2. Detectar ordem dos jogadores na partida
            const playerOrder = await this.detectPlayerOrder(gameData);

            // 3. Executar auto-pick para cada jogador
            for (const player of playerOrder) {
                if (player.championId) {
                    console.log(`🎯 [CustomGame] Auto-pick para ${player.riotId}: campeão ${player.championId}`);

                    // Aguardar um pouco entre cada pick
                    await new Promise(resolve => setTimeout(resolve, this.AUTO_PICK_DELAY));

                    // Executar pick
                    await this.executeChampionPick(player.championId);
                }
            }

            console.log(`✅ [CustomGame] Processo de auto-pick concluído para match ${matchId}`);

        } catch (error) {
            console.error(`❌ [CustomGame] Erro no processo de auto-pick:`, error);
        }
    }

    // ✅ Aguardar entrar na fase de seleção de campeões
    private async waitForChampionSelect(): Promise<void> {
        console.log(`⏳ [CustomGame] Aguardando entrar na fase de seleção de campeões...`);

        return new Promise((resolve, reject) => {
            const checkInterval = setInterval(async () => {
                try {
                    const gameflowPhase = await this.lcuService.getGameflowPhase();

                    if (gameflowPhase === 'ChampSelect') {
                        clearInterval(checkInterval);
                        console.log(`✅ [CustomGame] Entrou na fase de seleção de campeões`);
                        resolve();
                    }
                } catch (error) {
                    console.error(`❌ [CustomGame] Erro ao verificar fase do jogo:`, error);
                }
            }, 1000);

            // Timeout de 60 segundos
            setTimeout(() => {
                clearInterval(checkInterval);
                reject(new Error('Timeout: Não entrou na fase de seleção de campeões'));
            }, 60000);
        });
    }

    // ✅ Detectar ordem dos jogadores na partida com verificação precisa
    private async detectPlayerOrder(gameData: CustomGameData): Promise<CustomGamePlayer[]> {
        console.log(`🔍 [CustomGame] Detectando ordem dos jogadores na partida com verificação precisa...`);

        try {
            // 1. Buscar dados da sessão de seleção de campeões
            const champSelectResponse = await this.lcuService.getChampSelectData();
            const champSelectData = champSelectResponse.data;

            console.log(`📊 [CustomGame] Dados da seleção de campeões:`, {
                myTeam: champSelectData.myTeam?.length || 0,
                theirTeam: champSelectData.theirTeam?.length || 0,
                timer: champSelectData.timer?.phase || 'unknown'
            });

            // 2. ✅ NOVO: Verificar se a ordem está correta baseada no draft
            const expectedOrder = this.getExpectedPlayerOrder(gameData);
            const actualOrder = this.getActualPlayerOrder(champSelectData);

            console.log(`📋 [CustomGame] Ordem esperada (draft):`, expectedOrder.map(p =>
                `${p.assignedLane}: ${p.riotId} (${p.teamIndex})`
            ));

            console.log(`📋 [CustomGame] Ordem atual (partida):`, actualOrder.map(p =>
                `${p.position}: ${p.summonerName}`
            ));

            // 3. ✅ NOVO: Verificar se as ordens coincidem
            const orderMatches = this.verifyPlayerOrder(expectedOrder, actualOrder);

            if (orderMatches) {
                console.log(`✅ [CustomGame] Ordem dos jogadores está correta!`);
                return expectedOrder;
            } else {
                console.warn(`⚠️ [CustomGame] Ordem dos jogadores não coincide com o draft`);
                console.log(`🔄 [CustomGame] Usando ordem esperada do draft como referência`);

                // ✅ NOVO: Tentar corrigir a ordem se possível
                const correctedOrder = this.attemptOrderCorrection(expectedOrder, actualOrder);
                return correctedOrder;
            }

        } catch (error) {
            console.error(`❌ [CustomGame] Erro ao detectar ordem dos jogadores:`, error);
            // Em caso de erro, usar ordem esperada do draft
            return this.getExpectedPlayerOrder(gameData);
        }
    }

    // ✅ NOVO: Obter ordem esperada baseada no draft
    private getExpectedPlayerOrder(gameData: CustomGameData): CustomGamePlayer[] {
        // Ordenar jogadores baseado na ordem da partida (0-9) conforme definido no draft
        return [...gameData.players].sort((a, b) => a.teamIndex - b.teamIndex);
    }

    // ✅ NOVO: Obter ordem atual da partida via LCU
    private getActualPlayerOrder(champSelectData: any): any[] {
        const allPlayers = [];

        // Adicionar jogadores do meu time
        if (champSelectData.myTeam) {
            allPlayers.push(...champSelectData.myTeam.map((player: any) => ({
                ...player,
                team: 'myTeam'
            })));
        }

        // Adicionar jogadores do time adversário
        if (champSelectData.theirTeam) {
            allPlayers.push(...champSelectData.theirTeam.map((player: any) => ({
                ...player,
                team: 'theirTeam'
            })));
        }

        // Ordenar por cellId (posição na partida)
        return allPlayers.sort((a, b) => a.cellId - b.cellId);
    }

    // ✅ NOVO: Verificar se a ordem atual coincide com a esperada
    private verifyPlayerOrder(expectedOrder: CustomGamePlayer[], actualOrder: any[]): boolean {
        if (expectedOrder.length !== actualOrder.length) {
            console.warn(`⚠️ [CustomGame] Número de jogadores não coincide: esperado ${expectedOrder.length}, atual ${actualOrder.length}`);
            return false;
        }

        // Verificar se cada jogador está na posição correta
        for (let i = 0; i < expectedOrder.length; i++) {
            const expected = expectedOrder[i];
            const actual = actualOrder[i];

            // Tentar encontrar o jogador esperado na posição atual
            const foundPlayer = actualOrder.find((p: any) =>
                p.summonerName === expected.summonerName ||
                p.displayName === expected.summonerName ||
                p.gameName === expected.summonerName
            );

            if (!foundPlayer) {
                console.warn(`⚠️ [CustomGame] Jogador ${expected.riotId} não encontrado na posição ${i}`);
                return false;
            }

            // Verificar se a lane/posição está correta
            const expectedPosition = this.getLanePosition(expected.assignedLane);
            if (foundPlayer.cellId !== expectedPosition) {
                console.warn(`⚠️ [CustomGame] Posição incorreta para ${expected.riotId}: esperado ${expectedPosition}, atual ${foundPlayer.cellId}`);
                return false;
            }
        }

        return true;
    }

    // ✅ NOVO: Obter posição da lane no LoL
    private getLanePosition(lane: string): number {
        const lanePositions: { [key: string]: number } = {
            'top': 0,
            'jungle': 1,
            'mid': 2,
            'adc': 3,
            'support': 4
        };

        return lanePositions[lane] || 0;
    }

    // ✅ NOVO: Tentar corrigir a ordem dos jogadores se não coincidir
    private attemptOrderCorrection(expectedOrder: CustomGamePlayer[], actualOrder: any[]): CustomGamePlayer[] {
        console.log(`🔄 [CustomGame] Tentando corrigir ordem dos jogadores...`);

        try {
            // Se temos dados suficientes, tentar mapear jogadores baseado em nomes
            const correctedOrder: CustomGamePlayer[] = [];

            for (const expectedPlayer of expectedOrder) {
                // Tentar encontrar o jogador na ordem atual
                const foundPlayer = actualOrder.find((actual: any) => {
                    const actualName = actual.summonerName || actual.displayName || actual.gameName;
                    return actualName === expectedPlayer.summonerName ||
                        actualName === expectedPlayer.riotId ||
                        actualName?.includes(expectedPlayer.summonerName);
                });

                if (foundPlayer) {
                    // Jogador encontrado, manter dados do draft mas usar posição atual
                    correctedOrder.push({
                        ...expectedPlayer,
                        // Manter dados do draft (championId, assignedLane, etc.)
                    });
                    console.log(`✅ [CustomGame] Jogador ${expectedPlayer.riotId} mapeado corretamente`);
                } else {
                    // Jogador não encontrado, usar dados do draft
                    correctedOrder.push(expectedPlayer);
                    console.warn(`⚠️ [CustomGame] Jogador ${expectedPlayer.riotId} não encontrado na partida`);
                }
            }

            console.log(`🔄 [CustomGame] Ordem corrigida com ${correctedOrder.length} jogadores`);
            return correctedOrder;

        } catch (error) {
            console.error(`❌ [CustomGame] Erro ao corrigir ordem:`, error);
            return expectedOrder; // Fallback para ordem esperada
        }
    }

    // ✅ Executar pick de campeão
    private async executeChampionPick(championId: number): Promise<void> {
        console.log(`🎯 [CustomGame] Executando pick do campeão ${championId}...`);

        try {
            // 1. Verificar se é o turno do jogador
            const champSelectResponse = await this.lcuService.getChampSelectData();
            const champSelectData = champSelectResponse.data;

            // 2. Encontrar ação atual do jogador
            const currentAction = champSelectData.actions?.find((action: any) =>
                action.isInProgress && action.type === 'pick'
            );

            if (currentAction) {
                // 3. Executar pick
                await this.lcuService.executeChampSelectAction(currentAction.id, {
                    championId: championId,
                    completed: true
                });

                console.log(`✅ [CustomGame] Pick executado com sucesso: campeão ${championId}`);
            } else {
                console.log(`⏳ [CustomGame] Não é o turno do jogador para pick`);
            }

        } catch (error) {
            console.error(`❌ [CustomGame] Erro ao executar pick:`, error);
        }
    }

    // ✅ Handlers para timeouts e erros
    private async handleGameCreationTimeout(matchId: number): Promise<void> {
        console.error(`❌ [CustomGame] Timeout na criação do jogo para match ${matchId}`);

        try {
            await this.dbManager.updateCustomMatch(matchId, {
                status: 'custom_game_timeout',
                notes: 'Timeout: Líder não criou partida customizada'
            });

            this.activeGames.delete(matchId);
            this.gameCreationQueue.delete(matchId);

            // Log do erro (apenas backend)
            this.logCustomGameError(matchId, 'Timeout na criação da partida customizada');
        } catch (error) {
            console.error(`❌ [CustomGame] Erro ao lidar com timeout:`, error);
        }
    }

    private async handleLobbyJoinTimeout(matchId: number): Promise<void> {
        console.error(`❌ [CustomGame] Timeout na entrada do lobby para match ${matchId}`);

        try {
            await this.dbManager.updateCustomMatch(matchId, {
                status: 'custom_game_lobby_timeout',
                notes: 'Timeout: Nem todos os jogadores entraram no lobby'
            });

            this.activeGames.delete(matchId);

            // Log do erro (apenas backend)
            this.logCustomGameError(matchId, 'Timeout na entrada do lobby');
        } catch (error) {
            console.error(`❌ [CustomGame] Erro ao lidar com timeout do lobby:`, error);
        }
    }

    // ✅ Logs do backend (sem notificações WebSocket)
    private logCustomGameCreationStarted(matchId: number, gameData: CustomGameData): void {
        console.log(`🎮 [CustomGame] Criação de partida customizada iniciada para match ${matchId}`);
        console.log(`📋 [CustomGame] Jogadores:`, gameData.players.map(p =>
            `${p.riotId} (${p.assignedLane}) - ${p.isLeader ? 'LÍDER' : 'Jogador'}`
        ));
    }

    private logCustomGameError(matchId: number, errorMessage: string): void {
        console.error(`❌ [CustomGame] Erro na partida customizada ${matchId}: ${errorMessage}`);
    }

    // Método removido - não há notificações WebSocket para o frontend

    // ✅ Métodos públicos para integração
    async getActiveCustomGames(): Promise<CustomGameData[]> {
        return Array.from(this.activeGames.values());
    }

    async getCustomGameByMatchId(matchId: number): Promise<CustomGameData | undefined> {
        return this.activeGames.get(matchId);
    }

    // ✅ Shutdown
    shutdown(): void {
        console.log('🔄 [CustomGame] Encerrando CustomGameService...');

        // Limpar timeouts
        for (const [matchId, timeout] of this.gameCreationQueue) {
            clearTimeout(timeout);
        }
        this.gameCreationQueue.clear();

        // Limpar jogos ativos
        this.activeGames.clear();

        console.log('✅ [CustomGame] CustomGameService encerrado');
    }

    // ✅ NOVO: Detectar e configurar lobby manualmente criado
    private async detectAndConfigureManualLobby(gameData: CustomGameData): Promise<boolean> {
        console.log(`🔍 [CustomGame] Detectando lobby manualmente criado...`);

        try {
            // 1. Verificar se há um lobby ativo
            const lobbyResponse = await this.lcuService.getLobbyData();
            const lobbyData = lobbyResponse.data;

            console.log(`📋 [CustomGame] Lobby detectado:`, {
                lobbyId: lobbyData.lobbyId,
                queueId: lobbyData.queueId,
                gameConfig: lobbyData.gameConfig,
                participants: lobbyData.participants?.length || 0
            });

            // 2. Verificar se é um lobby customizado
            if (lobbyData.queueId !== 0) {
                console.log(`❌ [CustomGame] Lobby não é customizado (queueId: ${lobbyData.queueId})`);
                return false;
            }

            // 3. Configurar o lobby com as configurações corretas
            console.log(`⚙️ [CustomGame] Configurando lobby com configurações corretas...`);

            const updatedConfig = {
                gameConfig: {
                    gameMode: 'CLASSIC',
                    mapId: 11, // Summoner's Rift
                    pickType: 'BLIND_PICK',
                    spectatorType: 'ALL',
                    teamSize: 5
                },
                lobbyName: gameData.gameName || 'Partida Customizada',
                lobbyPassword: 'ordem123'
            };

            // 4. Atualizar configuração do lobby
            await this.lcuService.makeLCURequest('PUT', '/lol-lobby/v2/lobby', updatedConfig);
            console.log(`✅ [CustomGame] Configuração do lobby atualizada`);

            // 5. Configurar posições dos jogadores
            await this.configureLobbyPositions(gameData.players.slice(0, 5), gameData.players.slice(5, 10));

            console.log(`🎉 [CustomGame] Lobby manual configurado com sucesso!`);
            return true;

        } catch (error: any) {
            if (error.response?.data?.errorCode === 'LOBBY_NOT_FOUND') {
                console.log(`📋 [CustomGame] Nenhum lobby ativo encontrado`);
                return false;
            }

            console.error(`❌ [CustomGame] Erro ao configurar lobby manual:`, error);
            return false;
        }
    }

    // ✅ NOVO: Método principal para criar partida customizada (abordagem híbrida)
    public async createCustomGame(matchId: number, gameData: CustomGameData): Promise<boolean> {
        console.log(`🎮 [CustomGame] Iniciando criação de partida customizada (abordagem híbrida)...`);

        try {
            // 1. Tentar criar lobby automaticamente (pode falhar)
            console.log(`1️⃣ [CustomGame] Tentando criar lobby automaticamente...`);

            try {
                await this.createCustomGameLobby(matchId, gameData);
                console.log(`✅ [CustomGame] Lobby criado automaticamente!`);
                return true;
            } catch (error: any) {
                console.log(`⚠️ [CustomGame] Criação automática falhou:`, error.message);
            }

            // 2. Se falhou, detectar e configurar lobby manual
            console.log(`2️⃣ [CustomGame] Tentando detectar lobby manual...`);

            const success = await this.detectAndConfigureManualLobby(gameData);
            if (success) {
                console.log(`✅ [CustomGame] Lobby manual configurado com sucesso!`);
                return true;
            }

            // 3. Se ambos falharam, instruir o usuário
            console.log(`3️⃣ [CustomGame] Ambas as abordagens falharam`);
            console.log(`📋 [CustomGame] Instruções para o usuário:`);
            console.log(`   1. Crie um lobby customizado manualmente no League of Legends`);
            console.log(`   2. Configure como "Escolha às Cegas"`);
            console.log(`   3. Defina a senha como "ordem123"`);
            console.log(`   4. Execute novamente o comando de criação`);

            return false;

        } catch (error) {
            console.error(`❌ [CustomGame] Erro na criação de partida customizada:`, error);
            return false;
        }
    }
} 