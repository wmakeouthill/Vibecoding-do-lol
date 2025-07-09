#!/usr/bin/env node

/**
 * Diagnóstico completo para builds de produção
 * Verifica se todas as conexões estão usando 127.0.0.1 em produção
 */

const fs = require('fs');
const path = require('path');

console.log('🔍 Diagnóstico de Build de Produção');
console.log('=====================================\n');

function analyzeFile(filePath, fileName) {
    if (!fs.existsSync(filePath)) {
        console.log(`❌ ${fileName}: Arquivo não encontrado`);
        return false;
    }

    try {
        const content = fs.readFileSync(filePath, 'utf8');
        console.log(`✅ ${fileName}: Analisando...`);

        // Verificar problemas específicos
        const issues = [];
        const suggestions = [];

        // 1. Verificar localhost usage em contexto de produção
        const localhostMatches = content.match(/localhost/g);
        if (localhostMatches && localhostMatches.length > 0) {
            const lines = content.split('\n');
            const problematicLines = [];
            
            lines.forEach((line, index) => {
                if (line.includes('localhost') && !line.includes('//')) {
                    // Verificar se é em contexto de dev ou produção
                    const isInDevContext = line.includes('isDev') || 
                                         line.includes('development') || 
                                         line.includes('fallback') ||
                                         line.includes('Em desenvolvimento') ||
                                         line.includes('dev server');
                    
                    if (!isInDevContext) {
                        problematicLines.push({
                            line: index + 1,
                            content: line.trim()
                        });
                    }
                }
            });

            if (problematicLines.length > 0) {
                issues.push(`Uso de localhost fora de contexto dev (${problematicLines.length} ocorrências)`);
                problematicLines.forEach(p => {
                    console.log(`  ⚠️  Linha ${p.line}: ${p.content}`);
                });
                suggestions.push('Substituir localhost por 127.0.0.1 em contextos de produção');
            }
        }

        // 2. Verificar configurações de IP específicas
        if (content.includes('baseUrl') && !content.includes('127.0.0.1')) {
            const baseUrlPattern = /baseUrl.*=.*['"`]([^'"`]*)['"]/g;
            let match;
            while ((match = baseUrlPattern.exec(content)) !== null) {
                if (match[1].includes('localhost') && !match[0].includes('isDev')) {
                    issues.push(`baseUrl usa localhost em contexto não-dev: ${match[1]}`);
                }
            }
        }

        // 3. Verificar NODE_ENV e mode detection
        if (content.includes('NODE_ENV') || content.includes('isDev')) {
            console.log(`  📋 Detecta ambiente: ✅`);
        } else if (fileName.includes('server') || fileName.includes('main')) {
            issues.push('Não detecta ambiente de desenvolvimento/produção');
            suggestions.push('Adicionar detecção de NODE_ENV ou isDev');
        }

        // 4. Verificar fallback URLs
        if (content.includes('fallbackUrls') || content.includes('tryWithFallback')) {
            console.log(`  🔄 Sistema de fallback: ✅`);
        }

        // 5. Verificar configurações específicas por arquivo
        if (fileName.includes('api.ts') || fileName.includes('api.js')) {
            // Frontend API service
            if (content.includes('isElectron()')) {
                console.log(`  🖥️  Detecção Electron: ✅`);
            } else {
                issues.push('Frontend não detecta ambiente Electron');
            }

            if (content.includes('127.0.0.1') && content.includes('Electron')) {
                console.log(`  🎯 IP direto para Electron: ✅`);
            } else {
                issues.push('Frontend não usa 127.0.0.1 para Electron');
            }
        }

        if (fileName.includes('server.ts') || fileName.includes('server.js')) {
            // Backend server
            if (content.includes('0.0.0.0') && content.includes('PORT')) {
                console.log(`  🌐 Bind em todas as interfaces: ✅`);
            }

            if (content.includes('127.0.0.1') && content.includes('production')) {
                console.log(`  🎯 Logs usando 127.0.0.1: ✅`);
            }
        }

        if (fileName.includes('main.ts') || fileName.includes('main.js')) {
            // Electron main
            if (content.includes('127.0.0.1:3000') && content.includes('produção')) {
                console.log(`  🖥️  Frontend via 127.0.0.1: ✅`);
            } else {
                issues.push('Electron main não carrega frontend via 127.0.0.1');
            }

            if (content.includes('BackendStarter')) {
                console.log(`  🚀 Backend starter robusto: ✅`);
            }
        }

        // Exibir resultado
        if (issues.length === 0) {
            console.log(`  ✅ Sem problemas detectados\n`);
            return true;
        } else {
            console.log(`  ❌ ${issues.length} problema(s) encontrado(s):`);
            issues.forEach(issue => console.log(`     - ${issue}`));
            
            if (suggestions.length > 0) {
                console.log(`  💡 Sugestões:`);
                suggestions.forEach(suggestion => console.log(`     - ${suggestion}`));
            }
            console.log('');
            return false;
        }

    } catch (error) {
        console.log(`❌ ${fileName}: Erro ao analisar - ${error.message}\n`);
        return false;
    }
}

