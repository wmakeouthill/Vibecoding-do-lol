const fs = require('fs');
const path = require('path');

// Caminho para os serviços
const servicesPath = path.join(__dirname, 'src', 'backend', 'services');

// Função para extrair métodos de um arquivo com melhor precisão
function extractMethods(content, filename) {
    const methods = [];
    
    // Regex mais precisa para métodos TypeScript
    const methodRegex = /(?:public|private|protected)?\s*(async\s+)?(\w+)\s*\([^)]*\)\s*:\s*[\w\[\]<>|.\s]+\s*\{/g;
    
    let match;
    while ((match = methodRegex.exec(content)) !== null) {
        const methodName = match[2];
        
        // Ignorar constructors, palavras-chave e métodos comuns
        if (methodName !== 'constructor' && 
            methodName !== 'toString' && 
            methodName !== 'valueOf' &&
            methodName !== 'hasOwnProperty' &&
            methodName !== 'if' &&
            methodName !== 'catch' &&
            methodName !== 'for' &&
            methodName !== 'while' &&
            methodName !== 'switch' &&
            methodName !== 'try' &&
            methodName !== 'else' &&
            methodName !== 'return' &&
            methodName !== 'throw' &&
            methodName !== 'break' &&
            methodName !== 'continue' &&
            methodName !== 'console' &&
            methodName !== 'const' &&
            methodName !== 'let' &&
            methodName !== 'var' &&
            methodName !== 'function') {
            
            // Extrair informações sobre o método
            const startPos = match.index;
            const lineNumber = content.substring(0, startPos).split('\n').length;
            
            // Verificar se é público, privado ou protegido
            const visibility = match[0].includes('public') ? 'public' : 
                             match[0].includes('private') ? 'private' : 
                             match[0].includes('protected') ? 'protected' : 'inferred_public';
            
            const isAsync = match[0].includes('async');
            
            methods.push({
                name: methodName,
                visibility,
                isAsync,
                line: lineNumber,
                file: filename,
                fullMatch: match[0].trim()
            });
        }
    }
    
    return methods;
}

// Função para verificar uso de métodos no código
function checkMethodUsage(methodName, allFiles) {
    const usage = [];
    
    allFiles.forEach(file => {
        try {
            const content = fs.readFileSync(file, 'utf8');
            
            // Procurar chamadas do método (mais preciso)
            const patterns = [
                new RegExp(`\\b${methodName}\\s*\\(`, 'g'),  // método(
                new RegExp(`\\.${methodName}\\s*\\(`, 'g'),  // .método(
                new RegExp(`this\\.${methodName}\\s*\\(`, 'g') // this.método(
            ];
            
            patterns.forEach(pattern => {
                let match;
                while ((match = pattern.exec(content)) !== null) {
                    const lineNumber = content.substring(0, match.index).split('\n').length;
                    usage.push({
                        file: path.basename(file),
                        line: lineNumber,
                        context: content.split('\n')[lineNumber - 1].trim()
                    });
                }
            });
        } catch (error) {
            // Ignorar erros de leitura
        }
    });
    
    return usage;
}

// Função para encontrar métodos duplicados
function findDuplicateMethods() {
    const allMethods = [];
    
    // Ler todos os arquivos de serviços
    const files = fs.readdirSync(servicesPath).filter(file => file.endsWith('.ts'));
    
    files.forEach(file => {
        const filePath = path.join(servicesPath, file);
        const content = fs.readFileSync(filePath, 'utf8');
        const methods = extractMethods(content, file);
        allMethods.push(...methods);
    });
    
    // Agrupar métodos por nome
    const methodsByName = {};
    allMethods.forEach(method => {
        if (!methodsByName[method.name]) {
            methodsByName[method.name] = [];
        }
        methodsByName[method.name].push(method);
    });
    
    // Encontrar métodos duplicados
    const duplicates = {};
    const potentiallyUnused = [];
    
    Object.keys(methodsByName).forEach(methodName => {
        const methods = methodsByName[methodName];
        
        if (methods.length > 1) {
            // Verificar se são realmente duplicados (mesmo nome em arquivos diferentes)
            const files = [...new Set(methods.map(m => m.file))];
            if (files.length > 1) {
                duplicates[methodName] = methods;
            }
        }
        
        // Verificar métodos públicos que podem estar não utilizados
        const publicMethods = methods.filter(m => m.visibility === 'public' || m.visibility === 'inferred_public');
        if (publicMethods.length === 1) {
            potentiallyUnused.push(publicMethods[0]);
        }
    });
    
    return { duplicates, potentiallyUnused, allMethods };
}

// Executar análise
console.log('🔍 Analisando métodos duplicados e não utilizados (versão melhorada)...\n');

const { duplicates, potentiallyUnused, allMethods } = findDuplicateMethods();

// Coletar todos os arquivos do backend para verificar uso
const backendPath = path.join(__dirname, 'src', 'backend');
const allBackendFiles = [];

function collectFiles(dir) {
    try {
        const items = fs.readdirSync(dir);
        items.forEach(item => {
            const itemPath = path.join(dir, item);
            const stat = fs.statSync(itemPath);
            
            if (stat.isDirectory()) {
                collectFiles(itemPath);
            } else if (item.endsWith('.ts') || item.endsWith('.js')) {
                allBackendFiles.push(itemPath);
            }
        });
    } catch (error) {
        // Ignorar erros de acesso
    }
}

