import { Component, Input, Output, EventEmitter, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

interface Champion {
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
  isLeader: boolean;
  leaderCanExtend: boolean;
  extendedTime: number;
  phases: PickBanPhase[];
  blueTeam: any[];
  redTeam: any[];
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
  searchFilter: string = '';
  selectedChampion: Champion | null = null;
  timeRemaining: number = 30;
  isMyTurn: boolean = false;

  private timer: any = null;

  // Mock champions data (in real app, load from Riot API)
  private mockChampions: Champion[] = [
    { id: 1, name: 'Aatrox', image: 'https://ddragon.leagueoflegends.com/cdn/15.12.1/img/champion/Aatrox.png' },
    { id: 2, name: 'Ahri', image: 'https://ddragon.leagueoflegends.com/cdn/15.12.1/img/champion/Ahri.png' },
    { id: 3, name: 'Akali', image: 'https://ddragon.leagueoflegends.com/cdn/15.12.1/img/champion/Akali.png' },
    { id: 4, name: 'Ashe', image: 'https://ddragon.leagueoflegends.com/cdn/15.12.1/img/champion/Ashe.png' },
    { id: 5, name: 'Azir', image: 'https://ddragon.leagueoflegends.com/cdn/15.12.1/img/champion/Azir.png' },
    { id: 6, name: 'Blitzcrank', image: 'https://ddragon.leagueoflegends.com/cdn/15.12.1/img/champion/Blitzcrank.png' },
    { id: 7, name: 'Braum', image: 'https://ddragon.leagueoflegends.com/cdn/15.12.1/img/champion/Braum.png' },
    { id: 8, name: 'Caitlyn', image: 'https://ddragon.leagueoflegends.com/cdn/15.12.1/img/champion/Caitlyn.png' },
    { id: 9, name: 'Cassiopeia', image: 'https://ddragon.leagueoflegends.com/cdn/15.12.1/img/champion/Cassiopeia.png' },
    { id: 10, name: 'Darius', image: 'https://ddragon.leagueoflegends.com/cdn/15.12.1/img/champion/Darius.png' }
  ];

  ngOnInit() {
    this.champions = this.mockChampions;
    this.initializePickBanSession();
    this.startTimer();
  }

  ngOnDestroy() {
    if (this.timer) {
      clearInterval(this.timer);
    }
  }

  initializePickBanSession() {
    if (!this.matchData) return;

    // Create the pick/ban sequence (similar to LoL)
    const phases: PickBanPhase[] = [
      // Bans phase
      { team: 'blue', action: 'ban', locked: false, timeRemaining: 30 },
      { team: 'red', action: 'ban', locked: false, timeRemaining: 30 },
      { team: 'blue', action: 'ban', locked: false, timeRemaining: 30 },
      { team: 'red', action: 'ban', locked: false, timeRemaining: 30 },
      { team: 'blue', action: 'ban', locked: false, timeRemaining: 30 },
      { team: 'red', action: 'ban', locked: false, timeRemaining: 30 },

      // Picks phase
      { team: 'blue', action: 'pick', locked: false, timeRemaining: 30 },
      { team: 'red', action: 'pick', locked: false, timeRemaining: 30 },
      { team: 'red', action: 'pick', locked: false, timeRemaining: 30 },
      { team: 'blue', action: 'pick', locked: false, timeRemaining: 30 },
      { team: 'blue', action: 'pick', locked: false, timeRemaining: 30 },
      { team: 'red', action: 'pick', locked: false, timeRemaining: 30 },
      { team: 'red', action: 'pick', locked: false, timeRemaining: 30 },
      { team: 'blue', action: 'pick', locked: false, timeRemaining: 30 },
      { team: 'blue', action: 'pick', locked: false, timeRemaining: 30 },
      { team: 'red', action: 'pick', locked: false, timeRemaining: 30 }
    ];

    this.session = {
      id: this.matchData.id || 'custom_session_' + Date.now(),
      phase: 'bans',
      currentAction: 0,
      isLeader: this.isLeader,
      leaderCanExtend: true,
      extendedTime: 0,
      phases: phases,
      blueTeam: this.matchData.team1 || [],
      redTeam: this.matchData.team2 || []
    };

    this.updateCurrentTurn();
  }

  updateCurrentTurn() {
    if (!this.session || this.session.currentAction >= this.session.phases.length) {
      this.completePickBan();
      return;
    }

    const currentPhase = this.session.phases[this.session.currentAction];
    this.timeRemaining = currentPhase.timeRemaining + this.session.extendedTime;

    // Update phase status
    if (this.session.currentAction < 6) {
      this.session.phase = 'bans';
    } else {
      this.session.phase = 'picks';
    }

    // Check if it's the current player's turn
    this.checkIfMyTurn(currentPhase);
  }

  checkIfMyTurn(phase: PickBanPhase) {
    if (!this.currentPlayer || !this.session) return;

    const playerTeam = this.getPlayerTeam();
    this.isMyTurn = phase.team === playerTeam && !phase.locked;
  }

  getPlayerTeam(): 'blue' | 'red' {
    if (!this.currentPlayer || !this.session) return 'blue';

    const isInBlueTeam = this.session.blueTeam.some(p => p.id === this.currentPlayer.id);
    return isInBlueTeam ? 'blue' : 'red';
  }

  getFilteredChampions(): Champion[] {
    if (!this.searchFilter.trim()) return this.champions;

    return this.champions.filter(champ =>
      champ.name.toLowerCase().includes(this.searchFilter.toLowerCase())
    );
  }

  selectChampion(champion: Champion) {
    if (!this.isMyTurn) return;

    this.selectedChampion = champion;
  }

  confirmSelection() {
    if (!this.selectedChampion || !this.session) return;

    const currentPhase = this.session.phases[this.session.currentAction];

    // Lock the selection
    currentPhase.champion = this.selectedChampion;
    currentPhase.locked = true;
    currentPhase.playerId = this.currentPlayer?.id;
    currentPhase.playerName = this.currentPlayer?.name;

    // Remove selected champion from available list (for picks)
    if (currentPhase.action === 'pick') {
      this.champions = this.champions.filter(c => c.id !== this.selectedChampion!.id);
    }

    // Move to next action
    this.session.currentAction++;
    this.selectedChampion = null;
    this.session.extendedTime = 0; // Reset extended time

    this.updateCurrentTurn();
  }

  // Leader-only function to extend time
  extendTime() {
    if (!this.isLeader || !this.session || !this.session.leaderCanExtend) return;

    this.session.extendedTime += 30; // Add 30 seconds
    this.session.leaderCanExtend = false; // Can only extend once per turn
    this.timeRemaining += 30;
  }

  // Leader-only function to force pick for inactive player
  forceRandomPick() {
    if (!this.isLeader || !this.session) return;

    const availableChamps = this.getFilteredChampions();
    if (availableChamps.length === 0) return;

    const randomChamp = availableChamps[Math.floor(Math.random() * availableChamps.length)];
    this.selectedChampion = randomChamp;
    this.confirmSelection();
  }

  startTimer() {
    this.timer = setInterval(() => {
      this.timeRemaining--;

      if (this.timeRemaining <= 0) {
        this.handleTimeOut();
      }
    }, 1000);
  }

  handleTimeOut() {
    if (!this.session) return;

    // Auto-select random champion if time runs out
    if (this.isMyTurn && !this.selectedChampion) {
      const availableChamps = this.getFilteredChampions();
      if (availableChamps.length > 0) {
        this.selectedChampion = availableChamps[0]; // Pick first available
        this.confirmSelection();
      }
    } else if (this.isLeader) {
      // Leader can force next action
      this.forceRandomPick();
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
}
