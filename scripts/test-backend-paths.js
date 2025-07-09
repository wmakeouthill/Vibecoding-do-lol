#!/usr/bin/env node

/**
 * Script para testar os caminhos do backend em produção
 * Simula exatamente o que o Electron fará em produção
 */

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

function findNodeExecutable() {
    const commonPaths = [
        'node',
        'C:\\Program Files\\nodejs\\node.exe',
        'C:\\Program Files (x86)\\nodejs\\node.exe',
        path.join(process.env.USERPROFILE || '', 'AppData\\Roaming\\npm\\node.exe'),
        path.join(process.env.PROGRAMFILES || '', 'nodejs\\node.exe'),
        path.join(process.env['PROGRAMFILES(X86)'] || '', 'nodejs\\node.exe')
    ];

    for (const nodePath of commonPaths) {
        try {
            const testProcess = spawn(nodePath, ['--version'], { stdio: 'pipe' });
            testProcess.kill();
            console.log(`✅ Node.js encontrado: ${nodePath}`);
            return nodePath;
        } catch (error) {
            // Continuar testando
        }
    }

    console.error('❌ Nenhum Node.js encontrado!');
    return null;
}

function getProductionPaths() {
    // Simular os caminhos que o Electron usará
    const projectRoot = path.resolve(__dirname, '..');
    
    // Simular aplicação não empacotada (como será durante o teste)
    const backendPath = path.join(projectRoot, 'dist', 'backend', 'server.js');
    const nodeModulesPath = path.join(projectRoot, 'dist', 'backend', 'node_modules');
    const envPath = path.join(projectRoot, 'dist', 'backend', '.env');
    
    return {
        backend: backendPath,
        nodeModules: nodeModulesPath,
        env: envPath
    };
}

async function testBackendStart() {
    console.log('🔍 [TEST] Diagnóstico dos caminhos do backend...');
    
    const paths = getProductionPaths();
    console.log('📁 Caminhos calculados:');
    console.log(`   - Backend: ${paths.backend}`);
    console.log(`   - Node modules: ${paths.nodeModules}`);
    console.log(`   - Arquivo .env: ${paths.env}`);
    
    console.log('\n🔍 Verificando arquivos:');
    console.log(`   - Backend existe: ${fs.existsSync(paths.backend) ? '✅' : '❌'}`);
    console.log(`   - Node modules existe: ${fs.existsSync(paths.nodeModules) ? '✅' : '❌'}`);
    console.log(`   - Arquivo .env existe: ${fs.existsSync(paths.env) ? '✅' : '❌'}`);
    
    if (!fs.existsSync(paths.backend)) {
        console.error('\n❌ Backend não encontrado!');
        console.error('💡 Execute: npm run build:complete');
        return false;
    }
    
    if (!fs.existsSync(paths.nodeModules)) {
        console.error('\n❌ Dependências não encontradas!');
        console.error('💡 Execute: npm run build:complete');
        return false;
    }
    
    const nodePath = findNodeExecutable();
    if (!nodePath) {
        console.error('\n❌ Node.js não encontrado!');
        return false;
    }
    
    console.log('\n🚀 Tentando iniciar o backend...');
    
    return new Promise((resolve) => {
        const backendDir = path.dirname(paths.backend);
        const env = {
            ...process.env,
            NODE_PATH: paths.nodeModules,
            NODE_ENV: 'production'
        };
        
        console.log(`📂 Comando: ${nodePath} ${paths.backend}`);
        console.log(`📁 Diretório: ${backendDir}`);
        console.log(`🔧 NODE_PATH: ${env.NODE_PATH}`);
        
        const backendProcess = spawn(nodePath, [paths.backend], {
            stdio: 'pipe',
            env: env,
            cwd: backendDir
        });
        
        let outputReceived = false;
        let errorReceived = false;
        
        const timeout = setTimeout(() => {
            console.log('\n⏰ Timeout de 15 segundos atingido');
            backendProcess.kill();
            
            if (outputReceived && !errorReceived) {
                console.log('✅ Backend iniciou mas demorou para ficar pronto');
                resolve(true);
            } else if (errorReceived) {
                console.log('❌ Backend teve erros durante inicialização');
                resolve(false);
            } else {
                console.log('❌ Backend não produziu saída (possível travamento)');
                resolve(false);
            }
        }, 15000);
        
        backendProcess.stdout.on('data', (data) => {
            const message = data.toString();
            console.log(`📤 [Backend] ${message.trim()}`);
            outputReceived = true;
            
            if (message.includes('Servidor rodando na porta') || 
                message.includes('listening on') ||
                message.includes('API disponível')) {
                console.log('\n✅ Backend iniciou com sucesso!');
                clearTimeout(timeout);
                backendProcess.kill();
                resolve(true);
            }
        });
        
        backendProcess.stderr.on('data', (data) => {
            const message = data.toString();
            console.error(`❌ [Backend Error] ${message.trim()}`);
            errorReceived = true;
            
            if (message.includes('Cannot find module') || 
                message.includes('MODULE_NOT_FOUND') ||
                message.includes('Error: Cannot resolve module')) {
                console.error('\n💥 Erro de dependências detectado!');
                console.error('💡 Solução: npm run build:complete');
                clearTimeout(timeout);
                backendProcess.kill();
                resolve(false);
            }
        });
        
        backendProcess.on('close', (code) => {
            clearTimeout(timeout);
            console.log(`\n🏁 Backend fechou com código: ${code}`);
            resolve(code === 0);
        });
        
        backendProcess.on('error', (error) => {
            clearTimeout(timeout);
            console.error(`\n💥 Erro ao iniciar backend: ${error.message}`);
            resolve(false);
        });
    });
}

async function main() {
    console.log('🧪 Teste dos caminhos do backend em produção\n');
    
    const success = await testBackendStart();
    
    if (success) {
        console.log('\n🎉 Teste concluído com SUCESSO!');
        console.log('✅ O backend deve funcionar no executável Electron');
    } else {
        console.log('\n❌ Teste FALHOU!');
        console.log('💡 Corrija os problemas antes de gerar o executável');
    }
    
    process.exit(success ? 0 : 1);
}

main().catch(console.error);
