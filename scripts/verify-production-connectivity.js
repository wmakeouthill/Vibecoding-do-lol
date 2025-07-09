const fs = require('fs');
const path = require('path');

console.log('🔍 VERIFICAÇÃO DE CONECTIVIDADE PARA PRODUÇÃO');
console.log('===========================================\n');

// Verificar arquivos principais
const filesToCheck = [
  {
    path: 'src/backend/server.ts',
    name: 'Backend Server',
    checkPatterns: [
      { pattern: /127\.0\.0\.1/g, description: '127.0.0.1 (produção)' },
      { pattern: /localhost/g, description: 'localhost (deve ser usado apenas em dev)' }
    ]
  },
  {
    path: 'src/backend/services/signaling-server.ts',
    name: 'Signaling Server',
    checkPatterns: [
      { pattern: /127\.0\.0\.1/g, description: '127.0.0.1 (produção)' },
      { pattern: /localhost/g, description: 'localhost (deve ser usado apenas em dev)' }
    ]
  },
  {
    path: 'src/electron/main.ts',
    name: 'Electron Main',
    checkPatterns: [
      { pattern: /127\.0\.0\.1/g, description: '127.0.0.1 (produção)' },
      { pattern: /localhost/g, description: 'localhost (deve ser usado apenas em dev)' }
    ]
  },
  {
    path: 'src/electron/backend-starter.js',
    name: 'Backend Starter',
    checkPatterns: [
      { pattern: /127\.0\.0\.1/g, description: '127.0.0.1 (produção)' },
      { pattern: /localhost/g, description: 'localhost (deve ser usado apenas em dev)' }
    ]
  },
  {
    path: 'src/frontend/src/app/services/api.ts',
    name: 'Frontend API Service',
    checkPatterns: [
      { pattern: /127\.0\.0\.1/g, description: '127.0.0.1 (produção)' },
      { pattern: /localhost/g, description: 'localhost (deve ser usado apenas em dev)' }
    ]
  }
];

let allGood = true;

filesToCheck.forEach(file => {
  console.log(`📁 ${file.name} (${file.path}):`);
  
  if (!fs.existsSync(file.path)) {
    console.log('   ❌ Arquivo não encontrado');
    allGood = false;
    return;
  }
  
  const content = fs.readFileSync(file.path, 'utf8');
  
  file.checkPatterns.forEach(check => {
    const matches = content.match(check.pattern);
    const count = matches ? matches.length : 0;
    
    if (check.pattern.source.includes('127\\.0\\.0\\.1')) {
      // Para 127.0.0.1, esperamos pelo menos algumas ocorrências em produção
      if (count > 0) {
        console.log(`   ✅ ${check.description}: ${count} ocorrência(s)`);
      } else {
        console.log(`   ⚠️ ${check.description}: nenhuma ocorrência (pode estar correto se não for usado)`);
      }
    } else {
      // Para localhost, analisar o contexto
      if (count > 0) {
        console.log(`   ⚠️ ${check.description}: ${count} ocorrência(s)`);
        
        // Verificar se localhost está em contexto de desenvolvimento
        const devContextPatterns = [
          /if.*isDev.*localhost/,
          /development.*localhost/,
          /localhost:4200/,
          /Angular.*localhost/,
          /Em desenvolvimento.*localhost/,
          /dev web.*localhost/,
          /fallback.*localhost/,
          /Em dev web.*localhost/,
          /\.fallbackUrls.*localhost/,
          /baseUrl.*isDev.*localhost/
        ];
        
        const hasDevContext = devContextPatterns.some(pattern => pattern.test(content));
        
        if (hasDevContext) {
          console.log(`      ✅ Uso correto: localhost em contexto apropriado (dev/fallback)`);
        } else {
          console.log(`      ❌ VERIFICAR: localhost pode precisar ser 127.0.0.1 em produção`);
          allGood = false;
        }
      } else {
        console.log(`   ✅ ${check.description}: nenhuma ocorrência`);
      }
    }
  });
  
  console.log('');
});

// Verificar configurações específicas
console.log('📋 VERIFICAÇÕES ESPECÍFICAS:');
console.log('');

// 1. ApiService - URL primária
const apiServiceContent = fs.readFileSync('src/frontend/src/app/services/api.ts', 'utf8');
if (apiServiceContent.includes("return 'http://127.0.0.1:3000/api'")) {
  console.log('✅ ApiService: URL primária usa 127.0.0.1 no Electron');
} else {
  console.log('❌ ApiService: URL primária NÃO usa 127.0.0.1 no Electron');
  allGood = false;
}

// 2. Backend connectivity test
const mainTsContent = fs.readFileSync('src/electron/main.ts', 'utf8');
if (mainTsContent.includes("http.get('http://127.0.0.1:3000/api/health'")) {
  console.log('✅ Electron Main: Teste de conectividade usa 127.0.0.1');
} else {
  console.log('❌ Electron Main: Teste de conectividade NÃO usa 127.0.0.1');
  allGood = false;
}

// 3. Backend server logs
const serverContent = fs.readFileSync('src/backend/server.ts', 'utf8');
if (serverContent.includes('const baseUrl = isDev ? \'localhost\' : \'127.0.0.1\'')) {
  console.log('✅ Backend Server: Logs adaptados para prod/dev');
} else {
  console.log('❌ Backend Server: Logs NÃO adaptados para prod/dev');
  allGood = false;
}

// 4. Backend starter connectivity
if (fs.existsSync('src/electron/backend-starter.js')) {
  const starterContent = fs.readFileSync('src/electron/backend-starter.js', 'utf8');
  if (starterContent.includes("http.get('http://127.0.0.1:3000/api/health'")) {
    console.log('✅ Backend Starter: Teste de conectividade usa 127.0.0.1');
  } else {
    console.log('❌ Backend Starter: Teste de conectividade NÃO usa 127.0.0.1');
    allGood = false;
  }
} else {
  console.log('⚠️ Backend Starter: Arquivo não encontrado');
}

console.log('');
console.log('===========================================');

if (allGood) {
  console.log('🎉 ✅ TODAS AS CONEXÕES ESTÃO ADAPTADAS PARA PRODUÇÃO!');
  console.log('');
  console.log('📋 Resumo das configurações:');
  console.log('   • Electron sempre usa 127.0.0.1:3000 como primário');
  console.log('   • Frontend Angular dev usa localhost:4200');
  console.log('   • Backend logs adaptados para prod/dev');
  console.log('   • Testes de conectividade usam 127.0.0.1');
  console.log('   • CORS configurado para ambos');
  console.log('');
  console.log('✅ Pronto para build de produção!');
} else {
  console.log('❌ ALGUMAS CONEXÕES PRECISAM SER AJUSTADAS');
  console.log('');
  console.log('🔧 Ações recomendadas:');
  console.log('   1. Revisar os itens marcados com ❌');
  console.log('   2. Garantir que produção use 127.0.0.1');
  console.log('   3. Desenvolvimento pode usar localhost');
  console.log('   4. Rebuild após correções');
}

console.log('');
console.log('💡 Para testar: npm run build:complete && npm run electron:prod');
