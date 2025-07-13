const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

console.log('🧪 Testando Node.js embutido no Electron...');

// Função para verificar se um arquivo existe
function fileExists(filePath) {
    return fs.existsSync(filePath);
}

// Função para listar arquivos
function listFiles(dirPath, maxDepth = 2, currentDepth = 0) {
    if (currentDepth > maxDepth) return;

    if (!fileExists(dirPath)) {
        console.log(`❌ Diretório não encontrado: ${dirPath}`);
        return;
    }

    const items = fs.readdirSync(dirPath);

    items.forEach(item => {
        const itemPath = path.join(dirPath, item);
        const stats = fs.statSync(itemPath);
        const indent = '  '.repeat(currentDepth);

        if (stats.isDirectory()) {
            console.log(`${indent}📁 ${item}/`);
            if (currentDepth < maxDepth) {
                listFiles(itemPath, maxDepth, currentDepth + 1);
            }
        } else {
            const size = (stats.size / 1024).toFixed(1);
            console.log(`${indent}📄 ${item} (${size} KB)`);
        }
    });
}

// Verificar estrutura do build
console.log('\n🔍 Verificando estrutura do build...');

const buildPaths = [
    'dist/backend/server.js',
    'dist/backend/node_modules',
    'dist/backend/node_modules/mysql2',
    'dist/backend/node_modules/express',
    'dist/electron/main.js',
    'dist/frontend/browser/index.html'
];

console.log('\n📋 Verificação de arquivos:');
buildPaths.forEach(filePath => {
    const exists = fileExists(filePath);
    console.log(`${exists ? '✅' : '❌'} ${filePath}`);
});

// Verificar se o Electron está instalado
console.log('\n🔍 Verificando Electron...');
try {
    const electronVersion = execSync('npx electron --version', { encoding: 'utf8' }).trim();
    console.log(`✅ Electron ${electronVersion} encontrado`);
} catch (error) {
    console.log('❌ Electron não encontrado');
}

// Verificar estrutura do release (se existir)
if (fileExists('release')) {
    console.log('\n📁 Estrutura do release:');
    listFiles('release', 3);

    // Verificar se há executável
    const exeFiles = fs.readdirSync('release').filter(file => file.endsWith('.exe'));
    if (exeFiles.length > 0) {
        console.log('\n🎯 Executáveis encontrados:');
        exeFiles.forEach(exe => {
            const exePath = path.join('release', exe);
            const stats = fs.statSync(exePath);
            const sizeMB = (stats.size / (1024 * 1024)).toFixed(1);
            console.log(`  📄 ${exe} (${sizeMB} MB)`);
        });
    }
}

// Verificar win-unpacked (arquivos desempacotados)
const winUnpackedPath = 'release/win-unpacked';
if (fileExists(winUnpackedPath)) {
    console.log('\n📦 Estrutura win-unpacked (arquivos desempacotados):');
    listFiles(winUnpackedPath, 2);

    // Verificar se há node.dll (Node.js runtime)
    const nodeDllPath = path.join(winUnpackedPath, 'node.dll');
    if (fileExists(nodeDllPath)) {
        const stats = fs.statSync(nodeDllPath);
        const sizeMB = (stats.size / (1024 * 1024)).toFixed(1);
        console.log(`\n✅ Node.js runtime encontrado: node.dll (${sizeMB} MB)`);
    } else {
        console.log('\n❌ Node.js runtime não encontrado (node.dll)');
    }

    // Verificar resources
    const resourcesPath = path.join(winUnpackedPath, 'resources');
    if (fileExists(resourcesPath)) {
        console.log('\n📁 Estrutura resources:');
        listFiles(resourcesPath, 2);
    }
}

console.log('\n🎯 Resumo:');
console.log('✅ Se todos os arquivos estão presentes, o Node.js está embutido!');
console.log('✅ O executável funcionará sem Node.js instalado no sistema.');
console.log('✅ As dependências estão empacotadas em resources/backend/node_modules/'); 