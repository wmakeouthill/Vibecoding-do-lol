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

    console.log('✅ Dados dos times disponíveis:', {
      team1Size: this.matchData.team1.length,
      team2Size: this.matchData.team2.length,
      team1: this.matchData.team1.map((p: any) => ({ id: p.id, name: p.summonerName, isBot: p.id < 0 })),
      team2: this.matchData.team2.map((p: any) => ({ id: p.id, name: p.summonerName, isBot: p.id < 0 }))
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
      blueTeam: this.matchData.team1 || [],
      redTeam: this.matchData.team2 || [],
      currentPlayerIndex: 0
    };

    console.log('✅ Sessão Pick&Ban criada:', {
      id: this.session.id,
      blueTeamSize: this.session.blueTeam.length,
      redTeamSize: this.session.redTeam.length,
      phasesCount: this.session.phases.length,
      currentAction: this.session.currentAction,
      blueTeam: this.session.blueTeam.map(p => ({ id: p.id, name: p.summonerName })),
      redTeam: this.session.redTeam.map(p => ({ id: p.id, name: p.summonerName }))
    });

    this.updateCurrentTurn();
  } updateCurrentTurn() {
    if (!this.session || this.session.currentAction >= this.session.phases.length) {
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

    console.log(`🎯 Ação ${this.session.currentAction}: ${currentPhase.team} - ${currentPhase.action}`);

    // Check if it's the current player's turn
    this.checkIfMyTurn(currentPhase);

    // Check if it's a bot's turn and auto-pick after 3 seconds
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
      isBot: isBotPlayer
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
    const currentTeam = currentPhase.team === 'blue' ? this.session.blueTeam : this.session.redTeam;

    console.log(`🔍 [Player] Debug - currentAction: ${this.session.currentAction}, team: ${currentPhase.team}, teamSize: ${currentTeam.length}`);
    console.log(`🔍 [Player] Team players:`, currentTeam.map(p => ({ id: p.id, name: p.summonerName })));

    // Mapeamento simplificado e mais robusto
    let playerIndex = 0;
    const actionIndex = this.session.currentAction;

    // Distribuir ações de forma mais simples e previsível
    if (actionIndex < 6) {
      // Primeira fase de bans (0-5): distribuir entre os primeiros 3 players
      playerIndex = Math.floor(actionIndex / 2) % Math.min(3, currentTeam.length);
    } else if (actionIndex >= 6 && actionIndex < 11) {
      // Primeira fase de picks (6-10): distribuir entre todos os players
      const pickIndex = actionIndex - 6;
      playerIndex = pickIndex % currentTeam.length;
    } else if (actionIndex >= 11 && actionIndex < 15) {
      // Segunda fase de bans (11-14): usar players 3 e 4 se disponíveis
      const banIndex = actionIndex - 11;
      playerIndex = Math.min(3 + (banIndex % 2), currentTeam.length - 1);
    } else {
      // Segunda fase de picks (15-19): usar players restantes
      const pickIndex = actionIndex - 15;
      playerIndex = Math.min(2 + (pickIndex % 3), currentTeam.length - 1);
    }

    // Garantir que o índice seja válido
    playerIndex = Math.max(0, Math.min(playerIndex, currentTeam.length - 1));

    this.session.currentPlayerIndex = playerIndex;
    const player = currentTeam[playerIndex] || null;

    console.log(`👤 Player atual: ${player?.summonerName || 'Unknown'} (Team: ${currentPhase.team}, Index: ${playerIndex}, Action: ${actionIndex})`);

    return player;
  }

  private isBot(player: any): boolean {
    if (!player) {
      console.log(`🤖 [Bot] Player é null/undefined`);
      return false;
    }

    const name = player.summonerName || player.name || '';
    const id = player.id;

    console.log(`🔍 [Bot] Verificando se é bot:`, { id, name, summonerName: player.summonerName });

    // Verificar por ID negativo (padrão do backend)
    if (id < 0) {
      console.log(`🤖 [Bot] Bot identificado por ID negativo: ${id} (${name})`);
      return true;
    }

    // Verificar por nome
    const isBotByName = name.toLowerCase().startsWith('bot') ||
      name.toLowerCase().includes('bot') ||
      name.toLowerCase().startsWith('bot');

    if (isBotByName) {
      console.log(`🤖 [Bot] Bot identificado por nome: ${name} (ID: ${id})`);
      return true;
    }

    // Verificar se o nome contém "Bot" (case insensitive)
    if (name.toLowerCase().includes('bot')) {
      console.log(`🤖 [Bot] Bot identificado por nome contendo 'bot': ${name} (ID: ${id})`);
      return true;
    }

    console.log(`🤖 [Bot] Player não é bot: ${name} (ID: ${id})`);
    return false;
  }

  private performBotAction(phase: PickBanPhase) {
    console.log(`🤖 [Bot] performBotAction iniciado para fase:`, phase);

    if (!this.session || phase.locked) {
      console.log(`❌ [Bot] Sessão não disponível ou fase bloqueada`);
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

    // Apply the bot's selection
    this.selectedChampion = selectedChampion;
    console.log(`🤖 [Bot] Confirmando seleção...`);
    this.confirmSelection();
  }
  checkIfMyTurn(phase: PickBanPhase) {
    if (!this.currentPlayer || !this.session) return;

    const currentPlayer = this.getCurrentPlayer();

    console.log(`🔍 [Turn] Verificando vez:`, {
      currentPlayerFromSession: currentPlayer?.summonerName,
      currentPlayerFromInput: this.currentPlayer?.summonerName,
      currentPlayerFromSessionId: currentPlayer?.id,
      currentPlayerFromInputId: this.currentPlayer?.id,
      phaseLocked: phase.locked
    });

    // It's my turn if I'm the current player for this action
    const wasMyTurn = this.isMyTurn;
    this.isMyTurn = currentPlayer &&
      (currentPlayer.id === this.currentPlayer.id ||
        currentPlayer.summonerName === this.currentPlayer.summonerName ||
        (currentPlayer.summonerName && this.currentPlayer.summonerName &&
          currentPlayer.summonerName.includes(this.currentPlayer.summonerName.split('#')[0]))) &&
      !phase.locked;

    console.log(`🎯 Vez de: ${currentPlayer?.summonerName || 'Unknown'}, É minha vez: ${this.isMyTurn}`);

    // Abrir modal automaticamente se acabou de ser minha vez
    if (this.isMyTurn && !wasMyTurn && !this.showChampionModal) {
      console.log('🎯 Abrindo modal automaticamente para minha vez');
      setTimeout(() => {
        this.openChampionModal();
      }, 500); // Pequeno delay para garantir que a interface foi atualizada
    }
  }

  getPlayerTeam(): 'blue' | 'red' {
    if (!this.currentPlayer || !this.session) return 'blue';

    const isInBlueTeam = this.session.blueTeam.some(p => p.id === this.currentPlayer.id);
    return isInBlueTeam ? 'blue' : 'red';
  } getFilteredChampions(): Champion[] {
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
    if (!this.selectedChampion || !this.session) return;    // Clear bot timer if active
    if (this.botPickTimer) {
      clearTimeout(this.botPickTimer);
      this.botPickTimer = null;
    }

    const currentPhase = this.session.phases[this.session.currentAction];
    const currentPlayer = this.getCurrentPlayer();

    // Lock the selection
    currentPhase.champion = this.selectedChampion;
    currentPhase.locked = true;
    
    // CORREÇÃO: Incluir informações do jogador que escolheu
    if (currentPlayer) {
      currentPhase.playerId = currentPlayer.id;
      currentPhase.playerName = currentPlayer.summonerName;
      console.log(`✅ ${currentPhase.action} confirmado por ${currentPlayer.summonerName}: ${this.selectedChampion.name}`);
    } else {
      console.log(`✅ ${currentPhase.action} confirmado: ${this.selectedChampion.name} (jogador não identificado)`);
    }

    // Remove selected champion from available list (for picks only)
    if (currentPhase.action === 'pick') {
      // Don't modify the main champions list, filtering happens in getFilteredChampions
    }

    // Move to next action
    this.session.currentAction++;
    this.selectedChampion = null;
    this.session.extendedTime = 0; // Reset extended time

    // Reset timer for next player
    this.timeRemaining = 30;

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
    if (currentPhase.locked) return;

    // Auto-select random champion if time runs out
    const availableChamps = this.getFilteredChampions();
    if (availableChamps.length > 0) {
      this.selectedChampion = availableChamps[0]; // Pick first available
      this.confirmSelection();
    }
  }

  completePickBan() {
    if (!this.session) return;

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

    return this.session.phases
      .filter(p => p.action === 'pick' && p.team === team && p.champion)
      .map(p => p.champion!);
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
    
    return currentPlayer.summonerName || currentPlayer.name || 'Jogador';
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
  }

  /**
   * Filtra campeões para o modal baseado na busca e role
   */
  getModalFilteredChampions(): Champion[] {
    let filtered = this.champions;

    // Filtrar por role
    if (this.modalSelectedRole !== 'all' && this.championsByRole[this.modalSelectedRole]) {
      filtered = this.championsByRole[this.modalSelectedRole];
    }

    // Filtrar campeões banidos
    const bannedChampions = this.getBannedChampions();
    filtered = filtered.filter((champ: Champion) =>
      !bannedChampions.some(banned => banned.id === champ.id)
    );

    // Filtrar campeões já escolhidos (apenas na fase de picks)
    if (this.session && this.session.phase === 'picks') {
      const pickedChampions = this.getTeamPicks('blue').concat(this.getTeamPicks('red'));
      filtered = filtered.filter((champ: Champion) =>
        !pickedChampions.some(picked => picked.id === champ.id)
      );
    }

    // Filtrar por busca (case insensitive)
    if (this.modalSearchFilter.trim()) {
      const searchTerm = this.modalSearchFilter.toLowerCase().trim();
      filtered = filtered.filter(champion => 
        champion.name.toLowerCase().includes(searchTerm)
      );
    }

    return filtered;
  }

  /**
   * Seleciona um campeão no modal
   */
  selectChampionInModal(champion: Champion): void {
    this.modalSelectedChampion = champion;
    this.isConfirming = true;
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
   * Confirma a seleção no modal
   */
  confirmModalSelection(): void {
    if (!this.modalSelectedChampion) return;

    // Usar a seleção do modal para confirmar
    this.selectedChampion = this.modalSelectedChampion;
    this.confirmSelection();
    this.closeChampionModal();
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
   * Obtém o nome do jogador atual
   */
  getCurrentPlayerNameForModal(): string {
    const currentPlayer = this.getCurrentPlayer();
    if (!currentPlayer) return 'Desconhecido';
    
    return currentPlayer.summonerName || currentPlayer.name || 'Jogador';
  }

  /**
   * Obtém o time do jogador atual
   */
  getCurrentPlayerTeamForModal(): string {
    if (!this.session) return '';
    
    const currentPhase = this.session.phases[this.session.currentAction];
    if (!currentPhase) return '';
    
    return currentPhase.team === 'blue' ? 'Time Azul' : 'Time Vermelho';
  }

  /**
   * Obtém a cor do time atual
   */
  getCurrentTeamColor(): string {
    if (!this.session) return '#ffffff';
    
    const currentPhase = this.session.phases[this.session.currentAction];
    if (!currentPhase) return '#ffffff';
    
    return currentPhase.team === 'blue' ? '#5bc0de' : '#d9534f';
  }
}
