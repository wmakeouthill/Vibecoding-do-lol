const fs = require('fs');
const path = require('path');

console.log('🔧 Removendo "as RequestHandler"...');

const serverPath = path.join(__dirname, 'src', 'backend', 'server.ts');
let content = fs.readFileSync(serverPath, 'utf8');

console.log('📝 Arquivo lido, tamanho:', content.length, 'caracteres');

// Remover apenas "as RequestHandler" mantendo os parênteses
content = content.replace(/\s*as\s+RequestHandler\s*\)/g, ')');

console.log('💾 Salvando arquivo...');
fs.writeFileSync(serverPath, content);

console.log('✅ "as RequestHandler" removido!');
