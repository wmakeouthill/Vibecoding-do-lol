const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

console.log('🚀 Iniciando build standalone...');

// Função para verificar se um arquivo existe
function fileExists(filePath) {
    return fs.existsSync(filePath);
}

// Função para criar diretório se não existir
function ensureDir(dirPath) {
    if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
        console.log(`📁 Diretório criado: ${dirPath}`);
    }
}

// Função para copiar arquivos
function copyFile(src, dest) {
    if (fileExists(src)) {
        ensureDir(path.dirname(dest));
        fs.copyFileSync(src, dest);
        console.log(`📋 Copiado: ${src} → ${dest}`);
    } else {
        console.warn(`⚠️ Arquivo não encontrado: ${src}`);
    }
}

// Função para copiar diretório recursivamente
function copyDir(src, dest) {
    if (!fileExists(src)) {
        console.warn(`⚠️ Diretório não encontrado: ${src}`);
        return;
    }

    ensureDir(dest);

    const items = fs.readdirSync(src);
    for (const item of items) {
        const srcPath = path.join(src, item);
        const destPath = path.join(dest, item);

        if (fs.statSync(srcPath).isDirectory()) {
            copyDir(srcPath, destPath);
        } else {
            copyFile(srcPath, destPath);
        }
    }
}

try {
    // 1. Limpar builds anteriores
    console.log('🧹 Limpando builds anteriores...');
    if (fileExists('dist')) {
        fs.rmSync('dist', { recursive: true, force: true });
    }
    if (fileExists('release')) {
        fs.rmSync('release', { recursive: true, force: true });
    }

    // 2. Instalar dependências
    console.log('📦 Instalando dependências...');
    execSync('npm run install:all-deps', { stdio: 'inherit' });

    // 3. Build do backend
    console.log('🔧 Build do backend...');
    execSync('npm run build:backend', { stdio: 'inherit' });

    // 4. Build do frontend
    console.log('🎨 Build do frontend...');
    execSync('npm run build:frontend', { stdio: 'inherit' });

    // 5. Build do Electron
    console.log('⚡ Build do Electron...');
    execSync('npm run build:electron', { stdio: 'inherit' });

    // 6. Copiar assets
    console.log('📋 Copiando assets...');
    execSync('npm run copy:all-assets', { stdio: 'inherit' });

    // 7. Otimizar build
    console.log('🔧 Otimizando build...');
    execSync('node scripts/optimize-build.js', { stdio: 'inherit' });

    // 8. Verificar build
    console.log('🔍 Verificando build...');
    execSync('npm run verify:build', { stdio: 'inherit' });

    // 9. Criar executável
    console.log('🎯 Criando executável standalone...');
    execSync('npm run create:executable', { stdio: 'inherit' });

    console.log('✅ Build standalone concluído com sucesso!');
    console.log('📁 Arquivos gerados em: release/');

    // Listar arquivos gerados
    if (fileExists('release')) {
        const files = fs.readdirSync('release');
        console.log('📋 Arquivos gerados:');
        files.forEach(file => {
            const filePath = path.join('release', file);
            const stats = fs.statSync(filePath);
            const sizeMB = (stats.size / (1024 * 1024)).toFixed(2);
            console.log(`  - ${file} (${sizeMB} MB)`);
        });
    }

} catch (error) {
    console.error('❌ Erro durante o build:', error.message);
    process.exit(1);
} 