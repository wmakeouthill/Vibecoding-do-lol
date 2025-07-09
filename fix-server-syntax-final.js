const fs = require('fs');

console.log('🔧 CORREÇÃO COMPLETA DO SERVER.TS...');

const filePath = 'src/backend/server.ts';
let content = fs.readFileSync(filePath, 'utf8');

console.log('📊 Status inicial do arquivo:');
console.log(`  - Tamanho: ${content.length} caracteres`);
console.log(`  - Linhas: ${content.split('\n').length}`);

// 1. Corrigir todos os endpoints com sintaxe (async (req, res) =>
const asyncMatches = content.match(/app\.(get|post|put|delete)\([^,]+,\s*\(async\s*\(/g);
if (asyncMatches) {
  console.log(`🔍 Encontrados ${asyncMatches.length} endpoints com sintaxe incorreta (async (`);
  content = content.replace(/app\.(get|post|put|delete)\(([^,]+),\s*\(async\s*\(/g, 'app.$1($2, async (');
  console.log('✅ Corrigidos endpoints (async (');
}

// 2. Remover todos os ") as RequestHandler" restantes (sem parênteses)
const requestHandlerMatches = content.match(/\)\s*as\s*RequestHandler;/g);
if (requestHandlerMatches) {
  console.log(`🔍 Encontrados ${requestHandlerMatches.length} ") as RequestHandler;"`);
  content = content.replace(/\)\s*as\s*RequestHandler;/g, ');');
  console.log('✅ Removidos ") as RequestHandler;"');
}

// 3. Remover todos os "}) as RequestHandler)" com parênteses extras
const requestHandlerParenMatches = content.match(/\}\)\s*as\s*RequestHandler\);/g);
if (requestHandlerParenMatches) {
  console.log(`🔍 Encontrados ${requestHandlerParenMatches.length} "}) as RequestHandler);"`);
  content = content.replace(/\}\)\s*as\s*RequestHandler\);/g, '});');
  console.log('✅ Removidos "}) as RequestHandler);"');
}

// 4. Verificar se há problemas de parênteses desbalanceados
const openParens = (content.match(/\(/g) || []).length;
const closeParens = (content.match(/\)/g) || []).length;
console.log(`📊 Parênteses: ${openParens} abertos, ${closeParens} fechados`);

if (openParens !== closeParens) {
  console.log(`⚠️ Parênteses desbalanceados! Diferença: ${openParens - closeParens}`);
}

// 5. Verificar linha 2650 mencionada no erro
const lines = content.split('\n');
if (lines.length >= 2650) {
  console.log(`🔍 Linha 2650: "${lines[2649].trim()}"`);
  console.log(`🔍 Linha 2649: "${lines[2648].trim()}"`);
  console.log(`🔍 Linha 2651: "${lines[2650].trim()}"`);
}

// 6. Salvar arquivo corrigido
fs.writeFileSync(filePath, content);

console.log('\n✅ CORREÇÕES APLICADAS!');
console.log('📊 Status final:');
console.log(`  - Tamanho: ${content.length} caracteres`);
console.log(`  - Linhas: ${content.split('\n').length}`);

// 7. Verificar se ainda há problemas
const remainingIssues = [];

if (content.includes('(async (req: Request, res: Response) =>')) {
  remainingIssues.push('Ainda há "(async (req" sem correção');
}

if (content.includes('as RequestHandler')) {
  remainingIssues.push('Ainda há "as RequestHandler"');
}

if (remainingIssues.length > 0) {
  console.log('\n⚠️ PROBLEMAS RESTANTES:');
  remainingIssues.forEach(issue => console.log(`  - ${issue}`));
} else {
  console.log('\n🎉 ARQUIVO CORRIGIDO COMPLETAMENTE!');
}
