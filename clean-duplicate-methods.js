const fs = require('fs');
const path = require('path');

// Caminho para os serviços
const servicesPath = path.join(__dirname, 'src', 'backend', 'services');

// Métodos duplicados identificados que podem ser removidos
const duplicateMethodsToRemove = [
    // Métodos que são delegados no MatchmakingService (remover duplicatas)
    { file: 'MatchmakingService.ts', method: 'processDraftAction', reason: 'Delegado para DraftService' },
    { file: 'MatchmakingService.ts', method: 'finalizeDraft', reason: 'Delegado para DraftService' },
    { file: 'MatchmakingService.ts', method: 'finishGame', reason: 'Delegado para GameInProgressService' },
    { file: 'MatchmakingService.ts', method: 'getActiveGame', reason: 'Delegado para GameInProgressService' },
    { file: 'MatchmakingService.ts', method: 'getActiveGamesCount', reason: 'Delegado para GameInProgressService' },
    { file: 'MatchmakingService.ts', method: 'getActiveGamesList', reason: 'Delegado para GameInProgressService' },
    { file: 'MatchmakingService.ts', method: 'acceptMatch', reason: 'Delegado para MatchFoundService' },
    { file: 'MatchmakingService.ts', method: 'declineMatch', reason: 'Delegado para MatchFoundService' },
    
    // Métodos privados duplicados (remover uma das implementações)
    { file: 'MatchmakingService.ts', method: 'prepareDraftData', reason: 'Duplicado do DraftService' },
    { file: 'MatchmakingService.ts', method: 'balanceTeamsAndAssignLanes', reason: 'Duplicado do DraftService' },
    { file: 'MatchmakingService.ts', method: 'assignLanesOptimized', reason: 'Duplicado do DraftService' },
    { file: 'MatchmakingService.ts', method: 'notifyDraftStarted', reason: 'Duplicado do DraftService' },
    { file: 'MatchmakingService.ts', method: 'notifyMatchCancelled', reason: 'Duplicado do MatchFoundService' },
];

// Métodos não utilizados identificados que podem ser removidos
const unusedMethodsToRemove = [
    { file: 'DataDragonService.ts', method: 'getChampionById', reason: 'Não utilizado' },
    { file: 'DataDragonService.ts', method: 'reloadChampions', reason: 'Não utilizado' },
    { file: 'DiscordService.ts', method: 'getCurrentChannelName', reason: 'Não utilizado' },
    { file: 'DiscordService.ts', method: 'broadcastUsersInChannelImmediate', reason: 'Não utilizado' },
    { file: 'LCUService.ts', method: 'stopGameMonitoring', reason: 'Não utilizado' },
    { file: 'LCUService.ts', method: 'createCustomLobby', reason: 'Não utilizado' },
    { file: 'LCUService.ts', method: 'invitePlayersToLobby', reason: 'Não utilizado' },
    { file: 'LCUService.ts', method: 'getCurrentSummonerWithRiotData', reason: 'Não utilizado' },
    { file: 'LCUService.ts', method: 'getCurrentRank', reason: 'Não utilizado' },
    { file: 'LCUService.ts', method: 'saveCustomMatchResult', reason: 'Não utilizado' },
    { file: 'MatchHistoryService.ts', method: 'getPublicSummonerData', reason: 'Não utilizado' },
    { file: 'MatchHistoryService.ts', method: 'getPlayerMatchHistory', reason: 'Não utilizado' },
    { file: 'MatchmakingService.ts', method: 'forceQueueUpdate', reason: 'Não utilizado' },
    { file: 'MatchmakingService.ts', method: 'isServiceActive', reason: 'Não utilizado' },
    { file: 'PlayerService.ts', method: 'registerPlayer', reason: 'Não utilizado' },
    { file: 'PlayerService.ts', method: 'updatePlayerFromRiotAPI', reason: 'Não utilizado' },
    { file: 'PlayerService.ts', method: 'searchPlayers', reason: 'Não utilizado' },
];

