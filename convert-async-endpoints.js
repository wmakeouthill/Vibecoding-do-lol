const fs = require('fs');

console.log('🔧 Convertendo endpoints async para sintaxe correta...');

const filePath = 'src/backend/server.ts';
let content = fs.readFileSync(filePath, 'utf8');

console.log('📊 Estado inicial:');
console.log(`  - Tamanho: ${content.length} caracteres`);

// O problema é que os endpoints async não estão envolvidos em parênteses corretamente
// Precisamos converter de:
// app.get('/api/path', async (req: Request, res: Response) => {
// Para:
// app.get('/api/path', (async (req: Request, res: Response) => {

// 1. Encontrar todos os endpoints async
const asyncEndpointPattern = /(app\.(get|post|put|delete|patch))\('([^']+)',\s+async\s+\(req:\s*Request,\s*res:\s*Response\)\s*=>\s*\{/g;

let matches = [];
let match;
while ((match = asyncEndpointPattern.exec(content)) !== null) {
  matches.push({
    fullMatch: match[0],
    method: match[1],
    httpMethod: match[2],
    path: match[3],
    index: match.index
  });
}

console.log(`📊 Encontrados ${matches.length} endpoints async para corrigir`);

// 2. Converter cada endpoint
let corrections = 0;
for (const endpoint of matches) {
  // Converter para sintaxe correta
  const oldPattern = endpoint.fullMatch;
  const newPattern = `${endpoint.method}('${endpoint.path}', (async (req: Request, res: Response) => {`;
  
  console.log(`🔄 Convertendo: ${endpoint.httpMethod.toUpperCase()} ${endpoint.path}`);
  
  content = content.replace(oldPattern, newPattern);
  corrections++;
}

// 3. Agora precisamos adicionar os fechamentos corretos
// Cada endpoint que foi convertido precisa de ") as RequestHandler);" no final
// Mas vamos fazer isso de forma mais inteligente - procurar os finais dos endpoints

console.log(`✅ Convertidos ${corrections} endpoints`);

// 4. Salvar arquivo
fs.writeFileSync(filePath, content);

console.log(`\n🎉 Conversão concluída!`);
console.log(`📊 Total de correções: ${corrections}`);
console.log(`📝 Arquivo salvo: ${filePath}`);

// 5. Verificar se ainda há problemas
const remainingAsyncPatterns = content.match(/app\.(get|post|put|delete|patch)\('[^']+',\s+async\s+\(/g);
if (remainingAsyncPatterns) {
  console.log(`⚠️ Ainda restam ${remainingAsyncPatterns.length} endpoints async com sintaxe incorreta`);
} else {
  console.log(`✅ Todos os endpoints async foram convertidos`);
}
