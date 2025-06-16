// Shared interfaces for League of Legends Matchmaking App

export interface Player {
  id: number;
  summonerName: string;
  summonerId?: string;
  puuid?: string;
  tagLine?: string;
  profileIconId?: number;
  summonerLevel?: number;
  currentMMR: number;
  mmr?: number; // Alias para currentMMR
  region: string;
  rank?: {
    tier: string;
    rank: string;
    display: string;
    lp?: number;
  };
  wins?: number;
  losses?: number;
  lastMatchDate?: Date;  rankedData?: {
    soloQueue?: any;
    flexQueue?: any;
  };
}

export interface QueueStatus {
  playersInQueue: number;
  averageWaitTime: number;
  estimatedMatchTime?: number;
  isActive?: boolean;
  yourPosition?: number;
}

export interface Lane {
  id: string;
  name: string;
  icon: string;
  description: string;
}

export interface QueuePreferences {
  primaryLane: string;
  secondaryLane: string;
  autoAccept?: boolean;
}

export interface LCUStatus {
  isConnected: boolean;
  summoner?: any;
  gameflowPhase?: string;
  lobby?: any;
}

export interface MatchFound {
  matchId: number;
  team1: any[];
  team2: any[];
  yourTeam: number;
  averageMMR1: number;
  averageMMR2: number;
}

export interface Notification {
  id: string;
  type: 'success' | 'error' | 'warning' | 'info';
  title: string;
  message: string;
  timestamp: Date;
}

export interface CurrentGame {
  session: any;
  phase: string;
  isInGame: boolean;
}

export interface Match {
  id: string | number;
  createdAt?: Date;
  timestamp?: number;
  duration: number;
  team1?: any[];
  team2?: any[];
  winner?: number;
  averageMMR1?: number;
  averageMMR2?: number;
  isVictory?: boolean;
  mmrChange?: number;
  gameMode?: string;  playerStats?: {
    champion: string;
    kills: number;
    deaths: number;
    assists: number;
    mmrChange: number;
    isWin: boolean;
    championLevel?: number;
    doubleKills?: number;
    tripleKills?: number;
    quadraKills?: number;
    pentaKills?: number;
    items?: number[];
    lpChange?: number;
  };
}

export interface RefreshPlayerResponse {
  success: boolean;
  player: Player | null;
  error?: string;
}