// Função para encontrar e remover método de um arquivo
function removeMethodFromFile(filePath, methodName) {
    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split('\n');
    
    // Encontrar o início do método
    let methodStartLine = -1;
    let methodEndLine = -1;
    let braceCount = 0;
    let inMethod = false;
    
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        
        // Procurar pela assinatura do método
        if (!inMethod && line.includes(methodName) && line.includes('(')) {
            // Verificar se é realmente a definição do método
            const methodRegex = new RegExp(`(?:public|private|protected)?\\s*(?:async\\s+)?${methodName}\\s*\\(`);
            if (methodRegex.test(line)) {
                methodStartLine = i;
                inMethod = true;
                
                // Contar chaves na linha da assinatura
                braceCount += (line.match(/\{/g) || []).length;
                braceCount -= (line.match(/\}/g) || []).length;
                
                // Se a linha já fecha o método
                if (braceCount === 0 && line.includes('}')) {
                    methodEndLine = i;
                    break;
                }
            }
        } else if (inMethod) {
            // Contar chaves para encontrar o fim do método
            braceCount += (line.match(/\{/g) || []).length;
            braceCount -= (line.match(/\}/g) || []).length;
            
            if (braceCount === 0) {
                methodEndLine = i;
                break;
            }
        }
    }
    
    if (methodStartLine !== -1 && methodEndLine !== -1) {
        // Remover as linhas do método
        const newLines = [
            ...lines.slice(0, methodStartLine),
            ...lines.slice(methodEndLine + 1)
        ];
        
        return newLines.join('\n');
    }
    
    return content; // Retornar conteúdo original se não encontrar
}

// Função principal para limpeza
function performMethodCleanup() {
    console.log('🧹 Iniciando limpeza de métodos duplicados e não utilizados...\n');
    
    const removedMethods = [];
    const failedRemovals = [];
    
    // Processar métodos duplicados
    console.log('🔄 Removendo métodos duplicados...');
    duplicateMethodsToRemove.forEach(({ file, method, reason }) => {
        const filePath = path.join(servicesPath, file);
        
        try {
            const originalContent = fs.readFileSync(filePath, 'utf8');
            const newContent = removeMethodFromFile(filePath, method);
            
            if (newContent !== originalContent) {
                fs.writeFileSync(filePath, newContent);
                console.log(`✅ Removido: ${method} de ${file} (${reason})`);
                removedMethods.push({ file, method, reason, type: 'duplicate' });
            } else {
                console.log(`❌ Falha ao remover: ${method} de ${file}`);
                failedRemovals.push({ file, method, reason });
            }
        } catch (error) {
            console.log(`❌ Erro ao processar ${file}: ${error.message}`);
            failedRemovals.push({ file, method, reason, error: error.message });
        }
    });
    
    // Processar métodos não utilizados
    console.log('\n🗑️  Removendo métodos não utilizados...');
    unusedMethodsToRemove.forEach(({ file, method, reason }) => {
        const filePath = path.join(servicesPath, file);
        
        try {
            const originalContent = fs.readFileSync(filePath, 'utf8');
            const newContent = removeMethodFromFile(filePath, method);
            
            if (newContent !== originalContent) {
                fs.writeFileSync(filePath, newContent);
                console.log(`✅ Removido: ${method} de ${file} (${reason})`);
                removedMethods.push({ file, method, reason, type: 'unused' });
            } else {
                console.log(`❌ Falha ao remover: ${method} de ${file}`);
                failedRemovals.push({ file, method, reason });
            }
        } catch (error) {
            console.log(`❌ Erro ao processar ${file}: ${error.message}`);
            failedRemovals.push({ file, method, reason, error: error.message });
        }
    });
    
    // Relatório final
    console.log('\n📊 RELATÓRIO DE LIMPEZA:');
    console.log('='.repeat(50));
    console.log(`Métodos removidos com sucesso: ${removedMethods.length}`);
    console.log(`Falhas na remoção: ${failedRemovals.length}`);
    
    if (removedMethods.length > 0) {
        console.log('\n✅ Métodos removidos:');
        removedMethods.forEach(({ file, method, reason, type }) => {
            console.log(`  - ${method} (${file}) - ${reason} [${type}]`);
        });
    }
    
    if (failedRemovals.length > 0) {
        console.log('\n❌ Falhas na remoção:');
        failedRemovals.forEach(({ file, method, reason, error }) => {
            console.log(`  - ${method} (${file}) - ${reason}${error ? ` [${error}]` : ''}`);
        });
    }
    
    // Salvar relatório
    const report = {
        timestamp: new Date().toISOString(),
        removedMethods,
        failedRemovals,
        totalRemoved: removedMethods.length,
        totalFailed: failedRemovals.length
    };
    
    fs.writeFileSync('METHOD_CLEANUP_REPORT.json', JSON.stringify(report, null, 2));
    console.log('\n📝 Relatório salvo em: METHOD_CLEANUP_REPORT.json');
    
    return report;
}

// Executar limpeza
performMethodCleanup();
