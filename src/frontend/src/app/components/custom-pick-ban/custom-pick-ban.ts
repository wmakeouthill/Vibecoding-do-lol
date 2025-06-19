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

  private timer: any = null;
  private botPickTimer: any = null;

  constructor(private championService: ChampionService) {}
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
    console.log('📊 matchData disponível:', !!this.matchData);
    console.log('👤 currentPlayer:', this.currentPlayer);

    if (!this.matchData) {
      console.warn('⚠️ matchData não está disponível, criando dados de teste');
      // Criar dados de teste para desenvolvimento
      this.matchData = {
        id: 'test_match_' + Date.now(),
        team1: [
          { id: 1, summonerName: 'TestPlayer1', name: 'TestPlayer1' },
          { id: 2, summonerName: 'TestPlayer2', name: 'TestPlayer2' },
          { id: 3, summonerName: 'Bot1', name: 'Bot1' },
          { id: 4, summonerName: 'Bot2', name: 'Bot2' },
          { id: 5, summonerName: 'Bot3', name: 'Bot3' }
        ],
        team2: [
          { id: 6, summonerName: 'Bot4', name: 'Bot4' },
          { id: 7, summonerName: 'Bot5', name: 'Bot5' },
          { id: 8, summonerName: 'Bot6', name: 'Bot6' },
          { id: 9, summonerName: 'Bot7', name: 'Bot7' },
          { id: 10, summonerName: 'Bot8', name: 'Bot8' }
        ]
      };
    }

    // Se não temos currentPlayer, vamos usar o primeiro player do time azul como padrão para teste
    if (!this.currentPlayer && this.matchData) {
      this.currentPlayer = this.matchData.team1[0];
      console.log('🎮 Usando player padrão para teste:', this.currentPlayer);
    }// Create the pick/ban sequence (seguindo exatamente o padrão do LoL)
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
    ];this.session = {
      id: this.matchData.id || 'custom_session_' + Date.now(),
      phase: 'bans',
      currentAction: 0,
      extendedTime: 0,
      phases: phases,
      blueTeam: this.matchData.team1 || [],
      redTeam: this.matchData.team2 || [],
      currentPlayerIndex: 0
    };

    console.log('✅ Sessão Pick&Ban criada:', this.session);
    this.updateCurrentTurn();
  }  updateCurrentTurn() {
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
    if (!this.session) return;

    const currentPlayer = this.getCurrentPlayer();

    // Check if current player is a bot
    if (currentPlayer && this.isBot(currentPlayer)) {
      console.log(`🤖 Bot ${currentPlayer.summonerName || currentPlayer.name} irá fazer ${phase.action} automaticamente`);

      // Clear any existing bot timer
      if (this.botPickTimer) {
        clearTimeout(this.botPickTimer);
      }

      // Auto-pick/ban after 2 seconds
      this.botPickTimer = setTimeout(() => {
        this.performBotAction(phase);
      }, 2000);
    }
  }
  private getCurrentPlayer(): any {
    if (!this.session) return null;

    const currentPhase = this.session.phases[this.session.currentAction];
    const currentTeam = currentPhase.team === 'blue' ? this.session.blueTeam : this.session.redTeam;

    // Mapeamento específico para cada posição no draft
    let playerIndex = 0;

    // Distribuir as ações entre os 5 players de cada time
    const actionIndex = this.session.currentAction;

    if (actionIndex < 6) {
      // Primeira fase de bans (0-5): distribui entre os primeiros 3 players
      playerIndex = Math.floor(actionIndex / 2) % 3; // 0, 1, 2
    } else if (actionIndex >= 6 && actionIndex < 11) {
      // Primeira fase de picks (6-10): distribui entre diferentes players
      const pickIndex = actionIndex - 6;
      if (pickIndex === 0) playerIndex = 0; // Primeiro pick sempre player 0
      else if (pickIndex === 1) playerIndex = 0; // Red team primeiro pick
      else if (pickIndex === 2) playerIndex = 1; // Red team segundo pick
      else if (pickIndex === 3) playerIndex = 1; // Blue team segundo pick
      else if (pickIndex === 4) playerIndex = 2; // Blue team terceiro pick
    } else if (actionIndex >= 11 && actionIndex < 15) {
      // Segunda fase de bans (11-14): players 3 e 4
      const banIndex = actionIndex - 11;
      playerIndex = 3 + (banIndex % 2); // 3 ou 4
    } else {
      // Segunda fase de picks (15-19): players restantes
      const pickIndex = actionIndex - 15;
      if (pickIndex === 0) playerIndex = 2; // Red pick 3
      else if (pickIndex === 1) playerIndex = 3; // Blue pick 4
      else if (pickIndex === 2) playerIndex = 3; // Red pick 4
      else if (pickIndex === 3) playerIndex = 4; // Blue pick 5
      else if (pickIndex === 4) playerIndex = 4; // Red pick 5
    }

    // Garantir que o índice não exceda o tamanho do time
    playerIndex = playerIndex % currentTeam.length;

    this.session.currentPlayerIndex = playerIndex;
    const player = currentTeam[playerIndex] || null;

    console.log(`👤 Player atual: ${player?.summonerName || 'Unknown'} (Team: ${currentPhase.team}, Index: ${playerIndex})`);

    return player;
  }

  private isBot(player: any): boolean {
    const name = player.summonerName || player.name || '';
    return name.toLowerCase().startsWith('bot') ||
           name.toLowerCase().includes('bot') ||
           player.id < 0; // Negative IDs typically indicate bots
  }

  private performBotAction(phase: PickBanPhase) {
    if (!this.session || phase.locked) return;

    const availableChampions = this.getFilteredChampions();
    if (availableChampions.length === 0) return;

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

    console.log(`🤖 Bot auto-selecionou: ${selectedChampion.name} (${phase.action})`);

    // Apply the bot's selection
    this.selectedChampion = selectedChampion;
    this.confirmSelection();
  }
  checkIfMyTurn(phase: PickBanPhase) {
    if (!this.currentPlayer || !this.session) return;

    const currentPlayer = this.getCurrentPlayer();

    // It's my turn if I'm the current player for this action
    this.isMyTurn = currentPlayer &&
                   (currentPlayer.id === this.currentPlayer.id ||
                    currentPlayer.summonerName === this.currentPlayer.summonerName) &&
                   !phase.locked;

    console.log(`🎯 Vez de: ${currentPlayer?.summonerName || 'Unknown'}, É minha vez: ${this.isMyTurn}`);
  }

  getPlayerTeam(): 'blue' | 'red' {
    if (!this.currentPlayer || !this.session) return 'blue';

    const isInBlueTeam = this.session.blueTeam.some(p => p.id === this.currentPlayer.id);
    return isInBlueTeam ? 'blue' : 'red';
  }  getFilteredChampions(): Champion[] {
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
  }  confirmSelection() {
    if (!this.selectedChampion || !this.session) return;    // Clear bot timer if active
    if (this.botPickTimer) {
      clearTimeout(this.botPickTimer);
      this.botPickTimer = null;
    }

    const currentPhase = this.session.phases[this.session.currentAction];

    // Lock the selection
    currentPhase.champion = this.selectedChampion;
    currentPhase.locked = true;
    currentPhase.playerId = this.currentPlayer?.id;
    currentPhase.playerName = this.currentPlayer?.name;

    console.log(`✅ ${currentPhase.action} confirmado: ${this.selectedChampion.name}`);

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

    // Emit completed pick/ban data
    const result = {
      sessionId: this.session.id,
      bans: this.session.phases.filter(p => p.action === 'ban' && p.champion),
      picks: this.session.phases.filter(p => p.action === 'pick' && p.champion),
      blueTeamPicks: this.session.phases.filter(p => p.action === 'pick' && p.team === 'blue' && p.champion),
      redTeamPicks: this.session.phases.filter(p => p.action === 'pick' && p.team === 'red' && p.champion)
    };

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
    const currentPlayer = this.getCurrentPlayer();
    if (!currentPlayer) return 'Aguardando...';

    const name = currentPlayer.summonerName || currentPlayer.name || 'Jogador';
    const currentPhase = this.session?.phases[this.session.currentAction];
    const action = currentPhase?.action === 'ban' ? 'banindo' : 'escolhendo';

    return `${name} está ${action}`;
  }
}
