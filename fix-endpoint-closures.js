const fs = require('fs');

console.log('🔧 Adicionando fechamentos corretos para endpoints async...');

const filePath = 'src/backend/server.ts';
let content = fs.readFileSync(filePath, 'utf8');

// O problema agora é que cada endpoint async precisa do fechamento correto
// Vamos procurar por padrões como "});" após um endpoint async e convertê-los

// 1. Primeiro, vamos encontrar todos os endpoints que foram convertidos
const lines = content.split('\n');
let corrections = 0;

for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  
  // Se a linha tem um endpoint async convertido
  if (line.includes('(async (req: Request, res: Response) => {')) {
    // Procurar o fechamento correspondente
    let braceCount = 0;
    let endLineIndex = -1;
    
    // Contar chaves a partir desta linha
    for (let j = i; j < lines.length; j++) {
      const currentLine = lines[j];
      
      // Contar chaves abertas e fechadas
      const openBraces = (currentLine.match(/\{/g) || []).length;
      const closeBraces = (currentLine.match(/\}/g) || []).length;
      
      braceCount += openBraces - closeBraces;
      
      // Se chegamos ao balanceamento e a linha termina com "});"
      if (braceCount === 0 && j > i && currentLine.trim().endsWith('});')) {
        endLineIndex = j;
        break;
      }
    }
    
    if (endLineIndex !== -1) {
      // Substituir a linha de fechamento
      const oldLine = lines[endLineIndex];
      if (oldLine.trim() === '});') {
        lines[endLineIndex] = oldLine.replace('});', '}) as RequestHandler);');
        corrections++;
        
        // Extrair o path do endpoint para logging
        const pathMatch = line.match(/'([^']+)'/);
        const path = pathMatch ? pathMatch[1] : 'unknown';
        console.log(`✅ Corrigido fechamento para: ${path}`);
      }
    }
  }
}

// 2. Reconstituir o conteúdo
content = lines.join('\n');

// 3. Salvar arquivo
fs.writeFileSync(filePath, content);

console.log(`\n🎉 Fechamentos corrigidos!`);
console.log(`📊 Total de correções: ${corrections}`);
console.log(`📝 Arquivo salvo: ${filePath}`);

// 4. Verificação final
const asyncEndpoints = (content.match(/\(async \(req: Request, res: Response\) =>/g) || []).length;
const correctClosures = (content.match(/\}\) as RequestHandler\);/g) || []).length;

console.log(`\n📊 Verificação final:`);
console.log(`  - Endpoints async: ${asyncEndpoints}`);
console.log(`  - Fechamentos corretos: ${correctClosures}`);

if (asyncEndpoints === correctClosures) {
  console.log(`✅ Todos os endpoints têm fechamento correto!`);
} else {
  console.log(`⚠️ Discrepância: ${asyncEndpoints - correctClosures} endpoints sem fechamento correto`);
}
