const fs = require('fs');
const path = require('path');

// Caminho para os serviços
const servicesPath = path.join(__dirname, 'src', 'backend', 'services');

// Função para remover método específico de um arquivo
function removeMethodFromFile(filePath, methodName) {
    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split('\n');
    
    // Encontrar o método e suas linhas
    let methodStartLine = -1;
    let methodEndLine = -1;
    let braceCount = 0;
    let inMethod = false;
    
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        
        // Procurar pela assinatura do método
        if (!inMethod && line.includes(methodName) && line.includes('(')) {
            // Regex mais específica para a assinatura do método
            const methodRegex = new RegExp(`^\\s*(?:public|private|protected)?\\s*(?:async\\s+)?${methodName}\\s*\\(`);
            if (methodRegex.test(line)) {
                methodStartLine = i;
                inMethod = true;
                
                // Contar chaves
                braceCount += (line.match(/\{/g) || []).length;
                braceCount -= (line.match(/\}/g) || []).length;
                
                // Se o método é de uma linha só
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
        // Remover as linhas do método (incluindo linha vazia após, se existir)
        const newLines = [
            ...lines.slice(0, methodStartLine),
            ...lines.slice(methodEndLine + 1)
        ];
        
        // Remover linha vazia extra se existir
        if (newLines[methodStartLine] && newLines[methodStartLine].trim() === '') {
            newLines.splice(methodStartLine, 1);
        }
        
        return newLines.join('\n');
    }
    
    return content;
}

// Limpeza cuidadosa - apenas métodos delegados no MatchmakingService
function performCarefulCleanup() {
    console.log('🧹 Realizando limpeza cuidadosa de métodos delegados...\n');
    
    const methodsToRemove = [
        // Métodos que são apenas delegados no MatchmakingService
        { file: 'MatchmakingService.ts', method: 'processDraftAction' },
        { file: 'MatchmakingService.ts', method: 'finalizeDraft' },
        { file: 'MatchmakingService.ts', method: 'finishGame' },
        { file: 'MatchmakingService.ts', method: 'getActiveGame' },
        { file: 'MatchmakingService.ts', method: 'getActiveGamesCount' },
        { file: 'MatchmakingService.ts', method: 'getActiveGamesList' },
        { file: 'MatchmakingService.ts', method: 'acceptMatch' },
        { file: 'MatchmakingService.ts', method: 'declineMatch' },
        
        // Métodos privados duplicados que não são usados no MatchmakingService
        { file: 'MatchmakingService.ts', method: 'prepareDraftData' },
        { file: 'MatchmakingService.ts', method: 'notifyDraftStarted' },
        { file: 'MatchmakingService.ts', method: 'notifyMatchCancelled' }
    ];
    
    const removedMethods = [];
    const failedRemovals = [];
    
    methodsToRemove.forEach(({ file, method }) => {
        const filePath = path.join(servicesPath, file);
        
        try {
            console.log(`🔍 Processando remoção de: ${method} em ${file}`);
            
            const originalContent = fs.readFileSync(filePath, 'utf8');
            const newContent = removeMethodFromFile(filePath, method);
            
            if (newContent !== originalContent) {
                fs.writeFileSync(filePath, newContent);
                console.log(`✅ Removido: ${method} de ${file}`);
                removedMethods.push({ file, method });
            } else {
                console.log(`❌ Método não encontrado: ${method} em ${file}`);
                failedRemovals.push({ file, method, reason: 'Método não encontrado' });
            }
        } catch (error) {
            console.log(`❌ Erro ao processar ${file}: ${error.message}`);
            failedRemovals.push({ file, method, reason: error.message });
        }
    });
    
    // Remover alguns métodos não utilizados seguros
    const safeUnusedMethods = [
        { file: 'MatchmakingService.ts', method: 'forceQueueUpdate' },
        { file: 'MatchmakingService.ts', method: 'isServiceActive' },
        { file: 'DataDragonService.ts', method: 'reloadChampions' },
        { file: 'LCUService.ts', method: 'stopGameMonitoring' },
        { file: 'LCUService.ts', method: 'createCustomLobby' },
        { file: 'LCUService.ts', method: 'invitePlayersToLobby' },
        { file: 'LCUService.ts', method: 'saveCustomMatchResult' }
    ];
    
    console.log('\n🗑️  Removendo métodos não utilizados seguros...');
    
    safeUnusedMethods.forEach(({ file, method }) => {
        const filePath = path.join(servicesPath, file);
        
        try {
            console.log(`🔍 Processando remoção de: ${method} em ${file}`);
            
            const originalContent = fs.readFileSync(filePath, 'utf8');
            const newContent = removeMethodFromFile(filePath, method);
            
            if (newContent !== originalContent) {
                fs.writeFileSync(filePath, newContent);
                console.log(`✅ Removido: ${method} de ${file}`);
                removedMethods.push({ file, method });
            } else {
                console.log(`❌ Método não encontrado: ${method} em ${file}`);
                failedRemovals.push({ file, method, reason: 'Método não encontrado' });
            }
        } catch (error) {
            console.log(`❌ Erro ao processar ${file}: ${error.message}`);
            failedRemovals.push({ file, method, reason: error.message });
        }
    });
    
    // Relatório final
    console.log('\n📊 RELATÓRIO FINAL:');
    console.log('='.repeat(50));
    console.log(`Métodos removidos: ${removedMethods.length}`);
    console.log(`Falhas: ${failedRemovals.length}`);
    
    if (removedMethods.length > 0) {
        console.log('\n✅ Métodos removidos:');
        removedMethods.forEach(({ file, method }) => {
            console.log(`  - ${method} (${file})`);
        });
    }
    
    if (failedRemovals.length > 0) {
        console.log('\n❌ Falhas:');
        failedRemovals.forEach(({ file, method, reason }) => {
            console.log(`  - ${method} (${file}) - ${reason}`);
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
    
    fs.writeFileSync('CAREFUL_CLEANUP_REPORT.json', JSON.stringify(report, null, 2));
    console.log('\n📝 Relatório salvo em: CAREFUL_CLEANUP_REPORT.json');
}

// Executar limpeza
performCarefulCleanup();
