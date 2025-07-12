# Test Environment Script

The `test-env.js` script (`src/backend/test-env.js`) is a simple utility designed to verify that the necessary MySQL environment variables are correctly loaded and accessible within the backend environment. It is typically used during development or deployment to quickly check the database configuration.

## Purpose

- **Environment Variable Verification:** Loads environment variables from the project's root `.env` file and prints key MySQL connection details to the console.
- **Debugging Aid:** Helps developers confirm that database credentials and connection parameters are correctly set up, especially in different deployment environments (e.g., local development, Docker containers, production servers).

## Technology

- **Node.js:** The runtime environment for the script.
- **`dotenv`:** Used to load environment variables from a `.env` file.
- **`path`:** Node.js built-in module for resolving file paths.

## How it Works

1. **Path Resolution:** Calculates the path to the `.env` file, assuming it is located two directories up from the `src/backend/` directory (i.e., at the project root).
2. **Load Environment Variables:** Uses `require('dotenv').config()` to load the environment variables defined in the specified `.env` file into `process.env`.
3. **Log Variables:** Prints the values of `MYSQL_HOST`, `MYSQL_USER`, `MYSQL_DATABASE`, `MYSQL_PASSWORD` (masked for security), and `MYSQL_PORT` to the console.

## Usage

This script is intended to be run directly from the command line to perform a quick check of the database environment variables. It does not perform any database connections or operations, only variable loading and logging.

```bash
node src/backend/test-env.js
# or, if compiled to JavaScript in a 'dist' folder
node dist/backend/test-env.js
```

## Important Considerations

- **Security:** The `MYSQL_PASSWORD` is logged with `***` for security, but ensure that this script is not used in a context where even partial exposure of sensitive information could be a risk. In production, sensitive information should be managed through secure environment practices.
- **Path Dependency:** The script relies on the relative path to the `.env` file. If the project structure changes, this path may need to be updated.
- **Limited Scope:** This script only verifies the *loading* of variables, not their *correctness* for establishing a database connection. For a full connection test, `DatabaseManager.ts`'s `initialize()` method would be more appropriate.
