const fs = require('fs');
const path = require('path');

console.log('🔧 Corrigindo endpoints async...');

const serverPath = path.join(__dirname, 'src', 'backend', 'server.ts');
let content = fs.readFileSync(serverPath, 'utf8');

console.log('📝 Arquivo lido, tamanho:', content.length, 'caracteres');

// Lista de padrões para corrigir
const patterns = [
  // Padrão: app.post('/rota', async (req: Request, res: Response) => {
  {
    regex: /(app\.(get|post|put|delete|patch)\(['"][^'"]+['"],\s*)(async\s*\([^)]*\)\s*=>\s*{)/g,
    replacement: '$1($3) => {' // Remove async e adiciona parênteses
  },
  // Padrão: app.post('/rota', (async (req: Request, res: Response) => {
  {
    regex: /(app\.(get|post|put|delete|patch)\(['"][^'"]+['"],\s*)\(async\s*\(([^)]*)\)\s*=>\s*{/g,
    replacement: '$1(($3) => {' // Remove async mas mantém estrutura
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

// Correções específicas para casos problemáticos
const specificFixes = [
  // Remover "as RequestHandler" se ainda houver algum
  {
    regex: /\)\s*as\s+RequestHandler\)/g,
    replacement: '))'
  },
  // Corrigir chamadas return res.status().json() para não retornar
  {
    regex: /return\s+(res\.(status\([^)]+\)\.)?json\([^)]+\));/g,
    replacement: '$1; return;'
  },
  // Corrigir res.json() direto
  {
    regex: /return\s+(res\.json\([^)]+\));/g,
    replacement: '$1; return;'
  }
];

for (const fix of specificFixes) {
  const beforeLength = content.length;
  content = content.replace(fix.regex, fix.replacement);
  const afterLength = content.length;
  if (beforeLength !== afterLength) {
    changes++;
    console.log(`✅ Aplicada correção específica ${changes}`);
  }
}

console.log('💾 Salvando arquivo...');
fs.writeFileSync(serverPath, content);

console.log(`✅ Correções aplicadas: ${changes}`);
console.log('✅ Arquivo server.ts corrigido!');
