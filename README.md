# LoL Matchmaking Application - Project Overview

## 🎮 General Vision

This project, "Vibecoding-do-lol," is a comprehensive application designed to enhance the League of Legends matchmaking and in-game experience. It comprises three main components: a Backend (Node.js/TypeScript), a Frontend (Angular), and an Electron wrapper, working together to provide a seamless desktop application.

The core idea is to offer advanced matchmaking features, real-time game monitoring, and Discord integration, aiming to provide a richer experience than the standard League of Legends client.

## 🚀 Key Technologies and Architecture

- **Backend:** Built with Node.js and TypeScript, utilizing Express.js for API routes and various services for interacting with Riot Games API, Discord, and managing game states. It's designed for real-time communication and data processing, leveraging WebSockets for instant updates.
- **Frontend:** Developed using Angular, providing a modern and responsive user interface. It consumes data from the backend API and presents game-related information, matchmaking queues, and player statistics. The UI is designed for intuitive navigation and a smooth user experience.
- **Electron:** Acts as a desktop wrapper, bundling the frontend and backend into a single executable. It manages the lifecycle of both applications, handles inter-process communication (IPC), and provides access to native desktop features, ensuring a cohesive desktop experience.
- **Database:** Utilizes a custom flat-file database system (likely JSON or CSV based, given the file structure) for managing custom match data and potentially other persistent information. This approach simplifies deployment by avoiding external database dependencies, though scalability considerations would apply for larger datasets.

## 📦 Project Structure

The project is organized into `src/backend`, `src/frontend`, and `src/electron` directories, each containing its specific logic and components.

- `src/backend`: Contains all server-side logic, API definitions, database interactions, and integrations with external services like Riot Games and Discord. This includes services for data fetching, game state management, and real-time communication.
- `src/frontend`: Houses the user interface, Angular components, services, and styling. It's responsible for rendering the application, handling user input, and displaying data fetched from the backend.
- `src/electron`: Manages the desktop application's main process, handles the startup of the backend and frontend, and facilitates communication between them. It also provides system-level integrations required for a desktop application.

## 🛠️ Setup and Development

Detailed setup instructions for development and production environments are provided within the respective component documentations. Generally, it involves installing Node.js dependencies, building the Angular frontend, and packaging the Electron application. A `scripts` directory is available for automation tasks, such as `wait-for-all-servers.js` and `wait-for-discord.js`, which are crucial for ensuring proper application startup and inter-service dependency management.

## 🔗 Communication and Integration

- **Backend-Frontend:** Communication primarily occurs via RESTful API calls for data retrieval and updates, and WebSockets for real-time updates (e.g., matchmaking status, game events). This dual approach ensures both efficiency for static data and responsiveness for dynamic information.
- **Electron-Backend/Frontend:** Electron's `ipcMain` and `ipcRenderer` modules are used for secure and efficient communication between the main Electron process and the rendered web content (frontend). Electron also manages the spawning and lifecycle of the backend Node.js process, ensuring that all components are running correctly within the desktop environment.
- **Backend-Riot Games API:** The `RiotAPIService` is responsible for interacting with the official Riot Games API to fetch game data, player information, and match history. This service handles API key management, rate limiting, and data parsing to provide a seamless integration.
- **Backend-Discord:** The `DiscordService` handles integration with Discord, potentially for sending notifications, managing Discord bots, or facilitating custom game lobbies.

This document provides a high-level overview. For detailed insights into each component, please refer to their specific documentation files located within their respective directories.
