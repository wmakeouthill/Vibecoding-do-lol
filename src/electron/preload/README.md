# Preload Script (Electron)

The `preload.ts` file (`src/electron/preload.ts`) is a crucial component in an Electron application, especially when `contextIsolation` is enabled in the `BrowserWindow`'s `webPreferences`. It runs in a privileged context *before* the web content (your Angular frontend) loads in the renderer process. Its primary role is to securely expose a limited, controlled set of Electron and Node.js APIs to the renderer process, acting as a secure bridge between the two.

## Purpose

- **Secure API Exposure:** Exposes specific Electron and Node.js functionalities to the untrusted web content (frontend) in a controlled manner, preventing direct access to the powerful Node.js environment.
- **Context Isolation:** When `contextIsolation` is `true` (as it should be for security), the `preload` script runs in a separate JavaScript context from the web page. `contextBridge` is then used to safely bridge data and functions between these contexts.
- **Frontend-Main Process Communication:** Facilitates communication from the frontend (renderer) to the main Electron process using `ipcRenderer` (for sending messages) and `ipcMain` (on the main process side for handling them).
- **Event Listening:** Allows the frontend to listen to specific events emitted by the main process.

## Architecture and Technologies

- **Electron `contextBridge`:** The core mechanism for securely exposing APIs to the renderer process. It prevents prototype pollution and ensures that exposed functions cannot be overridden or modified by malicious scripts in the web content.
- **Electron `ipcRenderer`:** Used by the preload script to send messages (e.g., `invoke` for promises, `send` for one-way) to the main process and receive messages (e.g., `on` for event listeners).
- **TypeScript:** Provides strong typing for the exposed `electronAPI` interface, ensuring that the frontend consumes the API correctly.
- **`declare global`:** Used to extend the `Window` interface globally in TypeScript, so the `electronAPI` is recognized by the frontend TypeScript compiler without explicit imports in every component.

## Exposed `electronAPI`

The `preload.ts` file exposes an object named `electronAPI` to the `window` object in the renderer process. This object contains the following functions:

### Application Information

- `getAppVersion(): Promise<string>`: Invokes a main process handler to get the application's version.
- `getUserDataPath(): Promise<string>`: Invokes a main process handler to get the user data directory path.

### Window Controls

- `minimizeWindow(): Promise<void>`: Invokes a main process handler to minimize the main window.
- `maximizeWindow(): Promise<void>`: Invokes a main process handler to maximize/restore the main window.
- `closeWindow(): Promise<void>`: Invokes a main process handler to close the main window.

### Application Events (from Main Process to Renderer)

- `onOpenSettings(callback: () => void): void`: Registers a callback function to be executed when the `open-settings` event is emitted by the main process.
- `onJoinQueue(callback: () => void): void`: Registers a callback for the `join-queue` event.
- `onLeaveQueue(callback: () => void): void`: Registers a callback for the `leave-queue` event.
- `onShowAbout(callback: () => void): void`: Registers a callback for the `show-about` event.

### Listener Management

- `removeAllListeners(channel: string): void`: Removes all listeners for a specific IPC channel. This is important for cleanup to prevent memory leaks, especially when components are destroyed.

## Usage in Frontend (Angular)

In the Angular frontend, you can access the exposed API via `window.electronAPI`. The `declare global` block ensures that TypeScript correctly recognizes this global object.

```typescript
// Example in an Angular component or service
import { Component, OnInit, OnDestroy } from '@angular/core';
import { Subscription } from 'rxjs';

declare global {
  interface Window {
    electronAPI: {
      getAppVersion: () => Promise<string>;
      minimizeWindow: () => Promise<void>;
      onOpenSettings: (callback: () => void) => void;
      removeAllListeners: (channel: string) => void;
      // ... other exposed APIs
    };
  }
}

@Component({...})
export class MyElectronComponent implements OnInit, OnDestroy {
  appVersion: string = '';
  private settingsSubscription!: Subscription; // Use Subscription if managing multiple listeners

  constructor() {}

  ngOnInit() {
    if (window.electronAPI) {
      // Get app version
      window.electronAPI.getAppVersion().then(version => {
        this.appVersion = version;
        console.log('App Version:', version);
      });

      // Listen for 'open-settings' event from main process
      window.electronAPI.onOpenSettings(() => {
        console.log('Settings requested from main process!');
        // Navigate to settings view in Angular
        // This would typically involve using Angular Router if not using imperative view management
      });

      // Listen for 'join-queue' event from main process
      window.electronAPI.onJoinQueue(() => {
        console.log('Join queue requested from main process!');
        // Trigger join queue logic in Angular
      });
    }
  }

  minimizeApp() {
    if (window.electronAPI) {
      window.electronAPI.minimizeWindow();
    }
  }

  ngOnDestroy() {
    // Clean up event listeners to prevent memory leaks
    if (window.electronAPI) {
      window.electronAPI.removeAllListeners('open-settings');
      window.electronAPI.removeAllListeners('join-queue');
      window.electronAPI.removeAllListeners('leave-queue');
      window.electronAPI.removeAllListeners('show-about');
    }
  }
}
```

## Considerations

- **Security Best Practices:** Always expose the minimum necessary APIs from the preload script. Never expose `ipcRenderer` or other Electron/Node.js modules directly, as this compromises `contextIsolation` and introduces severe security vulnerabilities.
- **Error Handling:** Implement robust error handling for `ipcRenderer.invoke` calls in the frontend to gracefully manage failures in the main process.
- **Event Cleanup:** It is critical to use `removeAllListeners` or `once` (for one-time events) to prevent memory leaks, especially if event listeners are registered within Angular components that can be destroyed and re-created.
- **API Design:** Design the exposed APIs to be granular and purpose-specific, rather than broad methods that can perform many actions.
