const fs = require('fs');

console.log('🔧 Corrigindo TODOS os RequestHandler...');

const filePath = 'src/backend/server.ts';
let content = fs.readFileSync(filePath, 'utf8');

// Mostrar quantos RequestHandler existem antes
const beforeCount = (content.match(/\}\) as RequestHandler;/g) || []).length;
console.log(`📊 Encontrados ${beforeCount} "}) as RequestHandler;" para remover`);

// Substituir TODOS os "}) as RequestHandler;" por "});"
content = content.replace(/\}\) as RequestHandler;/g, '});');

// Verificar quantos restaram
const afterCount = (content.match(/\}\) as RequestHandler;/g) || []).length;
console.log(`📊 Restaram ${afterCount} "}) as RequestHandler;" após limpeza`);

fs.writeFileSync(filePath, content);

console.log('✅ Todos os RequestHandler removidos com sucesso!');

// Verificar se ainda existem erros de sintaxe
if (content.includes(') as RequestHandler')) {
  console.log('⚠️ Ainda existem algumas variações de RequestHandler');
  const variations = content.match(/.*as RequestHandler.*/g);
  if (variations) {
    console.log('📝 Variações encontradas:');
    variations.forEach((variation, index) => {
      console.log(`  ${index + 1}. ${variation.trim()}`);
    });
  }
}
