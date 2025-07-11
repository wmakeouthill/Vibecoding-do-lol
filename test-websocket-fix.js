#!/usr/bin/env node

/**
 * Script para testar as correções do WebSocket
 * Verifica se as mudanças foram aplicadas corretamente
 */

const fs = require('fs');
const path = require('path');

console.log('🔍 Verificando correções do WebSocket...\n');

// Verificar se as correções foram aplicadas
const checks = [
    {
        file: 'src/frontend/src/app/services/api.ts',
        description: 'Timeout no onWebSocketReady()',
        pattern: /maxWaitTime = 15000/,
        status: false
    },
    {
        file: 'src/frontend/src/app/services/discord-integration.service.ts',
        description: 'DiscordService usando ApiService',
        pattern: /WebSocket será gerenciado pelo ApiService/,
        status: false
    },
    {
        file: 'src/frontend/src/app/app.ts',
        description: 'Delay de 2 segundos na identificação',
        pattern: /setTimeout.*2000.*Aguardar 2 segundos/,
        status: false
    }
];

// Verificar cada arquivo
checks.forEach(check => {
    try {
        const filePath = path.join(__dirname, check.file);
        const content = fs.readFileSync(filePath, 'utf8');

        if (check.pattern.test(content)) {
            check.status = true;
            console.log(`✅ ${check.description}`);
        } else {
            console.log(`❌ ${check.description} - FALTANDO`);
        }
    } catch (error) {
        console.log(`❌ ${check.description} - ERRO: ${error.message}`);
    }
});

// Resumo
const passedChecks = checks.filter(c => c.status).length;
const totalChecks = checks.length;

console.log(`\n📊 Resultado: ${passedChecks}/${totalChecks} correções aplicadas`);

if (passedChecks === totalChecks) {
    console.log('🎉 Todas as correções foram aplicadas com sucesso!');
    console.log('\n📋 Próximos passos:');
    console.log('1. Reiniciar o aplicativo');
    console.log('2. Verificar se o erro "WebSocket não conectado" desapareceu');
    console.log('3. Monitorar os logs para confirmar conexão única');
} else {
    console.log('⚠️ Algumas correções podem não ter sido aplicadas corretamente.');
} 