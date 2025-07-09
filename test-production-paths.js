// Script para testar os caminhos de produção do Electron
// Executar com: node test-production-paths.js

const path = require('path');
const fs = require('fs');

console.log('=== TESTE DE CAMINHOS DE PRODUÇÃO ===\n');

// Simular o ambiente de produção do Electron
const mockElectronPaths = {
    // Caminho típico de um executável empacotado
    execPath: 'C:\\Users\\wcaco\\OneDrive\\Documentos\\Vibecoding-do-lol\\release\\win-unpacked\\vibecoding-lol.exe',
    resourcesPath: 'C:\\Users\\wcaco\\OneDrive\\Documentos\\Vibecoding-do-lol\\release\\win-unpacked\\resources',
    isPackaged: true
};

console.log('Simulando ambiente empacotado:');
console.log('- process.execPath:', mockElectronPaths.execPath);
console.log('- process.resourcesPath:', mockElectronPaths.resourcesPath);
console.log('- app.isPackaged:', mockElectronPaths.isPackaged);
console.log();

// Replicar a lógica do getProductionPaths()
const appPath = path.dirname(mockElectronPaths.execPath);
console.log('- App path:', appPath);

const backendPath = path.join(mockElectronPaths.resourcesPath, 'backend', 'server.js');
const frontendPath = path.join(mockElectronPaths.resourcesPath, 'frontend', 'browser', 'index.html');
const nodeModulesPath = path.join(mockElectronPaths.resourcesPath, 'backend', 'node_modules');

console.log('\nCaminhos calculados:');
console.log('- Backend:', backendPath);
console.log('- Frontend:', frontendPath);
console.log('- Node modules:', nodeModulesPath);

console.log('\nVerificando se arquivos existem:');
console.log('- Backend exists:', fs.existsSync(backendPath));
console.log('- Frontend exists:', fs.existsSync(frontendPath));
console.log('- Node modules exists:', fs.existsSync(nodeModulesPath));

// Verificar estrutura da pasta resources
const resourcesDir = mockElectronPaths.resourcesPath;
if (fs.existsSync(resourcesDir)) {
    console.log('\nConteúdo da pasta resources:');
    try {
        const items = fs.readdirSync(resourcesDir);
        items.forEach(item => {
            const itemPath = path.join(resourcesDir, item);
            const isDir = fs.statSync(itemPath).isDirectory();
            console.log(`  ${isDir ? '📁' : '📄'} ${item}`);
        });
    } catch (error) {
        console.error('Erro ao listar resources:', error.message);
    }
} else {
    console.log('\n❌ Pasta resources não encontrada!');
}

// Verificar pasta backend dentro de resources
const backendDir = path.join(resourcesDir, 'backend');
if (fs.existsSync(backendDir)) {
    console.log('\nConteúdo da pasta resources/backend:');
    try {
        const items = fs.readdirSync(backendDir);
        items.forEach(item => {
            const itemPath = path.join(backendDir, item);
            const isDir = fs.statSync(itemPath).isDirectory();
            console.log(`  ${isDir ? '📁' : '📄'} ${item}`);
        });
    } catch (error) {
        console.error('Erro ao listar backend:', error.message);
    }
} else {
    console.log('\n❌ Pasta resources/backend não encontrada!');
}

console.log('\n=== TESTE CONCLUÍDO ===');
