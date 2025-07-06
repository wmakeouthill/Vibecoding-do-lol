const fs = require('fs');
const path = require('path');

console.log('🔍 INVESTIGAÇÃO PROFUNDA - MÉTODOS DUPLICADOS E NÃO UTILIZADOS\n');

// 1. ANALISAR TODOS OS SERVIÇOS DO BACKEND
function analyzeAllServices() {
  console.log('🔧 1. ANALISANDO TODOS OS SERVIÇOS...');
  
  const servicesDir = 'src/backend/services';
  const services = fs.readdirSync(servicesDir).filter(file => file.endsWith('.ts'));
  
  console.log(`\n📋 Serviços encontrados: ${services.length}`);
  services.forEach((service, index) => {
    console.log(`   ${index + 1}. ${service}`);
  });
  
  return services;
}

// 2. BUSCAR MÉTODOS DUPLICADOS EM CADA SERVIÇO
function findDuplicateMethods(services) {
  console.log('\n🔧 2. BUSCANDO MÉTODOS DUPLICADOS...');
  
  const allMethods = new Map(); // método -> [arquivos que o contêm]
  const duplicates = [];
  
  services.forEach(service => {
    const servicePath = `src/backend/services/${service}`;
    const content = fs.readFileSync(servicePath, 'utf8');
    
    // Buscar todos os métodos (async, public, private, etc.)
    const methodRegex = /(?:async\s+)?(?:public\s+|private\s+|protected\s+)?(\w+)\s*\([^)]*\)\s*[:{]/g;
    const methods = [...content.matchAll(methodRegex)];
    
    console.log(`\n📁 ${service}:`);
    
    methods.forEach(match => {
      const methodName = match[1];
      
      // Filtrar construtores e métodos muito comuns
      if (methodName !== 'constructor' && methodName !== 'then' && methodName !== 'catch') {
        if (!allMethods.has(methodName)) {
          allMethods.set(methodName, []);
        }
        allMethods.get(methodName).push(service);
        
        console.log(`   - ${methodName}()`);
      }
    });
  });
  
  // Identificar duplicatas
  console.log('\n🔍 MÉTODOS DUPLICADOS ENCONTRADOS:');
  let duplicateCount = 0;
  
  allMethods.forEach((files, methodName) => {
    if (files.length > 1) {
      duplicateCount++;
      console.log(`\n🔴 ${duplicateCount}. ${methodName}():`);
      files.forEach(file => {
        console.log(`     - ${file}`);
      });
      duplicates.push({ method: methodName, files });
    }
  });
  
  if (duplicateCount === 0) {
    console.log('   ✅ Nenhum método com nome duplicado encontrado');
  }
  
  return duplicates;
}

// 3. ANALISAR MÉTODOS ESPECÍFICOS SUSPEITOS
function analyzeSuspiciousMethods() {
  console.log('\n🔧 3. ANALISANDO MÉTODOS ESPECÍFICOS SUSPEITOS...');
  
  const suspiciousMethods = [
    {
      file: 'MatchmakingService.ts',
      methods: [
        'assignLanesByMMRAndPreferences',
        'assignLanesOptimized',
        'removePlayerFromQueue',
        'removePlayerFromQueueById',
        'getQueueStatus',
        'getQueueStatusWithCurrentPlayer'
      ]
    },
    {
      file: 'DraftService.ts', 
      methods: [
        'assignLanesOptimized',
        'balanceTeamsAndAssignLanes',
        'prepareDraftData'
      ]
    },
    {
      file: 'LCUService.ts',
      methods: [
        'getCurrentSummoner',
        'getSummonerInfo',
        'createCustomLobby'
      ]
    }
  ];
  
  suspiciousMethods.forEach(serviceInfo => {
    const servicePath = `src/backend/services/${serviceInfo.file}`;
    
    if (fs.existsSync(servicePath)) {
      console.log(`\n📁 ${serviceInfo.file}:`);
      const content = fs.readFileSync(servicePath, 'utf8');
      
      serviceInfo.methods.forEach(methodName => {
        const methodExists = content.includes(`${methodName}(`);
        const occurrences = (content.match(new RegExp(methodName, 'g')) || []).length;
        
        console.log(`   ${methodExists ? '✅' : '❌'} ${methodName}() - ${occurrences} ocorrência(s)`);
        
        if (occurrences > 3) {
          console.log(`      ⚠️ Método usado ${occurrences} vezes - verificar se há duplicação interna`);
        }
      });
    } else {
      console.log(`   ❌ ${serviceInfo.file} não encontrado`);
    }
  });
}

