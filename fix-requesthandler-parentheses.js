const fs = require('fs');

console.log('🔧 Corrigindo RequestHandler com parênteses...');

const filePath = 'src/backend/server.ts';
let content = fs.readFileSync(filePath, 'utf8');

// Mostrar quantos RequestHandler existem antes
const beforeCount = (content.match(/\}\) as RequestHandler\);/g) || []).length;
console.log(`📊 Encontrados ${beforeCount} "}) as RequestHandler);" para remover`);

// Substituir TODOS os "}) as RequestHandler);" por "});"
content = content.replace(/\}\) as RequestHandler\);/g, '});');

// Verificar quantos restaram
const afterCount = (content.match(/\}\) as RequestHandler\);/g) || []).length;
console.log(`📊 Restaram ${afterCount} "}) as RequestHandler);" após limpeza`);

fs.writeFileSync(filePath, content);

console.log('✅ Todos os RequestHandler com parênteses removidos!');

// Verificar se ainda há problemas
if (content.includes('RequestHandler')) {
  console.log('⚠️ Ainda existem referências a RequestHandler');
} else {
  console.log('🎉 Nenhuma referência a RequestHandler restante!');
}
