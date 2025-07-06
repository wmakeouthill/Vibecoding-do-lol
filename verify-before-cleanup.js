const fs = require('fs');
const path = require('path');

// Caminho para os serviços
const servicesPath = path.join(__dirname, 'src', 'backend', 'services');
const backupPath = path.join(__dirname, 'backup-services');

// Criar backup dos serviços
function createBackup() {
    console.log('💾 Criando backup dos serviços...');
    
    if (!fs.existsSync(backupPath)) {
        fs.mkdirSync(backupPath, { recursive: true });
    }
    
    const files = fs.readdirSync(servicesPath).filter(file => file.endsWith('.ts'));
    
    files.forEach(file => {
        const sourcePath = path.join(servicesPath, file);
        const targetPath = path.join(backupPath, file);
        
        fs.copyFileSync(sourcePath, targetPath);
        console.log(`✅ Backup criado: ${file}`);
    });
    
    console.log(`📁 Backup completo em: ${backupPath}\n`);
}

// Verificar se métodos estão sendo realmente usados
function verifyMethodUsage() {
    console.log('🔍 Verificando uso de métodos antes da remoção...\n');
    
    // Coletar todos os arquivos do backend
    const allFiles = [];
    
    function collectFiles(dir) {
        try {
            const items = fs.readdirSync(dir);
            items.forEach(item => {
                const itemPath = path.join(dir, item);
                const stat = fs.statSync(itemPath);
                
                if (stat.isDirectory()) {
                    collectFiles(itemPath);
                } else if (item.endsWith('.ts') || item.endsWith('.js')) {
                    allFiles.push(itemPath);
                }
            });
        } catch (error) {
            // Ignorar erros
        }
    }
    
    collectFiles(path.join(__dirname, 'src', 'backend'));
    
    // Métodos para verificar
    const methodsToCheck = [
        'processDraftAction', 'finalizeDraft', 'finishGame', 'getActiveGame', 
        'getActiveGamesCount', 'getActiveGamesList', 'acceptMatch', 'declineMatch',
        'prepareDraftData', 'balanceTeamsAndAssignLanes', 'assignLanesOptimized',
        'notifyDraftStarted', 'notifyMatchCancelled'
    ];
    
    methodsToCheck.forEach(methodName => {
        console.log(`🔍 Verificando uso de: ${methodName}`);
        let usageCount = 0;
        const usages = [];
        
        allFiles.forEach(file => {
            try {
                const content = fs.readFileSync(file, 'utf8');
                const lines = content.split('\n');
                
                lines.forEach((line, index) => {
                    if (line.includes(methodName + '(') && 
                        !line.trim().startsWith('//') && 
                        !line.trim().startsWith('*')) {
                        
                        usageCount++;
                        usages.push({
                            file: path.basename(file),
                            line: index + 1,
                            context: line.trim()
                        });
                    }
                });
            } catch (error) {
                // Ignorar erros
            }
        });
        
        console.log(`  Usos encontrados: ${usageCount}`);
        if (usageCount > 0 && usageCount <= 5) {
            usages.forEach(usage => {
                console.log(`    - ${usage.file}:${usage.line} -> ${usage.context}`);
            });
        }
        console.log('');
    });
}

// Executar verificação
createBackup();
verifyMethodUsage();
