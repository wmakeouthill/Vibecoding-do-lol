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

  private timer: any = null;
  private botPickTimer: any = null;

  constructor(private championService: ChampionService) { }
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
    if (!this.session) {
      console.log('❌ [Bot] Sessão não disponível para verificar ação de bot');
      return;
    }

    const currentPlayer = this.getCurrentPlayer();
    console.log('🔍 [Bot] Verificando ação de bot para player:', currentPlayer);

    if (!currentPlayer) {
      console.log('❌ [Bot] Player atual é null/undefined');
      return;
    }

    // Check if current player is a bot
    const isBotPlayer = this.isBot(currentPlayer);
    console.log(`🔍 [Bot] Resultado da verificação:`, {
      player: currentPlayer.summonerName || currentPlayer.name,
      id: currentPlayer.id,
      isBot: isBotPlayer,
      phase: phase.action,
      team: phase.team
    });

    if (isBotPlayer) {
      console.log(`🤖 [Bot] Bot ${currentPlayer.summonerName || currentPlayer.name} irá fazer ${phase.action} automaticamente`);
      console.log(`🤖 [Bot] Dados do bot:`, {
        id: currentPlayer.id,
        summonerName: currentPlayer.summonerName,
        name: currentPlayer.name,
        isBot: isBotPlayer
      });

      // Clear any existing bot timer
      if (this.botPickTimer) {
        clearTimeout(this.botPickTimer);
        console.log('🔄 [Bot] Timer anterior limpo');
      }

      // Auto-pick/ban after 2 seconds
      this.botPickTimer = setTimeout(() => {
        console.log(`🤖 [Bot] Executando ação automática para ${currentPlayer.summonerName}`);
        this.performBotAction(phase);
      }, 2000);

      console.log('⏰ [Bot] Timer de 2 segundos iniciado para ação automática');
    } else {
      console.log('👤 [Bot] Não é vez de um bot:', {
        currentPlayer: currentPlayer.summonerName || currentPlayer.name,
        id: currentPlayer.id,
        isBot: isBotPlayer
      });
    }
  }
  private getCurrentPlayer(): any {
    if (!this.session) return null;
    const currentPhase = this.session.phases[this.session.currentAction];
    if (!currentPhase) return null;
    // Checagem defensiva para evitar erro de undefined
    if (!currentPhase.team) return null;
    const teamPlayers = currentPhase.team === 'blue' ? this.session.blueTeam : this.session.redTeam;

    console.log(`🔍 [Player] Debug - currentAction: ${this.session.currentAction}, team: ${currentPhase.team}, teamSize: ${teamPlayers.length}`);
    console.log(`🔍 [Player] Team players:`, teamPlayers.map(p => ({ id: p.id, name: p.summonerName, isBot: this.isBot(p) })));

    // Mapeamento simplificado e mais robusto
    let playerIndex = 0;
    const actionIndex = this.session.currentAction;

    // Distribuir ações de forma mais simples e previsível
    if (actionIndex < 6) {
      // Primeira fase de bans (0-5): distribuir entre os primeiros 3 players
      playerIndex = Math.floor(actionIndex / 2) % Math.min(3, teamPlayers.length);
    } else if (actionIndex >= 6 && actionIndex < 11) {
      // Primeira fase de picks (6-10): distribuir entre todos os players
      const pickIndex = actionIndex - 6;
      playerIndex = pickIndex % teamPlayers.length;
    } else if (actionIndex >= 11 && actionIndex < 15) {
      // Segunda fase de bans (11-14): usar players 3 e 4 se disponíveis
      const banIndex = actionIndex - 11;
      playerIndex = Math.min(3 + (banIndex % 2), teamPlayers.length - 1);
    } else {
      // Segunda fase de picks (15-19): usar players restantes
      const pickIndex = actionIndex - 15;
      playerIndex = Math.min(2 + (pickIndex % 3), teamPlayers.length - 1);
    }

    // Garantir que o índice seja válido
    playerIndex = Math.max(0, Math.min(playerIndex, teamPlayers.length - 1));

    this.session.currentPlayerIndex = playerIndex;
    const player = teamPlayers[playerIndex] || null;

    console.log(`👤 Player atual: ${player?.summonerName || 'Unknown'} (Team: ${currentPhase.team}, Index: ${playerIndex}, Action: ${actionIndex}, IsBot: ${this.isBot(player)})`);
    console.log(`🔍 [Player] Dados completos do player:`, player);

    // CORREÇÃO: Retornar sempre o jogador do índice calculado, independente de ser bot ou não
    // A lógica de priorização do jogador logado deve ser feita no checkIfMyTurn, não aqui
    return player;
  }

  private isBot(player: any): boolean {
    if (!player) {
      console.log(`🤖 [Bot] Player é null/undefined`);
      return false;
    }

    const name = player.summonerName || player.name || '';
    const id = player.id;

    console.log(`🔍 [Bot] Verificando se é bot:`, { 
      id, 
      idType: typeof id,
      name, 
      summonerName: player.summonerName,
      isNegative: id < 0,
      isString: typeof id === 'string',
      numericId: typeof id === 'string' ? parseInt(id) : id
    });

    // Verificar por ID negativo (padrão do backend)
    if (id < 0) {
      console.log(`🤖 [Bot] Bot identificado por ID negativo: ${id} (${name})`);
      return true;
    }

    // Verificar se o ID é string e pode ser convertido para número negativo
    if (typeof id === 'string') {
      const numericId = parseInt(id);
      if (!isNaN(numericId) && numericId < 0) {
        console.log(`🤖 [Bot] Bot identificado por ID string negativo: ${id} -> ${numericId} (${name})`);
        return true;
      }
    }

    // Verificar se o ID é string que contém "bot" ou números negativos
    if (typeof id === 'string') {
      if (id.toLowerCase().includes('bot') || id.startsWith('-')) {
        console.log(`🤖 [Bot] Bot identificado por ID string com 'bot' ou negativo: ${id} (${name})`);
        return true;
      }
    }

    // Verificar por padrões de nome de bot (mais específicos)
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
      /^ai\s*\d+\s*[a-z]*$/i   // AI número com sufixo
    ];

    for (const pattern of botPatterns) {
      if (pattern.test(name)) {
        console.log(`🤖 [Bot] Bot identificado por padrão de nome: ${name} (ID: ${id})`);
        return true;
      }
    }

    // Verificar se o nome contém "bot" (case insensitive)
    if (name.toLowerCase().includes('bot')) {
      console.log(`🤖 [Bot] Bot identificado por nome contendo 'bot': ${name} (ID: ${id})`);
      return true;
    }

    // Verificar se o nome contém "ai" (case insensitive)
    if (name.toLowerCase().includes('ai')) {
      console.log(`🤖 [Bot] Bot identificado por nome contendo 'ai': ${name} (ID: ${id})`);
      return true;
    }

    // Verificar se o nome contém números (pode ser bot numerado)
    if (/\d/.test(name) && (name.toLowerCase().includes('bot') || name.toLowerCase().includes('ai'))) {
      console.log(`🤖 [Bot] Bot identificado por nome com números: ${name} (ID: ${id})`);
      return true;
    }

    console.log(`🤖 [Bot] Player não é bot: ${name} (ID: ${id})`);
    return false;
  }

  private performBotAction(phase: PickBanPhase) {
    console.log(`🤖 [Bot] performBotAction iniciado para fase:`, phase);

    if (!this.session || !phase || phase.locked) {
      console.log(`❌ [Bot] Sessão não disponível, fase inválida ou fase bloqueada`);
      return;
    }

    const availableChampions = this.getFilteredChampions();
    console.log(`🤖 [Bot] Campeões disponíveis: ${availableChampions.length}`);

    if (availableChampions.length === 0) {
      console.log(`❌ [Bot] Nenhum campeão disponível`);
      return;
    }

    let selectedChampion: Champion;

    if (phase.action === 'pick') {
      console.log(`🤖 [Bot] Fazendo PICK automático`);
      // For picks, try to select a champion suitable for a random role
      const roles = ['top', 'jungle', 'mid', 'adc', 'support'];
      const randomRole = roles[Math.floor(Math.random() * roles.length)];
      const roleChampions = this.championsByRole[randomRole] || [];

      const availableRoleChampions = roleChampions.filter((champ: Champion) =>
        availableChampions.some(ac => ac.id === champ.id)
      );

      if (availableRoleChampions.length > 0) {
        selectedChampion = availableRoleChampions[Math.floor(Math.random() * availableRoleChampions.length)];
        console.log(`🤖 [Bot] Campeão selecionado por role (${randomRole}): ${selectedChampion.name}`);
      } else {
        selectedChampion = availableChampions[Math.floor(Math.random() * availableChampions.length)];
        console.log(`🤖 [Bot] Campeão aleatório selecionado: ${selectedChampion.name}`);
      }
    } else {
      console.log(`🤖 [Bot] Fazendo BAN automático`);
      // For bans, select a random strong champion
      const strongChampions = availableChampions.filter(champ =>
        ['Yasuo', 'Zed', 'Akali', 'LeBlanc', 'Azir', 'Kassadin', 'Katarina'].includes(champ.name)
      );

      if (strongChampions.length > 0) {
        selectedChampion = strongChampions[Math.floor(Math.random() * strongChampions.length)];
        console.log(`🤖 [Bot] Campeão forte banido: ${selectedChampion.name}`);
      } else {
        selectedChampion = availableChampions[Math.floor(Math.random() * availableChampions.length)];
        console.log(`🤖 [Bot] Campeão aleatório banido: ${selectedChampion.name}`);
      }
    }

    console.log(`🤖 [Bot] Bot auto-selecionou: ${selectedChampion.name} (${phase.action})`);

    // CORREÇÃO: Vincular o bot que fez a ação ANTES de confirmar a seleção
    const currentPlayer = this.getCurrentPlayer();
    if (currentPlayer) {
      // Vincular a ação ao bot atual
      phase.playerId = currentPlayer.id?.toString();
      phase.playerName = currentPlayer.summonerName || currentPlayer.name;
      console.log(`🤖 [Bot] Ação vinculada ao bot: ${currentPlayer.summonerName || currentPlayer.name} (ID: ${currentPlayer.id})`);
      
      // Aplicar a seleção do bot
      this.selectedChampion = selectedChampion;
      console.log(`🤖 [Bot] Confirmando seleção...`);
      this.confirmSelection();
    } else {
      console.log(`❌ [Bot] Bot não encontrado para vincular ação`);
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
      isPhasePlayerBot: this.isBot(currentPhasePlayer),
      isCurrentPlayerBot: this.isBot(this.currentPlayer)
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

  getBannedChampions(): Champion[] {
    if (!this.session) return [];

    return this.session.phases
      .filter(p => p.action === 'ban' && p.champion)
      .map(p => p.champion!);
  }

  getTeamPicks(team: 'blue' | 'red'): Champion[] {
    if (!this.session) return [];

    // Obter todos os picks do time
    const teamPicks = this.session.phases
      .filter(p => p.action === 'pick' && p.team === team && p.champion);

    // Obter jogadores ordenados por lane
    const sortedPlayers = this.getSortedTeamByLane(team);
    
    // Mapear picks às posições corretas dos jogadores
    const mappedPicks: Champion[] = [];
    
    sortedPlayers.forEach((player, index) => {
      // Encontrar o pick deste jogador
      const playerPick = teamPicks.find(p => {
        const matchById = p.playerId && p.playerId.toString() === player.id?.toString();
        const matchByName = p.playerName && p.playerName === (player.summonerName || player.name);
        const matchByGameName = p.playerName && (player.summonerName || player.name) && 
          p.playerName.startsWith((player.summonerName || player.name) + '#');
        
        return matchById || matchByName || matchByGameName;
      });
      
      if (playerPick && playerPick.champion) {
        mappedPicks[index] = playerPick.champion;
        console.log(`🔗 [getTeamPicks] Pick ${playerPick.champion.name} mapeado para posição ${index} (${player.summonerName || player.name})`);
      } else {
        // Se não há pick para este jogador, adicionar undefined para manter a posição
        mappedPicks[index] = undefined as any;
      }
    });
    
    // Filtrar apenas os picks que existem (remover undefined)
    return mappedPicks.filter(pick => pick !== undefined);
  }

  // Utility methods
  onImageError(event: any, champion: Champion) {
    // Fallback para imagem placeholder
    event.target.src = '/assets/images/champion-placeholder.svg';

    // Se o placeholder também falhar, usar um data URL simples
    event.target.onerror = () => {
      event.target.src = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjQiIGhlaWdodD0iNjQiIHZpZXdCb3g9IjAgMCA2NCA2NCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPHJlY3Qgd2lkdGg9IjY0IiBoZWlnaHQ9IjY0IiBmaWxsPSIjMzMzIi8+Cjx0ZXh0IHg9IjMyIiB5PSI0MCIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZmlsbD0iI2Y1ZjVmNSIgZm9udC1zaXplPSIyNCI+PzwvdGV4dD4KPHN2Zz4K';
    };

    console.warn(`Erro ao carregar imagem do campeão: ${champion.name}`);
  }

  // Bot detection and auto-selection logic...
  // ...existing bot methods...

  getCurrentPlayerName(): string {
    if (!this.session) return 'Desconhecido';

    const currentPlayer = this.getCurrentPlayer();
    if (!currentPlayer) return 'Desconhecido';

    const playerName = currentPlayer.summonerName || currentPlayer.name || 'Jogador';
    console.log(`🔍 [getCurrentPlayerName] Nome do jogador atual: ${playerName} (ID: ${currentPlayer.id}, IsBot: ${this.isBot(currentPlayer)})`);
    
    return playerName;
  }

  // ========== NOVOS MÉTODOS PARA O MODAL ==========

  /**
   * Abre o modal de seleção de campeões
   */
  openChampionModal(): void {
    if (!this.isMyTurn) return;

    this.showChampionModal = true;
    this.modalSearchFilter = '';
    this.modalSelectedRole = 'all';
    this.modalSelectedChampion = null;
    this.isConfirming = false;

    // Iniciar timer do modal
    this.startModalTimer();

    // Focar no campo de busca automaticamente
    setTimeout(() => {
      const searchInput = document.getElementById('modal-champion-search') as HTMLInputElement;
      if (searchInput) {
        searchInput.focus();
      }
    }, 100);
  }

  /**
   * Fecha o modal de seleção de campeões
   */
  closeChampionModal(): void {
    this.showChampionModal = false;
    this.modalSearchFilter = '';
    this.modalSelectedRole = 'all';
    this.modalSelectedChampion = null;
    this.isConfirming = false;

    // Parar timer do modal
    this.stopModalTimer();
  }

  /**
   * Retorna campeões filtrados para o modal
   */
  getModalFilteredChampions(): Champion[] {
    if (!this.session) return [];

    // Obter campeões banidos
    const bannedChampions = this.getBannedChampions();
    const bannedIds = bannedChampions.map(ban => ban.id);

    // Filtrar campeões disponíveis (excluindo banidos)
    let availableChampions = this.champions.filter(champion =>
      !bannedIds.includes(champion.id)
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
    
    if (this.currentPlayer && !this.isBot(this.currentPlayer)) {
      targetPlayerId = this.currentPlayer.id?.toString();
      targetPlayerName = this.currentPlayer.summonerName || this.currentPlayer.name;
      console.log(`✅ [confirmModalSelection] Usando jogador logado: ${targetPlayerName} (${targetPlayerId})`);
    } else {
      // Fallback: usar o jogador da fase atual
      const currentPlayer = this.getCurrentPlayer();
      if (currentPlayer) {
        targetPlayerId = currentPlayer.id?.toString();
        targetPlayerName = currentPlayer.summonerName || currentPlayer.name;
        console.log(`✅ [confirmModalSelection] Usando jogador da fase: ${targetPlayerName} (${targetPlayerId})`);
      }
    }

    // Atualizar a fase com o campeão selecionado
    currentPhase.champion = this.modalSelectedChampion;
    currentPhase.playerId = targetPlayerId;
    currentPhase.playerName = targetPlayerName;
    currentPhase.locked = true;

    console.log(`🎯 [confirmModalSelection] Fase atualizada:`, {
      action: currentPhase.action,
      champion: currentPhase.champion?.name,
      playerId: currentPhase.playerId,
      playerName: currentPhase.playerName,
      team: currentPhase.team
    });

    // Fechar modal
    this.closeChampionModal();

    // Avançar para próxima ação apenas se não estiver editando
    this.session.currentAction++;
    this.updateCurrentTurn();
  }

  /**
   * Cancela a seleção no modal
   */
  cancelModalSelection(): void {
    this.closeChampionModal();
  }

  /**
   * Obtém o texto da ação atual (Pick/Ban)
   */
  getCurrentActionText(): string {
    if (!this.session || this.session.currentAction >= this.session.phases.length) {
      return '';
    }

    const currentPhase = this.session.phases[this.session.currentAction];
    return currentPhase.action === 'ban' ? 'Banir Campeão' : 'Escolher Campeão';
  }

  /**
   * Obtém o ícone da ação atual
   */
  getCurrentActionIcon(): string {
    if (!this.session || this.session.currentAction >= this.session.phases.length) {
      return '';
    }

    const currentPhase = this.session.phases[this.session.currentAction];
    return currentPhase.action === 'ban' ? '🚫' : '⭐';
  }

  /**
   * Obtém o nome do jogador atual para o modal
   */
  getCurrentPlayerNameForModal(): string {
    if (!this.session) return 'Desconhecido';

    // Se está em modo de edição, mostrar o jogador que está editando
    if (this.isEditingMode && this.editingPlayerId) {
      console.log(`🔍 [getCurrentPlayerNameForModal] Modo edição - editingPlayerId: ${this.editingPlayerId}`);

      const allPlayers = [...this.session.blueTeam, ...this.session.redTeam];
      const editingPlayer = allPlayers.find(p => this.comparePlayerWithId(p, this.editingPlayerId!));

      if (editingPlayer) {
        const playerName = editingPlayer.summonerName || editingPlayer.name || 'Jogador';
        console.log(`✅ [getCurrentPlayerNameForModal] Jogador encontrado: ${playerName}`);
        return playerName;
      } else {
        console.log(`❌ [getCurrentPlayerNameForModal] Jogador não encontrado para: ${this.editingPlayerId}`);
      }
    }

    // Caso contrário, usar a lógica normal
    const currentPhase = this.session.phases[this.session.currentAction];
    if (!currentPhase) return 'Desconhecido';

    const team = currentPhase.team === 'blue' ? this.session.blueTeam : this.session.redTeam;
    const playerIndex = this.getPlayerIndexForPick(currentPhase.team, Math.floor(this.session.currentAction / 2));

    if (playerIndex < team.length) {
      const playerName = team[playerIndex].summonerName || team[playerIndex].name || 'Jogador';
      console.log(`🔍 [getCurrentPlayerNameForModal] Lógica normal - jogador: ${playerName}`);
      return playerName;
    }

    console.log(`❌ [getCurrentPlayerNameForModal] Jogador não encontrado na lógica normal`);
    return 'Desconhecido';
  }

  /**
   * Obtém o time do jogador atual para o modal
   */
  getCurrentPlayerTeamForModal(): string {
    if (!this.session) return '';

    // Se está em modo de edição, mostrar o time do jogador que está editando
    if (this.isEditingMode && this.editingPlayerId) {
      console.log(`🔍 [getCurrentPlayerTeamForModal] Modo edição - editingPlayerId: ${this.editingPlayerId}`);

      // Verificar no time azul
      const blueTeamPlayer = this.session.blueTeam.find(p => this.comparePlayerWithId(p, this.editingPlayerId!));

      if (blueTeamPlayer) {
        console.log(`✅ [getCurrentPlayerTeamForModal] Jogador encontrado no Time Azul`);
        return 'Time Azul';
      }

      // Verificar no time vermelho
      const redTeamPlayer = this.session.redTeam.find(p => this.comparePlayerWithId(p, this.editingPlayerId!));

      if (redTeamPlayer) {
        console.log(`✅ [getCurrentPlayerTeamForModal] Jogador encontrado no Time Vermelho`);
        return 'Time Vermelho';
      }

      console.log(`❌ [getCurrentPlayerTeamForModal] Jogador não encontrado em nenhum time: ${this.editingPlayerId}`);
    }

    // Caso contrário, usar a lógica normal
    const currentPhase = this.session.phases[this.session.currentAction];
    if (!currentPhase) return '';

    const teamName = currentPhase.team === 'blue' ? 'Time Azul' : 'Time Vermelho';
    console.log(`🔍 [getCurrentPlayerTeamForModal] Lógica normal - time: ${teamName}`);
    return teamName;
  }

  /**
   * Obtém a cor do time atual para o modal
   */
  getCurrentTeamColor(): string {
    if (!this.session) return '#3498db';

    // Se está em modo de edição, mostrar a cor do time do jogador que está editando
    if (this.isEditingMode && this.editingPlayerId) {
      const blueTeamPlayer = this.session.blueTeam.find(p =>
        p.id?.toString() === this.editingPlayerId?.toString() ||
        p.summonerName === this.editingPlayerId ||
        p.name === this.editingPlayerId
      );

      if (blueTeamPlayer) {
        return '#3498db'; // Azul
      }

      const redTeamPlayer = this.session.redTeam.find(p =>
        p.id?.toString() === this.editingPlayerId?.toString() ||
        p.summonerName === this.editingPlayerId ||
        p.name === this.editingPlayerId
      );

      if (redTeamPlayer) {
        return '#e74c3c'; // Vermelho
      }
    }

    // Caso contrário, usar a lógica normal
    const currentPhase = this.session.phases[this.session.currentAction];
    if (!currentPhase) return '#3498db';

    return currentPhase.team === 'blue' ? '#3498db' : '#e74c3c';
  }

  // ========== MÉTODOS PARA TIMER DO MODAL ==========

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

  // ========== MÉTODOS PARA CONFIRMAÇÃO FINAL ==========

  /**
   * Organiza o time por lanes fixas (TOP, JUNGLE, MIDDLE, ADC, SUPPORT)
   */
  private organizeTeamByLanes(teamPlayers: any[], teamPicks: any[]): any[] {
    const laneOrder = ['top', 'jungle', 'mid', 'bot', 'support'];

    // Ordenar jogadores por lane primeiro
    const sortedPlayers = [...teamPlayers].sort((a, b) => {
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
   * Mapeia picks com jogadores para um time específico
   */
  private mapPicksWithPlayers(team: 'blue' | 'red'): any[] {
    if (!this.session) return [];

    const teamPlayers = team === 'blue' ? this.session.blueTeam : this.session.redTeam;
    const teamPicks = this.session.phases.filter(p => p.action === 'pick' && p.team === team && p.champion);

    // Criar array com 5 slots (um para cada jogador)
    const picksWithPlayers = new Array(5).fill(null);

    // Mapear picks existentes para os slots corretos
    teamPicks.forEach((pick, index) => {
      if (index < 5) {
        // Encontrar o jogador correspondente usando método auxiliar
        const player = teamPlayers.find(p => {
          const matchById = p.id && pick.playerId && p.id.toString() === pick.playerId.toString();
          const matchByName = p.summonerName && pick.playerName && p.summonerName === pick.playerName;
          const matchByGameName = p.summonerName && pick.playerName && p.summonerName.startsWith(pick.playerName + '#');

          console.log(`🔍 [mapPicksWithPlayers] Verificando jogador para pick:`, {
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

        picksWithPlayers[index] = {
          champion: pick.champion,
          playerId: pick.playerId || (player ? player.id : null),
          playerName: pick.playerName || (player ? (player.summonerName || player.name) : 'Desconhecido'),
          phaseIndex: this.session!.phases.indexOf(pick),
          player: player
        };

        if (player) {
          console.log(`✅ [mapPicksWithPlayers] Pick ${pick.champion?.name} mapeado para jogador ${player.summonerName}`);
        } else {
          console.log(`❌ [mapPicksWithPlayers] Jogador não encontrado para pick ${pick.champion?.name}`);
        }
      }
    });

    console.log(`🎯 [mapPicksWithPlayers] ${team} team:`, picksWithPlayers);
    return picksWithPlayers;
  }

  /**
   * Confirma o draft final
   */
  confirmFinalDraft(): void {
    this.showFinalConfirmation = false;
    this.finalConfirmationData = null;
    this.completePickBan();
  }

  /**
   * Cancela o draft final e permite edição
   */
  cancelFinalDraft(): void {
    this.showFinalConfirmation = false;
    this.finalConfirmationData = null;
    // Voltar para a última ação para permitir edição
    this.allowDraftEditing();
  }

  /**
   * Permite edição do draft voltando para a última ação
   */
  allowDraftEditing(): void {
    if (!this.session) return;

    // Voltar para a última ação realizada
    if (this.session.currentAction > 0) {
      this.session.currentAction--;
    }

    // Resetar o timer e permitir nova seleção
    this.timeRemaining = 30;
    this.isEditingMode = true;
    this.updateCurrentTurn();
  }

  /**
   * Inicia edição de um pick específico
   */
  startEditingPick(playerId: string, phaseIndex: number): void {
    if (!this.session) return;

    console.log(`✏️ [Edição] Iniciando edição para jogador ${playerId} na fase ${phaseIndex}`);
    console.log(`🔍 [Edição] CurrentPlayer:`, this.currentPlayer);

    // Definir o jogador que está editando PRIMEIRO
    this.editingPlayerId = playerId;
    this.isEditingMode = true;

    // AGORA verificar se o jogador atual pode editar este pick
    if (!this.canCurrentPlayerEdit()) {
      console.log(`❌ [Edição] Jogador atual não pode editar este pick`);
      console.log(`🔍 [Edição] Current: ${this.currentPlayer?.id}/${this.currentPlayer?.summonerName}, Editing: ${playerId}`);
      // Resetar se não pode editar
      this.editingPlayerId = null;
      this.isEditingMode = false;
      return;
    }

    console.log(`✅ [Edição] Jogador autorizado a editar. Procurando fase...`);

    // Encontrar a fase correta para edição
    let targetPhaseIndex = phaseIndex;
    if (phaseIndex === undefined || phaseIndex === null) {
      // Se não temos o phaseIndex, encontrar a fase do pick atual
      const teamPicks = this.session.phases.filter(p => p.action === 'pick' && p.champion);
      console.log(`🔍 [Edição] Procurando pick do jogador ${playerId} em ${teamPicks.length} picks`);

      const playerPick = teamPicks.find(p => {
        // Verificar por ID
        const matchById = p.playerId && p.playerId.toString() === playerId.toString();
        
        // Verificar por nome
        const matchByName = p.playerName && p.playerName === playerId;
        
        // Verificar por Riot ID (gameName#tagLine)
        const matchByGameName = p.playerName && playerId && p.playerName.startsWith(playerId + '#');
        
        // Verificar se o playerId contém o nome do jogador
        const matchByPlayerIdName = p.playerId && playerId && p.playerId.toString().includes(playerId);

        console.log(`🔍 [Edição] Verificando pick:`, {
          pickPlayerId: p.playerId,
          pickPlayerName: p.playerName,
          targetPlayerId: playerId,
          matchById,
          matchByName,
          matchByGameName,
          matchByPlayerIdName
        });

        return matchById || matchByName || matchByGameName || matchByPlayerIdName;
      });

      if (playerPick) {
        targetPhaseIndex = this.session.phases.indexOf(playerPick);
        console.log(`✅ [Edição] Fase encontrada: ${targetPhaseIndex}`);
      } else {
        console.log(`❌ [Edição] Fase não encontrada para jogador ${playerId}`);
        // Tentar encontrar por índice do jogador no time
        const allPlayers = [...this.session.blueTeam, ...this.session.redTeam];
        const playerIndex = allPlayers.findIndex(p => 
          this.comparePlayerWithId(p, playerId) || 
          p.summonerName === playerId || 
          p.name === playerId
        );
        
        if (playerIndex !== -1) {
          // Encontrar a fase correspondente ao índice do jogador
          const player = allPlayers[playerIndex];
          const team = this.session.blueTeam.includes(player) ? 'blue' : 'red';
          const teamIndex = team === 'blue' ? 
            this.session.blueTeam.indexOf(player) : 
            this.session.redTeam.indexOf(player);
          
          // Estimar a fase baseada no índice do jogador
          targetPhaseIndex = Math.min(teamIndex * 2 + 6, this.session.phases.length - 1);
          console.log(`✅ [Edição] Fase estimada por índice: ${targetPhaseIndex}`);
        }
      }
    }

    // Voltar para a fase específica
    if (targetPhaseIndex !== undefined && targetPhaseIndex >= 0 && targetPhaseIndex < this.session.phases.length) {
      this.session.currentAction = targetPhaseIndex;
      console.log(`🎯 [Edição] Definindo currentAction para: ${targetPhaseIndex}`);
    } else {
      // Fallback: voltar para a última ação
      if (this.session.currentAction > 0) {
        this.session.currentAction--;
        console.log(`🎯 [Edição] Fallback: currentAction para: ${this.session.currentAction}`);
      }
    }

    // Resetar o timer
    this.timeRemaining = 30;

    // Fechar confirmação final
    this.showFinalConfirmation = false;
    this.finalConfirmationData = null;

    // Atualizar turno
    this.updateCurrentTurn();

    // Verificar se é minha vez após atualizar
    const currentPhase = this.session.phases[this.session.currentAction];
    this.isMyTurn = this.checkIfMyTurn(currentPhase);

    console.log(`🎯 [Edição] É minha vez: ${this.isMyTurn}`);

    // Abrir modal automaticamente se for minha vez
    if (this.isMyTurn) {
      console.log('🎯 [Edição] Abrindo modal automaticamente para edição');
      this.openChampionModal();
    } else {
      console.log('❌ [Edição] Não é minha vez, não abrindo modal');
    }
  }

  /**
   * Verifica se o jogador atual pode editar
   */
  canCurrentPlayerEdit(): boolean {
    if (!this.currentPlayer || !this.editingPlayerId) return false;

    const canEdit = this.comparePlayerWithId(this.currentPlayer, this.editingPlayerId);
    console.log(`🔍 [canCurrentPlayerEdit] Jogador pode editar: ${canEdit}`);
    return canEdit;
  }

  /**
   * Verifica se um jogador é bot (método público)
   */
  isPlayerBot(player: any): boolean {
    const isBot = this.isBot(player);
    console.log(`🔍 [isPlayerBot] Verificando se ${player?.summonerName || player?.name} é bot: ${isBot}`);
    return isBot;
  }

  /**
   * Obtém o nome do jogador para um pick específico
   */
  getPlayerNameForPick(team: 'blue' | 'red', pickIndex: number): string {
    if (!this.session) return 'Desconhecido';

    const teamPicks = this.session.phases.filter(p => p.action === 'pick' && p.team === team && p.champion);
    const pick = teamPicks[pickIndex];

    if (pick && pick.playerName) {
      return pick.playerName;
    }

    // Fallback: buscar pelo índice do jogador no time
    const teamPlayers = team === 'blue' ? this.session.blueTeam : this.session.redTeam;
    const playerIndex = this.getPlayerIndexForPick(team, pickIndex);

    if (playerIndex < teamPlayers.length) {
      return teamPlayers[playerIndex].summonerName || teamPlayers[playerIndex].name || 'Jogador';
    }

    return 'Desconhecido';
  }

  /**
   * Obtém o nome do jogador para um slot específico
   */
  getPlayerNameForSlot(team: 'blue' | 'red', slotIndex: number): string {
    if (!this.session) return 'Desconhecido';

    const teamPlayers = team === 'blue' ? this.session.blueTeam : this.session.redTeam;

    if (slotIndex < teamPlayers.length) {
      return teamPlayers[slotIndex].summonerName || teamPlayers[slotIndex].name || 'Jogador';
    }

    return 'Desconhecido';
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
   * Obtém a lane atribuída a um jogador específico
   */
  getPlayerLaneDisplay(team: 'blue' | 'red', slotIndex: number): string {
    if (!this.session) return '';

    const teamPlayers = team === 'blue' ? this.session.blueTeam : this.session.redTeam;

    if (slotIndex < teamPlayers.length) {
      const player = teamPlayers[slotIndex];
      const assignedLane = player.assignedLane || player.primaryLane || 'fill';
      const isAutofill = player.isAutofill || false;

      const laneName = this.getLaneDisplayName(assignedLane.toUpperCase());
      const laneIcon = this.getLaneIcon(assignedLane);

      if (isAutofill) {
        return `${laneIcon} ${laneName} (Auto)`;
      }
      return `${laneIcon} ${laneName}`;
    }

    return '';
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
   * Ordena jogadores por lane na ordem: top, jungle, mid, adc, support
   * E vincula os picks às lanes corretas
   */
  getSortedTeamByLane(team: 'blue' | 'red'): any[] {
    if (!this.session) return [];

    const teamPlayers = team === 'blue' ? this.session.blueTeam : this.session.redTeam;
    const laneOrder = ['top', 'jungle', 'mid', 'bot', 'support'];

    // Primeiro, ordenar jogadores por lane
    const sortedPlayers = [...teamPlayers].sort((a, b) => {
      const laneA = a.assignedLane || a.primaryLane || 'fill';
      const laneB = b.assignedLane || b.primaryLane || 'fill';

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

    // Agora vincular os picks às lanes corretas
    const teamPicks = this.session.phases.filter(p => p.action === 'pick' && p.team === team && p.champion);
    
    console.log(`🔍 [getSortedTeamByLane] ${team} team:`, {
      players: sortedPlayers.map(p => ({ name: p.summonerName, lane: p.assignedLane || p.primaryLane })),
      picks: teamPicks.map(p => ({ player: p.playerName, champion: p.champion?.name }))
    });

    // Para cada jogador, verificar se tem um pick e vincular
    sortedPlayers.forEach((player, index) => {
      const playerPick = teamPicks.find(p => {
        const matchById = p.playerId && p.playerId.toString() === player.id?.toString();
        const matchByName = p.playerName && p.playerName === (player.summonerName || player.name);
        const matchByGameName = p.playerName && (player.summonerName || player.name) && 
          p.playerName.startsWith((player.summonerName || player.name) + '#');
        
        return matchById || matchByName || matchByGameName;
      });

      if (playerPick) {
        console.log(`🔗 [getSortedTeamByLane] Vinculando pick ${playerPick.champion?.name} ao jogador ${player.summonerName || player.name} na lane ${player.assignedLane || player.primaryLane}`);
      }
    });

    return sortedPlayers;
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
    this.modalSelectedChampion = null;
    this.isConfirming = false;
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

    console.log(`🔍 [comparePlayers] Comparando:`, {
      player1: { id: id1, name: name1 },
      player2: { id: id2, name: name2 }
    });

    // Verificar por ID
    if (id1 && id2 && id1 === id2) {
      console.log(`🔍 [comparePlayers] Match por ID: ${id1}`);
      return true;
    }

    // Verificar por nome exato
    if (name1 && name2 && name1 === name2) {
      console.log(`🔍 [comparePlayers] Match por nome exato: ${name1}`);
      return true;
    }

    // Verificar por nome parcial (sem tagline)
    if (name1 && name2 && name1.includes('#')) {
      const gameName1 = name1.split('#')[0];
      if (name2.includes('#')) {
        const gameName2 = name2.split('#')[0];
        if (gameName1 === gameName2) {
          console.log(`🔍 [comparePlayers] Match por gameName: ${gameName1}`);
          return true;
        }
      } else if (gameName1 === name2) {
        console.log(`🔍 [comparePlayers] Match por gameName (sem tagline): ${gameName1}`);
        return true;
      }
    }

    // Verificar se name2 é gameName do name1
    if (name1 && name2 && name1.startsWith(name2 + '#')) {
      console.log(`🔍 [comparePlayers] Match por gameName prefix: ${name2}`);
      return true;
    }

    // Verificar se name1 é gameName do name2
    if (name1 && name2 && name2.startsWith(name1 + '#')) {
      console.log(`🔍 [comparePlayers] Match por gameName prefix reverso: ${name1}`);
      return true;
    }

    // Verificar se um dos nomes é substring do outro (para casos onde um tem tagline e outro não)
    if (name1 && name2) {
      if (name1.includes(name2) || name2.includes(name1)) {
        console.log(`🔍 [comparePlayers] Match por substring: ${name1} / ${name2}`);
        return true;
      }
    }

    console.log(`🔍 [comparePlayers] No match - Player1: ${id1}/${name1}, Player2: ${id2}/${name2}`);
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

    console.log(`🔍 [comparePlayerWithId] Comparando:`, {
      player: { id: playerId, name: playerName },
      target: targetIdStr
    });

    // Verificar por ID
    if (playerId && targetIdStr && playerId === targetIdStr) {
      console.log(`🔍 [comparePlayerWithId] Match por ID: ${playerId}`);
      return true;
    }

    // Verificar por nome exato
    if (playerName && targetIdStr && playerName === targetIdStr) {
      console.log(`🔍 [comparePlayerWithId] Match por nome exato: ${playerName}`);
      return true;
    }

    // Verificar por nome parcial (sem tagline)
    if (playerName && targetIdStr && playerName.includes('#')) {
      const gameName = playerName.split('#')[0];
      if (targetIdStr.includes('#')) {
        const targetGameName = targetIdStr.split('#')[0];
        if (gameName === targetGameName) {
          console.log(`🔍 [comparePlayerWithId] Match por gameName: ${gameName}`);
          return true;
        }
      } else if (gameName === targetIdStr) {
        console.log(`🔍 [comparePlayerWithId] Match por gameName (sem tagline): ${gameName}`);
        return true;
      }
    }

    // Verificar se targetId é gameName do player
    if (playerName && targetIdStr && playerName.startsWith(targetIdStr + '#')) {
      console.log(`🔍 [comparePlayerWithId] Match por gameName prefix: ${targetIdStr}`);
      return true;
    }

    // Verificar se um dos nomes é substring do outro (para casos onde um tem tagline e outro não)
    if (playerName && targetIdStr) {
      if (playerName.includes(targetIdStr) || targetIdStr.includes(playerName)) {
        console.log(`🔍 [comparePlayerWithId] Match por substring: ${playerName} / ${targetIdStr}`);
        return true;
      }
    }

    console.log(`🔍 [comparePlayerWithId] No match - Player: ${playerId}/${playerName}, Target: ${targetIdStr}`);
    return false;
  }

  /**
   * Verifica se um jogador é o jogador atual logado
   */
  isCurrentPlayer(player: any): boolean {
    if (!this.currentPlayer || !player) return false;
    
    console.log(`🔍 [isCurrentPlayer] Verificando se ${player?.summonerName || player?.name} é o jogador logado ${this.currentPlayer?.summonerName || this.currentPlayer?.name}`);
    
    // Se o jogador atual é um bot, não deve ser identificado como jogador logado
    if (this.isBot(this.currentPlayer)) {
      console.log(`🔍 [isCurrentPlayer] Jogador atual é bot, não deve ser identificado como jogador logado`);
      return false;
    }
    
    // Se o jogador sendo verificado é um bot, não deve ser identificado como jogador logado
    if (this.isBot(player)) {
      console.log(`🔍 [isCurrentPlayer] Jogador verificado é bot, não deve ser identificado como jogador logado`);
      return false;
    }
    
    const result = this.comparePlayers(this.currentPlayer, player);
    console.log(`🔍 [isCurrentPlayer] Resultado: ${result}`);
    return result;
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
   * Verifica se o jogador atual está no modal
   */
  isCurrentPlayerForModal(): boolean {
    if (!this.currentPlayer || !this.session) return false;
    
    // Se o jogador atual é um bot, não deve ser identificado como jogador logado
    if (this.isBot(this.currentPlayer)) {
      console.log(`🔍 [isCurrentPlayerForModal] Jogador atual é bot, não deve ser identificado como jogador logado`);
      return false;
    }
    
    // Se está em modo de edição, verificar se o jogador atual é quem está editando
    if (this.isEditingMode && this.editingPlayerId) {
      return this.comparePlayerWithId(this.currentPlayer, this.editingPlayerId);
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
    
    return this.comparePlayers(this.currentPlayer, expectedPlayer);
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
        isBot: this.isBot(player),
        isCurrentPlayer: this.comparePlayers(this.currentPlayer, player)
      });
    });

    const currentPhasePlayer = this.getCurrentPlayer();
    console.log('🔍 [Debug] === CURRENT PHASE PLAYER ===');
    console.log('🔍 [Debug] Current Phase Player:', {
      id: currentPhasePlayer?.id,
      idType: typeof currentPhasePlayer?.id,
      name: currentPhasePlayer?.summonerName || currentPhasePlayer?.name,
      isBot: this.isBot(currentPhasePlayer),
      isCurrentPlayer: this.comparePlayers(this.currentPlayer, currentPhasePlayer)
    });

    console.log('🔍 [Debug] === PHASE INFO ===');
    if (this.session.phases[this.session.currentAction]) {
      const phase = this.session.phases[this.session.currentAction];
      console.log('🔍 [Debug] Current Phase:', {
        action: phase.action,
        team: phase.team,
        playerId: phase.playerId,
        playerName: phase.playerName,
        locked: phase.locked
      });
    }

    console.log('🔍 [Debug] === BOT DETECTION TEST ===');
    [...this.session.blueTeam, ...this.session.redTeam].forEach(player => {
      const isBot = this.isBot(player);
      console.log(`🔍 [Debug] Bot Test - ${player.summonerName || player.name}:`, {
        id: player.id,
        idType: typeof player.id,
        isBot,
        reason: isBot ? 'Bot detected' : 'Not a bot'
      });
    });

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
}