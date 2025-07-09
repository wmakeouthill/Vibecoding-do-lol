#!/usr/bin/env node

// Script para testar todas as conexões de produção
const fs = require('fs');
const path = require('path');
const http = require('http');
const { spawn } = require('child_process');

console.log('🧪 TESTE DE PRODUÇÃO - Conectividade para Electron');
console.log('================================================\n');

// Função para testar conectividade HTTP
function testHttp(url) {
    return new Promise((resolve) => {
        const req = http.get(url, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    const parsed = JSON.parse(data);
                    resolve({ success: true, data: parsed });
                } catch {
                    resolve({ success: true, data: data });
                }
            });
        });

        req.on('error', (error) => {
            resolve({ success: false, error: error.message });
        });

        req.setTimeout(5000, () => {
            req.destroy();
            resolve({ success: false, error: 'Timeout' });
        });
    });
}

// Função para testar WebSocket
function testWebSocket(url) {
    return new Promise((resolve) => {
        try {
            const WebSocket = require('ws');
            const ws = new WebSocket(url);

            const timeout = setTimeout(() => {
                ws.close();
                resolve({ success: false, error: 'Timeout' });
            }, 5000);

            ws.on('open', () => {
                clearTimeout(timeout);
                ws.close();
                resolve({ success: true });
            });

            ws.on('error', (error) => {
                clearTimeout(timeout);
                resolve({ success: false, error: error.message });
            });

        } catch (error) {
            resolve({ success: false, error: error.message });
        }
    });
}

// Função para verificar se arquivo existe
function checkFile(filePath) {
    try {
        return fs.existsSync(filePath);
    } catch {
        return false;
    }
}

async function runTests() {
    console.log('1. 📁 Verificando arquivos de build...');
    
    const buildFiles = [
        'dist/backend/server.js',
        'dist/frontend/index.html',
        'dist/.env',
        'src/electron/backend-starter.js'
    ];

    buildFiles.forEach(file => {
        const exists = checkFile(file);
        console.log(`   ${exists ? '✅' : '❌'} ${file}`);
    });

    console.log('\n2. 🔌 Testando conectividade de produção...');
    
    // Tentar iniciar backend temporariamente para teste
    console.log('   🚀 Iniciando backend de teste...');
    
    const backend = spawn('node', ['dist/backend/server.js'], {
        stdio: 'pipe',
        env: { ...process.env, NODE_ENV: 'production' }
    });

    // Aguardar backend iniciar
    await new Promise(resolve => setTimeout(resolve, 5000));

    // Testar HTTP
    console.log('   🌐 Testando HTTP API...');
    const httpTest = await testHttp('http://127.0.0.1:3000/api/health');
    console.log(`   ${httpTest.success ? '✅' : '❌'} HTTP: ${httpTest.success ? 'OK' : httpTest.error}`);

    // Testar WebSocket
    console.log('   🔌 Testando WebSocket...');
    const wsTest = await testWebSocket('ws://127.0.0.1:3000/ws');
    console.log(`   ${wsTest.success ? '✅' : '❌'} WebSocket: ${wsTest.success ? 'OK' : wsTest.error}`);

    // Fechar backend
    backend.kill();

    console.log('\n3. 📋 Resumo dos Testes');
    console.log('=======================');
    
    const allGood = httpTest.success && wsTest.success;
    
    if (allGood) {
        console.log('✅ TODOS OS TESTES PASSARAM');
        console.log('🎉 A aplicação deve funcionar corretamente em produção!');
    } else {
        console.log('❌ ALGUNS TESTES FALHARAM');
        console.log('🔧 Verifique os logs acima para detalhes.');
        
        if (!httpTest.success) {
            console.log('💡 HTTP falhou - backend pode não estar iniciando corretamente');
        }
        
        if (!wsTest.success) {
            console.log('💡 WebSocket falhou - conexão em tempo real não funcionará');
        }
    }

    console.log('\n4. 🚀 Próximos Passos');
    console.log('===================');
    console.log('Se os testes passaram:');
    console.log('  • npm run build:all  (rebuildar tudo)');
    console.log('  • npm run dist        (gerar executável)');
    console.log('  • Testar executável');
    
    process.exit(allGood ? 0 : 1);
}

runTests().catch(error => {
    console.error('❌ Erro durante os testes:', error);
    process.exit(1);
});