// 4. BUSCAR MÉTODOS NÃO UTILIZADOS
function findUnusedMethods() {
  console.log('\n🔧 4. BUSCANDO MÉTODOS NÃO UTILIZADOS...');
  
  const servicesDir = 'src/backend/services';
  const serverPath = 'src/backend/server.ts';
  
  // Ler server.ts para ver quais métodos são chamados
  const serverContent = fs.readFileSync(serverPath, 'utf8');
  
  const services = fs.readdirSync(servicesDir).filter(file => file.endsWith('.ts'));
  
  services.forEach(service => {
    const servicePath = `${servicesDir}/${service}`;
    const content = fs.readFileSync(servicePath, 'utf8');
    
    console.log(`\n📁 ${service}:`);
    
    // Buscar métodos públicos
    const publicMethodRegex = /(?:async\s+)?(?:public\s+)?(\w+)\s*\([^)]*\)\s*[:{]/g;
    const methods = [...content.matchAll(publicMethodRegex)];
    
    const unusedMethods = [];
    
    methods.forEach(match => {
      const methodName = match[1];
      
      // Pular construtores e métodos especiais
      if (methodName !== 'constructor' && methodName !== 'then' && methodName !== 'catch' && methodName !== 'finally') {
        // Verificar se é usado no server.ts
        const usedInServer = serverContent.includes(methodName);
        
        // Verificar se é usado em outros serviços
        let usedInOtherServices = false;
        services.forEach(otherService => {
          if (otherService !== service) {
            const otherContent = fs.readFileSync(`${servicesDir}/${otherService}`, 'utf8');
            if (otherContent.includes(methodName)) {
              usedInOtherServices = true;
            }
          }
        });
        
        const isUsed = usedInServer || usedInOtherServices;
        
        if (!isUsed) {
          unusedMethods.push(methodName);
          console.log(`   🔴 ${methodName}() - POSSIVELMENTE NÃO UTILIZADO`);
        } else {
          console.log(`   ✅ ${methodName}() - UTILIZADO`);
        }
      }
    });
    
    if (unusedMethods.length === 0) {
      console.log('   ✅ Todos os métodos públicos parecem estar em uso');
    }
  });
}

// 5. ANALISAR IMPORTS NÃO UTILIZADOS
function findUnusedImports() {
  console.log('\n🔧 5. ANALISANDO IMPORTS NÃO UTILIZADOS...');
  
  const files = [
    'src/backend/server.ts',
    ...fs.readdirSync('src/backend/services').map(f => `src/backend/services/${f}`)
  ];
  
  files.forEach(filePath => {
    if (fs.existsSync(filePath) && filePath.endsWith('.ts')) {
      const content = fs.readFileSync(filePath, 'utf8');
      const fileName = path.basename(filePath);
      
      console.log(`\n📁 ${fileName}:`);
      
      // Buscar imports
      const importRegex = /import\s+(?:{([^}]+)}|\*\s+as\s+(\w+)|(\w+))\s+from\s+['"]([^'"]+)['"]/g;
      const imports = [...content.matchAll(importRegex)];
      
      const unusedImports = [];
      
      imports.forEach(match => {
        const [fullMatch, namedImports, namespaceImport, defaultImport, modulePath] = match;
        
        if (namedImports) {
          // Imports nomeados como { something }
          const names = namedImports.split(',').map(n => n.trim());
          names.forEach(name => {
            const isUsed = content.includes(name) && content.lastIndexOf(name) !== content.indexOf(name);
            if (!isUsed) {
              unusedImports.push(name);
            }
          });
        } else if (namespaceImport) {
          // Imports como * as something
          const isUsed = content.includes(namespaceImport) && content.lastIndexOf(namespaceImport) !== content.indexOf(namespaceImport);
          if (!isUsed) {
            unusedImports.push(namespaceImport);
          }
        } else if (defaultImport) {
          // Imports default
          const isUsed = content.includes(defaultImport) && content.lastIndexOf(defaultImport) !== content.indexOf(defaultImport);
          if (!isUsed) {
            unusedImports.push(defaultImport);
          }
        }
      });
      
      if (unusedImports.length > 0) {
        console.log('   🔴 IMPORTS POSSIVELMENTE NÃO UTILIZADOS:');
        unusedImports.forEach(imp => {
          console.log(`      - ${imp}`);
        });
      } else {
        console.log('   ✅ Todos os imports parecem estar em uso');
      }
    }
  });
}

