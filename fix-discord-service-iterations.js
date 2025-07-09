const fs = require('fs');
const path = require('path');

console.log('🔧 Corrigindo iterações MapIterator no DiscordService...');

const discordServicePath = path.join(__dirname, 'src', 'backend', 'services', 'DiscordService.ts');
let content = fs.readFileSync(discordServicePath, 'utf8');

console.log('📝 Arquivo lido, tamanho:', content.length, 'caracteres');

// Corrigir todas as iterações problemáticas
content = content.replace(
  /for \(const match of this\.activeMatches\.values\(\)\) \{/g,
  'for (const match of Array.from(this.activeMatches.values())) {'
);

console.log('💾 Salvando arquivo...');
fs.writeFileSync(discordServicePath, content);

console.log('✅ DiscordService.ts corrigido!');
