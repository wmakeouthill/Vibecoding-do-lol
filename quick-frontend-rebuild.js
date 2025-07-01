const fs = require('fs');
const { execSync } = require('child_process');

console.log('⚡ Rebuild rápido do frontend...');

// Limpar cache Angular
try {
  if (fs.existsSync('src/frontend/.angular')) {
    console.log('🗑️ Removendo cache Angular...');
    fs.rmSync('src/frontend/.angular', { recursive: true, force: true });
  }
} catch (error) {
  console.warn('⚠️ Erro ao limpar cache:', error.message);
}

try {
  console.log('🔧 Rebuilding frontend...');
  execSync('cd src/frontend && npm run build', { 
    stdio: 'inherit',
    cwd: process.cwd()
  });
  
  console.log('✅ Frontend rebuild concluído!');
  console.log('🔍 Agora teste e procure por estes logs:');
  console.log('   - 🚨 [UrlFixInterceptor] DETECTADO e CORRIGIDO URL duplicado');
  console.log('   - 📊 [ApiService] getQueueStatus chamado com URL');
  console.log('   - 🔧 [ApiService] URL construída');
  
} catch (error) {
  console.error('❌ Erro no rebuild:', error.message);
  process.exit(1);
} 