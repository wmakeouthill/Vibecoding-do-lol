const fs = require('fs');

console.log('🔧 Corrigindo sintaxe do server.ts...');

const filePath = 'src/backend/server.ts';
let content = fs.readFileSync(filePath, 'utf8');

// Substituir todas as ocorrências de "(async (req: Request, res: Response) =>" por "async (req: Request, res: Response) =>"
content = content.replace(/\(async \(req: Request, res: Response\) =>/g, 'async (req: Request, res: Response) =>');

// Remover todos os ") as RequestHandler;"
content = content.replace(/\) as RequestHandler;/g, ');');

fs.writeFileSync(filePath, content);

console.log('✅ Sintaxe corrigida com sucesso!');
console.log('📝 Substituições feitas:');
console.log('  - (async (req: Request, res: Response) => → async (req: Request, res: Response) =>');
console.log('  - ) as RequestHandler; → );');
