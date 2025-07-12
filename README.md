# LoL Matchmaking Application - Project Overview

## 🎮 General Vision

This project, "Vibecoding-do-lol," is a comprehensive application designed to enhance the League of Legends matchmaking and in-game experience. It comprises three main components: a Backend (Node.js/TypeScript), a Frontend (Angular), and an Electron wrapper, working together to provide a seamless desktop application.

The core idea is to offer advanced matchmaking features, real-time game monitoring, and Discord integration, aiming to provide a richer experience than the standard League of Legends client.

## 🚀 Key Technologies and Architecture

- **Backend:** Built with Node.js and TypeScript, utilizing Express.js for API routes and various services for interacting with Riot Games API, Discord, and managing game states. It's designed for real-time communication and data processing, leveraging WebSockets for instant updates.
- **Frontend:** Developed using Angular, providing a modern and responsive user interface. It consumes data from the backend API and presents game-related information, matchmaking queues, and player statistics. The UI is designed for intuitive navigation and a smooth user experience.
- **Electron:** Acts as a desktop wrapper, bundling the frontend and backend into a single executable. It manages the lifecycle of both applications, handles inter-process communication (IPC), and provides access to native desktop features, ensuring a cohesive desktop experience.
- **Database:** Utilizes a MySQL database for managing custom match data, player profiles, queues, and other persistent information. This approach ensures data integrity, scalability, and robust querying capabilities. Some legacy or development scripts might interact with SQLite for specific, isolated functionalities.

## 📦 Project Structure and Detailed Documentation

The project is organized into `src/backend`, `src/frontend`, and `src/electron` directories, each containing its specific logic and components. Detailed documentation for each major module and its sub-components can be found in their respective `README.md` files.

### [Backend Module Documentation](src/backend/DOCUMENTACAO-BACKEND.md)

The `src/backend` directory houses all server-side logic, API definitions, database interactions, and integrations with external services like Riot Games and Discord. This includes services for data fetching, game state management, and real-time communication.

