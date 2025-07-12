# TypeScript Configuration (Electron Main Process)

The `tsconfig.json` file located in `src/electron/` is the TypeScript configuration for the Electron **main process** and **preload scripts**. It defines how TypeScript files (`.ts`) within the Electron context are compiled into JavaScript, ensuring compatibility with the Electron runtime and Node.js environment.

## Purpose

- **TypeScript Compilation:** Directs the TypeScript compiler (`tsc`) on how to transpile TypeScript code into JavaScript.
- **Environment Targeting:** Configures the compilation target to match the Electron environment, which is typically a specific version of Node.js.
- **Module Resolution:** Specifies how modules are resolved and what module system to use (`commonjs`).
- **Output Directory:** Defines where the compiled JavaScript files will be placed.
- **Strictness and Type Checking:** Enforces various strictness checks and type safety rules.

## Key `compilerOptions`

- **`"target": "ES2020"`:**
  - **Meaning:** Specifies the ECMAScript target version for the compiled JavaScript. `ES2020` ensures modern JavaScript features are preserved and compatible with recent Node.js versions used by Electron.
- **`"module": "commonjs"`:**
  - **Meaning:** Specifies the module system to be used in the compiled JavaScript output. `commonjs` is standard for Node.js environments.
- **`"lib": ["ES2020"]`:**
  - **Meaning:** Defines the library files to be included in the compilation. `ES2020` provides type definitions for modern JavaScript APIs.
- **`"outDir": "../../dist/electron"`:**
  - **Meaning:** Sets the output directory for the compiled JavaScript files relative to this `tsconfig.json`. This means compiled files from `src/electron/` will go into `dist/electron/` at the project root.
- **`"rootDir": "."`:**
  - **Meaning:** Specifies the root directory of the TypeScript source files. In this case, `.` means the current directory (`src/electron/`).
- **`"strict": true`:**
  - **Meaning:** Enables a broad range of strict type-checking options, promoting more robust and error-free code.
- **`"esModuleInterop": true`:**
  - **Meaning:** Enables compatibility for importing CommonJS modules as ES modules, improving interoperability between different module systems.
- **`"skipLibCheck": true`:**
  - **Meaning:** Skips type checking of declaration files (`.d.ts`). This can speed up compilation, especially in large projects with many third-party libraries.
- **`"forceConsistentCasingInFileNames": true`:**
  - **Meaning:** Ensures that file names are referenced with consistent casing, preventing issues on case-sensitive file systems (e.g., Linux).
- **`"resolveJsonModule": true`:**
  - **Meaning:** Allows importing `.json` files directly as modules.
- **`"declaration": false`:**
  - **Meaning:** Prevents the compiler from generating `.d.ts` declaration files. Typically set to `false` for application code, but `true` for library code.
- **`"removeComments": true`:**
  - **Meaning:** Strips comments from the compiled JavaScript output, reducing file size.
- **`"emitDecoratorMetadata": true` and `"experimentalDecorators": true`:**
  - **Meaning:** Enable support for TypeScript decorators, often used in frameworks (though less common directly in Electron main/preload).
- **`"sourceMap": true`:**
  - **Meaning:** Generates source map files (`.map`) alongside the compiled JavaScript. These are crucial for debugging TypeScript code in the compiled JavaScript environment.
- **`"incremental": true`:**
  - **Meaning:** Enables incremental compilation, which can significantly speed up subsequent compilations by caching information from previous builds.
- **`"typeRoots": ["../../node_modules/@types"]`:**
  - **Meaning:** Specifies the directories where TypeScript should look for type definition files (e.g., for Node.js built-in modules like `child_process`). This path points to the `@types` directory in the project's root `node_modules`.

## `include` and `exclude`

- **`"include": ["**/*.ts"]`:**
  - **Meaning:** Specifies which files TypeScript should include in the compilation. `**/*.ts` means all `.ts` files in the current directory and its subdirectories.
- **`"exclude": ["node_modules", "**/*.spec.ts", "**/*.test.ts"]`:**
  - **Meaning:** Specifies files or directories that should be excluded from compilation, even if they match the `include` pattern. This typically excludes `node_modules` and test files.

## Usage

This `tsconfig.json` is used by the TypeScript compiler when building the Electron main process and preload scripts. It ensures that the TypeScript code is correctly transpiled and optimized for the Electron environment.

```bash
# Example of how it might be used in a build script
tsc --project src/electron/tsconfig.json
```

## Considerations

- **Target Environment:** The `target` and `module` options are critical for ensuring compatibility with the specific Node.js version shipped with Electron. Always ensure they align.
- **Performance:** Options like `skipLibCheck` and `incremental` are good for development performance. For production builds, you might want to adjust other options (e.g., `removeComments`) for smaller file sizes.
- **Security:** While `tsconfig.json` primarily affects compilation, ensuring strict type checks (`strict: true`) contributes to writing more robust and potentially more secure code by catching common programming errors early.
