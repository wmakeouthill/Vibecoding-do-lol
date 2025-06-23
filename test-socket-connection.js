const { io } = require('socket.io-client');

console.log('🧪 Testando conexão Socket.IO...');

// Testar conexão com polling apenas
const socket = io('http://localhost:8080', {
  transports: ['polling'], // Apenas polling
  autoConnect: false
});

socket.on('connect', () => {
  console.log('✅ Conectado ao servidor de sinalização!');
  console.log('📡 Socket ID:', socket.id);
  
  // Testar registro de peer
  const testPeer = {
    id: 'test-peer-' + Date.now(),
    summonerName: 'TestPlayer',
    region: 'BR1',
    mmr: 1500
  };
  
  console.log('📤 Registrando peer de teste...');
  socket.emit('register-peer', testPeer);
});

socket.on('connect_error', (error) => {
  console.error('❌ Erro de conexão:', error);
});

socket.on('peers-list', (peers) => {
  console.log('👥 Lista de peers recebida:', peers);
});

socket.on('peer-joined', (peer) => {
  console.log('🎉 Novo peer conectado:', peer);
});

socket.on('disconnect', () => {
  console.log('🔌 Desconectado do servidor');
});

// Conectar
console.log('🔗 Tentando conectar...');
socket.connect();

// Desconectar após 10 segundos
setTimeout(() => {
  console.log('🏁 Finalizando teste...');
  socket.disconnect();
  process.exit(0);
}, 10000);
