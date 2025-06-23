import { SignalingServer } from './services/signaling-server';

const PORT = process.env.P2P_SIGNALING_PORT ? parseInt(process.env.P2P_SIGNALING_PORT) : 8080;

console.log('🚀 Iniciando servidor de sinalização P2P...');

const signalingServer = new SignalingServer(PORT);

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n🛑 Encerrando servidor de sinalização...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n🛑 Encerrando servidor de sinalização...');
  process.exit(0);
});

console.log('✅ Servidor de sinalização P2P iniciado com sucesso!');
console.log(`📡 Aguardando conexões em ws://localhost:${PORT}`);
