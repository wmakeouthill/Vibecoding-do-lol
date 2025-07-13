const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

console.log('🔧 Otimizando build para distribuição...');

// Diretórios e arquivos para remover
const removePatterns = [
    // Arquivos de desenvolvimento
    '**/*.map',
    '**/*.ts',
    '**/test/**',
    '**/tests/**',
    '**/__tests__/**',
    '**/*.test.js',
    '**/*.spec.js',
    '**/*.test.ts',
    '**/*.spec.ts',

    // Documentação
    '**/README.md',
    '**/CHANGELOG.md',
    '**/LICENSE',
    '**/docs/**',

    // Configurações de desenvolvimento
    '**/.eslintrc*',
    '**/.prettierrc*',
    '**/tsconfig.json',
    '**/angular.json',
    '**/karma.conf.js',
    '**/protractor.conf.js',

    // Cache e temporários
    '**/.cache/**',
    '**/node_modules/.cache/**',
    '**/.angular/cache/**',
    '**/tmp/**',
    '**/temp/**',

    // Git
    '**/.git/**',
    '**/.gitignore',
    '**/.gitattributes',

    // IDEs
    '**/.vscode/**',
    '**/.idea/**',
    '**/*.sublime-*',

    // Logs
    '**/*.log',
    '**/logs/**',

    // Arquivos de build desnecessários
    '**/node_modules/typescript/**',
    '**/node_modules/@types/**',
    '**/node_modules/ts-node/**',
    '**/node_modules/nodemon/**',
    '**/node_modules/concurrently/**',
    '**/node_modules/cross-env/**',
    '**/node_modules/electron-builder/**',
    '**/node_modules/wait-on/**'
];

function removeFile(filePath) {
    try {
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
            console.log(`🗑️ Removido: ${filePath}`);
        }
    } catch (error) {
        console.warn(`⚠️ Erro ao remover ${filePath}:`, error.message);
    }
}

function removeDirectory(dirPath) {
    try {
        if (fs.existsSync(dirPath)) {
            fs.rmSync(dirPath, { recursive: true, force: true });
            console.log(`🗑️ Removido diretório: ${dirPath}`);
        }
    } catch (error) {
        console.warn(`⚠️ Erro ao remover diretório ${dirPath}:`, error.message);
    }
}

function optimizeNodeModules(nodeModulesPath) {
    if (!fs.existsSync(nodeModulesPath)) {
        console.log('⚠️ node_modules não encontrado');
        return;
    }

    console.log('📦 Otimizando node_modules...');

    // Remover dependências de desenvolvimento
    const devDepsToRemove = [
        'typescript',
        '@types',
        'ts-node',
        'nodemon',
        'concurrently',
        'cross-env',
        'electron-builder',
        'wait-on',
        'eslint',
        'prettier',
        'jest',
        'karma',
        'protractor'
    ];

    devDepsToRemove.forEach(dep => {
        const depPath = path.join(nodeModulesPath, dep);
        if (fs.existsSync(depPath)) {
            removeDirectory(depPath);
        }
    });

    // Remover arquivos desnecessários de dependências
    const packages = fs.readdirSync(nodeModulesPath);
    packages.forEach(pkg => {
        const pkgPath = path.join(nodeModulesPath, pkg);
        if (fs.statSync(pkgPath).isDirectory()) {
            // Remover arquivos de teste
            const testFiles = [
                'test', 'tests', '__tests__', 'spec', 'examples', 'docs'
            ];

            testFiles.forEach(testDir => {
                const testPath = path.join(pkgPath, testDir);
                if (fs.existsSync(testPath)) {
                    removeDirectory(testPath);
                }
            });

            // Remover arquivos de configuração desnecessários
            const configFiles = [
                '.eslintrc.js', '.eslintrc.json', '.prettierrc', 'tsconfig.json',
                'karma.conf.js', 'protractor.conf.js', 'jest.config.js'
            ];

            configFiles.forEach(configFile => {
                const configPath = path.join(pkgPath, configFile);
                removeFile(configPath);
            });
        }
    });
}

function optimizeBuild() {
    const distPath = 'dist';
    const backendPath = path.join(distPath, 'backend');
    const frontendPath = path.join(distPath, 'frontend');

    console.log('🧹 Iniciando otimização...');

    // Otimizar node_modules do backend
    const backendNodeModules = path.join(backendPath, 'node_modules');
    optimizeNodeModules(backendNodeModules);

    // Remover arquivos desnecessários do frontend
    if (fs.existsSync(frontendPath)) {
        const browserPath = path.join(frontendPath, 'browser');
        if (fs.existsSync(browserPath)) {
            // Remover source maps em produção
            const sourceMapFiles = fs.readdirSync(browserPath)
                .filter(file => file.endsWith('.map'));

            sourceMapFiles.forEach(mapFile => {
                removeFile(path.join(browserPath, mapFile));
            });
        }
    }

    // Remover arquivos de configuração desnecessários
    const configFiles = [
        path.join(distPath, 'tsconfig.json'),
        path.join(backendPath, 'tsconfig.json'),
        path.join(frontendPath, 'tsconfig.json')
    ];

    configFiles.forEach(configFile => {
        removeFile(configFile);
    });

    console.log('✅ Otimização concluída!');

    // Calcular tamanho final
    const totalSize = calculateDirectorySize(distPath);
    console.log(`📊 Tamanho total do build: ${(totalSize / (1024 * 1024)).toFixed(2)} MB`);
}

function calculateDirectorySize(dirPath) {
    let totalSize = 0;

    function calculateSize(currentPath) {
        const items = fs.readdirSync(currentPath);

        for (const item of items) {
            const itemPath = path.join(currentPath, item);
            const stats = fs.statSync(itemPath);

            if (stats.isDirectory()) {
                calculateSize(itemPath);
            } else {
                totalSize += stats.size;
            }
        }
    }

    if (fs.existsSync(dirPath)) {
        calculateSize(dirPath);
    }

    return totalSize;
}

// Executar otimização
try {
    optimizeBuild();
} catch (error) {
    console.error('❌ Erro durante otimização:', error.message);
    process.exit(1);
} 