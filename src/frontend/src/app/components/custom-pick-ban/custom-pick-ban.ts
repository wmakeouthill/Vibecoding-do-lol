import { Component, Input, Output, EventEmitter, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ChampionService, Champion } from '../../services/champion.service';

interface LocalChampion {
  id: number;
  name: string;
  image: string;
}

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
  currentPlayerIndex: number; // Index do jogador atual dentro do time
}

@Component({
  selector: 'app-custom-pick-ban',
  imports: [CommonModule, FormsModule],
  templateUrl: './custom-pick-ban.html',
  styleUrl: './custom-pick-ban.scss'
})
export class CustomPickBanComponent implements OnInit, OnDestroy {
  @Input() matchData: any = null;
  @Input() isLeader: boolean = false;
  @Input() currentPlayer: any = null;
  @Output() onPickBanComplete = new EventEmitter<any>();
  @Output() onPickBanCancel = new EventEmitter<void>();

  session: CustomPickBanSession | null = null;
  champions: Champion[] = [];
  championsByRole: any = {};
  searchFilter: string = '';
  selectedChampion: Champion | null = null;
  selectedRole: string = 'all';
  timeRemaining: number = 30;
  isMyTurn: boolean = false;

  // NOVAS PROPRIEDADES PARA O MODAL
  showChampionModal: boolean = false;
  modalSearchFilter: string = '';
  modalSelectedRole: string = 'all';
  modalSelectedChampion: Champion | null = null;
  isConfirming: boolean = false;

  // NOVAS PROPRIEDADES PARA MELHORIAS
  showFinalConfirmation: boolean = false;
  finalConfirmationData: any = null;
  modalTimeRemaining: number = 30;
  modalTimer: any = null;
  editingPlayerId: string | null = null; // ID do jogador que está editando
  isEditingMode: boolean = false; // Se está em modo de edição

  // PROPRIEDADES PARA CACHE E PERFORMANCE
  private _cachedSortedBlueTeam: any[] | null = null;
  private _cachedSortedRedTeam: any[] | null = null;
  private _cachedBannedChampions: Champion[] | null = null;
  private _cachedBlueTeamPicks: Champion[] | null = null;
  private _cachedRedTeamPicks: Champion[] | null = null;
  private _cachedModalFilteredChampions: Champion[] | null = null;
  private _lastCacheUpdate: number = 0;
  private readonly CACHE_DURATION = 100; // 100ms de cache

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

    // Verificar por ID negativo (padrão do backend)
    if (id < 0) {
      return true;
    }

    // Verificar se o ID é string e pode ser convertido para número negativo
    if (typeof id === 'string') {
      const numericId = parseInt(id);
      if (!isNaN(numericId) && numericId < 0) {
        return true;
      }

      // Verificar se o ID é string que contém "bot" ou números negativos
      if (id.toLowerCase().includes('bot') || id.startsWith('-')) {
        return true;
      }
    }

    // Verificar por padrões de nome de bot (mais específicos e abrangentes)
    const botPatterns = [
      /^bot\d+$/i,           // Bot1, Bot2, etc
      /^bot\s*\d+$/i,        // Bot 1, Bot 2, etc
      /^ai\s*bot$/i,         // AI Bot
      /^computer\s*\d*$/i,   // Computer, Computer1, etc
      /^bot\s*player$/i,     // Bot Player
      /^ai\s*player$/i,      // AI Player
      /^bot$/i,              // Bot
      /^ai$/i,               // AI
      /^popcornseller$/i,    // Nome específico do bot
      /^bot\s*[a-z]*$/i,     // Bot com qualquer sufixo
      /^ai\s*[a-z]*$/i,      // AI com qualquer sufixo
      /^bot\s*\d+\s*[a-z]*$/i, // Bot número com sufixo
      /^ai\s*\d+\s*[a-z]*$/i,   // AI número com sufixo
      /^bot\d+[a-z]*$/i,     // Bot número sem espaço
      /^ai\d+[a-z]*$/i       // AI número sem espaço
    ];

    for (const pattern of botPatterns) {
      if (pattern.test(name)) {
        return true;
      }
    }

    // Verificar se o nome contém "bot" (case insensitive)
    if (name.toLowerCase().includes('bot')) {
      return true;
    }

    // Verificar se o nome contém "ai" (case insensitive)
    if (name.toLowerCase().includes('ai')) {
      return true;
    }

    // Verificar se o nome contém números (pode ser bot numerado)
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

    // Normalizar os valores para comparação
    const id1 = player1.id?.toString();
    const name1 = player1.summonerName || player1.name || '';
    const id2 = player2.id?.toString();
    const name2 = player2.summonerName || player2.name || '';

    // Verificar por ID
    if (id1 && id2 && id1 === id2) {
      return true;
    }

    // Verificar por nome exato
    if (name1 && name2 && name1 === name2) {
      return true;
    }

    // Verificar por nome parcial (sem tagline)
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

    // Verificar se name2 é gameName do name1
    if (name1 && name2 && name1.startsWith(name2 + '#')) {
      return true;
    }

    // Verificar se name1 é gameName do name2
    if (name1 && name2 && name2.startsWith(name1 + '#')) {
      return true;
    }

