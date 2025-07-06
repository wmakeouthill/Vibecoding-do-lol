const fs = require('fs');
const path = require('path');

// Caminho para os serviços
const servicesPath = path.join(__dirname, 'src', 'backend', 'services');

// Função para extrair métodos de um arquivo
function extractMethods(content, filename) {
    const methods = [];
    
    // Regex para encontrar métodos públicos, privados e protected
    const methodRegex = /(?:public|private|protected)?\s+(\w+)\s*\([^)]*\)\s*(?::\s*[\w\[\]<>|]+)?\s*\{/g;
    
    let match;
    while ((match = methodRegex.exec(content)) !== null) {
        const methodName = match[1];
        
        // Ignorar constructors e métodos comuns
        if (methodName !== 'constructor' && 
            methodName !== 'toString' && 
            methodName !== 'valueOf' &&
            methodName !== 'hasOwnProperty') {
            
            // Extrair informações sobre o método
            const startPos = match.index;
            const lineNumber = content.substring(0, startPos).split('\n').length;
            
            // Verificar se é público, privado ou protegido
            const visibility = match[0].includes('public') ? 'public' : 
                             match[0].includes('private') ? 'private' : 
                             match[0].includes('protected') ? 'protected' : 'public';
            
            methods.push({
                name: methodName,
                visibility,
                line: lineNumber,
                file: filename,
                fullMatch: match[0]
            });
        }
    }
    
    return methods;
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
        const publicMethods = methods.filter(m => m.visibility === 'public');
        if (publicMethods.length === 1) {
            potentiallyUnused.push(publicMethods[0]);
        }
    });
    
    return { duplicates, potentiallyUnused, allMethods };
}

// Função para verificar uso de métodos
function checkMethodUsage(methodName, allFiles) {
    const usage = [];
    
    allFiles.forEach(file => {
        const content = fs.readFileSync(file, 'utf8');
        
        // Procurar chamadas do método
        const callRegex = new RegExp(`\\b${methodName}\\s*\\(`, 'g');
        let match;
        
        while ((match = callRegex.exec(content)) !== null) {
            const lineNumber = content.substring(0, match.index).split('\n').length;
            usage.push({
                file: path.basename(file),
                line: lineNumber,
                context: content.split('\n')[lineNumber - 1].trim()
            });
        }
    });
    
    return usage;
}

// Executar análise
console.log('🔍 Analisando métodos duplicados e não utilizados...\n');

const { duplicates, potentiallyUnused, allMethods } = findDuplicateMethods();

// Coletar todos os arquivos do backend para verificar uso
const backendPath = path.join(__dirname, 'src', 'backend');
const allBackendFiles = [];

function collectFiles(dir) {
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
}

collectFiles(backendPath);

// Relatório de métodos duplicados
if (Object.keys(duplicates).length > 0) {
    console.log('🔄 MÉTODOS DUPLICADOS ENCONTRADOS:');
    console.log('='.repeat(50));
    
    Object.keys(duplicates).forEach(methodName => {
        const methods = duplicates[methodName];
        console.log(`\n📋 Método: ${methodName}`);
        console.log(`   Encontrado em ${methods.length} arquivos:`);
        
        methods.forEach(method => {
            console.log(`   - ${method.file}:${method.line} (${method.visibility})`);
        });
        
        // Verificar uso
        const usage = checkMethodUsage(methodName, allBackendFiles);
        console.log(`   Uso encontrado: ${usage.length} ocorrências`);
    });
} else {
    console.log('✅ Nenhum método duplicado encontrado.');
}

// Relatório de métodos potencialmente não utilizados
console.log('\n\n🔍 MÉTODOS PÚBLICOS POTENCIALMENTE NÃO UTILIZADOS:');
console.log('='.repeat(50));

if (potentiallyUnused.length > 0) {
    potentiallyUnused.forEach(method => {
        const usage = checkMethodUsage(method.name, allBackendFiles);
        
        if (usage.length <= 1) { // Apenas a definição
            console.log(`\n❓ ${method.name} (${method.file}:${method.line})`);
            console.log(`   Uso encontrado: ${usage.length} ocorrências`);
            
            if (usage.length > 0) {
                usage.forEach(u => {
                    console.log(`   - ${u.file}:${u.line} -> ${u.context}`);
                });
            }
        }
    });
} else {
    console.log('✅ Todos os métodos públicos parecem estar em uso.');
}

// Estatísticas gerais
console.log('\n\n📊 ESTATÍSTICAS GERAIS:');
console.log('='.repeat(50));
console.log(`Total de métodos analisados: ${allMethods.length}`);
console.log(`Métodos duplicados: ${Object.keys(duplicates).length}`);
console.log(`Métodos públicos: ${allMethods.filter(m => m.visibility === 'public').length}`);
console.log(`Métodos privados: ${allMethods.filter(m => m.visibility === 'private').length}`);
console.log(`Métodos protegidos: ${allMethods.filter(m => m.visibility === 'protected').length}`);
console.log(`Arquivos analisados: ${fs.readdirSync(servicesPath).filter(f => f.endsWith('.ts')).length}`);

// Salvar relatório detalhado
const report = {
    timestamp: new Date().toISOString(),
    duplicates,
    potentiallyUnused: potentiallyUnused.filter(method => {
        const usage = checkMethodUsage(method.name, allBackendFiles);
        return usage.length <= 1;
    }),
    statistics: {
        totalMethods: allMethods.length,
        duplicateMethods: Object.keys(duplicates).length,
        publicMethods: allMethods.filter(m => m.visibility === 'public').length,
        privateMethods: allMethods.filter(m => m.visibility === 'private').length,
        protectedMethods: allMethods.filter(m => m.visibility === 'protected').length,
        filesAnalyzed: fs.readdirSync(servicesPath).filter(f => f.endsWith('.ts')).length
    }
};

fs.writeFileSync('METHOD_DUPLICATES_REPORT.json', JSON.stringify(report, null, 2));
console.log('\n📝 Relatório salvo em: METHOD_DUPLICATES_REPORT.json');
