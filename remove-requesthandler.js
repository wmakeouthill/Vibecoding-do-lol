const fs = require('fs');
const path = require('path');

console.log('🔧 Removendo "as RequestHandler" do server.ts...');

const serverPath = path.join(__dirname, 'src', 'backend', 'server.ts');
let content = fs.readFileSync(serverPath, 'utf8');

console.log('📝 Arquivo lido, tamanho:', content.length, 'caracteres');

// Remover todas as ocorrências de "as RequestHandler"
const before = content.length;
content = content.replace(/\s*as\s+RequestHandler/g, '');
const after = content.length;

const changes = before - after;

console.log('💾 Salvando arquivo...');
fs.writeFileSync(serverPath, content);

console.log(`✅ Removidos ${changes} caracteres (as RequestHandler)`);
console.log('✅ Arquivo server.ts corrigido!');