collectFiles(backendPath);

// Relatório de métodos duplicados
console.log('🔄 MÉTODOS DUPLICADOS ENCONTRADOS:');
console.log('='.repeat(60));

if (Object.keys(duplicates).length > 0) {
    Object.keys(duplicates).forEach(methodName => {
        const methods = duplicates[methodName];
        console.log(`\n📋 Método: ${methodName}`);
        console.log(`   Encontrado em ${methods.length} arquivos:`);
        
        methods.forEach(method => {
            console.log(`   - ${method.file}:${method.line} (${method.visibility}${method.isAsync ? ', async' : ''})`);
        });
        
        // Verificar uso
        const usage = checkMethodUsage(methodName, allBackendFiles);
        console.log(`   Uso encontrado: ${usage.length} ocorrências`);
        
        if (usage.length <= 5) {
            usage.forEach(u => {
                console.log(`     - ${u.file}:${u.line} -> ${u.context}`);
            });
        }
    });
} else {
    console.log('✅ Nenhum método duplicado encontrado.');
}

// Relatório de métodos potencialmente não utilizados
console.log('\n\n🔍 MÉTODOS PÚBLICOS POTENCIALMENTE NÃO UTILIZADOS:');
console.log('='.repeat(60));

const unusedMethods = [];

potentiallyUnused.forEach(method => {
    const usage = checkMethodUsage(method.name, allBackendFiles);
    
    // Considerar não utilizado se tem apenas 1 ou 2 ocorrências (definição + maybe uma chamada)
    if (usage.length <= 2) {
        unusedMethods.push({ method, usage });
    }
});

if (unusedMethods.length > 0) {
    unusedMethods.forEach(({ method, usage }) => {
        console.log(`\n❓ ${method.name} (${method.file}:${method.line})`);
        console.log(`   Visibilidade: ${method.visibility}${method.isAsync ? ', async' : ''}`);
        console.log(`   Uso encontrado: ${usage.length} ocorrências`);
        
        if (usage.length > 0) {
            usage.forEach(u => {
                console.log(`     - ${u.file}:${u.line} -> ${u.context}`);
            });
        }
    });
} else {
    console.log('✅ Todos os métodos públicos parecem estar em uso.');
}

// Relatório resumido de duplicados importantes
console.log('\n\n📊 RESUMO DE DUPLICADOS IMPORTANTES:');
console.log('='.repeat(60));

const importantDuplicates = Object.keys(duplicates).filter(name => {
    const methods = duplicates[name];
    return methods.some(m => m.visibility === 'public' || m.visibility === 'inferred_public');
});

if (importantDuplicates.length > 0) {
    importantDuplicates.forEach(methodName => {
        const methods = duplicates[methodName];
        const publicMethods = methods.filter(m => m.visibility === 'public' || m.visibility === 'inferred_public');
        
        if (publicMethods.length > 1) {
            console.log(`\n⚠️  ${methodName} - ${publicMethods.length} implementações públicas:`);
            publicMethods.forEach(method => {
                console.log(`   - ${method.file}:${method.line}`);
            });
        }
    });
} else {
    console.log('✅ Nenhum método público duplicado encontrado.');
}

// Estatísticas gerais
console.log('\n\n📈 ESTATÍSTICAS FINAIS:');
console.log('='.repeat(60));
console.log(`Total de métodos analisados: ${allMethods.length}`);
console.log(`Métodos duplicados (por nome): ${Object.keys(duplicates).length}`);
console.log(`Métodos públicos duplicados: ${importantDuplicates.length}`);
console.log(`Métodos potencialmente não utilizados: ${unusedMethods.length}`);
console.log(`Métodos públicos: ${allMethods.filter(m => m.visibility === 'public' || m.visibility === 'inferred_public').length}`);
console.log(`Métodos privados: ${allMethods.filter(m => m.visibility === 'private').length}`);
console.log(`Métodos assíncronos: ${allMethods.filter(m => m.isAsync).length}`);
console.log(`Arquivos analisados: ${fs.readdirSync(servicesPath).filter(f => f.endsWith('.ts')).length}`);

// Salvar relatório melhorado
const report = {
    timestamp: new Date().toISOString(),
    duplicates,
    unusedMethods: unusedMethods.map(({ method, usage }) => ({ method, usageCount: usage.length })),
    importantDuplicates,
    statistics: {
        totalMethods: allMethods.length,
        duplicateMethodNames: Object.keys(duplicates).length,
        publicDuplicates: importantDuplicates.length,
        potentiallyUnused: unusedMethods.length,
        publicMethods: allMethods.filter(m => m.visibility === 'public' || m.visibility === 'inferred_public').length,
        privateMethods: allMethods.filter(m => m.visibility === 'private').length,
        asyncMethods: allMethods.filter(m => m.isAsync).length,
        filesAnalyzed: fs.readdirSync(servicesPath).filter(f => f.endsWith('.ts')).length
    }
};

fs.writeFileSync('IMPROVED_METHOD_ANALYSIS_REPORT.json', JSON.stringify(report, null, 2));
console.log('\n📝 Relatório detalhado salvo em: IMPROVED_METHOD_ANALYSIS_REPORT.json');
