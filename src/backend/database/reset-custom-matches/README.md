# Reset Custom Matches Script

The `reset_custom_matches.ts` script is a utility designed to completely clear and reset the `custom_matches` table within the SQLite database (`matchmaking.db`). This script is primarily used for development or testing purposes, providing a clean slate for custom match data without affecting the main MySQL database.

## Purpose

- **Data Cleansing:** Deletes all existing records from the `custom_matches` table.
- **ID Sequence Reset:** Resets the `sqlite_sequence` for the `custom_matches` table, ensuring that new entries start from ID 1.
- **Development Utility:** Facilitates quick and easy resetting of custom match data during development or testing cycles.

## Technology

- **SQLite3 & SQLite:** Utilizes the `sqlite3` driver and the `sqlite` package's `open` function for interacting with the SQLite database.
- **TypeScript:** The script is written in TypeScript, providing type safety.
- **Path:** Uses the `path` module for resolving the database file path based on the environment (development or production).

## How it Works

1. **Database Path Resolution:** Determines the path to `matchmaking.db` based on the `NODE_ENV` environment variable. In development, it looks in a `data` folder within the current working directory; otherwise, it uses a platform-specific application data directory.
2. **Database Connection:** Opens a connection to the `matchmaking.db` SQLite database.
3. **Table Truncation:** Executes two SQL commands:
    - `DELETE FROM custom_matches;`: Removes all rows from the `custom_matches` table.
    - `DELETE FROM sqlite_sequence WHERE name='custom_matches';`: Resets the auto-increment counter for the `custom_matches` table.
4. **Error Handling:** Includes a `try-catch` block to log any errors that occur during the database operations.
5. **Connection Closure:** Ensures the database connection is properly closed in the `finally` block.

## Usage

This script is typically executed manually from the command line during development or as part of a testing pipeline when a clean state of custom match data is required.

```bash
node dist/backend/database/reset_custom_matches.js
# or, if using ts-node for direct execution
ts-node src/backend/database/reset_custom_matches.ts
```

## Important Considerations

- **SQLite Specific:** This script is designed specifically for SQLite and the `matchmaking.db` file. It does **not** interact with the main MySQL database used by the backend for persistent application data.
- **Data Loss:** Running this script will permanently delete all data in the `custom_matches` table of the SQLite database. Use with caution.
- **Environment:** The script's behavior regarding the database path changes based on the `NODE_ENV`. Ensure the environment is correctly set when running it.
