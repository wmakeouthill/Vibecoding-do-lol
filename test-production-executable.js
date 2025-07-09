// Script para testar o executável de produção com logging
// Roda o executável e captura todos os logs

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

console.log('=== TESTE DO EXECUTÁVEL DE PRODUÇÃO ===\n');

// Caminho para o executável
const exePath = 'C:\\Users\\wcaco\\OneDrive\\Documentos\\Vibecoding-do-lol\\release\\win-unpacked\\LoL Matchmaking.exe';

console.log('Executável:', exePath);
console.log('Existe:', fs.existsSync(exePath));
console.log();

if (!fs.existsSync(exePath)) {
    console.error('❌ Executável não encontrado!');
    console.error('💡 Execute: npm run build:complete');
    process.exit(1);
}

console.log('🚀 Iniciando executável de produção...');
console.log('📋 Capturando TODOS os logs (incluindo do backend-starter)...');
console.log('⏳ Aguarde pelo menos 60 segundos para o backend inicializar...');
console.log();

// Iniciar o executável
const electronProcess = spawn(exePath, [], {
    stdio: 'pipe',
    windowsHide: false
});

console.log('✅ Processo iniciado, PID:', electronProcess.pid);

let logCount = 0;

// Capturar stdout
electronProcess.stdout.on('data', (data) => {
    const message = data.toString().trim();
    logCount++;
    console.log(`📤 [${logCount}] [STDOUT]`, message);
});

// Capturar stderr
electronProcess.stderr.on('data', (data) => {
    const message = data.toString().trim();
    logCount++;
    console.log(`📥 [${logCount}] [STDERR]`, message);
});

// Processo fechou
electronProcess.on('close', (code, signal) => {
    console.log();
    console.log('🔚 Processo fechou');
    console.log('- Code:', code);
    console.log('- Signal:', signal);
    console.log('- Total de logs capturados:', logCount);
    
    if (code === 0) {
        console.log('✅ Executável fechou normalmente');
    } else {
        console.log('❌ Executável fechou com erro');
    }
});

// Erro no processo
electronProcess.on('error', (error) => {
    console.error('❌ Erro no processo:', error);
});

// Timeout de 2 minutos
const timeout = setTimeout(() => {
    console.log();
    console.log('⏰ Timeout de 2 minutos atingido');
    console.log('🔪 Finalizando processo...');
    electronProcess.kill();
    
    setTimeout(() => {
        console.log('🏁 Teste finalizado');
        process.exit(0);
    }, 2000);
}, 120000);

// Capturar Ctrl+C para finalizar graciosamente
process.on('SIGINT', () => {
    console.log();
    console.log('🛑 Interrompido pelo usuário');
    clearTimeout(timeout);
    electronProcess.kill();
    
    setTimeout(() => {
        console.log('🏁 Teste finalizado');
        process.exit(0);
    }, 2000);
});
