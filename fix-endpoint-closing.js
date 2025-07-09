const fs = require('fs');
const path = require('path');

console.log('🔧 Corrigindo fechamento dos endpoints...');

const serverPath = path.join(__dirname, 'src', 'backend', 'server.ts');
let content = fs.readFileSync(serverPath, 'utf8');

console.log('📝 Arquivo lido, corrigindo fechamentos...');

// Trocar })); por });
content = content.replace(/\}\)\);/g, '});');

console.log('💾 Salvando arquivo corrigido...');
fs.writeFileSync(serverPath, content);

console.log('✅ Fechamento dos endpoints corrigido!');
