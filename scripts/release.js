const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

console.log('🚀 LoL Matchmaking - Gerador de Release Standalone');
console.log('='.repeat(50));

// Verificar se estamos no diretório correto
if (!fs.existsSync('package.json')) {
    console.error('❌ Execute este script na raiz do projeto');
    process.exit(1);
}

// Verificar se o Node.js está instalado
try {
    const nodeVersion = execSync('node --version', { encoding: 'utf8' }).trim();
    console.log(`✅ Node.js ${nodeVersion} detectado`);
} catch (error) {
    console.error('❌ Node.js não encontrado. Instale o Node.js 18+ primeiro.');
    process.exit(1);
}

// Verificar se o npm está instalado
try {
    const npmVersion = execSync('npm --version', { encoding: 'utf8' }).trim();
    console.log(`✅ npm ${npmVersion} detectado`);
} catch (error) {
    console.error('❌ npm não encontrado.');
    process.exit(1);
}

// Função para executar comandos com feedback
function runCommand(command, description) {
    console.log(`\n🔧 ${description}...`);
    try {
        execSync(command, { stdio: 'inherit' });
        console.log(`✅ ${description} concluído`);
        return true;
    } catch (error) {
        console.error(`❌ Erro em: ${description}`);
        return false;
    }
}

// Função para verificar se um arquivo existe
function fileExists(filePath) {
    return fs.existsSync(filePath);
}

// Função para calcular tamanho de arquivo
function getFileSize(filePath) {
    if (!fileExists(filePath)) return 0;
    const stats = fs.statSync(filePath);
    return stats.size;
}

// Função para formatar tamanho
function formatSize(bytes) {
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    if (bytes === 0) return '0 Bytes';
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i];
}

// Função para listar arquivos gerados
function listGeneratedFiles() {
    console.log('\n📁 Arquivos gerados:');

    if (!fileExists('release')) {
        console.log('❌ Pasta release não encontrada');
        return;
    }

    const files = fs.readdirSync('release');
    let totalSize = 0;

    files.forEach(file => {
        const filePath = path.join('release', file);
        const size = getFileSize(filePath);
        totalSize += size;
        console.log(`  📄 ${file} (${formatSize(size)})`);
    });

    console.log(`\n📊 Tamanho total: ${formatSize(totalSize)}`);
}

// Função para verificar ícones
function checkIcons() {
    console.log('\n🎨 Verificando ícones...');

    const iconFiles = [
        { path: 'build/icon.ico', platform: 'Windows' },
        { path: 'build/icon.icns', platform: 'macOS' },
        { path: 'build/icon.png', platform: 'Linux' }
    ];

    let missingIcons = [];

    iconFiles.forEach(icon => {
        if (fileExists(icon.path)) {
            const size = getFileSize(icon.path);
            console.log(`✅ ${icon.platform}: ${icon.path} (${formatSize(size)})`);
        } else {
            console.log(`⚠️ ${icon.platform}: ${icon.path} não encontrado`);
            missingIcons.push(icon.platform);
        }
    });

    if (missingIcons.length > 0) {
        console.log('\n💡 Dica: Adicione ícones em build/ para melhor aparência');
        console.log('   Consulte build/README.md para instruções');
    }
}

// Função principal
async function generateRelease() {
    console.log('\n🎯 Iniciando geração de release...\n');

    // 1. Verificar ícones
    checkIcons();

    // 2. Limpar builds anteriores
    if (!runCommand('npm run clean', 'Limpando builds anteriores')) {
        return false;
    }

    // 3. Instalar dependências
    if (!runCommand('npm run install:all-deps', 'Instalando dependências')) {
        return false;
    }

    // 4. Build do backend
    if (!runCommand('npm run build:backend', 'Build do backend')) {
        return false;
    }

    // 5. Build do frontend
    if (!runCommand('npm run build:frontend', 'Build do frontend')) {
        return false;
    }

    // 6. Build do Electron
    if (!runCommand('npm run build:electron', 'Build do Electron')) {
        return false;
    }

    // 7. Copiar assets
    if (!runCommand('npm run copy:all-assets', 'Copiando assets')) {
        return false;
    }

    // 8. Otimizar build
    if (!runCommand('npm run optimize:build', 'Otimizando build')) {
        return false;
    }

    // 9. Verificar build
    if (!runCommand('npm run verify:build', 'Verificando build')) {
        return false;
    }

    // 10. Testar build
    if (!runCommand('npm run test:standalone', 'Testando build')) {
        console.log('⚠️ Testes falharam, mas continuando...');
    }

    // 11. Criar executáveis
    console.log('\n🎯 Criando executáveis...');

    // Instalador
    if (!runCommand('npm run build:installer', 'Criando instalador')) {
        return false;
    }

    // Portable
    if (!runCommand('npm run build:portable', 'Criando versão portable')) {
        return false;
    }

    // 12. Listar arquivos gerados
    listGeneratedFiles();

    console.log('\n🎉 Release gerada com sucesso!');
    console.log('\n📋 Próximos passos:');
    console.log('   1. Teste os executáveis gerados');
    console.log('   2. Distribua os arquivos da pasta release/');
    console.log('   3. Consulte DISTRIBUTION.md para mais detalhes');

    return true;
}

// Executar geração
generateRelease().then(success => {
    if (!success) {
        console.error('\n❌ Falha na geração da release');
        process.exit(1);
    }
}).catch(error => {
    console.error('\n❌ Erro inesperado:', error.message);
    process.exit(1);
}); 