    // Verificar se um dos nomes é substring do outro (para casos onde um tem tagline e outro não)
    if (name1 && name2) {
      if (name1.includes(name2) || name2.includes(name1)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Método auxiliar para comparar um jogador com um ID/nome
   */
  private comparePlayerWithId(player: any, targetId: string): boolean {
    if (!player || !targetId) return false;

    // Normalizar os valores para comparação
    const playerId = player.id?.toString();
    const playerName = player.summonerName || player.name || '';
    const targetIdStr = targetId.toString();

    // Verificar por ID
    if (playerId && targetIdStr && playerId === targetIdStr) {
      return true;
    }

    // Verificar por nome exato
    if (playerName && targetIdStr && playerName === targetIdStr) {
      return true;
    }

    // Verificar por nome parcial (sem tagline)
    if (playerName && targetIdStr && playerName.includes('#')) {
      const gameName = playerName.split('#')[0];
      if (targetIdStr.includes('#')) {
        const targetGameName = targetIdStr.split('#')[0];
        if (gameName === targetGameName) {
          return true;
        }
      } else if (gameName === targetIdStr) {
        return true;
      }
    }

    // Verificar se targetId é gameName do player
    if (playerName && targetIdStr && playerName.startsWith(targetIdStr + '#')) {
      return true;
    }

    // Verificar se um dos nomes é substring do outro (para casos onde um tem tagline e outro não)
    if (playerName && targetIdStr) {
      if (playerName.includes(targetIdStr) || targetIdStr.includes(playerName)) {
        return true;
      }
    }

    return false;
  }

  ngOnInit() {
    console.log('🔥 CustomPickBanComponent ngOnInit iniciado');
    console.log('📊 matchData recebido:', this.matchData);
    console.log('👤 currentPlayer recebido:', this.currentPlayer);

    // Carregar todos os campeões do serviço
    this.champions = this.championService.getAllChampions();
    this.championsByRole = this.championService.getChampionsByRole();

    console.log('🏆 Campeões carregados no Pick&Ban:', this.champions.length);
    console.log('📁 Campeões por role:', Object.keys(this.championsByRole).map(key => `${key}: ${this.championsByRole[key]?.length || 0}`));

    this.initializePickBanSession();
    this.startTimer();
  }

  ngOnDestroy() {
    if (this.timer) {
      clearInterval(this.timer);
    }
    if (this.botPickTimer) {
      clearInterval(this.botPickTimer);
    }
    if (this.modalTimer) {
      clearInterval(this.modalTimer);
    }
  }
  initializePickBanSession() {
    console.log('🚀 initializePickBanSession iniciado');
    console.log('📊 matchData completo:', this.matchData);
    console.log('👤 currentPlayer:', this.currentPlayer);

    if (!this.matchData) {
      console.error('❌ matchData não está disponível - não é possível inicializar sessão');
      return;
    }

    // Verificar se temos os times necessários
    if (!this.matchData.team1 || !this.matchData.team2) {
      console.error('❌ Dados dos times não estão disponíveis no matchData');
      console.log('📊 matchData recebido:', this.matchData);
      console.log('📊 Propriedades disponíveis:', Object.keys(this.matchData));
      return;
    }

    // Processar dados dos times para garantir formato consistente
    const processTeamData = (teamData: any[]): any[] => {
      return teamData.map((player: any) => {
        // Se já é um objeto com dados completos, usar como está
        if (typeof player === 'object' && player !== null) {
          // Garantir que summonerName está no formato correto
          let summonerName = player.summonerName || player.name || '';

          // Se temos gameName e tagLine, formatar como gameName#tagLine
          if (player.gameName && player.tagLine) {
            summonerName = `${player.gameName}#${player.tagLine}`;
          } else if (player.gameName && !player.tagLine) {
            summonerName = player.gameName;
          }

          return {
            ...player,
            summonerName: summonerName,
            name: summonerName, // Manter compatibilidade
            id: player.id || player.summonerId || Math.random().toString()
          };
        }

        // Se é string, criar objeto básico
        const playerName = player.toString();
        return {
          id: playerName,
          name: playerName,
          summonerName: playerName
        };
      });
    };

    const processedTeam1 = processTeamData(this.matchData.team1);
    const processedTeam2 = processTeamData(this.matchData.team2);

    console.log('✅ Dados dos times processados:', {
      team1Size: processedTeam1.length,
      team2Size: processedTeam2.length,
      team1: processedTeam1.map((p: any) => ({ id: p.id, name: p.summonerName, isBot: this.isBot(p) })),
      team2: processedTeam2.map((p: any) => ({ id: p.id, name: p.summonerName, isBot: this.isBot(p) }))
    });

    // Create the pick/ban sequence (seguindo exatamente o padrão do LoL)
    const phases: PickBanPhase[] = [
      // 1ª Fase de Banimento (3 bans por time)
      { team: 'blue', action: 'ban', locked: false, timeRemaining: 30 },   // Ban 1 - Blue
      { team: 'red', action: 'ban', locked: false, timeRemaining: 30 },    // Ban 1 - Red
      { team: 'blue', action: 'ban', locked: false, timeRemaining: 30 },   // Ban 2 - Blue
      { team: 'red', action: 'ban', locked: false, timeRemaining: 30 },    // Ban 2 - Red
      { team: 'blue', action: 'ban', locked: false, timeRemaining: 30 },   // Ban 3 - Blue
      { team: 'red', action: 'ban', locked: false, timeRemaining: 30 },    // Ban 3 - Red

      // 1ª Fase de Picks (3 picks iniciais)
      { team: 'blue', action: 'pick', locked: false, timeRemaining: 30 },  // Pick 1 - Blue (primeiro pick)
      { team: 'red', action: 'pick', locked: false, timeRemaining: 30 },   // Pick 1 - Red
      { team: 'red', action: 'pick', locked: false, timeRemaining: 30 },   // Pick 2 - Red
      { team: 'blue', action: 'pick', locked: false, timeRemaining: 30 },  // Pick 2 - Blue
      { team: 'blue', action: 'pick', locked: false, timeRemaining: 30 },  // Pick 3 - Blue

      // 2ª Fase de Banimento (2 bans por time)
      { team: 'red', action: 'ban', locked: false, timeRemaining: 30 },    // Ban 4 - Red (começa o vermelho)
      { team: 'blue', action: 'ban', locked: false, timeRemaining: 30 },   // Ban 4 - Blue
      { team: 'red', action: 'ban', locked: false, timeRemaining: 30 },    // Ban 5 - Red
      { team: 'blue', action: 'ban', locked: false, timeRemaining: 30 },   // Ban 5 - Blue

      // 2ª Fase de Picks (2 picks finais)
      { team: 'red', action: 'pick', locked: false, timeRemaining: 30 },   // Pick 3 - Red
      { team: 'blue', action: 'pick', locked: false, timeRemaining: 30 },  // Pick 4 - Blue
      { team: 'red', action: 'pick', locked: false, timeRemaining: 30 },   // Pick 4 - Red
      { team: 'blue', action: 'pick', locked: false, timeRemaining: 30 },  // Pick 5 - Blue (último pick)
      { team: 'red', action: 'pick', locked: false, timeRemaining: 30 }    // Pick 5 - Red (último pick)
    ];

    this.session = {
      id: this.matchData.id || 'custom_session_' + Date.now(),
      phase: 'bans',
      currentAction: 0,
      extendedTime: 0,
      phases: phases,
      blueTeam: processedTeam1,
      redTeam: processedTeam2,
      currentPlayerIndex: 0
    };

    console.log('✅ Sessão Pick&Ban criada:', {
      id: this.session.id,
      blueTeamSize: this.session.blueTeam.length,
      redTeamSize: this.session.redTeam.length,
      phasesCount: this.session.phases.length,
      currentAction: this.session.currentAction,
      blueTeam: this.session.blueTeam.map(p => ({ id: p.id, name: p.summonerName, isBot: this.isBot(p) })),
      redTeam: this.session.redTeam.map(p => ({ id: p.id, name: p.summonerName, isBot: this.isBot(p) }))
    });

    this.updateCurrentTurn();
  } updateCurrentTurn() {
    if (!this.session || this.session.currentAction >= this.session.phases.length) {
      console.log('🎯 [updateCurrentTurn] Sessão completada, finalizando...');
      this.completePickBan();
      return;
    }

    const currentPhase = this.session.phases[this.session.currentAction];
    this.timeRemaining = currentPhase.timeRemaining + this.session.extendedTime;

    // Update phase status baseado na ação atual
    if (this.session.currentAction < 6) {
      this.session.phase = 'bans'; // Primeira fase de bans (0-5)
    } else if (this.session.currentAction >= 6 && this.session.currentAction < 11) {
      this.session.phase = 'picks'; // Primeira fase de picks (6-10)
    } else if (this.session.currentAction >= 11 && this.session.currentAction < 15) {
      this.session.phase = 'bans'; // Segunda fase de bans (11-14)
    } else {
      this.session.phase = 'picks'; // Segunda fase de picks (15-19)
    }

    console.log(`🎯 [updateCurrentTurn] Ação ${this.session.currentAction}: ${currentPhase.team} - ${currentPhase.action}`);
    console.log(`🎯 [updateCurrentTurn] Fase atual: ${this.session.phase}`);

    // Verificar se é minha vez
    const wasMyTurn = this.isMyTurn;
    this.isMyTurn = this.checkIfMyTurn(currentPhase);

    console.log(`🎯 [updateCurrentTurn] Vez de: ${this.getCurrentPlayerName()}, É minha vez: ${this.isMyTurn}`);
    console.log(`🎯 [updateCurrentTurn] Jogador logado: ${this.currentPlayer?.summonerName || this.currentPlayer?.name}`);
    console.log(`🎯 [updateCurrentTurn] Time do jogador logado: ${this.getPlayerTeam()}`);

    // Debug detalhado a cada 5 ações ou quando há mudança de turno
    if (this.session.currentAction % 5 === 0 || wasMyTurn !== this.isMyTurn) {
      this.debugPlayerData();
    }

    // Abrir modal automaticamente se acabou de ser minha vez
    if (this.isMyTurn && !wasMyTurn && !this.showChampionModal) {
      console.log('🎯 [updateCurrentTurn] Abrindo modal automaticamente para minha vez');
      setTimeout(() => {
        this.openChampionModal();
      }, 500); // Pequeno delay para garantir que a interface foi atualizada
    }

    // Verificar se é um bot e fazer ação automática
    this.checkForBotAutoAction(currentPhase);
  }
  private checkForBotAutoAction(phase: PickBanPhase) {
    if (!this.session || !phase) {
      return;
    }

    // Verificar se a fase já está bloqueada
    if (phase.locked === true) {
      return;
    }

    // Obter o jogador atual da fase
    const currentPlayer = this.getCurrentPlayer();
    if (!currentPlayer) {
      return;
    }

    // Verificar se é um bot
    const isBot = this.isBot(currentPlayer);

    if (isBot) {
      // Limpar timer anterior se existir
      if (this.botPickTimer) {
        clearTimeout(this.botPickTimer);
      }

      // Definir delay aleatório para ação do bot (1-3 segundos)
      const delay = Math.random() * 2000 + 1000;

      this.botPickTimer = setTimeout(() => {
        this.performBotAction(phase);
      }, delay);
    }
  }
  private getCurrentPlayer(): any {
    if (!this.session) return null;
    const currentPhase = this.session.phases[this.session.currentAction];
    if (!currentPhase) return null;
    // Checagem defensiva para evitar erro de undefined
    if (!currentPhase.team) return null;
    const teamPlayers = currentPhase.team === 'blue' ? this.session.blueTeam : this.session.redTeam;

    // Garantir que temos exatamente 5 jogadores
    if (teamPlayers.length !== 5) {
      console.error(`❌ [getCurrentPlayer] Time ${currentPhase.team} não tem exatamente 5 jogadores: ${teamPlayers.length}`);
      return teamPlayers[0] || null; // Fallback para o primeiro jogador
    }

    // Obter jogadores ordenados por lane (top, jungle, mid, adc, support)
    const sortedPlayers = this.getSortedTeamByLane(currentPhase.team);

    // Mapeamento baseado na ordem padrão do LoL e na ação atual
    let playerIndex = 0;
    const actionIndex = this.session.currentAction;

    // Distribuição seguindo a ordem padrão do LoL:
    // - Bans: distribuídos entre os 5 jogadores de forma rotativa
    // - Picks: cada jogador faz exatamente 1 pick na ordem de suas lanes

    if (actionIndex < 6) {
      // Primeira fase de bans (0-5): distribuir entre todos os 5 players
      // Blue: 0, 2, 4 | Red: 1, 3, 5
      const teamBanIndex = actionIndex % 2 === 0 ? actionIndex / 2 : (actionIndex - 1) / 2;
      playerIndex = teamBanIndex % 5;
    } else if (actionIndex >= 6 && actionIndex < 11) {
      // Primeira fase de picks (6-10): cada jogador faz 1 pick
      // Blue: 6, 9, 10 | Red: 7, 8
      if (currentPhase.team === 'blue') {
        // Blue team picks: 6, 9, 10
        if (actionIndex === 6) playerIndex = 0; // Primeiro pick - Top
        else if (actionIndex === 9) playerIndex = 1; // Segundo pick - Jungle  
        else if (actionIndex === 10) playerIndex = 2; // Terceiro pick - Mid
      } else {
        // Red team picks: 7, 8
        if (actionIndex === 7) playerIndex = 0; // Primeiro pick - Top
        else if (actionIndex === 8) playerIndex = 1; // Segundo pick - Jungle
      }
    } else if (actionIndex >= 11 && actionIndex < 15) {
      // Segunda fase de bans (11-14): usar jogadores que ainda não fizeram ban
      // Blue: 12, 14 | Red: 11, 13
      if (currentPhase.team === 'blue') {
        // Blue team bans: 12, 14
        if (actionIndex === 12) playerIndex = 3; // ADC
        else if (actionIndex === 14) playerIndex = 4; // Support
      } else {
        // Red team bans: 11, 13
        if (actionIndex === 11) playerIndex = 2; // Mid
        else if (actionIndex === 13) playerIndex = 3; // ADC
      }
    } else {
      // Segunda fase de picks (15-19): jogadores restantes fazem seus picks
      // Blue: 16, 18 | Red: 15, 17, 19
      if (currentPhase.team === 'blue') {
        // Blue team picks: 16, 18
        if (actionIndex === 16) playerIndex = 3; // ADC
        else if (actionIndex === 18) playerIndex = 4; // Support
      } else {
        // Red team picks: 15, 17, 19
        if (actionIndex === 15) playerIndex = 2; // Mid
        else if (actionIndex === 17) playerIndex = 3; // ADC
        else if (actionIndex === 19) playerIndex = 4; // Support
      }
    }

    // Garantir que o índice seja válido
    playerIndex = Math.max(0, Math.min(playerIndex, sortedPlayers.length - 1));

    this.session.currentPlayerIndex = playerIndex;
    const player = sortedPlayers[playerIndex] || null;

    console.log(`🔍 [getCurrentPlayer] Ação ${actionIndex}, Time ${currentPhase.team}, Player Index ${playerIndex}:`, {
      playerName: player?.summonerName || player?.name,
      playerLane: player?.assignedLane || player?.primaryLane,
      isBot: this.isBot(player),
      action: currentPhase.action
    });

    return player;
  }

  private performBotAction(phase: PickBanPhase) {
    if (!this.session || !phase) {
      return;
    }

    // Verificar se a fase já está bloqueada
    if (phase.locked === true) {
      return;
    }

    const availableChampions = this.getFilteredChampions();

    if (availableChampions.length === 0) {
      return;
    }

    let selectedChampion: Champion;

    if (phase.action === 'pick') {
      // For picks, try to select a champion suitable for a random role
      const roles = ['top', 'jungle', 'mid', 'adc', 'support'];
      const randomRole = roles[Math.floor(Math.random() * roles.length)];
      const roleChampions = this.championsByRole[randomRole] || [];

      const availableRoleChampions = roleChampions.filter((champ: Champion) =>
        availableChampions.some(ac => ac.id === champ.id)
      );

      if (availableRoleChampions.length > 0) {
        selectedChampion = availableRoleChampions[Math.floor(Math.random() * availableRoleChampions.length)];
      } else {
        selectedChampion = availableChampions[Math.floor(Math.random() * availableChampions.length)];
      }
    } else {
      // For bans, select a random strong champion
      const strongChampions = availableChampions.filter(champ =>
        ['Yasuo', 'Zed', 'Akali', 'LeBlanc', 'Azir', 'Kassadin', 'Katarina'].includes(champ.name)
      );

      if (strongChampions.length > 0) {
        selectedChampion = strongChampions[Math.floor(Math.random() * strongChampions.length)];
      } else {
        selectedChampion = availableChampions[Math.floor(Math.random() * availableChampions.length)];
      }
    }

    // Vincular o bot que fez a ação
    const currentPlayer = this.getCurrentPlayer();
    if (currentPlayer) {
      // Vincular a ação ao bot atual
      phase.playerId = currentPlayer.id?.toString();
      phase.playerName = currentPlayer.summonerName || currentPlayer.name;
      phase.champion = selectedChampion;
      phase.locked = true;

      // Avançar para próxima ação
      this.session.currentAction++;
      this.session.extendedTime = 0;

      // Resetar timer
      this.timeRemaining = 30;

      // Atualizar turno
      this.updateCurrentTurn();
    }
  }
  /**
   * Verifica se é a vez do jogador atual
   */
  checkIfMyTurn(phase: PickBanPhase): boolean {
    if (!this.session || !this.currentPlayer) return false;

    // Se está em modo de edição, verificar se o jogador atual é quem está editando
    if (this.isEditingMode && this.editingPlayerId) {
      const isEditingPlayer = this.comparePlayerWithId(this.currentPlayer, this.editingPlayerId);
      console.log(`🔍 [checkIfMyTurn] Modo edição - É o jogador que está editando: ${isEditingPlayer}`);
      return isEditingPlayer;
    }

    // Lógica normal para turnos - verificar se o jogador logado está no time correto
    const currentPhase = this.session.phases[this.session.currentAction];
    if (!currentPhase) return false;

    // Verificar se o jogador logado está no time da fase atual
    const teamPlayers = currentPhase.team === 'blue' ? this.session.blueTeam : this.session.redTeam;
    const isPlayerInTeam = teamPlayers.some(p => this.comparePlayers(this.currentPlayer, p));

    if (!isPlayerInTeam) {
      console.log(`🔍 [checkIfMyTurn] Jogador não está no time ${currentPhase.team}`);
      return false;
    }

    // Obter o jogador atual da fase (pode ser bot ou jogador logado)
    const currentPhasePlayer = this.getCurrentPlayer();
    if (!currentPhasePlayer) {
      console.log(`🔍 [checkIfMyTurn] Jogador da fase atual não encontrado`);
      return false;
    }

    // Se o jogador da fase atual é o jogador logado, é sua vez
    const isCurrentPlayerTurn = this.comparePlayers(this.currentPlayer, currentPhasePlayer);

    console.log(`🔍 [checkIfMyTurn] Verificando turno:`, {
      currentAction: this.session.currentAction,
      team: currentPhase.team,
      currentPhasePlayer: currentPhasePlayer.summonerName || currentPhasePlayer.name,
      currentPlayer: this.currentPlayer.summonerName || this.currentPlayer.name,
      isCurrentPlayerTurn,
      isBot: this.isBot(currentPhasePlayer)
    });

    return isCurrentPlayerTurn;
  }

  getPlayerTeam(): 'blue' | 'red' {
    if (!this.currentPlayer || !this.session) return 'blue';

    const isInBlueTeam = this.session.blueTeam.some(p => this.comparePlayers(this.currentPlayer, p));
    return isInBlueTeam ? 'blue' : 'red';
  }

  getFilteredChampions(): Champion[] {
    let champions = this.selectedRole === 'all' ?
      this.champions :
      (this.championsByRole[this.selectedRole] || []);

    // Filter out banned champions
    const bannedChampions = this.getBannedChampions();
    champions = champions.filter((champ: Champion) =>
      !bannedChampions.some(banned => banned.id === champ.id)
    );

    // Filter out picked champions (for pick phase)
    if (this.session && this.session.phase === 'picks') {
      const pickedChampions = this.getTeamPicks('blue').concat(this.getTeamPicks('red'));
      champions = champions.filter((champ: Champion) =>
        !pickedChampions.some(picked => picked.id === champ.id)
      );
    }

    // Apply search filter
    if (this.searchFilter.trim()) {
      champions = champions.filter((champ: Champion) =>
        champ.name.toLowerCase().includes(this.searchFilter.toLowerCase())
      );
    }

    return champions;
  }

  selectRole(role: string) {
    this.selectedRole = role;
    this.selectedChampion = null; // Clear selection when changing role
  }

  selectChampion(champion: Champion) {
    if (!this.isMyTurn) return;

    this.selectedChampion = champion;
  } confirmSelection() {
    if (!this.selectedChampion || !this.session) return;

    // Verificar se o campeão selecionado não está banido
    const bannedChampions = this.getBannedChampions();
    if (bannedChampions.some(ban => ban.id === this.selectedChampion!.id)) {
      console.log(`❌ [confirmSelection] Campeão ${this.selectedChampion.name} está banido!`);
      return;
    }

    // Clear bot timer if active
    if (this.botPickTimer) {
      clearTimeout(this.botPickTimer);
      this.botPickTimer = null;
    }

    const currentPhase = this.session.phases[this.session.currentAction];

    // Lock the selection
    currentPhase.champion = this.selectedChampion;
    currentPhase.locked = true;

    // CORREÇÃO: Vincular o pick ao jogador correto
    if (!currentPhase.playerId || !currentPhase.playerName) {
      // Se não temos dados do jogador, usar o jogador atual
      if (this.currentPlayer && !this.isBot(this.currentPlayer)) {
        currentPhase.playerId = this.currentPlayer.id?.toString();
        currentPhase.playerName = this.currentPlayer.summonerName || this.currentPlayer.name;
        console.log(`✅ ${currentPhase.action} confirmado por ${this.currentPlayer.summonerName || this.currentPlayer.name}: ${this.selectedChampion.name}`);
        console.log(`🔍 [confirmSelection] Dados do jogador:`, {
          playerId: currentPhase.playerId,
          playerName: currentPhase.playerName,
          currentPlayerId: this.currentPlayer.id,
          currentPlayerName: this.currentPlayer.summonerName,
          isBot: this.isBot(this.currentPlayer),
          lane: this.currentPlayer.assignedLane || this.currentPlayer.primaryLane
        });
      } else {
        // Se o jogador atual é um bot ou não temos dados, usar o jogador da fase atual
        const currentPlayer = this.getCurrentPlayer();
        if (currentPlayer) {
          currentPhase.playerId = currentPlayer.id?.toString();
          currentPhase.playerName = currentPlayer.summonerName || currentPlayer.name;
          console.log(`✅ ${currentPhase.action} confirmado por ${currentPlayer.summonerName || currentPlayer.name}: ${this.selectedChampion.name} (Bot: ${this.isBot(currentPlayer)})`);
          console.log(`🔍 [confirmSelection] Dados do bot:`, {
            playerId: currentPhase.playerId,
            playerName: currentPhase.playerName,
            isBot: this.isBot(currentPlayer),
            lane: currentPlayer.assignedLane || currentPlayer.primaryLane
          });
        } else {
          console.log(`❌ [confirmSelection] Jogador não encontrado`);
          console.log(`✅ ${currentPhase.action} confirmado: ${this.selectedChampion.name} (jogador não identificado)`);
        }
      }
    } else {
      // Já temos dados do jogador (caso de bot que já foi vinculado)
      console.log(`✅ ${currentPhase.action} confirmado por ${currentPhase.playerName}: ${this.selectedChampion.name}`);
    }

    // Vincular o pick à lane do jogador se for um pick
    if (currentPhase.action === 'pick' && currentPhase.playerId) {
      const teamPlayers = currentPhase.team === 'blue' ? this.session.blueTeam : this.session.redTeam;
      const player = teamPlayers.find(p =>
        p.id?.toString() === currentPhase.playerId ||
        p.summonerName === currentPhase.playerName ||
        p.name === currentPhase.playerName
      );

      if (player) {
        const playerLane = player.assignedLane || player.primaryLane || 'fill';
        console.log(`🔗 [confirmSelection] Pick ${this.selectedChampion.name} vinculado ao jogador ${currentPhase.playerName} na lane ${playerLane}`);
      }
    }

    // Move to next action
    this.session.currentAction++;
    this.selectedChampion = null;
    this.session.extendedTime = 0; // Reset extended time

    // Reset timer for next player
    this.timeRemaining = 30;

    // Reset modo de edição se estava editando
    if (this.isEditingMode) {
      this.isEditingMode = false;
      this.editingPlayerId = null;
      console.log('✏️ [Edição] Modo de edição finalizado');
    }

    // OTIMIZAÇÃO: Invalidar cache após modificação
    this.invalidateCache();

    this.updateCurrentTurn();
  }
  // Sistema de timer automático
  startTimer() {
    console.log('⏰ startTimer chamado');

    if (this.timer) {
      clearInterval(this.timer);
    }

    this.timer = setInterval(() => {
      this.timeRemaining--;
      console.log('⏰ Timer tick:', this.timeRemaining);

      if (this.timeRemaining <= 0) {
        this.handleTimeOut();
      }
    }, 1000);

    console.log('✅ Timer iniciado, tempo inicial:', this.timeRemaining);
  }

  handleTimeOut() {
    if (!this.session) return;

    const currentPhase = this.session.phases[this.session.currentAction];
    if (!currentPhase || currentPhase.locked) return;

    // Auto-select random champion if time runs out
    const availableChamps = this.getFilteredChampions();
    if (availableChamps.length > 0) {
      this.selectedChampion = availableChamps[0]; // Pick first available
      this.confirmSelection();
    }
  }

  completePickBan() {
    if (!this.session) return;

    // Se não está na confirmação final, mostrar diálogo de confirmação
    if (!this.showFinalConfirmation) {
      this.showFinalConfirmationDialog();
      return;
    }

    // Se já está na confirmação final, completar normalmente
    this.session.phase = 'completed';

    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }

    // CORREÇÃO: Incluir informações dos jogadores que escolheram cada campeão
    const result = {
      sessionId: this.session.id,
      bans: this.session.phases.filter(p => p.action === 'ban' && p.champion),
      picks: this.session.phases.filter(p => p.action === 'pick' && p.champion).map(p => ({
        ...p,
        playerId: p.playerId,
        playerName: p.playerName,
        champion: p.champion
      })),
      blueTeamPicks: this.session.phases.filter(p => p.action === 'pick' && p.team === 'blue' && p.champion).map(p => ({
        ...p,
        playerId: p.playerId,
        playerName: p.playerName,
        champion: p.champion
      })),
      redTeamPicks: this.session.phases.filter(p => p.action === 'pick' && p.team === 'red' && p.champion).map(p => ({
        ...p,
        playerId: p.playerId,
        playerName: p.playerName,
        champion: p.champion
      }))
    };

    console.log('🎯 [completePickBan] Resultado com informações dos jogadores:', result);

    this.onPickBanComplete.emit(result);
  }

  cancelPickBan() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }

