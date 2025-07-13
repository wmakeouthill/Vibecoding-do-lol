import { LCUService } from './services/LCUService';

async function checkLobbyStatus() {
    const lcuService = new LCUService();
    await lcuService.initialize();
    if (!lcuService.isClientConnected()) {
        console.error('❌ LCU não está conectado!');
        process.exit(1);
    }
    try {
        const lobby = await lcuService.getLobbyData();
        console.log('📋 Status do lobby atual:', JSON.stringify(lobby.data, null, 2));
    } catch (err) {
        if (err instanceof Error) {
            console.error('❌ Não foi possível obter o status do lobby:', err.message);
        } else {
            console.error('❌ Não foi possível obter o status do lobby:', err);
        }
    }
}

checkLobbyStatus(); 