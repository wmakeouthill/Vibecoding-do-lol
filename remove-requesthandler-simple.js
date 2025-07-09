const fs = require('fs');
const path = require('path');

console.log('🔧 Removendo "as RequestHandler"...');

const serverPath = path.join(__dirname, 'src', 'backend', 'server.ts');
let content = fs.readFileSync(serverPath, 'utf8');

console.log('📝 Arquivo lido, tamanho:', content.length, 'caracteres');

// Contar ocorrências antes
const beforeCount = (content.match(/\s*as\s+RequestHandler/g) || []).length;
console.log('🔍 Encontradas', beforeCount, 'ocorrências de "as RequestHandler"');

// Remover apenas "as RequestHandler" (com espaços opcionais)
content = content.replace(/\s*as\s+RequestHandler/g, '');

// Contar ocorrências depois
const afterCount = (content.match(/\s*as\s+RequestHandler/g) || []).length;
console.log('🔍 Restaram', afterCount, 'ocorrências de "as RequestHandler"');

console.log('💾 Salvando arquivo...');
fs.writeFileSync(serverPath, content);

console.log(`✅ Removidas ${beforeCount - afterCount} ocorrências de "as RequestHandler"!`);
