const fs = require('fs');
const path = require('path');

console.log('🔧 REMOVENDO ROTAS DUPLICADAS DO SERVER.TS\n');

const serverPath = 'src/backend/server.ts';
let content = fs.readFileSync(serverPath, 'utf8');

// Encontrar e remover as rotas duplicadas de campeões
const startMarker = '    // Endpoint para obter todos os campeões do DataDragon';
const endMarker = '    }) as RequestHandler);';

const startIndex = content.indexOf(startMarker);
if (startIndex !== -1) {
  // Encontrar o final da segunda rota
  const secondRouteEnd = content.indexOf(endMarker, startIndex);
  const finalEndIndex = content.indexOf(endMarker, secondRouteEnd + 1);
  
  if (finalEndIndex !== -1) {
    // Remover as duas rotas duplicadas
    const beforeRoutes = content.substring(0, startIndex);
    const afterRoutes = content.substring(finalEndIndex + endMarker.length);
    
    const newContent = beforeRoutes + 
      '    // ROTAS DE CAMPEÕES REMOVIDAS - já definidas em routes/champions.ts\n' +
      afterRoutes;
    
    fs.writeFileSync(serverPath, newContent);
    console.log('✅ Rotas duplicadas removidas com sucesso!');
  } else {
    console.log('❌ Não foi possível encontrar o final das rotas duplicadas');
  }
} else {
  console.log('❌ Não foi possível encontrar as rotas duplicadas');
}

console.log('\n🔧 ROTAS DUPLICADAS REMOVIDAS'); 