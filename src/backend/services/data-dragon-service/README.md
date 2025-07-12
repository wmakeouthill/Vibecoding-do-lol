# `DataDragonService.ts` Documentation

## Overview

The `DataDragonService.ts` module is a crucial backend service responsible for interacting with the Riot Games Data Dragon API. Its primary function is to fetch, cache, and provide comprehensive data about League of Legends champions to other parts of the application, particularly the frontend and other backend services (like `LCUService` for processing participants).

This service ensures that champion-related information, such as names, IDs, images, tags (roles), and statistics, is readily available and efficiently managed through in-memory caching to minimize redundant API calls.

## Interfaces

### `ChampionData`

Defines the structure of detailed champion data retrieved from the Data Dragon API.

```typescript
interface ChampionData {
  id: string; // Champion's ID string (e.g., "Aatrox")
  key: string; // Champion's numerical key (e.g., "266")
  name: string; // Champion's display name
  title: string;
  blurb: string;
  info: { attack: number; defense: number; magic: number; difficulty: number; };
  image: { full: string; sprite: string; group: string; x: number; y: number; w: number; h: number; };
  tags: string[]; // e.g., ["Fighter", "Tank"]
  partype: string; // e.g., "Mana", "Energy"
  stats: { /* ... extensive champion stats ... */ };
}
```

### `DataDragonResponse`

Defines the overall structure of the JSON response from the Data Dragon `champion.json` endpoint.

```typescript
interface DataDragonResponse {
  type: string;
  format: string;
  version: string;
  data: { [championName: string]: ChampionData }; // Object where keys are champion names
}
```

## Class: `DataDragonService`

### Properties

* `private readonly baseUrl: string`: Base URL for the Data Dragon API.
* `private readonly version: string`: Current Data Dragon version (e.g., `15.13.1`).
* `private readonly language: string`: Language code for data retrieval (e.g., `pt_BR`).
* `private championsCache: { [championName: string]: ChampionData }`: In-memory cache for all champion data, keyed by champion name.
* `private championsLoaded: boolean`: Flag indicating whether champion data has been successfully loaded.
* `private championIdToNameMap: { [championId: number]: string }`: Mapping from numerical champion ID to champion name.

### Constructor

The constructor initializes the service with base URL, version, and language, and sets up empty caches.

```typescript
constructor() { /* ... initialization ... */ }
```

### Method: `loadChampions()`

Asynchronously loads all champion data from the Data Dragon API into the `championsCache` and populates the `championIdToNameMap`. This method is idempotent; it will only load data if not already loaded (`championsLoaded` is false).

* **Purpose**: To ensure champion data is available and cached for quick access throughout the application.
* **Logic**: Fetches `champion.json` from Data Dragon, stores the data, and creates a mapping for ID-to-name lookup.
* **Error Handling**: Logs and re-throws errors encountered during the API call.

```typescript
async loadChampions(): Promise<void> { /* ... implementation ... */ }
```

### Method: `getChampionNameById(championId: number): string | null`

Retrieves the champion's official name (key used in Data Dragon URLs) given its numerical ID.

* **Logic**: Uses the `championIdToNameMap` for a quick lookup. If data isn't loaded, it attempts to load it and returns `null`.

### Method: `getChampionByName(championName: string): ChampionData | null`

Retrieves the full `ChampionData` object from the cache using the champion's name.

* **Logic**: Directly accesses `championsCache`. Returns `null` if data is not loaded or champion not found.

### Method: `getChampionById(championId: number): ChampionData | null`

Retrieves the full `ChampionData` object using the champion's numerical ID.

* **Logic**: Combines `getChampionNameById` and `getChampionByName`.

### Method: `getChampionImageUrl(championName: string): string`

Constructs the URL for a champion's square image based on the champion's name, Data Dragon version, and base URL.

### Method: `isLoaded(): boolean`

Returns `true` if champion data has been successfully loaded and cached, `false` otherwise.

### Method: `processParticipants(participants: any[]): any[]`

Takes an array of participant data (e.g., from LCU API) and enriches each participant object by adding the champion's name, image URL, and a detected lane based on Data Dragon tags and stats.

* **Purpose**: To provide more human-readable and contextually rich champion information for frontend display.
* **Logic**: Iterates through participants, uses `getChampionNameById` to find the champion's name, `getChampionImageUrl` for the image, and `detectChampionLane` for lane prediction.

### Method: `private detectChampionLane(championName: string): string`

(Private) Predicts the most likely lane for a given champion based on its tags (roles) and statistics from Data Dragon.

* **Logic**: Implements a scoring system where different tags (e.g., "Marksman", "Fighter") and stats (e.g., `attackrange`, `hp`) contribute points to potential lanes (TOP, JUNGLE, MIDDLE, ADC, SUPPORT). The lane with the highest score is returned. If scores are too low, returns `UNKNOWN`.

### Method: `getAllChampions(): any[]`

Returns an array of all loaded champions, formatted for frontend consumption (simplified structure including `id`, `key`, `name`, `title`, `image`, `tags`, `info`).

### Method: `getChampionsByRole(): any`

Organizes all loaded champions into categories based on their primary roles (top, jungle, mid, adc, support), derived from their Data Dragon tags. Also includes an `all` category with all champions.

* **Logic**: Iterates through all champions and assigns them to relevant role arrays based on a predefined `roleMapping` of tags.

## Dependencies

* `axios`: Used for making HTTP requests to the Data Dragon API.

## Technologies Used

* **Node.js**: Runtime environment.
* **TypeScript**: Provides type safety.
* **Data Dragon API (Riot Games)**: External API for champion data.

## Potential Improvements

* **Cache Invalidation/Refresh**: Implement a mechanism to periodically refresh the champion cache to account for new patches or data updates without requiring a full application restart.
* **Error Handling Granularity**: Add more specific error handling for different failure scenarios (e.g., network issues vs. API rate limits).
* **`detectChampionLane` Refinement**: The lane detection logic could be improved with more sophisticated algorithms or by incorporating external data sources for meta analysis.
* **Version Management**: Automate the Data Dragon version detection to avoid hardcoding it (`this.version`).