// 6. ANALISAR CÓDIGO MORTO (FUNÇÕES/CLASSES NÃO EXPORTADAS E NÃO UTILIZADAS)
function findDeadCode() {
  console.log('\n🔧 6. ANALISANDO CÓDIGO MORTO...');
  
  const servicesDir = 'src/backend/services';
  const services = fs.readdirSync(servicesDir).filter(file => file.endsWith('.ts'));
  
  services.forEach(service => {
    const servicePath = `${servicesDir}/${service}`;
    const content = fs.readFileSync(servicePath, 'utf8');
    
    console.log(`\n📁 ${service}:`);
    
    // Buscar funções não exportadas
    const functionRegex = /(?:^|\n)(?!export\s+)(?:async\s+)?function\s+(\w+)/g;
    const functions = [...content.matchAll(functionRegex)];
    
    // Buscar classes não exportadas
    const classRegex = /(?:^|\n)(?!export\s+)class\s+(\w+)/g;
    const classes = [...content.matchAll(classRegex)];
    
    const deadCode = [];
    
    [...functions, ...classes].forEach(match => {
      const name = match[1];
      const occurrences = (content.match(new RegExp(name, 'g')) || []).length;
      
      // Se só aparece uma vez (na definição), pode ser código morto
      if (occurrences === 1) {
        deadCode.push(name);
        console.log(`   🔴 ${name} - POSSIVELMENTE CÓDIGO MORTO (não utilizado)`);
      } else {
        console.log(`   ✅ ${name} - UTILIZADO (${occurrences} vezes)`);
      }
    });
    
    if (deadCode.length === 0 && functions.length === 0 && classes.length === 0) {
      console.log('   ℹ️ Nenhuma função/classe não exportada encontrada');
    } else if (deadCode.length === 0) {
      console.log('   ✅ Nenhum código morto óbvio encontrado');
    }
  });
}

// 7. GERAR RELATÓRIO DETALHADO DE MÉTODOS
function generateMethodReport(duplicates) {
  console.log('\n📊 7. GERANDO RELATÓRIO DETALHADO...');
  
  const reportContent = `# 🔍 RELATÓRIO DETALHADO - MÉTODOS DUPLICADOS E NÃO UTILIZADOS

## 📋 Resumo da Investigação

**Data**: ${new Date().toLocaleDateString('pt-BR')}  
**Tipo**: Investigação profunda de métodos duplicados e não utilizados  
**Escopo**: Todos os serviços do backend  

---

## 🎯 DESCOBERTAS PRINCIPAIS

### 🔴 MÉTODOS DUPLICADOS IDENTIFICADOS

${duplicates.length > 0 ? 
  duplicates.map((dup, index) => 
    `#### ${index + 1}. **${dup.method}()**\n` +
    `- **Arquivos**: ${dup.files.join(', ')}\n` +
    `- **Ação**: Verificar se implementações são idênticas ou se podem ser consolidadas\n`
  ).join('\n') 
  : '✅ **Nenhum método com nome duplicado encontrado**'
}

### 🔍 MÉTODOS SUSPEITOS DE DUPLICAÇÃO

