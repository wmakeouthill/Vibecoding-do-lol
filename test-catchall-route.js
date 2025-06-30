const express = require('express');

console.log('🔍 TESTE DA ROTA CATCH-ALL');
console.log('=========================');

const app = express();

const dummyHandler = (req, res) => res.json({ ok: true });

console.log('📝 Testando rotas normais primeiro...');

try {
  // Testar rotas normais primeiro
  app.get('/api/test', dummyHandler);
  app.get('/api/champions', dummyHandler);
  app.get('/api/champions/role/:role', dummyHandler);
  app.post('/api/matches/:matchId/draft-completed', dummyHandler);
  app.post('/api/matches/:matchId/game-completed', dummyHandler);
  app.put('/api/matches/custom/:matchId', dummyHandler);
  
  console.log('✅ Todas as rotas normais funcionaram!');
  
  console.log('\n📝 Agora testando a rota catch-all...');
  
  // Agora testar a rota catch-all
  app.get('*', dummyHandler);
  
  console.log('✅ Rota catch-all adicionada com sucesso!');
  
  console.log('\n📝 Tentando inicializar o servidor...');
  
  // Tentar inicializar o servidor
  const server = app.listen(0, '127.0.0.1', () => {
    const port = server.address().port;
    console.log(`✅ Servidor iniciado com sucesso na porta ${port}!`);
    console.log('✅ Todas as rotas estão funcionando corretamente!');
    
    server.close(() => {
      console.log('✅ Servidor encerrado com sucesso');
      process.exit(0);
    });
  });
  
} catch (error) {
  console.error('\n💥 ERRO ENCONTRADO!');
  console.error('Tipo:', error.constructor.name);
  console.error('Mensagem:', error.message);
  
  if (error.message.includes('pathToRegexpError') || error.message.includes('Missing parameter name')) {
    console.error('\n🎯 ERRO DE PATH-TO-REGEXP DETECTADO!');
    console.error('📍 A rota catch-all pode estar causando o problema.');
  }
  
  console.error('\nStack trace:');
  console.error(error.stack);
  
  process.exit(1);
}

// Timeout de segurança
setTimeout(() => {
  console.log('\n⏰ Timeout - encerrando teste');
  process.exit(1);
}, 5000); 