// Analisar arquivos principais
const filesToAnalyze = [
    {
        path: 'src/frontend/src/app/services/api.ts',
        name: 'Frontend API Service'
    },
    {
        path: 'src/backend/server.ts',
        name: 'Backend Server'
    },
    {
        path: 'src/backend/services/signaling-server.ts',
        name: 'Signaling Server'
    },
    {
        path: 'src/electron/main.ts',
        name: 'Electron Main'
    },
    {
        path: 'src/electron/backend-starter.js',
        name: 'Backend Starter'
    }
];

let allGood = true;

filesToAnalyze.forEach(file => {
    const fullPath = path.join(process.cwd(), file.path);
    const result = analyzeFile(fullPath, file.name);
    allGood = allGood && result;
});

// Verificar estrutura de build
console.log('📦 Verificando estrutura de build:');
const buildPaths = [
    'dist/backend/server.js',
    'dist/frontend/browser/index.html',
    'dist/backend/node_modules',
    'dist/backend/.env'
];

buildPaths.forEach(buildPath => {
    const fullPath = path.join(process.cwd(), buildPath);
    const exists = fs.existsSync(fullPath);
    console.log(`  ${exists ? '✅' : '❌'} ${buildPath}`);
    if (!exists && buildPath.includes('node_modules')) {
        console.log('    💡 Execute: npm run build:complete');
    }
    if (!exists && buildPath.includes('.env')) {
        console.log('    💡 Arquivo .env não encontrado na pasta dist');
    }
});

console.log('\n📋 Resumo:');
if (allGood) {
    console.log('✅ Todos os arquivos analisados estão configurados corretamente para produção');
    console.log('🎯 Todas as conexões usam 127.0.0.1 em produção como esperado');
} else {
    console.log('❌ Alguns problemas foram encontrados nos arquivos');
    console.log('🔧 Verifique as sugestões acima para corrigir');
}

console.log('\n💡 Próximos passos para teste:');
console.log('1. Execute: npm run build:complete');
console.log('2. Execute: npm run electron:dist');
console.log('3. Teste o executável gerado');
console.log('4. Verifique os logs do Electron DevTools');

// Verificar se há algum processo Node.js rodando na porta 3000
console.log('\n🔍 Verificando porta 3000...');
require('child_process').exec('netstat -ano | find "3000"', (error, stdout, stderr) => {
    if (stdout.trim()) {
        console.log('⚠️  Processos encontrados na porta 3000:');
        console.log(stdout);
        console.log('💡 Execute: taskkill /F /IM node.exe (se necessário)');
    } else {
        console.log('✅ Porta 3000 livre');
    }
});