- **Key Components:**
  - **[`server.ts`](src/backend/DOCUMENTACAO-BACKEND.md#--arquivo-serverts-servidor-principal):** The main Express.js server entry point, handling global setup, middlewares, and service initialization.
  - **`database/`:** Contains database management (`DatabaseManager.ts`) and utility scripts ([`clear_custom_matches.js`](src/backend/database/clear-custom-matches/README.md), [`reset_custom_matches.ts`](src/backend/database/reset-custom-matches/README.md)).
    - **[`DatabaseManager.ts`](src/backend/database/database-manager/README.md):** Centralized class for all MySQL database interactions.
  - **`routes/`:** Defines API endpoints, e.g., [`champions.ts`](src/backend/routes/champions-route/README.md).
  - **`services/`:** Encapsulates business logic, including:
    - [`DataDragonService.ts`](src/backend/services/data-dragon-service/README.md)
    - [`DiscordService.ts`](src/backend/services/discord-service/README.md)
    - [`DraftService.ts`](src/backend/services/draft-service/README.md)
    - [`GameInProgressService.ts`](src/backend/services/game-in-progress-service/README.md)
    - [`LCUService.ts`](src/backend/services/lcu-service/README.md)
    - [`MatchFoundService.ts`](src/backend/services/match-found-service/README.md)
    - [`MatchHistoryService.ts`](src/backend/services/match-history-service/README.md)
    - [`MatchmakingService.ts`](src/backend/services/matchmaking-service/README.md)
    - [`PlayerService.ts`](src/backend/services/player-service/README.md)
    - [`RiotAPIService.ts`](src/backend/services/riot-api-service/README.md)
    - [`signaling-server.ts`](src/backend/services/signaling-server/README.md)
  - **[`test-env.js`](src/backend/test-env/README.md):** Utility for checking backend environment variables.

### [Frontend Module Documentation](src/frontend/DOCUMENTACAO-FRONTEND.md)

The `src/frontend` directory contains the Angular application, responsible for rendering the user interface, handling user input, and displaying data fetched from the backend.

- **Key Components (`src/frontend/src/app/`):**
  - **[`app.ts`](src/frontend/src/app/DOCUMENTACAO-FRONTEND.md#--arquivo-appts-app-componente-principal):** The root Angular component, orchestrating global state and view management.
  - **[`app.config.ts`](src/frontend/src/app/app.config/README.md):** Global Angular application configuration.
  - **[`app.routes.ts`](src/frontend/src/app/app.routes/README.md):** Angular routing definitions (currently using imperative view management).
  - **`app-simple.html`:** The primary HTML template for the root component.
  - **[`app.scss`](src/frontend/src/app/DOCUMENTACAO-FRONTEND.md#--arquivo-appscss-estilos-globais):** Global SCSS styles for the application's visual theme.
  - **[`app.spec.ts`](src/frontend/src/app/DOCUMENTACAO-FRONTEND.md#--arquivo-appspects-testes-unitarios):** Unit tests for the root `App` component.
  - **[`interfaces.ts`](src/frontend/src/app/README.md#documentação-interfacests):** Centralized TypeScript interface definitions.
  - **`components/`:** Various UI components:
    - [`custom-pick-ban/`](src/frontend/src/app/components/custom-pick-ban/README.md)
    - [`dashboard/`](src/frontend/src/app/components/dashboard/README.md)
    - [`draft/`](src/frontend/src/app/components/draft/README.md) (includes [`draft-champion-modal/`](src/frontend/src/app/components/draft/draft-champion-modal/README.md), [`draft-confirmation-modal/`](src/frontend/src/app/components/draft/draft-confirmation-modal/README.md), [`draft-pick-ban/`](src/frontend/src/app/components/draft/draft-pick-ban/README.md))
    - [`game-in-progress/`](src/frontend/src/app/components/game-in-progress/README.md)
    - [`lane-selector/`](src/frontend/src/app/components/lane-selector/README.md)
    - [`leaderboard/`](src/frontend/src/app/components/leaderboard/README.md)
    - [`match-found/`](src/frontend/src/app/components/match-found/README.md)
    - [`match-history/`](src/frontend/src/app/components/match-history/README.md)
    - [`queue/`](src/frontend/src/app/components/queue/README.md)
  - **`services/`:** Business logic and API communication services:
    - [`api.ts`](src/frontend/src/app/services/api.service/README.md)
    - [`bot.service.ts`](src/frontend/src/app/services/bot.service/README.md)
    - [`champion.service.ts`](src/frontend/src/app/services/champion.service/README.md)
    - [`discord-integration.service.ts`](src/frontend/src/app/services/discord-integration.service/README.md)
    - [`match-linking.ts`](src/frontend/src/app/services/match-linking/README.md)
    - [`player-search.ts`](src/frontend/src/app/services/player-search/README.md)
    - [`profile-icon.service.ts`](src/frontend/src/app/services/profile-icon.service/README.md)
    - [`queue-state.ts`](src/frontend/src/app/services/queue-state/README.md)
  - **[`main.ts`](src/frontend/src/main/README.md):** The primary bootstrapping file for the Angular application.
  - **[`styles.scss`](src/frontend/src/styles/README.md):** Global stylesheet for shared styles.

### [Electron Module Documentation](src/electron/DOCUMENTACAO-ELECTRON.md)

The `src/electron` directory manages the desktop application's main process, handles the startup of the backend and frontend, and facilitates communication between them, providing system-level integrations.

- **Key Components:**
  - **[`main.ts`](src/electron/main/README.md):** The main process file for the Electron application, controlling window management, backend orchestration, and IPC.
  - **[`preload.ts`](src/electron/preload/README.md):** A secure bridge exposing controlled APIs from the main process to the frontend (renderer process).
  - **[`backend-starter.js`](src/electron/backend-starter/README.md):** Utility script for robustly launching and managing the Node.js backend server.
  - **[`error.html`](src/electron/error/README.md):** A static HTML page for displaying critical application loading errors.
  - **[`tsconfig.json`](src/electron/tsconfig/README.md):** TypeScript configuration for the Electron main process and preload scripts.

## 🛠️ Setup and Development

Detailed setup instructions for development and production environments are provided within the respective component documentations. Generally, it involves installing Node.js dependencies, building the Angular frontend, and packaging the Electron application. A `scripts` directory is available for automation tasks, such as `wait-for-all-servers.js` and `wait-for-discord.js`, which are crucial for ensuring proper application startup and inter-service dependency management.

## 🔗 Communication and Integration

- **Backend-Frontend:** Communication primarily occurs via RESTful API calls for data retrieval and updates, and WebSockets for real-time updates (e.g., matchmaking status, game events). This dual approach ensures both efficiency for static data and responsiveness for dynamic information.
- **Electron-Backend/Frontend:** Electron's `ipcMain` and `ipcRenderer` modules are used for secure and efficient communication between the main Electron process and the rendered web content (frontend). Electron also manages the spawning and lifecycle of the backend Node.js process, ensuring that all components are running correctly within the desktop environment.
- **Backend-Riot Games API:** The `RiotAPIService` is responsible for interacting with the official Riot Games API to fetch game data, player information, and match history. This service handles API key management, rate limiting, and data parsing to provide a seamless integration.
- **Backend-Discord:** The `DiscordService` handles integration with Discord, potentially for sending notifications, managing Discord bots, or facilitating custom game lobbies.

This document provides a high-level overview. For detailed insights into each component, please refer to their specific documentation files located within their respective directories.
