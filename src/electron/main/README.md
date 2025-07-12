# Main Process (Electron)

The `main.ts` file (`src/electron/main.ts`) serves as the core of the Electron application. It runs in the main process, which is responsible for managing the application's lifecycle, creating browser windows, handling system-level operations, and orchestrating the backend Node.js server. This file is crucial for bundling the frontend (Angular) and backend (Node.js) into a single desktop executable.

## Purpose

- **Application Lifecycle Management:** Controls the Electron application's startup, shutdown, and various events.
- **Window Management:** Creates and manages `BrowserWindow` instances, including setting their dimensions, preferences, and loading content.
- **Backend Process Orchestration:** Spawns, manages, and terminates the Node.js backend server as a child process.
- **Inter-Process Communication (IPC):** Sets up listeners for `ipcMain` to handle messages from the renderer processes (frontend) and sends messages back to them.
- **Security Configuration:** Configures `webPreferences` for security (e.g., `contextIsolation`, `webSecurity`) and manages Content Security Policy (CSP) headers.
- **Environment Adaptation:** Handles different loading and operational behaviors based on whether the application is running in development or a packaged production environment.
- **Network Management:** Includes logic to detect the local IP address for backend communication.

## Architecture and Key Functionalities

### 1. **Application Entry and Initialization**

- **`app.on('ready')`:** The primary entry point. When Electron is ready, it calls `createWindow()` and `startBackendServer()`, ensuring both the UI and the backend are initialized.
- **`isDev` Detection:** Determines the current environment (`development` or `production`) to adjust paths, logging, and DevTools behavior.
- **Single Instance Lock:** Configured to allow multiple instances in `development` mode for testing P2P features, but typically enforces a single instance in production.

### 2. **Window Management (`createWindow`)**

- **`BrowserWindow` Setup:** Configures the main application window with specific `height`, `width`, `minHeight`, `minWidth`, and `webPreferences`.
- **`webPreferences`:** Critical for security:
  - `nodeIntegration: false`: Prevents renderer processes from accessing Node.js APIs directly.
  - `contextIsolation: true`: Isolates the preload script's context from the web content's context, enhancing security.
  - `preload`: Specifies `preload.js` to expose controlled APIs to the renderer.
  - `webSecurity: true`, `sandbox: false`: Basic web security settings.
  - `partition`: Uses a session with no cache (`no-cache`) for development/testing to ensure fresh content.
- **Content Loading:**
  - In `development`, attempts to load the frontend from `http://localhost:3000` (backend) or `http://localhost:4200` (Angular dev server).
  - In `production`, loads a `loading.html` page first, then transitions to the actual frontend (`index.html`) once the backend is confirmed to be running.
- **DevTools:** Opens DevTools automatically in development and optionally in production for diagnostics.
- **CSP Management:** Intercepts `onHeadersReceived` to explicitly remove Content Security Policy headers, which is often necessary to allow certain Electron or P2P functionalities (e.g., WebSockets) that might otherwise be blocked.

### 3. **Backend Process Management (`startBackendServer`, `testBackendConnectivity`)**

- **Spawning Backend:** Uses `child_process.spawn` to launch the Node.js backend (`server.js`) as a separate process.
- **Output Redirection:** Redirects backend `stdout` and `stderr` to the main Electron process's console for unified logging.
- **Error Handling:** Monitors backend process for `exit` and `error` events to handle crashes or unexpected terminations.
- **Connectivity Test (`testBackendConnectivity`):** Periodically pings the backend's health endpoint (`/health`) to ensure it's ready before loading the frontend. Implements retry logic with delays.
- **Backend URL Detection:** Dynamically determines the backend URL (`http://localhost:3000` or local IP if configured) for both frontend and backend inter-communication.

### 4. **Inter-Process Communication (IPC)**

- **`ipcMain.handle`:** Sets up handlers for synchronous and asynchronous messages from the renderer process (frontend).
- **Exposed APIs:** Handles a range of commands from the renderer, including:
  - `check-backend-health`
  - `start-backend` (only if not already running)
  - `get-local-ip`
  - `minimize-window`, `maximize-window`, `close-window`
  - `open-external-link`
  - `restart-app`
  - `load-frontend` (for transitioning from loading screen)
  - `quit-app`

### 5. **Menu Configuration (`createMenu`)**

- Creates a custom application menu (macOS) or system tray menu (Windows/Linux) with standard options (e.g., `About`, `Quit`) and debug tools (reload, toggle DevTools).

### 6. **Error Handling and Logging**

- Comprehensive `console.log` statements are used throughout for debugging the Electron process and backend interactions.
- Includes `try-catch` blocks for critical operations like window creation and backend startup.
- `app.on('window-all-closed')` and `app.on('activate')` ensure standard macOS and Windows/Linux behaviors for application shutdown and re-activation.

## Usage Flow

1. **Electron Startup:** The Electron executable is launched.
2. **`main.ts` Execution:** The `main` process begins.
3. **Backend Launch:** `startBackendServer()` attempts to spawn the Node.js backend.
4. **Window Creation:** `createWindow()` creates the main browser window.
5. **Backend Wait:** In production, a loading screen is shown, and `waitForBackend()` ensures the backend is responsive.
6. **Frontend Load:** The Angular frontend (`index.html`) is loaded into the `BrowserWindow`.
7. **IPC Handlers:** `ipcMain` listens for commands from the frontend (via `preload.js`).

## Important Considerations

- **Security:** CSP disablement should be used with caution as it weakens web security. Ensure all loaded content and origins are trusted. The `contextIsolation` and `nodeIntegration: false` settings are crucial for security.
- **Bundling:** The `getProductionPaths` function is vital for correctly locating the bundled backend and frontend assets within the Electron's `resources` directory in a packaged application.
- **Cross-Platform Compatibility:** Paths and process spawning logic consider different operating systems (`process.platform`).
- **Debugging:** Extensive logging is included, which is very helpful during development but might need to be toned down for production builds.
- **Backend Lifecycle:** The main process is responsible for the backend's lifecycle. Ensure proper cleanup on application exit.
