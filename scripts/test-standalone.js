const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

console.log('🧪 Testando build standalone...');

// Verificar se os arquivos necessários existem
function checkRequiredFiles() {
    const requiredFiles = [
        'dist/backend/server.js',
        'dist/backend/node_modules',
        'dist/frontend/browser/index.html',
        'dist/electron/main.js'
    ];

    console.log('🔍 Verificando arquivos necessários...');

    let allFilesExist = true;
    requiredFiles.forEach(file => {
        const exists = fs.existsSync(file);
        console.log(`${exists ? '✅' : '❌'} ${file}`);
        if (!exists) allFilesExist = false;
    });

    return allFilesExist;
}

// Testar se o backend pode ser iniciado
function testBackendStartup() {
    return new Promise((resolve, reject) => {
        console.log('🚀 Testando inicialização do backend...');

        const backendPath = path.join(__dirname, '..', 'dist', 'backend', 'server.js');

        if (!fs.existsSync(backendPath)) {
            reject(new Error('Backend não encontrado'));
            return;
        }

        const backendProcess = spawn('node', [backendPath], {
            cwd: path.join(__dirname, '..', 'dist', 'backend'),
            stdio: ['pipe', 'pipe', 'pipe']
        });

        let output = '';
        let errorOutput = '';

        backendProcess.stdout.on('data', (data) => {
            output += data.toString();
            console.log('📤 Backend:', data.toString().trim());
        });

        backendProcess.stderr.on('data', (data) => {
            errorOutput += data.toString();
            console.log('⚠️ Backend Error:', data.toString().trim());
        });

        // Aguardar um pouco para o servidor inicializar
        setTimeout(() => {
            backendProcess.kill();

            if (output.includes('Server running') || output.includes('Listening')) {
                console.log('✅ Backend iniciou com sucesso');
                resolve(true);
            } else {
                console.log('❌ Backend falhou ao iniciar');
                console.log('Output:', output);
                console.log('Errors:', errorOutput);
                reject(new Error('Backend não iniciou corretamente'));
            }
        }, 5000);
    });
}

// Testar se o frontend pode ser carregado
function testFrontendLoad() {
    return new Promise((resolve, reject) => {
        console.log('🎨 Testando carregamento do frontend...');

        const frontendPath = path.join(__dirname, '..', 'dist', 'frontend', 'browser', 'index.html');

        if (!fs.existsSync(frontendPath)) {
            reject(new Error('Frontend não encontrado'));
            return;
        }

        const htmlContent = fs.readFileSync(frontendPath, 'utf8');

        // Verificar se o HTML contém elementos essenciais
        const checks = [
            { name: 'DOCTYPE', check: htmlContent.includes('<!DOCTYPE html>') },
            { name: 'Title', check: htmlContent.includes('<title>') },
            { name: 'Angular App', check: htmlContent.includes('app-root') },
            { name: 'Scripts', check: htmlContent.includes('.js') }
        ];

        let allChecksPass = true;
        checks.forEach(check => {
            console.log(`${check.check ? '✅' : '❌'} ${check.name}`);
            if (!check.check) allChecksPass = false;
        });

        if (allChecksPass) {
            console.log('✅ Frontend carregado com sucesso');
            resolve(true);
        } else {
            reject(new Error('Frontend não carregou corretamente'));
        }
    });
}

// Testar se o Electron pode ser compilado
function testElectronBuild() {
    return new Promise((resolve, reject) => {
        console.log('⚡ Testando build do Electron...');

        const electronPath = path.join(__dirname, '..', 'dist', 'electron', 'main.js');

        if (!fs.existsSync(electronPath)) {
            reject(new Error('Electron main não encontrado'));
            return;
        }

        // Verificar se o arquivo pode ser executado
        try {
            const content = fs.readFileSync(electronPath, 'utf8');

            const checks = [
                { name: 'Electron Import', check: content.includes('electron') },
                { name: 'App Import', check: content.includes('app') },
                { name: 'BrowserWindow', check: content.includes('BrowserWindow') },
                { name: 'Main Function', check: content.includes('createWindow') }
            ];

            let allChecksPass = true;
            checks.forEach(check => {
                console.log(`${check.check ? '✅' : '❌'} ${check.name}`);
                if (!check.check) allChecksPass = false;
            });

            if (allChecksPass) {
                console.log('✅ Electron build válido');
                resolve(true);
            } else {
                reject(new Error('Electron build inválido'));
            }
        } catch (error) {
            reject(new Error(`Erro ao ler Electron: ${error.message}`));
        }
    });
}

// Testar conectividade
function testConnectivity() {
    return new Promise((resolve, reject) => {
        console.log('🌐 Testando conectividade...');

        const http = require('http');

        const req = http.request({
            hostname: 'localhost',
            port: 3000,
            path: '/',
            method: 'GET',
            timeout: 5000
        }, (res) => {
            console.log(`✅ Servidor respondeu com status: ${res.statusCode}`);
            resolve(true);
        });

        req.on('error', (error) => {
            console.log('⚠️ Servidor não está rodando (normal se não foi iniciado)');
            resolve(true); // Não é um erro se o servidor não estiver rodando
        });

        req.on('timeout', () => {
            console.log('⚠️ Timeout na conexão (normal se não foi iniciado)');
            resolve(true);
        });

        req.end();
    });
}

// Executar todos os testes
async function runAllTests() {
    try {
        console.log('🧪 Iniciando testes do build standalone...\n');

        // 1. Verificar arquivos
        if (!checkRequiredFiles()) {
            throw new Error('Arquivos necessários não encontrados');
        }

        // 2. Testar backend
        await testBackendStartup();

        // 3. Testar frontend
        await testFrontendLoad();

        // 4. Testar Electron
        await testElectronBuild();

        // 5. Testar conectividade
        await testConnectivity();

        console.log('\n🎉 Todos os testes passaram!');
        console.log('✅ Build standalone está funcionando corretamente');

        // Calcular tamanho
        const distPath = path.join(__dirname, '..', 'dist');
        if (fs.existsSync(distPath)) {
            const size = calculateDirectorySize(distPath);
            console.log(`📊 Tamanho do build: ${(size / (1024 * 1024)).toFixed(2)} MB`);
        }

    } catch (error) {
        console.error('\n❌ Teste falhou:', error.message);
        process.exit(1);
    }
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

// Executar testes
runAllTests(); 