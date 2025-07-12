# Application Error Page

The `error.html` file (`src/electron/error.html`) is a static HTML page displayed by the Electron main process when the application encounters a critical loading error, such as the backend failing to start or the frontend failing to load. It serves as a user-friendly fallback to inform the user about a problem and provides basic diagnostic information.

## Purpose

- **User Feedback:** Informs the user in a clear and simple manner that the application has failed to load.
- **Basic Diagnostics:** Provides a placeholder (`#error-details`) where more detailed error information can be injected (e.g., from the main process) to assist with debugging or support requests.
- **Graceful Failure:** Ensures that the user doesn't see a blank or unresponsive window in case of a critical startup failure.

## Structure and Contents

The `error.html` is a standard HTML5 document with embedded CSS for styling:

```html
<!DOCTYPE html>
<html>

<head>
    <title>Application Error</title>
    <style>
        body {
            font-family: Arial, sans-serif;
            padding: 20px;
        }

        #error-details {
            white-space: pre-wrap;
            background: #f8f8f8;
            padding: 15px;
            border-radius: 5px;
            margin-top: 20px;
        }
    </style>
</head>

<body>
    <h1>⚠️ Application Loading Error</h1>
    <p>The application failed to load properly. Technical details below:</p>
    <div id="error-details"></div>
    <p>Please restart the application or contact support.</p>
</body>

</html>
```

### Key Elements

- `<title>`: Sets the title of the window, visible in the taskbar or window title bar.
- `<style>` block: Contains basic CSS to style the page, making it readable and visually distinct from the main application.
  - `body`: Sets font, padding.
  - `#error-details`: Styles a `div` intended to display pre-formatted error text, using `white-space: pre-wrap` to preserve line breaks and spacing.
- `<h1>`: A prominent heading indicating an application loading error.
- `<p>` tags: Provide instructional text to the user.
- `<div id="error-details">`: An empty `div` that is expected to be populated dynamically by the Electron main process with specific error messages or stack traces using `webContents.executeJavaScript` or similar methods.

## Usage

This `error.html` is loaded by the Electron main process (`main.ts`) when the `BrowserWindow` fails to load the primary frontend content (e.g., `index.html`) due to an unrecoverable error or timeout. The main process would typically use `mainWindow.loadFile('path/to/error.html')` to display it.

```typescript
// Example in main.ts (simplified)
async function loadFrontendSafely() {
  try {
    await mainWindow.loadURL('http://localhost:3000'); // Try to load main frontend
  } catch (error) {
    console.error('Failed to load frontend, showing error page:', error);
    // Load the error page and inject details
    await mainWindow.loadFile(path.join(__dirname, 'error.html'));
    mainWindow.webContents.executeJavaScript(`
      document.getElementById('error-details').textContent = ${JSON.stringify(error.message || error)};
    `);
  }
}
```

## Considerations

- **Error Detail Injection:** The effectiveness of this page depends on the `main` process injecting relevant error details into the `#error-details` div. Ensure the mechanism for injecting this content is robust.
- **Minimalism:** Keep the error page as minimal as possible to ensure it loads quickly even under severe error conditions.
- **No External Dependencies:** Avoid external CSS, JavaScript, or images to prevent further loading failures.
- **User Guidance:** The message should guide the user on what to do next (e.g., restart, contact support).
