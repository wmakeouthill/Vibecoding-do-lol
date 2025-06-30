const path = require('path');
const Module = require('module');

console.log('🕵️ INTERCEPTANDO EXECUÇÃO DO SERVIDOR');
console.log('=====================================');

// Interceptar require do express para monitorar rotas
const originalRequire = Module.prototype.require;

Module.prototype.require = function(id) {
  const module = originalRequire.apply(this, arguments);
  
  if (id === 'express') {
    console.log('📦 Express interceptado!');
    
    const originalExpress = module;
    
    // Wrapper para a função express()
    function wrappedExpress() {
      const app = originalExpress();
      
      // Interceptar métodos de rota
      const methods = ['get', 'post', 'put', 'delete', 'patch', 'all'];
      
      methods.forEach(method => {
        const originalMethod = app[method];
        
        app[method] = function(route, ...handlers) {
          console.log(`🛣️ Definindo rota ${method.toUpperCase()}: "${route}"`);
          
          // Verificar se a rota tem problemas de sintaxe
          if (typeof route === 'string') {
            // Procurar por dois pontos sem nome de parâmetro
            const problematicPattern = /:(?![a-zA-Z0-9_])|:$/;
            if (problematicPattern.test(route)) {
              console.error(`❌ ROTA PROBLEMÁTICA DETECTADA: "${route}"`);
              console.error('   Problema: Parâmetro sem nome ou malformado');
              
              // Mostrar onde na string está o problema
              const match = route.match(problematicPattern);
              if (match) {
                const position = match.index;
                console.error(`   Posição do erro: ${position}`);
                console.error(`   Contexto: "${route.substring(Math.max(0, position - 5), position + 5)}"`);
              }
              
              throw new Error(`Rota malformada detectada: "${route}"`);
            }
          }
          
          try {
            return originalMethod.apply(this, arguments);
          } catch (error) {
            console.error(`💥 ERRO ao definir rota ${method.toUpperCase()} "${route}":`, error.message);
            
            if (error.message.includes('pathToRegexpError') || error.message.includes('Missing parameter name')) {
              console.error('🔍 Este é o erro que procurávamos!');
              console.error('📍 Rota problemática:', route);
              console.error('📋 Handlers:', handlers.length);
              console.error('📊 Stack trace:');
              console.error(error.stack);
            }
            
            throw error;
          }
        };
      });
      
      return app;
    }
    
    // Copiar propriedades do express original
    Object.setPrototypeOf(wrappedExpress, originalExpress);
    Object.assign(wrappedExpress, originalExpress);
    
    return wrappedExpress;
  }
  
  return module;
};

// Agora executar o servidor
console.log('\n🚀 Iniciando servidor com interceptação...');

try {
  // Mudar para o diretório do backend
  process.chdir(path.join(__dirname, 'dist', 'backend'));
  
  // Carregar o servidor
  require('./server.js');
  
} catch (error) {
  console.error('\n💥 ERRO CAPTURADO!');
  console.error('Tipo:', error.constructor.name);
  console.error('Mensagem:', error.message);
  
  if (error.message.includes('pathToRegexpError') || error.message.includes('Missing parameter name')) {
    console.error('\n🎯 ESTE É O ERRO QUE PROCURÁVAMOS!');
    console.error('Este erro confirma que há uma rota malformada sendo definida.');
  }
  
  console.error('\nStack trace completo:');
  console.error(error.stack);
  
  process.exit(1);
} 