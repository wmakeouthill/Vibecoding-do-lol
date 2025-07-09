// Script para testar inicialização manual do backend em produção
// Simula exatamente como o Electron tenta iniciar o backend
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const http = require('http');

async function testBackendStartup() {
    console.log('=== TESTE DE INICIALIZAÇÃO DO BACKEND ===\n');
    
    // Caminhos de produção (do release)
    const releaseDir = 'C:\\Users\\wcaco\\OneDrive\\Documentos\\Vibecoding-do-lol\\release\\win-unpacked\\resources';
    const backendPath = path.join(releaseDir, 'backend', 'server.js');
    const nodeModulesPath = path.join(releaseDir, 'backend', 'node_modules');
    const backendDir = path.join(releaseDir, 'backend');
    
    console.log('Caminhos de teste:');
    console.log('- Backend:', backendPath);
    console.log('- Node modules:', nodeModulesPath);
    console.log('- Working dir:', backendDir);
    console.log();
    
    // Verificar arquivos
    console.log('Verificando arquivos:');
    console.log('- Backend exists:', fs.existsSync(backendPath));
    console.log('- Node modules exists:', fs.existsSync(nodeModulesPath));
    console.log('- Working dir exists:', fs.existsSync(backendDir));
    console.log();
    
    if (!fs.existsSync(backendPath)) {
        console.error('❌ Backend não encontrado!');
        return;
    }
    
    if (!fs.existsSync(nodeModulesPath)) {
        console.error('❌ Node modules não encontrados!');
        return;
    }
    
    // Configurar ambiente (igual ao backend-starter)
    const env = {
        ...process.env,
        NODE_PATH: nodeModulesPath,
        NODE_ENV: 'production',
        UV_THREADPOOL_SIZE: '4',
        NODE_OPTIONS: '--max-old-space-size=2048'
    };
    
    console.log('Ambiente configurado:');
    console.log('- NODE_PATH:', env.NODE_PATH);
    console.log('- NODE_ENV:', env.NODE_ENV);
    console.log();
    
    // Verificar se porta 3000 está livre
    console.log('Verificando porta 3000...');
    try {
        const request = http.request({ port: 3000, timeout: 1000 }, () => {
            console.log('⚠️ Porta 3000 já está em uso');
        });
        request.on('error', () => {
            console.log('✅ Porta 3000 está livre');
        });
        request.end();
    } catch (error) {
        console.log('✅ Porta 3000 está livre (erro esperado)');
    }
    
    console.log();
    console.log('🚀 Iniciando backend...');
    console.log('Comando: node', backendPath);
    console.log('Working dir:', backendDir);
    console.log();
    
    // Iniciar processo (igual ao backend-starter)
    const backendProcess = spawn('node', [backendPath], {
        stdio: 'pipe',
        env: env,
        cwd: backendDir,
        windowsHide: false
    });
    
    console.log('✅ Processo criado, PID:', backendProcess.pid);
    
    let startupSuccess = false;
    
    // Timeout de 30 segundos
    const timeout = setTimeout(() => {
        if (!startupSuccess) {
            console.log('❌ Timeout após 30 segundos');
            backendProcess.kill();
            process.exit(1);
        }
    }, 30000);
    
    // Capturar saída
    backendProcess.stdout.on('data', (data) => {
        const message = data.toString();
        console.log('📤 [STDOUT]', message.trim());
        
        // Detectar sucesso
        if (message.includes('Servidor rodando na porta') || 
            message.includes('listening on') || 
            message.includes('API disponível')) {
            
            console.log('🎯 Backend parece ter iniciado! Testando conectividade...');
            
            setTimeout(async () => {
                try {
                    const request = http.request({ port: 3000, path: '/health', timeout: 5000 }, (res) => {
                        console.log('✅ Backend está respondendo na porta 3000!');
                        console.log('Status:', res.statusCode);
                        startupSuccess = true;
                        clearTimeout(timeout);
                        backendProcess.kill();
                        process.exit(0);
                    });
                    request.on('error', (error) => {
                        console.log('❌ Backend não responde:', error.message);
                    });
                    request.end();
                } catch (error) {
                    console.log('❌ Erro no teste de conectividade:', error.message);
                }
            }, 3000);
        }
    });
    
    // Capturar erros
    backendProcess.stderr.on('data', (data) => {
        const message = data.toString();
        console.error('📥 [STDERR]', message.trim());
    });
    
    // Processo fechou
    backendProcess.on('close', (code, signal) => {
        console.log('🔚 Processo fechou - Code:', code, 'Signal:', signal);
        clearTimeout(timeout);
        if (code !== 0 && !startupSuccess) {
            console.error('❌ Backend falhou ao iniciar');
            process.exit(1);
        }
    });
    
    // Erro no processo
    backendProcess.on('error', (error) => {
        console.error('❌ Erro no processo:', error);
        clearTimeout(timeout);
        process.exit(1);
    });
    
    console.log('⏳ Aguardando inicialização...');
}

testBackendStartup().catch(error => {
    console.error('❌ Erro no teste:', error);
    process.exit(1);
});