    this.onPickBanCancel.emit();
  }

  // UI Helper methods
  getCurrentPhaseText(): string {
    if (!this.session) return '';

    const phase = this.session.phases[this.session.currentAction];
    if (!phase) return 'Seleção Completa';

    const action = phase.action === 'ban' ? 'Banir' : 'Escolher';
    const team = phase.team === 'blue' ? 'Time Azul' : 'Time Vermelho';

    return `${team} - ${action} Campeão`;
  }

  getPhaseProgress(): number {
    if (!this.session) return 0;
    return (this.session.currentAction / this.session.phases.length) * 100;
  }

  /**
   * Invalida o cache quando há mudanças
   */
  private invalidateCache(): void {
    this._cachedSortedBlueTeam = null;
    this._cachedSortedRedTeam = null;
    this._cachedBannedChampions = null;
    this._cachedBlueTeamPicks = null;
    this._cachedRedTeamPicks = null;
    this._cachedModalFilteredChampions = null;
    this._lastCacheUpdate = Date.now();
  }

  /**
   * Verifica se o cache ainda é válido
   */
  private isCacheValid(): boolean {
    return (Date.now() - this._lastCacheUpdate) < this.CACHE_DURATION;
  }

  /**
   * Obtém campeões banidos com cache
   */
  getBannedChampions(): Champion[] {
    if (!this.session) return [];

    return this.session.phases
      .filter(p => p.action === 'ban' && p.champion)
      .map(p => p.champion!);
  }

  /**
   * Obtém picks do time azul com cache
   */
  getTeamPicks(team: 'blue' | 'red'): Champion[] {
    if (team === 'blue') {
      if (this._cachedBlueTeamPicks && this.isCacheValid()) {
        return this._cachedBlueTeamPicks;
      }
    } else {
      if (this._cachedRedTeamPicks && this.isCacheValid()) {
        return this._cachedRedTeamPicks;
      }
    }

    if (!this.session) {
      const emptyResult: Champion[] = [];
      if (team === 'blue') this._cachedBlueTeamPicks = emptyResult;
      else this._cachedRedTeamPicks = emptyResult;
      return emptyResult;
    }

    // Obter jogadores ordenados por lane
    const sortedPlayers = this.getSortedTeamByLane(team);

    // Obter todos os picks do time
    const teamPicks = this.session.phases
      .filter(p => p.action === 'pick' && p.team === team && p.champion);

    // Mapear picks às posições corretas dos jogadores (por lane)
    const picksByLane: (Champion | null)[] = new Array(5).fill(null);

    sortedPlayers.forEach((player, laneIndex) => {
      // Encontrar o pick deste jogador
      const playerPick = teamPicks.find(p => {
        const matchById = p.playerId && p.playerId.toString() === player.id?.toString();
        const matchByName = p.playerName && p.playerName === (player.summonerName || player.name);
        const matchByGameName = p.playerName && (player.summonerName || player.name) &&
          p.playerName.startsWith((player.summonerName || player.name) + '#');

        return matchById || matchByName || matchByGameName;
      });

      if (playerPick && playerPick.champion) {
        picksByLane[laneIndex] = playerPick.champion;
      }
    });

    // Retornar apenas os picks que existem (remover null)
    const result = picksByLane.filter(pick => pick !== null) as Champion[];

    if (team === 'blue') this._cachedBlueTeamPicks = result;
    else this._cachedRedTeamPicks = result;

    return result;
  }

  /**
   * Obtém time ordenado por lane com cache
   */
  getSortedTeamByLane(team: 'blue' | 'red'): any[] {
    if (team === 'blue') {
      if (this._cachedSortedBlueTeam && this.isCacheValid()) {
        return this._cachedSortedBlueTeam;
      }
    } else {
      if (this._cachedSortedRedTeam && this.isCacheValid()) {
        return this._cachedSortedRedTeam;
      }
    }

    if (!this.session) {
      const emptyResult: any[] = [];
      if (team === 'blue') this._cachedSortedBlueTeam = emptyResult;
      else this._cachedSortedRedTeam = emptyResult;
      return emptyResult;
    }

    const teamPlayers = team === 'blue' ? this.session.blueTeam : this.session.redTeam;
    const laneOrder = ['top', 'jungle', 'mid', 'bot', 'support'];

    // Garantir que temos exatamente 5 jogadores
    if (teamPlayers.length !== 5) {
      console.warn(`⚠️ [getSortedTeamByLane] Time ${team} não tem exatamente 5 jogadores: ${teamPlayers.length}`);

      // Se temos menos de 5 jogadores, criar jogadores placeholder
      const paddedPlayers = [...teamPlayers];
      while (paddedPlayers.length < 5) {
        const placeholderIndex = paddedPlayers.length;
        const placeholderLane = laneOrder[placeholderIndex] || 'fill';
        paddedPlayers.push({
          id: `placeholder_${team}_${placeholderIndex}`,
          summonerName: `Bot ${placeholderIndex + 1}`,
          name: `Bot ${placeholderIndex + 1}`,
          assignedLane: placeholderLane,
          primaryLane: placeholderLane,
          isBot: true
        });
      }

      // Se temos mais de 5 jogadores, truncar para 5
      if (paddedPlayers.length > 5) {
        paddedPlayers.splice(5);
      }

      console.log(`✅ [getSortedTeamByLane] Time ${team} normalizado para 5 jogadores`);
      const result = this.sortPlayersByLane(paddedPlayers);
      if (team === 'blue') this._cachedSortedBlueTeam = result;
      else this._cachedSortedRedTeam = result;
      return result;
    }

    const result = this.sortPlayersByLane(teamPlayers);
    if (team === 'blue') this._cachedSortedBlueTeam = result;
    else this._cachedSortedRedTeam = result;
    return result;
  }

  /**
   * Método auxiliar para ordenar jogadores por lane
   */
  private sortPlayersByLane(players: any[]): any[] {
    const laneOrder = ['top', 'jungle', 'mid', 'bot', 'support'];

    // Primeiro, ordenar jogadores por lane
    const sortedPlayers = [...players].sort((a, b) => {
      const laneA = (a.assignedLane || a.primaryLane || 'fill').toLowerCase();
      const laneB = (b.assignedLane || b.primaryLane || 'fill').toLowerCase();

      const indexA = laneOrder.indexOf(laneA);
      const indexB = laneOrder.indexOf(laneB);

      // Se ambos têm lane válida, ordenar pela ordem definida
      if (indexA !== -1 && indexB !== -1) {
        return indexA - indexB;
      }

      // Se apenas um tem lane válida, priorizar o que tem
      if (indexA !== -1) return -1;
      if (indexB !== -1) return 1;

      // Se nenhum tem lane válida, manter ordem original
      return 0;
    });

    // Garantir que temos exatamente 5 jogadores na ordem correta
    const finalPlayers = [];
    for (let i = 0; i < 5; i++) {
      if (i < sortedPlayers.length) {
        // Atribuir lane específica se não tiver
        const player = { ...sortedPlayers[i] };
        if (!player.assignedLane && !player.primaryLane) {
          player.assignedLane = laneOrder[i];
          player.primaryLane = laneOrder[i];
        }
        finalPlayers.push(player);
      } else {
        // Criar jogador placeholder para esta posição
        finalPlayers.push({
          id: `placeholder_${i}`,
          summonerName: `Bot ${i + 1}`,
          name: `Bot ${i + 1}`,
          assignedLane: laneOrder[i],
          primaryLane: laneOrder[i],
          isBot: true
        });
      }
    }

    // Agora vincular os picks às lanes corretas
    const teamPicks = this.session!.phases.filter(p => p.action === 'pick' && p.champion);

    console.log(`🔍 [sortPlayersByLane] Jogadores ordenados:`, finalPlayers.map((p, index) => ({
      index,
      name: p.summonerName,
      lane: p.assignedLane || p.primaryLane,
      isBot: this.isBot(p)
    })));

    return finalPlayers;
  }

  /**
   * Obtém a lane atribuída a um jogador específico (para uso direto com objeto player)
   */
  getPlayerLaneDisplayForPlayer(player: any): string {
    if (!player) return '';

    const assignedLane = player.assignedLane || player.primaryLane || 'fill';
    const isAutofill = player.isAutofill || false;

    const laneName = this.getLaneDisplayName(assignedLane.toUpperCase());
    const laneIcon = this.getLaneIcon(assignedLane);

    if (isAutofill) {
      return `${laneIcon} ${laneName} (Auto)`;
    }
    return `${laneIcon} ${laneName}`;
  }

  /**
   * Confirma o pick de um bot
   */
  confirmBotPick(playerId: string, phaseIndex: number): void {
    if (!this.session) return;

    console.log(`🤖 [Bot] Confirmando pick do bot ${playerId} na fase ${phaseIndex}`);

    // Encontrar a fase do bot
    let targetPhaseIndex = phaseIndex;
    if (phaseIndex === undefined || phaseIndex === null) {
      const teamPicks = this.session.phases.filter(p => p.action === 'pick' && p.champion);
      console.log(`🔍 [Bot] Procurando pick do bot ${playerId} em ${teamPicks.length} picks`);

      const botPick = teamPicks.find(p => {
        const matchById = p.playerId && p.playerId.toString() === playerId.toString();
        const matchByName = p.playerName && p.playerName === playerId;
        const matchByGameName = p.playerName && playerId && p.playerName.startsWith(playerId + '#');

        console.log(`🔍 [Bot] Verificando pick:`, {
          pickPlayerId: p.playerId,
          pickPlayerName: p.playerName,
          targetPlayerId: playerId,
          matchById,
          matchByName,
          matchByGameName
        });

        return matchById || matchByName || matchByGameName;
      });

      if (botPick) {
        targetPhaseIndex = this.session.phases.indexOf(botPick);
        console.log(`✅ [Bot] Fase encontrada: ${targetPhaseIndex}`);
      } else {
        console.log(`❌ [Bot] Fase não encontrada para bot ${playerId}`);
      }
    }

    // Marcar a fase como confirmada
    if (targetPhaseIndex !== undefined && targetPhaseIndex >= 0 && targetPhaseIndex < this.session.phases.length) {
      this.session.phases[targetPhaseIndex].locked = true;
      console.log(`🤖 [Bot] Pick confirmado na fase ${targetPhaseIndex}`);
    } else {
      console.log(`❌ [Bot] Fase inválida: ${targetPhaseIndex}`);
    }

    // Voltar para a confirmação final
    this.showFinalConfirmationDialog();
  }

  /**
   * Seleciona um campeão no modal
   */
  selectChampionInModal(champion: Champion): void {
    // Não permitir seleção de campeões banidos
    if (this.isChampionBanned(champion)) {
      console.log(`❌ [selectChampionInModal] Campeão ${champion.name} está banido e não pode ser selecionado`);
      return;
    }

    this.modalSelectedChampion = champion;
    this.isConfirming = true;
    console.log(`✅ [selectChampionInModal] Campeão selecionado: ${champion.name}`);
  }

  /**
   * Seleciona uma role no modal
   */
  selectRoleInModal(role: string): void {
    this.modalSelectedRole = role;
  }

  /**
   * Verifica se um jogador é o jogador atual logado
   */
  isCurrentPlayer(player: any): boolean {
    if (!this.currentPlayer || !player) return false;

    // Se o jogador atual é um bot, não deve ser identificado como jogador logado
    if (this.isBot(this.currentPlayer)) {
      return false;
    }

    // Se o jogador sendo verificado é um bot, não deve ser identificado como jogador logado
    if (this.isBot(player)) {
      return false;
    }

    return this.comparePlayers(this.currentPlayer, player);
  }

  /**
   * Obtém os bans de um time específico
   */
  getTeamBans(team: 'blue' | 'red'): Champion[] {
    if (!this.session) return [];

    return this.session.phases
      .filter(p => p.action === 'ban' && p.team === team && p.champion)
      .map(p => p.champion!)
      .slice(0, 5); // Máximo 5 bans por time
  }

  /**
   * Verifica se o jogador atual fez um pick específico
   */
  isCurrentPlayerForPick(team: 'blue' | 'red', pickIndex: number): boolean {
    if (!this.session || !this.currentPlayer) return false;

    // Se o jogador atual é um bot, não deve ser identificado como jogador logado
    if (this.isBot(this.currentPlayer)) {
      console.log(`🔍 [isCurrentPlayerForPick] Jogador atual é bot, não deve ser identificado como jogador logado`);
      return false;
    }

    const teamPicks = this.session.phases.filter(p => p.action === 'pick' && p.team === team && p.champion);
    const pick = teamPicks[pickIndex];

    if (!pick) return false;

    // Usar a lógica de comparação melhorada
    const isMatch = this.comparePlayerWithId(this.currentPlayer, pick.playerId || pick.playerName || '');

    console.log(`🔍 [isCurrentPlayerForPick] Verificando pick ${pickIndex} do time ${team}:`, {
      pickPlayerId: pick.playerId,
      pickPlayerName: pick.playerName,
      currentPlayerId: this.currentPlayer.id,
      currentPlayerName: this.currentPlayer.summonerName,
      isMatch
    });

    return isMatch;
  }

  /**
   * Verifica se um campeão está banido
   */
  isChampionBanned(champion: Champion): boolean {
    if (!this.session) return false;
    const bannedChampions = this.getBannedChampions();
    return bannedChampions.some(ban => ban.id === champion.id);
  }

  /**
 * Verifica se um campeão já foi escolhido (picked)
 */
  isChampionPicked(champion: Champion): boolean {
    if (!this.session || this.session.phase !== 'picks') return false;
    const pickedChampions = this.getTeamPicks('blue').concat(this.getTeamPicks('red'));
    return pickedChampions.some(pick => pick.id === champion.id);
  }

  /**
   * Verifica se o jogador atual está no modal
   */
  isCurrentPlayerForModal(): boolean {
    if (!this.currentPlayer || !this.session) return false;

    // Se está em modo de edição, verificar se o jogador atual é quem está editando
    if (this.isEditingMode && this.editingPlayerId) {
      const isEditingPlayer = this.comparePlayerWithId(this.currentPlayer, this.editingPlayerId);
      console.log(`🔍 [isCurrentPlayerForModal] Modo edição - É o jogador que está editando: ${isEditingPlayer}`);
      return isEditingPlayer;
    }

    // Se não está em modo de edição, verificar se é o jogador da fase atual
    const currentPhase = this.session.phases[this.session.currentAction];
    if (!currentPhase) return false;

    const teamPlayers = currentPhase.team === 'blue' ? this.session.blueTeam : this.session.redTeam;
    const playerIndex = this.getPlayerIndexForPick(currentPhase.team, Math.floor(this.session.currentAction / 2));
    const expectedPlayer = teamPlayers[playerIndex];

    if (!expectedPlayer) return false;

    // Se o jogador esperado é um bot, não deve ser identificado como jogador logado
    if (this.isBot(expectedPlayer)) {
      console.log(`🔍 [isCurrentPlayerForModal] Jogador esperado é bot, não deve ser identificado como jogador logado`);
      return false;
    }

    const result = this.comparePlayers(this.currentPlayer, expectedPlayer);
    console.log(`🔍 [isCurrentPlayerForModal] Resultado: ${result}`);
    return result;
  }

  /**
   * Verifica se o jogador atual é um bot
   */
  isCurrentPlayerBot(): boolean {
    if (!this.currentPlayer) return false;

    // Verificar se o nome do jogador contém indicadores de bot
    const playerName = this.currentPlayer.summonerName || this.currentPlayer.name || '';
    return playerName.toLowerCase().includes('bot') ||
      playerName.toLowerCase().includes('ai') ||
      playerName.toLowerCase().includes('computer');
  }

  /**
   * Método de debug para mostrar todos os dados dos jogadores e suas ações
   */
  debugPlayerData(): void {
    if (!this.session) {
      console.log('❌ [Debug] Sessão não disponível');
      return;
    }

    console.log('🔍 [Debug] === DADOS COMPLETOS DOS JOGADORES ===');
    console.log('🔍 [Debug] Current Action:', this.session.currentAction);
    console.log('🔍 [Debug] Current Player (logged in):', {
      id: this.currentPlayer?.id,
      idType: typeof this.currentPlayer?.id,
      name: this.currentPlayer?.summonerName || this.currentPlayer?.name,
      isBot: this.isBot(this.currentPlayer)
    });

    console.log('🔍 [Debug] === BLUE TEAM ===');
    this.session.blueTeam.forEach((player, index) => {
      console.log(`🔍 [Debug] Blue ${index}:`, {
        id: player.id,
        idType: typeof player.id,
        name: player.summonerName || player.name,
        lane: player.assignedLane || player.primaryLane,
        isBot: this.isBot(player),
        isCurrentPlayer: this.comparePlayers(this.currentPlayer, player)
      });
    });

    console.log('🔍 [Debug] === RED TEAM ===');
    this.session.redTeam.forEach((player, index) => {
      console.log(`🔍 [Debug] Red ${index}:`, {
        id: player.id,
        idType: typeof player.id,
        name: player.summonerName || player.name,
        lane: player.assignedLane || player.primaryLane,
        isBot: this.isBot(player),
        isCurrentPlayer: this.comparePlayers(this.currentPlayer, player)
      });
    });

    console.log('🔍 [Debug] === PHASES ===');
    this.session.phases.forEach((phase, index) => {
      console.log(`🔍 [Debug] Phase ${index}:`, {
        action: phase.action,
        team: phase.team,
        champion: phase.champion?.name,
        playerId: phase.playerId,
        playerName: phase.playerName,
        locked: phase.locked,
        isCurrentAction: index === this.session?.currentAction
      });
    });

    console.log('🔍 [Debug] === BLUE TEAM PICKS ===');
    const bluePicks = this.mapPicksWithPlayers('blue');
    bluePicks.forEach((pick, index) => {
      console.log(`🔍 [Debug] Blue Pick ${index}:`, {
        champion: pick?.champion?.name,
        playerId: pick?.playerId,
        playerName: pick?.playerName,
        player: pick?.player ? {
          id: pick.player?.id,
          name: pick.player?.summonerName || pick.player?.name,
          isBot: pick.player ? this.isBot(pick.player) : false
        } : null
      });
    });

    console.log('🔍 [Debug] === RED TEAM PICKS ===');
    const redPicks = this.mapPicksWithPlayers('red');
    redPicks.forEach((pick, index) => {
      console.log(`🔍 [Debug] Red Pick ${index}:`, {
        champion: pick?.champion?.name,
        playerId: pick?.playerId,
        playerName: pick?.playerName,
        player: pick?.player ? {
          id: pick.player?.id,
          name: pick.player?.summonerName || pick.player?.name,
          isBot: pick.player ? this.isBot(pick.player) : false
        } : null
      });
    });

    console.log('🔍 [Debug] === EDITING MODE ===');
    console.log('🔍 [Debug] Is Editing Mode:', this.isEditingMode);
    console.log('🔍 [Debug] Editing Player ID:', this.editingPlayerId);
    console.log('🔍 [Debug] Is My Turn:', this.isMyTurn);

    // Adicionar validação de uso dos jogadores
    this.validatePlayerUsage();

    console.log('🔍 [Debug] === END DEBUG ===');
  }

  /**
   * Gera um array com os índices dos slots vazios de bans
   */
  getEmptyBanSlots(banCount: number): number[] {
    const maxBans = 5;
    const emptySlots = maxBans - banCount;
    return Array.from({ length: Math.max(0, emptySlots) }, (_, i) => i);
  }

  /**
   * Verifica se o jogador logado está no time e retorna sua posição
   */
  getLoggedPlayerPosition(): { team: 'blue' | 'red', index: number } | null {
    if (!this.currentPlayer || !this.session) return null;

    // Verificar no time azul
    const blueIndex = this.session.blueTeam.findIndex(p => this.comparePlayers(this.currentPlayer, p));
    if (blueIndex !== -1) {
      return { team: 'blue', index: blueIndex };
    }

    // Verificar no time vermelho
    const redIndex = this.session.redTeam.findIndex(p => this.comparePlayers(this.currentPlayer, p));
    if (redIndex !== -1) {
      return { team: 'red', index: redIndex };
    }

    return null;
  }

  /**
   * Obtém o pick de um jogador específico
   */
  getPlayerPick(team: 'blue' | 'red', player: any): Champion | null {
    if (!this.session || !player) return null;

    // Obter todos os picks do time
    const teamPicks = this.session.phases
      .filter(p => p.action === 'pick' && p.team === team && p.champion);

    // Encontrar o pick deste jogador
    const playerPick = teamPicks.find(p => {
      const matchById = p.playerId && p.playerId.toString() === player.id?.toString();
      const matchByName = p.playerName && p.playerName === (player.summonerName || player.name);
      const matchByGameName = p.playerName && (player.summonerName || player.name) &&
        p.playerName.startsWith((player.summonerName || player.name) + '#');

      return matchById || matchByName || matchByGameName;
    });

    return playerPick?.champion || null;
  }

  /**
   * Valida se todos os 5 jogadores estão sendo utilizados corretamente
   */
  private validatePlayerUsage(): void {
    if (!this.session) return;

    console.log('🔍 [validatePlayerUsage] === VALIDAÇÃO DE USO DOS JOGADORES ===');

    // Validar times
    (['blue', 'red'] as const).forEach(team => {
      const teamPlayers = team === 'blue' ? this.session!.blueTeam : this.session!.redTeam;
      const sortedPlayers = this.getSortedTeamByLane(team);

      console.log(`🔍 [validatePlayerUsage] Time ${team}:`);
      console.log(`  - Jogadores originais: ${teamPlayers.length}`);
      console.log(`  - Jogadores ordenados: ${sortedPlayers.length}`);

      sortedPlayers.forEach((player, index) => {
        const lane = player.assignedLane || player.primaryLane || 'fill';
        console.log(`  - Posição ${index} (${lane}): ${player.summonerName || player.name} (Bot: ${this.isBot(player)})`);
      });
    });

    // Validar fases
    console.log('🔍 [validatePlayerUsage] Fases:');
    this.session.phases.forEach((phase, index) => {
      if (index < this.session!.currentAction) {
        const player = this.getCurrentPlayerForPhase(index);
        console.log(`  - Fase ${index}: ${phase.team} ${phase.action} - ${player?.summonerName || player?.name || 'N/A'} (${player?.assignedLane || player?.primaryLane || 'N/A'})`);
      }
    });

    console.log('🔍 [validatePlayerUsage] === FIM DA VALIDAÇÃO ===');
  }

  /**
   * Obtém o jogador para uma fase específica (para validação)
   */
  private getCurrentPlayerForPhase(phaseIndex: number): any {
    if (!this.session || phaseIndex >= this.session.phases.length) return null;

    const phase = this.session.phases[phaseIndex];
    const teamPlayers = phase.team === 'blue' ? this.session.blueTeam : this.session.redTeam;
    const sortedPlayers = this.getSortedTeamByLane(phase.team);

    // Usar a mesma lógica do getCurrentPlayer mas para uma fase específica
    let playerIndex = 0;

    if (phaseIndex < 6) {
      // Primeira fase de bans
      const teamBanIndex = phaseIndex % 2 === 0 ? phaseIndex / 2 : (phaseIndex - 1) / 2;
      playerIndex = teamBanIndex % 5;
    } else if (phaseIndex >= 6 && phaseIndex < 11) {
      // Primeira fase de picks
      if (phase.team === 'blue') {
        if (phaseIndex === 6) playerIndex = 0;
        else if (phaseIndex === 9) playerIndex = 1;
        else if (phaseIndex === 10) playerIndex = 2;
      } else {
        if (phaseIndex === 7) playerIndex = 0;
        else if (phaseIndex === 8) playerIndex = 1;
      }
    } else if (phaseIndex >= 11 && phaseIndex < 15) {
      // Segunda fase de bans
      if (phase.team === 'blue') {
        if (phaseIndex === 12) playerIndex = 3;
        else if (phaseIndex === 14) playerIndex = 4;
      } else {
        if (phaseIndex === 11) playerIndex = 2;
        else if (phaseIndex === 13) playerIndex = 3;
      }
    } else {
      // Segunda fase de picks
      if (phase.team === 'blue') {
        if (phaseIndex === 16) playerIndex = 3;
        else if (phaseIndex === 18) playerIndex = 4;
      } else {
        if (phaseIndex === 15) playerIndex = 2;
        else if (phaseIndex === 17) playerIndex = 3;
        else if (phaseIndex === 19) playerIndex = 4;
      }
    }

    return sortedPlayers[playerIndex] || null;
  }

  /**
   * Inicia edição de um pick específico
   */
  startEditingPick(playerId: string, phaseIndex: number): void {
    console.log(`🎯 [Edição] Iniciando edição - PlayerID: ${playerId}, PhaseIndex: ${phaseIndex}`);
    console.log(`🔍 [Edição] Current Player:`, this.currentPlayer);

    if (!this.session) {
      console.log(`❌ [Edição] Sessão não disponível`);
      return;
    }

    // CORREÇÃO: Definir o editingPlayerId ANTES de verificar se pode editar
    this.editingPlayerId = playerId;
    this.isEditingMode = true;

    console.log(`✅ [Edição] Modo de edição ativado - EditingPlayerId: ${this.editingPlayerId}`);

    // Verificar se o jogador atual pode editar este pick
    if (!this.canCurrentPlayerEdit()) {
      console.log(`❌ [Edição] Jogador atual não pode editar este pick`);
      // Resetar modo de edição se não pode editar
      this.isEditingMode = false;
      this.editingPlayerId = null;
      return;
    }

    // Encontrar a fase correta para edição
    let targetPhaseIndex = phaseIndex;
    if (phaseIndex === undefined || phaseIndex === null) {
      // Se não temos o phaseIndex, encontrar a fase do pick atual
      const teamPicks = this.session.phases.filter(p => p.action === 'pick' && p.champion);

      const playerPick = teamPicks.find(p => {
        const matchById = p.playerId && p.playerId.toString() === playerId.toString();
        const matchByName = p.playerName && p.playerName === playerId;
        const matchByGameName = p.playerName && playerId && p.playerName.startsWith(playerId + '#');
        const matchByPlayerIdName = p.playerId && playerId && p.playerId.toString().includes(playerId);

        return matchById || matchByName || matchByGameName || matchByPlayerIdName;
      });

      if (playerPick) {
        targetPhaseIndex = this.session.phases.indexOf(playerPick);
        console.log(`🔍 [Edição] Fase encontrada para edição: ${targetPhaseIndex}`);
      }
    }

    // Voltar para a fase específica
    if (targetPhaseIndex !== undefined && targetPhaseIndex >= 0 && targetPhaseIndex < this.session.phases.length) {
      this.session.currentAction = targetPhaseIndex;
      console.log(`🔍 [Edição] Voltando para fase: ${targetPhaseIndex}`);
    } else {
      // Fallback: voltar para a última ação
      if (this.session.currentAction > 0) {
        this.session.currentAction--;
      }
      console.log(`🔍 [Edição] Usando fallback - fase atual: ${this.session.currentAction}`);
    }

    // Resetar o timer
    this.timeRemaining = 30;

    // Fechar confirmação final
    this.showFinalConfirmation = false;
    this.finalConfirmationData = null;

    // Atualizar turno
    this.updateCurrentTurn();

    // ABRIR MODAL DIRETAMENTE PARA EDIÇÃO
    console.log('🎯 [Edição] Abrindo modal para edição');
    setTimeout(() => {
      this.openChampionModal();
    }, 100); // Pequeno delay para garantir que o estado foi atualizado
  }

  /**
   * Retorna campeões filtrados para o modal
   */
  getModalFilteredChampions(): Champion[] {
    if (!this.session) return [];

    // Obter campeões banidos
    const bannedChampions = this.getBannedChampions();
    const bannedIds = bannedChampions.map(ban => ban.id);

    let availableChampions = this.champions.filter(champion =>
      !bannedIds.includes(champion.id)
    );

    // CORREÇÃO: Sempre filtrar campeões já escolhidos (picked), independente da fase
    const pickedChampions = this.getTeamPicks('blue').concat(this.getTeamPicks('red'));
    const pickedIds = pickedChampions.map(pick => pick.id);
    availableChampions = availableChampions.filter(champion =>
      !pickedIds.includes(champion.id)
    );

    // Aplicar filtro de role
    if (this.modalSelectedRole && this.modalSelectedRole !== 'all') {
      availableChampions = availableChampions.filter(champion =>
        this.championsByRole[this.modalSelectedRole]?.some((roleChamp: Champion) => roleChamp.id === champion.id)
      );
    }

    // Aplicar filtro de busca
    if (this.modalSearchFilter.trim()) {
      const searchTerm = this.modalSearchFilter.toLowerCase().trim();
      availableChampions = availableChampions.filter(champion =>
        champion.name.toLowerCase().includes(searchTerm)
      );
    }

    return availableChampions;
  }

  /**
   * Obtém o nome do jogador atual
   */
  getCurrentPlayerName(): string {
    if (!this.session) return 'Desconhecido';

    const currentPlayer = this.getCurrentPlayer();
    if (!currentPlayer) return 'Desconhecido';

    const playerName = currentPlayer.summonerName || currentPlayer.name || 'Jogador';
    console.log(`🔍 [getCurrentPlayerName] Nome do jogador atual: ${playerName} (ID: ${currentPlayer.id}, IsBot: ${this.isBot(currentPlayer)})`);

    return playerName;
  }

  /**
   * Abre o modal de seleção de campeões
   */
  openChampionModal(): void {
    console.log(`🎯 [Modal] Abrindo modal de seleção`);
    console.log(`🔍 [Modal] Modo edição: ${this.isEditingMode}, editingPlayerId: ${this.editingPlayerId}`);

    this.showChampionModal = true;
    this.modalSearchFilter = '';
    this.modalSelectedRole = 'all';
    this.modalSelectedChampion = null;
    this.isConfirming = false;

    // Se está em modo de edição, definir o jogador correto
    if (this.isEditingMode && this.editingPlayerId) {
      console.log(`🎯 [Modal] Modal aberto em modo de edição para jogador: ${this.editingPlayerId}`);
    } else {
      console.log(`🎯 [Modal] Modal aberto em modo normal`);
    }

    // Iniciar timer do modal
  this.startModalTimer();

    // Focus no campo de busca após um pequeno delay
    setTimeout(() => {
      const searchInput = document.getElementById('modal-champion-search') as HTMLInputElement;
      if (searchInput) {
        searchInput.focus();
      }
    }, 100);
  }

  /**
   * Mostra a confirmação final antes de completar o draft
   */
  showFinalConfirmationDialog(): void {
    if (!this.session) return;

    // Mapear picks com jogadores corretamente
    const blueTeamPicksWithPlayers = this.mapPicksWithPlayers('blue');
    const redTeamPicksWithPlayers = this.mapPicksWithPlayers('red');

    // Organizar times por lane fixa
    const blueTeamByLane = this.organizeTeamByLanes(this.session.blueTeam, blueTeamPicksWithPlayers);
    const redTeamByLane = this.organizeTeamByLanes(this.session.redTeam, redTeamPicksWithPlayers);

    // Preparar dados para confirmação
    this.finalConfirmationData = {
      blueTeamPicks: blueTeamPicksWithPlayers,
      redTeamPicks: redTeamPicksWithPlayers,
      blueTeamByLane,
      redTeamByLane,
      bannedChampions: this.getBannedChampions(),
      blueTeamPlayers: this.session.blueTeam,
      redTeamPlayers: this.session.redTeam,
      allPicks: this.session.phases.filter(p => p.action === 'pick' && p.champion)
    };

    this.showFinalConfirmation = true;
  }

  /**
   * Retorna o nome amigável da lane
   */
  getLaneDisplayName(lane: string): string {
    switch (lane) {
      case 'TOP': return 'Topo';
      case 'JUNGLE': return 'Selva';
      case 'MIDDLE': return 'Meio';
      case 'MID': return 'Meio';
      case 'ADC': return 'Atirador';
      case 'BOT': return 'Atirador';
      case 'SUPPORT': return 'Suporte';
      default: return lane;
    }
  }

  /**
   * Obtém o ícone da lane
   */
  private getLaneIcon(lane: string): string {
    const icons: { [key: string]: string } = {
      'top': '🛡️',
      'jungle': '🌲',
      'mid': '⚡',
      'middle': '⚡',
      'bot': '🏹',
      'adc': '🏹',
      'support': '💎',
      'fill': '🎲'
    };
    return icons[lane.toLowerCase()] || '❓';
  }

  /**
   * Calcula o índice do jogador para um pick específico
   */
  private getPlayerIndexForPick(team: 'blue' | 'red', pickIndex: number): number {
    // Lógica baseada na ordem dos picks do LoL
    if (pickIndex === 0) return 0; // Primeiro pick
    if (pickIndex === 1) return 1; // Segundo pick
    if (pickIndex === 2) return 2; // Terceiro pick
    if (pickIndex === 3) return 3; // Quarto pick
    if (pickIndex === 4) return 4; // Quinto pick

    return pickIndex % 5; // Fallback
  }

  /**
   * Verifica se o jogador atual pode editar
   */
  canCurrentPlayerEdit(): boolean {
    if (!this.currentPlayer || !this.editingPlayerId) return false;

    // Se o jogador atual é um bot, não pode editar
    if (this.isBot(this.currentPlayer)) {
      return false;
    }

    // Verificar se o jogador que está editando é o jogador logado
    const canEdit = this.comparePlayerWithId(this.currentPlayer, this.editingPlayerId);
    console.log(`🔍 [canCurrentPlayerEdit] Jogador pode editar: ${canEdit} (${this.currentPlayer.summonerName} -> ${this.editingPlayerId})`);
    return canEdit;
  }

  /**
   * Mapeia picks com jogadores para um time específico
   */
  private mapPicksWithPlayers(team: 'blue' | 'red'): any[] {
    if (!this.session) return [];

    // Obter jogadores ordenados por lane
    const sortedPlayers = this.getSortedTeamByLane(team);
    const teamPicks = this.session.phases.filter(p => p.action === 'pick' && p.team === team && p.champion);

    // Criar array com 5 slots (um para cada jogador por lane)
    const picksWithPlayers = new Array(5).fill(null);

    // Mapear cada jogador ordenado por lane
    sortedPlayers.forEach((player, laneIndex) => {
      // Encontrar o pick deste jogador
      const playerPick = teamPicks.find(p => {
        const matchById = p.playerId && p.playerId.toString() === player.id?.toString();
        const matchByName = p.playerName && p.playerName === (player.summonerName || player.name);
        const matchByGameName = p.playerName && (player.summonerName || player.name) &&
          p.playerName.startsWith((player.summonerName || player.name) + '#');

        return matchById || matchByName || matchByGameName;
      });

      picksWithPlayers[laneIndex] = {
        champion: playerPick?.champion || null,
        playerId: player.id,
        playerName: player.summonerName || player.name,
        phaseIndex: playerPick ? this.session!.phases.indexOf(playerPick) : null,
        player: player
      };
    });

    console.log(`🔍 [mapPicksWithPlayers] ${team} team mapeado:`, picksWithPlayers.map((pick, index) => ({
      laneIndex: index,
      lane: sortedPlayers[index]?.assignedLane || sortedPlayers[index]?.primaryLane,
      playerName: pick?.playerName,
      champion: pick?.champion?.name,
      isBot: pick?.player ? this.isBot(pick.player) : false
    })));

    return picksWithPlayers;
  }

  // Fechar modal
  closeChampionModal(): void {
    this.showChampionModal = false;
  }

  /**
   * Inicia o timer do modal
   */
  startModalTimer(): void {
    if (this.modalTimer) {
      clearInterval(this.modalTimer);
    }

    this.modalTimeRemaining = this.timeRemaining;

    this.modalTimer = setInterval(() => {
      this.modalTimeRemaining--;

      if (this.modalTimeRemaining <= 0) {
        this.handleModalTimeOut();
      }
    }, 1000);
  }

  /**
   * Para o timer do modal
   */
  stopModalTimer(): void {
    if (this.modalTimer) {
      clearInterval(this.modalTimer);
      this.modalTimer = null;
    }
  }

  /**
   * Trata o timeout do modal - seleção automática
   */
  handleModalTimeOut(): void {
    console.log('⏰ Modal timeout - seleção automática');
    this.stopModalTimer();

    // Selecionar campeão aleatório disponível
    const availableChampions = this.getModalFilteredChampions();
    if (availableChampions.length > 0) {
      const randomChampion = availableChampions[Math.floor(Math.random() * availableChampions.length)];
      this.modalSelectedChampion = randomChampion;
      console.log(`⏰ Seleção automática: ${randomChampion.name}`);
      this.confirmModalSelection();
    } else {
      // Se não há campeões disponíveis, fechar modal
      this.closeChampionModal();
    }
  }

  /**
   * Organiza o time por lanes fixas (TOP, JUNGLE, MIDDLE, ADC, SUPPORT)
   */
  private organizeTeamByLanes(teamPlayers: any[], teamPicks: any[]): any[] {
    const laneOrder = ['top', 'jungle', 'mid', 'bot', 'support'];

    // Usar o método getSortedTeamByLane para obter jogadores ordenados
    const team = teamPlayers === this.session!.blueTeam ? 'blue' : 'red';
    const sortedPlayers = this.getSortedTeamByLane(team);

    console.log(`🔍 [organizeTeamByLanes] Jogadores ordenados:`, sortedPlayers.map(p => ({
      name: p.summonerName || p.name,
      lane: p.assignedLane || p.primaryLane,
      isBot: this.isBot(p)
    })));

    // Mapear lane para player ordenado
    const laneMap: { [lane: string]: any } = {};

    // Primeira passada: atribuir jogadores ordenados às lanes
    sortedPlayers.forEach((player, index) => {
      if (index < laneOrder.length) {
        const lane = laneOrder[index];
        laneMap[lane] = { player, pick: null };
      }
    });

    // Segunda passada: mapear picks para lanes (usando método auxiliar)
    teamPicks.forEach(pick => {
      const player = sortedPlayers.find(p => {
        // Usar método auxiliar para comparação
        const matchById = p.id && pick.playerId && p.id.toString() === pick.playerId.toString();
        const matchByName = p.summonerName && pick.playerName && p.summonerName === pick.playerName;
        const matchByGameName = p.summonerName && pick.playerName && p.summonerName.startsWith(pick.playerName + '#');

        console.log(`🔍 [organizeTeamByLanes] Verificando pick:`, {
          playerId: p.id,
          playerName: p.summonerName,
          pickPlayerId: pick.playerId,
          pickPlayerName: pick.playerName,
          matchById,
          matchByName,
          matchByGameName
        });

        return matchById || matchByName || matchByGameName;
      });

      if (player) {
        let lane = (player.assignedLane || player.primaryLane || 'fill').toLowerCase();
        if (!laneOrder.includes(lane)) {
          // fallback: encontrar a lane do jogador na ordem
          const playerIndex = sortedPlayers.indexOf(player);
          lane = laneOrder[playerIndex] || 'top';
        }

        if (laneMap[lane]) {
          laneMap[lane].pick = pick.champion;
          console.log(`✅ [organizeTeamByLanes] Pick ${pick.champion?.name} atribuído ao jogador ${player.summonerName} na lane ${lane}`);
        }
      } else {
        console.log(`❌ [organizeTeamByLanes] Jogador não encontrado para pick:`, pick);
      }
    });

    // Retornar array ordenado por lanes
    return laneOrder.map(lane => ({
      lane: lane.toUpperCase(),
      player: laneMap[lane]?.player || null,
      champion: laneMap[lane]?.pick || null
    }));
  }

  /**
   * Confirma a seleção no modal
   */
  confirmModalSelection(): void {
    if (!this.modalSelectedChampion || !this.session) return;

    // Verificar se o campeão selecionado não está banido
    const bannedChampions = this.getBannedChampions();
    if (bannedChampions.some(ban => ban.id === this.modalSelectedChampion!.id)) {
      console.log(`❌ [confirmModalSelection] Campeão ${this.modalSelectedChampion.name} está banido!`);
      return;
    }

    console.log(`✅ [confirmModalSelection] Confirmando seleção: ${this.modalSelectedChampion.name}`);
    console.log(`🔍 [confirmModalSelection] Modo edição: ${this.isEditingMode}, editingPlayerId: ${this.editingPlayerId}`);

    // Se está em modo de edição, encontrar a fase correta para editar
    if (this.isEditingMode && this.editingPlayerId) {
      console.log(`🔍 [confirmModalSelection] Editando pick existente para: ${this.editingPlayerId}`);

      // Encontrar o jogador correto
      const allPlayers = [...this.session.blueTeam, ...this.session.redTeam];
      const editingPlayer = allPlayers.find(p => this.comparePlayerWithId(p, this.editingPlayerId!));

      if (editingPlayer) {
        // Encontrar a fase que contém o pick deste jogador
        const targetPhase = this.session.phases.find(phase =>
          phase.action === 'pick' &&
          phase.champion &&
          this.comparePlayerWithId(editingPlayer, phase.playerId || phase.playerName || '')
        );

        if (targetPhase) {
          // Atualizar a fase existente
          targetPhase.champion = this.modalSelectedChampion;
          targetPhase.playerId = editingPlayer.id?.toString();
          targetPhase.playerName = editingPlayer.summonerName || editingPlayer.name;

          console.log(`✅ [confirmModalSelection] Pick editado com sucesso:`, {
            player: editingPlayer.summonerName,
            champion: this.modalSelectedChampion.name,
            phaseIndex: this.session.phases.indexOf(targetPhase)
          });
        } else {
          console.log(`❌ [confirmModalSelection] Fase não encontrada para edição`);
        }
      } else {
        console.log(`❌ [confirmModalSelection] Jogador de edição não encontrado: ${this.editingPlayerId}`);
      }

      // Fechar modal e resetar modo de edição
      this.closeChampionModal();
      this.isEditingMode = false;
      this.editingPlayerId = null;
      return; // Não avançar para próxima ação
    }

    // Lógica normal para nova seleção
    const currentPhase = this.session.phases[this.session.currentAction];
    if (!currentPhase) return;

    // Se não está em modo de edição, usar o jogador logado ou o jogador atual da fase
    let targetPlayerId = currentPhase.playerId;
    let targetPlayerName = currentPhase.playerName;

    // Se não temos dados do jogador na fase, usar o jogador logado
    if (!targetPlayerId && !targetPlayerName) {
      const currentPlayer = this.getCurrentPlayer();
      if (currentPlayer) {
        targetPlayerId = currentPlayer.id?.toString();
        targetPlayerName = currentPlayer.summonerName || currentPlayer.name;
        console.log(`✅ [confirmModalSelection] Usando jogador logado: ${targetPlayerName}`);
      }
    }

    // Vincular o pick ao jogador
    currentPhase.champion = this.modalSelectedChampion;
    currentPhase.playerId = targetPlayerId;
    currentPhase.playerName = targetPlayerName;
    currentPhase.locked = true;

    console.log(`✅ [confirmModalSelection] Pick confirmado:`, {
      champion: this.modalSelectedChampion.name,
      playerId: targetPlayerId,
      playerName: targetPlayerName,
      phaseIndex: this.session.currentAction
    });

    // Fechar modal
    this.closeChampionModal();

    // Avançar para próxima ação
    this.session.currentAction++;
    this.modalSelectedChampion = null;
    this.session.extendedTime = 0;

    // Resetar timer
    this.timeRemaining = 30;

    // OTIMIZAÇÃO: Invalidar cache após modificação
    this.invalidateCache();

    // Atualizar turno
    this.updateCurrentTurn();
  }

  /**
   * Cancela a seleção no modal
   */
  cancelModalSelection(): void {
    console.log('❌ [cancelModalSelection] Cancelando seleção no modal');
    this.closeChampionModal();
    
    // Resetar modo de edição se estava editando
    if (this.isEditingMode) {
      this.isEditingMode = false;
      this.editingPlayerId = null;
      console.log('✏️ [cancelModalSelection] Modo de edição resetado');
    }
  }

  /**
   * Obtém o texto da ação atual (Banir/Escolher)
   */
  getCurrentActionText(): string {
    if (!this.session) return 'Ação';

    const currentPhase = this.session.phases[this.session.currentAction];
    if (!currentPhase) return 'Ação';

    if (this.isEditingMode) {
      return 'Editar Campeão';
    }

    return currentPhase.action === 'ban' ? 'Banir Campeão' : 'Escolher Campeão';
  }

  /**
   * Obtém o ícone da ação atual
   */
  getCurrentActionIcon(): string {
    if (!this.session) return '❓';

    const currentPhase = this.session.phases[this.session.currentAction];
    if (!currentPhase) return '❓';

    if (this.isEditingMode) {
      return '✏️';
    }

    return currentPhase.action === 'ban' ? '🚫' : '✅';
  }

  /**
   * Verifica se um jogador é bot (alias para isBot)
   */
  isPlayerBot(player: any): boolean {
    return this.isBot(player);
  }

  /**
   * Cancela o draft final
   */
  cancelFinalDraft(): void {
    console.log('❌ [cancelFinalDraft] Cancelando draft final');
    this.showFinalConfirmation = false;
    this.finalConfirmationData = null;
  }

  /**
   * Confirma o draft final
   */
  confirmFinalDraft(): void {
    console.log('✅ [confirmFinalDraft] Confirmando draft final');
    this.showFinalConfirmation = false;
    this.finalConfirmationData = null;
    
    // Completar o pick/ban
    this.completePickBan();
  }

  /**
   * Trata erro de carregamento de imagem
   */
  onImageError(event: any, champion: Champion): void {
    console.log(`🖼️ [onImageError] Erro ao carregar imagem de ${champion.name}`);
    // Definir imagem padrão ou placeholder
    event.target.src = 'assets/images/champion-placeholder.svg';
  }

  /**
   * Obtém o nome do jogador atual para exibição no modal
   */
  getCurrentPlayerNameForModal(): string {
    if (!this.session) return 'Jogador';

    // Se está em modo de edição, usar o jogador que está editando
    if (this.isEditingMode && this.editingPlayerId) {
      const allPlayers = [...this.session.blueTeam, ...this.session.redTeam];
      const editingPlayer = allPlayers.find(p => this.comparePlayerWithId(p, this.editingPlayerId!));
      
      if (editingPlayer) {
        return editingPlayer.summonerName || editingPlayer.name || 'Jogador';
      }
    }

    // Caso contrário, usar o jogador atual da fase
    const currentPlayer = this.getCurrentPlayer();
    if (currentPlayer) {
      return currentPlayer.summonerName || currentPlayer.name || 'Jogador';
    }

    return 'Jogador';
  }

  /**
   * Obtém o time do jogador atual para exibição no modal
   */
  getCurrentPlayerTeamForModal(): string {
    if (!this.session) return 'Time';

    // Se está em modo de edição, determinar o time do jogador que está editando
    if (this.isEditingMode && this.editingPlayerId) {
      const bluePlayer = this.session.blueTeam.find(p => this.comparePlayerWithId(p, this.editingPlayerId!));
      if (bluePlayer) {
        return '🔵 Time Azul';
      }
      
      const redPlayer = this.session.redTeam.find(p => this.comparePlayerWithId(p, this.editingPlayerId!));
      if (redPlayer) {
        return '🔴 Time Vermelho';
      }
    }

    // Caso contrário, usar o time do jogador atual da fase
    const currentPhase = this.session.phases[this.session.currentAction];
    if (currentPhase) {
      return currentPhase.team === 'blue' ? '🔵 Time Azul' : '🔴 Time Vermelho';
    }

    return 'Time';
  }

  /**
   * Obtém a cor do time atual para o modal
   */
  getCurrentTeamColor(): string {
    if (!this.session) return '#007bff';

    // Se está em modo de edição, usar a cor do time do jogador que está editando
    if (this.isEditingMode && this.editingPlayerId) {
      const bluePlayer = this.session.blueTeam.find(p => this.comparePlayerWithId(p, this.editingPlayerId!));
      if (bluePlayer) {
        return '#007bff'; // Azul
      }
      
      const redPlayer = this.session.redTeam.find(p => this.comparePlayerWithId(p, this.editingPlayerId!));
      if (redPlayer) {
        return '#dc3545'; // Vermelho
      }
    }

    // Caso contrário, usar a cor do time da fase atual
    const currentPhase = this.session.phases[this.session.currentAction];
    if (currentPhase) {
      return currentPhase.team === 'blue' ? '#007bff' : '#dc3545';
    }

    return '#007bff'; // Padrão azul
  }
}