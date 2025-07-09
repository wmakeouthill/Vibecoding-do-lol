const fs = require('fs');
const path = require('path');

console.log('🔧 Corrigindo endpoints async - versão 2...');

const serverPath = path.join(__dirname, 'src', 'backend', 'server.ts');
let content = fs.readFileSync(serverPath, 'utf8');

console.log('📝 Arquivo lido, tamanho:', content.length, 'caracteres');

// Corrigir padrões específicos que estão quebrados
const patterns = [
  // app.post('/rota', ((req: Request, res: Response) => {) => {
  {
    regex: /(app\.(get|post|put|delete|patch)\([^,]+,\s*)\(\((req:\s*Request,\s*res:\s*Response)\s*=>\s*\{\)\s*=>\s*\{/g,
    replacement: '$1async ($3) => {'
  },
  // app.post('/rota', (async (req: Request, res: Response) => {) => {
  {
    regex: /(app\.(get|post|put|delete|patch)\([^,]+,\s*)\(\s*async\s*\((req:\s*Request,\s*res:\s*Response)\s*=>\s*\{\)\s*=>\s*\{/g,
    replacement: '$1async ($3) => {'
  }
];

console.log('🔍 Aplicando correções...');

let changes = 0;
for (const pattern of patterns) {
  const beforeLength = content.length;
  content = content.replace(pattern.regex, pattern.replacement);
  const afterLength = content.length;
  if (beforeLength !== afterLength) {
    changes++;
    console.log(`✅ Aplicado padrão ${changes}`);
  }
}

console.log('💾 Salvando arquivo...');
fs.writeFileSync(serverPath, content);

console.log(`✅ Correções aplicadas: ${changes}`);
console.log('✅ Arquivo server.ts corrigido!');
