const fs = require('fs');
const path = require('path');

console.log('🔧 Corrigindo endpoints finais...');

const serverPath = path.join(__dirname, 'src', 'backend', 'server.ts');
let content = fs.readFileSync(serverPath, 'utf8');

console.log('📝 Arquivo lido, tamanho:', content.length, 'caracteres');

// Primeira correção: endpoints que começam com ((req: Request, res: Response) => {
content = content.replace(/\(\(req: Request, res: Response\) => {/g, '(req: Request, res: Response) => {');

// Segunda correção: endpoints que terminam com }));
content = content.replace(/}\)\);/g, '});');

// Terceira correção: remover "as RequestHandler" se ainda existir
content = content.replace(/\s*as\s+RequestHandler/g, '');

console.log('💾 Salvando arquivo...');
fs.writeFileSync(serverPath, content);

console.log('✅ Endpoints corrigidos!');
