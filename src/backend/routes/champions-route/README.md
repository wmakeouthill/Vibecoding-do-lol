# Champions Routes

This directory, `src/backend/routes/champions-route/`, contains the Express.js routes responsible for serving League of Legends champion data to the frontend application. It primarily interacts with the `DataDragonService` to retrieve and format champion information.

## `champions.ts`

This file defines the API endpoints related to champion data. It exports a `setupChampionRoutes` function that takes the Express `app` instance and an initialized `DataDragonService` as arguments to set up the routes.

### Responsibilities

- **Champion Data Exposure:** Provides endpoints for the frontend to fetch all champions and champions filtered by role.
- **DataDragonService Integration:** Leverages the `DataDragonService` to access pre-loaded and organized champion data.
- **Data Loading Assurance:** Ensures that champion data is loaded into the `DataDragonService` if it hasn't been already, preventing requests from failing due to uninitialized data.
- **Error Handling:** Implements basic error handling for API requests, returning appropriate HTTP status codes and error messages.

### Endpoints

#### `GET /api/champions`

- **Purpose:** Retrieves a comprehensive list of all League of Legends champions and champions organized by their roles.
- **Request:** No parameters required.
- **Response:**
  - `200 OK`: A JSON object containing:
    - `success: true`
    - `champions: Champion[]` (An array of all champion objects)
    - `championsByRole: ChampionsByRole` (An object grouping champions by role: `top`, `jungle`, `mid`, `adc`, `support`, `all`)
    - `total: number` (The total number of champions)
  - `500 Internal Server Error`: A JSON object with `success: false` and an `error` message if an issue occurs during data retrieval or processing.
- **Logic:** Calls `dataDragonService.getAllChampions()` and `dataDragonService.getChampionsByRole()`. If `DataDragonService` is not loaded, it triggers `dataDragonService.loadChampions()` before fetching data.

#### `GET /api/champions/role/:role`

- **Purpose:** Retrieves a list of champions filtered by a specific role.
- **Request:**
  - URL Parameter: `:role` (e.g., `top`, `jungle`, `mid`, `adc`, `support`).
- **Response:**
  - `200 OK`: A JSON object containing:
    - `success: true`
    - `champions: Champion[]` (An array of champion objects belonging to the specified role)
    - `role: string` (The requested role)
    - `total: number` (The total number of champions for that role)
  - `500 Internal Server Error`: A JSON object with `success: false` and an `error` message.
- **Logic:** Retrieves the specified `role` from the request parameters. Calls `dataDragonService.getChampionsByRole()` and then filters the results based on the provided role. If the `DataDragonService` is not loaded, it loads the champions before processing.

### Dependencies

- `express`: Used for defining and handling API routes.
- `DataDragonService` (from `../services/DataDragonService`): The core service for fetching and managing League of Legends Data Dragon champion data.

### Usage

The `setupChampionRoutes` function is typically called in the main `server.ts` file to initialize the champion-related API endpoints.

```typescript
// In server.ts
import express from 'express';
import { setupChampionRoutes } from './routes/champions';
import { DataDragonService } from './services/DataDragonService';

const app = express();
const dataDragonService = new DataDragonService(); // Ensure DataDragonService is initialized

// ... (other app configurations)

setupChampionRoutes(app, dataDragonService);

// ... (start server)
```

## Technologies

- **Node.js:** Backend runtime environment.
- **Express.js:** Web framework for handling HTTP requests and routing.
- **TypeScript:** Ensures type safety and improves code maintainability.
- **Data Dragon API (via `DataDragonService`):** Source of League of Legends game data.
