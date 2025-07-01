const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

console.log('🧹 Iniciando limpeza completa e rebuild...');

// Pastas para limpar
const foldersToClean = [
  'src/frontend/dist',
  'src/frontend/.angular',
  'src/frontend/node_modules/.cache',
  'release'
];

// Limpar pastas
for (const folder of foldersToClean) {
  try {
    if (fs.existsSync(folder)) {
      console.log(`🗑️ Removendo ${folder}...`);
      fs.rmSync(folder, { recursive: true, force: true });
      console.log(`✅ ${folder} removido`);
    } else {
      console.log(`ℹ️ ${folder} não existe`);
    }
  } catch (error) {
    console.warn(`⚠️ Erro ao remover ${folder}:`, error.message);
  }
}

console.log('\n🔧 Iniciando rebuild do frontend...');

try {
  // Rebuild frontend
  execSync('cd src/frontend && npm run build', { 
    stdio: 'inherit',
    cwd: process.cwd()
  });
  console.log('✅ Frontend rebuild concluído');
  
  console.log('\n🔧 Iniciando rebuild do backend...');
  
  // Rebuild backend 
  execSync('cd src/backend && npm run build', { 
    stdio: 'inherit',
    cwd: process.cwd()
  });
  console.log('✅ Backend rebuild concluído');
  
  console.log('\n🔧 Iniciando rebuild do Electron...');
  
  // Rebuild Electron
  execSync('npm run build', { 
    stdio: 'inherit',
    cwd: process.cwd()
  });
  console.log('✅ Electron rebuild concluído');
  
  console.log('\n🎉 Rebuild completo finalizado!');
  console.log('🔍 Agora teste novamente e verifique os logs:');
  console.log('   - 🌍 [ApiService] Produção com IP específico');
  console.log('   - 🏠 [ApiService] Desenvolvimento/localhost');
  console.log('   - Não deve aparecer mais /api/api/queue/status');
  
} catch (error) {
  console.error('❌ Erro no rebuild:', error.message);
  process.exit(1);
} 