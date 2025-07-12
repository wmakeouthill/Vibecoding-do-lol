# Backend Starter (Electron)

The `backend-starter.js` script (`src/electron/backend-starter.js`) is a critical utility within the Electron application responsible for robustly launching and managing the Node.js backend server. Its primary function is to detect the correct Node.js executable, handle file path complexities in packaged (asar) and development environments, and ensure the backend server is running and accessible.

## Purpose

- **Automated Backend Launch:** Automatically starts the Node.js backend server when the Electron application launches.
- **Environment Adaptation:** Intelligently adapts to different execution environments (development vs. packaged production) to locate backend files and Node.js executables.
- **ASAR Archive Handling:** Manages the extraction of backend files and `node_modules` from Electron's `.asar` archives if necessary, making them accessible to the spawned Node.js process.
- **Node.js Detection:** Searches for and validates available Node.js executables on the user's system.
- **Robust Startup:** Implements retry mechanisms and connectivity tests to ensure the backend starts successfully and is responsive.
- **Unified Logging:** Redirects backend output to the Electron main process console for centralized debugging.

## Architecture and Key Functionalities

### 1. **Node.js Executable Discovery (`findNodeExecutables`, `testNodeExecutable`, `findWorkingNode`)**

- **`findNodeExecutables()`:** Populates a list of common Node.js installation paths (Program Files, AppData, PATH environment variable) to identify potential executables.
- **`testNodeExecutable(nodePath)`:** Attempts to run `node --version` for a given path to verify if it's a functional Node.js executable.
- **`findWorkingNode()`:** Iterates through the discovered paths, using `testNodeExecutable` to find the first functional Node.js executable. If none is found, it reports an error and prevents backend startup.

### 2. **Path Resolution and ASAR Extraction (`startBackend`, `extractFromAsar`, `copyRecursiveSync`)**

- **`startBackend(backendPath, nodeModulesPath)`:** The main method to initiate backend startup. It receives paths to the bundled backend `server.js` and `node_modules`.
- **ASAR Detection & Extraction:**
  - Detects if the backend files are located within an Electron `.asar` archive (`isInsideAsar`).
  - If they are inside an `.asar` and not directly accessible (e.g., if `extraResources` is not configured to extract them by default), it extracts the backend files and `node_modules` to a temporary directory using `extractFromAsar`.
  - This is crucial because Node.js child processes cannot directly execute files from within `.asar` archives.
- **`extractFromAsar(asarPath, destinationPath)`:** Handles copying files or recursively copying directories from the `.asar` archive to a specified temporary location. Includes basic error handling.
- **`copyRecursiveSync(src, dest)`:** A helper function for recursive directory copying, used by `extractFromAsar`.

### 3. **Backend Process Spawning and Management (`attemptStart`)**

- **`attemptStart(nodePath, backendPath, backendDir, env)`:** This method is called repeatedly with retries to launch the backend.
- **`child_process.spawn`:** Uses Node.js `spawn` to execute the discovered Node.js executable with `server.js` as an argument.
- **Environment Variables:** Sets crucial environment variables for the spawned backend process, including `NODE_PATH` (pointing to extracted `node_modules`), `NODE_ENV` (set to `production`), and performance-related Node.js options (`UV_THREADPOOL_SIZE`, `NODE_OPTIONS`).
- **`stdio: 'inherit'`:** Configures the child process to inherit the parent's (Electron main process) standard I/O, meaning backend `console.log`s appear directly in the Electron console.
- **Error and Exit Handling:** Listens for `error` and `exit` events from the backend process to log issues and potentially trigger restarts.

### 4. **Backend Connectivity Testing (`quickConnectivityTest`, `testConnectivity`, `testHttpEndpoint`, `testWebSocketEndpoint`)**

- **`quickConnectivityTest()`:** Performs a rapid check of backend connectivity by pinging the `/health` endpoint.
- **`testConnectivity()`:** A more robust check that retries HTTP and WebSocket endpoint tests until success or max retries are reached.
- **`testHttpEndpoint()` / `testWebSocketEndpoint()`:** Private methods to directly ping the backend's HTTP (`/api/health`) and WebSocket (`/ws`) endpoints to verify their responsiveness.
- **`isPortFree(port)`:** Utility to check if a given network port is free before attempting to start the backend, preventing address-in-use errors.

## Usage Flow

1. The Electron main process (`main.ts`) instantiates `BackendStarter`.
2. `main.ts` calls `backendStarter.startBackend(...)`.
3. `BackendStarter` finds a suitable Node.js executable and resolves backend/node_modules paths, performing ASAR extraction if needed.
4. It then attempts to spawn the backend process, with retries.
5. Once the backend is spawned, `BackendStarter` uses `testConnectivity` to ensure the backend is responsive before signaling success.

## Important Considerations

- **Security:** Ensure that the temporary directory used for ASAR extraction is secure and cleaned up appropriately. The `NODE_PATH` environment variable can be a security risk if not controlled, as it can make Node.js load modules from arbitrary paths.
- **Performance:** Extracting large `node_modules` from an ASAR archive can add to startup time. Optimize `extraResources` in your Electron build configuration to place commonly used static assets outside the ASAR if possible.
- **Debugging:** The extensive logging within `BackendStarter` is invaluable for diagnosing startup issues. In production, consider a more controlled logging mechanism.
- **Cross-Platform Compatibility:** The use of `path` and `os.tmpdir()` helps ensure compatibility across Windows, macOS, and Linux.
- **Robustness:** The retry logic and connectivity tests significantly improve the reliability of backend startup, especially in environments where services might take a moment to become fully available.