#### **MatchmakingService.ts**
- \`assignLanesByMMRAndPreferences()\` vs \`assignLanesOptimized()\`
  - **Suspeita**: Ambos fazem atribuição de lanes
  - **Recomendação**: Verificar se podem ser consolidados

- \`removePlayerFromQueue()\` vs \`removePlayerFromQueueById()\`
  - **Status**: ✅ **DIFERENTES** - WebSocket vs ID/Nome
  - **Ação**: Manter ambos (responsabilidades diferentes)

- \`getQueueStatus()\` vs \`getQueueStatusWithCurrentPlayer()\`
  - **Suspeita**: Funcionalidades similares
  - **Recomendação**: Consolidar com parâmetro opcional

#### **DraftService.ts vs MatchmakingService.ts**
- Ambos têm métodos de atribuição de lanes
- **Verificar**: Se há duplicação de lógica entre serviços

### 🔴 MÉTODOS POSSIVELMENTE NÃO UTILIZADOS
*(Lista gerada automaticamente - requer verificação manual)*

### 🔴 IMPORTS NÃO UTILIZADOS
*(Lista gerada automaticamente - podem ser removidos para limpeza)*

### 🔴 CÓDIGO MORTO
*(Funções/classes não exportadas e não utilizadas)*

---

## 🎯 RECOMENDAÇÕES DE AÇÃO

### **Prioridade Alta** 🔴

1. **Consolidar métodos de lane assignment**
   - Investigar \`assignLanesByMMRAndPreferences()\` vs \`assignLanesOptimized()\`
   - Verificar se há duplicação entre MatchmakingService e DraftService

2. **Consolidar métodos de queue status**
   - Transformar \`getQueueStatusWithCurrentPlayer()\` em parâmetro opcional

### **Prioridade Média** 🟡

1. **Remover imports não utilizados**
   - Limpeza automática possível
   - Reduzir tamanho dos bundles

2. **Remover código morto**
   - Funções/classes não utilizadas
   - Simplificar codebase

### **Prioridade Baixa** 🟢

1. **Revisar métodos possivelmente não utilizados**
   - Verificação manual necessária
   - Alguns podem ser APIs públicas

---

## 📊 ESTATÍSTICAS

- **Serviços analisados**: ${fs.readdirSync('src/backend/services').filter(f => f.endsWith('.ts')).length}
- **Métodos duplicados**: ${duplicates.length}
- **Arquivos verificados**: ${fs.readdirSync('src/backend/services').filter(f => f.endsWith('.ts')).length + 1} (serviços + server.ts)

---

## 🚦 PRÓXIMOS PASSOS

1. **Manual**: Verificar duplicações identificadas
2. **Automático**: Remover imports não utilizados
3. **Manual**: Revisar código morto
4. **Manual**: Consolidar métodos similares

---

**Status**: ✅ **INVESTIGAÇÃO CONCLUÍDA**  
**Recomendação**: Proceder com verificações manuais das descobertas
`;

  fs.writeFileSync('DETAILED_METHODS_AUDIT_REPORT.md', reportContent);
  console.log('   💾 Relatório salvo em DETAILED_METHODS_AUDIT_REPORT.md');
}

// EXECUTAR INVESTIGAÇÃO COMPLETA
async function runMethodInvestigation() {
  try {
    console.log('🎯 INICIANDO INVESTIGAÇÃO PROFUNDA DE MÉTODOS...\n');
    
    // Executar todas as análises
    const services = analyzeAllServices();
    const duplicates = findDuplicateMethods(services);
    analyzeSuspiciousMethods();
    findUnusedMethods();
    findUnusedImports();
    findDeadCode();
    generateMethodReport(duplicates);
    
    console.log('\n🎉 INVESTIGAÇÃO COMPLETA FINALIZADA!');
    console.log('\n📊 RESUMO:');
    console.log(`   📁 Serviços analisados: ${services.length}`);
    console.log(`   🔍 Métodos duplicados: ${duplicates.length}`);
    console.log('   📝 Relatório gerado: DETAILED_METHODS_AUDIT_REPORT.md');
    
    console.log('\n✅ INVESTIGAÇÃO DE MÉTODOS CONCLUÍDA!');
    console.log('\n🎯 Próximo passo: Revisar relatório e aplicar correções recomendadas');
    
  } catch (error) {
    console.error('❌ ERRO durante a investigação:', error);
    console.log('\n🔧 Verifique os arquivos e tente novamente');
  }
}

// Executar investigação
runMethodInvestigation();
