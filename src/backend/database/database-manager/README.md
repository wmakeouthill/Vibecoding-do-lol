# Database Manager

The `DatabaseManager` class (`src/backend/database/DatabaseManager.ts`) is the central component responsible for all interactions with the MySQL database in the backend. It provides a comprehensive set of methods for managing player data, matchmaking results (both standard and custom matches), queue management, Discord-LoL account linking, application settings, and various data integrity operations.

## Architecture and Technologies

- **MySQL2/Promise:** Utilizes the `mysql2/promise` library for asynchronous interaction with the MySQL database, ensuring efficient and non-blocking database operations.
- **Connection Pooling:** Employs a connection pool to manage database connections, optimizing performance by reusing existing connections and limiting the number of open connections.
- **TypeScript:** Developed in TypeScript, providing strong typing for database models (e.g., `Player`, `Match`) and ensuring type safety across database operations.
- **Environment Variables:** Relies on environment variables (`DB_HOST`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`, `DB_PORT`) for database configuration, promoting flexibility and security.
- **DataDragonService Integration:** Integrates with `DataDragonService` to load champion data, which is essential for processing match-related information (e.g., in `processParticipantsWithDataDragon`).

## Key Responsibilities

- **Database Initialization:** Establishes and tests the database connection, creates necessary tables (`players`, `matches`, `custom_matches`, `discord_lol_links`, `settings`, `queue_players`, `queue_actions`) if they don't exist, and ensures correct character set configurations.
- **Player Management:** Handles creating, retrieving, updating (including MMR and custom LP), and querying player data by summoner name or PUUID.
- **Match Management (Standard & Custom):** Provides functionalities for creating, updating, retrieving, and completing both standard and custom match records. This includes advanced logic for calculating MMR changes, handling pick/ban data, and linking actual game results.
- **Queue Management:** Manages players in the matchmaking queue, including adding, removing, updating status, and cleaning up stale entries. Implements mechanisms to ensure queue integrity.
- **Discord-LoL Linking:** Facilitates the linking and unlinking of Discord accounts with League of Legends accounts, including verification and retrieval of linked data.
- **Application Settings:** Allows for storing and retrieving key-value application settings in the database.
- **Data Integrity and Maintenance:** Includes methods for various maintenance tasks such as fixing match statuses, recalculating custom LP, cleaning up test matches, and refreshing player data from custom matches.
- **Leaderboard Generation:** Generates aggregated player statistics and custom match leaderboards.

## Core Interfaces

- `Player`:
  - Represents a player's profile with fields like `id`, `summoner_name`, `summoner_id`, `puuid`, `region`, `current_mmr`, `peak_mmr`, `games_played`, `wins`, `losses`, `win_streak`.
  - Includes specific fields for custom match statistics: `custom_mmr`, `custom_peak_mmr`, `custom_games_played`, `custom_wins`, `custom_losses`, `custom_win_streak`, `custom_lp`.
- `Match`:
  - Represents a match record with fields such as `id`, `match_id`, `team1_players`, `team2_players`, `winner_team`, `status`, `created_at`, `completed_at`, `riot_game_id`, `pick_ban_data`, `mmr_changes`, and more.

## Key Methods and Functionalities

### Initialization & Setup

- `initialize(): Promise<void>`: Connects to MySQL, creates tables, inserts default settings, and initializes `DataDragonService`.
- `private createTables(): Promise<void>`: Defines and creates all necessary database tables.
- `private ensureCustomMatchesTable(): Promise<void>`: Ensures the `custom_matches` table is properly structured.
- `private insertDefaultSettings(): Promise<void>`: Populates the `settings` table with initial values.

### Player Operations

- `getPlayer(playerId: number): Promise<Player | null>`
- `getPlayerBySummonerName(summonerName: string): Promise<Player | null>`
- `getPlayerByPuuid(puuid: string): Promise<Player | null>`
- `createPlayer(playerData: Omit<Player, 'id'>): Promise<number>`
- `updatePlayerMMR(playerId: number, mmrChange: number): Promise<void>`
- `updatePlayer(playerId: number, updates: any): Promise<void>`
- `updatePlayerNickname(oldName: string, newName: string): Promise<void>`
- `getPlayersCount(): Promise<number>`

### Match Operations (Standard & Custom)

- `createMatch(team1Players: any[], team2Players: any[], avgMMR1: number, avgMMR2: number, extraData: any = {}): Promise<number>`
- `getPlayerMatches(playerId: number, limit: number = 30, offset: number = 0): Promise<Match[]>`
- `getRecentMatches(limit: number = 20): Promise<Match[]>`
- `updateMatchStatus(matchId: number, status: string): Promise<void>`
- `completeMatch(matchId: number, winner: string, mmrChanges: any): Promise<void>`
- `createCustomMatch(matchData: {}): Promise<number>`
- `getCustomMatches(limit: number = 20, offset: number = 0): Promise<any[]>`
- `getCustomMatchById(matchId: number): Promise<any | null>`
- `updateCustomMatch(matchId: number, updateData: any, requestingUser?: string): Promise<void>`
- `updateCustomMatchWithRealData(matchId: number, realMatchData: any): Promise<void>`
- `completeCustomMatch(matchId: number, winnerTeam: number, extraData: any = {}): Promise<void>`
- `deleteCustomMatch(matchId: number): Promise<void>`
- `clearAllCustomMatches(): Promise<number>`
- `getCustomMatchesCount(): Promise<number>`
- `getCustomMatchesByStatus(status: string, limit: number = 20): Promise<any[]>`
- `getActiveCustomMatches(): Promise<any[]>`

### Queue Operations

- `addPlayerToQueue(playerId: number, summonerName: string, region: string, customLp: number, preferences: any): Promise<void>`
- `removePlayerFromQueue(playerId: number): Promise<void>`
- `removePlayerFromQueueBySummonerName(summonerName: string): Promise<boolean>`
- `removeDeclinedPlayers(): Promise<number>`
- `getActiveQueuePlayers(): Promise<any[]>`
- `clearQueue(): Promise<void>`
- `clearAllPlayers(): Promise<void>`
- `recordQueueAction(action: string, playerId?: number, data?: any): Promise<void>`

### Discord Linking

- `createDiscordLink(discordId: string, discordUsername: string, gameName: string, tagLine: string): Promise<number>`
- `getDiscordLink(discordId: string): Promise<any | null>`
- `getDiscordLinkByGameName(gameName: string, tagLine: string): Promise<any | null>`
- `updateDiscordLinkLastUsed(discordId: string): Promise<void>`
- `deleteDiscordLink(discordId: string): Promise<void>`
- `getAllDiscordLinks(): Promise<any[]>`
- `verifyDiscordLink(discordId: string, gameName: string, tagLine: string): Promise<boolean>`
- `getDiscordLinksCount(): Promise<number>`

### Settings

- `getSetting(key: string): Promise<string | null>`
- `setSetting(key: string, value: string): Promise<void>`

### Data Integrity & Reporting

- `cleanupTestMatches(): Promise<{ deletedCount: number, remainingMatches: number, deletedMatches: any[] }>`
- `fixMatchStatus(): Promise<{ affectedMatches: number; playerCount: number }>`
- `recalculateCustomLP(): Promise<{ affectedMatches: number; affectedPlayers: number; details: any[] }>`
- `getParticipantsLeaderboard(limit: number | string = 100): Promise<any[]>`
- `refreshPlayersFromCustomMatches(): Promise<void>`
- `getCustomMatchStats(): Promise<any>`
- `getTablesStats(): Promise<any>`

## Usage

The `DatabaseManager` is typically instantiated once in the application's bootstrap phase (e.g., in `server.ts`) and its methods are then called by various services and routes to interact with the database. It encapsulates all direct database queries, ensuring that the application logic remains decoupled from the underlying database implementation details.

```typescript
// Example in server.ts or another service
import { DatabaseManager } from './database/DatabaseManager';

const dbManager = new DatabaseManager();

async function startApplication() {
  try {
    await dbManager.initialize();
    console.log('Database ready.');
    // Proceed with starting server, etc.
  } catch (error) {
    console.error('Failed to initialize database:', error);
    process.exit(1);
  }
}

startApplication();

// Example of using a method
// async function getPlayerInfo(summonerName: string) {
//   const player = await dbManager.getPlayerBySummonerName(summonerName);
//   if (player) {
//     console.log(`Player ${player.summoner_name} found with MMR: ${player.current_mmr}`);
//   } else {
//     console.log(`Player ${summonerName} not found.`);
//   }
// }
```

## Considerations

- **Error Handling:** Each method includes `try-catch` blocks to handle database errors, logging them and rethrowing for higher-level error management.
- **Schema Migrations:** While `createTables` handles initial table creation, for production environments, a dedicated schema migration tool would be beneficial for managing database schema changes over time.
- **Performance:** Connection pooling and asynchronous operations contribute to good performance. For extremely high-load scenarios, further optimizations like indexing and query tuning might be required.
- **Security:** Relies on environment variables for credentials. Ensure these are securely managed in production deployments.
- **LP Calculation Logic:** The `calculateLPChange` method implements a specific algorithm for LP changes in custom matches. This logic should be well-understood and potentially configurable.
