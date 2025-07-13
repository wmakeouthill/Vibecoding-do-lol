const { spawn } = require('child_process');
const path = require('path');

console.log('🔄 [Restart] Reiniciando servidor...');

// Parar o servidor atual (se estiver rodando)
const killProcess = spawn('taskkill', ['/F', '/IM', 'node.exe'], {
    stdio: 'ignore',
    shell: true
});

killProcess.on('close', () => {
    console.log('✅ [Restart] Servidor anterior parado');

    // Aguardar um pouco antes de reiniciar
    setTimeout(() => {
        console.log('🚀 [Restart] Iniciando novo servidor...');

        // Iniciar novo servidor
        const server = spawn('npx', ['ts-node', 'server.ts'], {
            cwd: path.join(__dirname),
            stdio: 'inherit',
            shell: true
        });

        server.on('error', (error) => {
            console.error('❌ [Restart] Erro ao iniciar servidor:', error);
        });

        server.on('close', (code) => {
            console.log(`🔄 [Restart] Servidor encerrado com código: ${code}`);
        });

        // Aguardar um pouco e testar os endpoints
        setTimeout(async () => {
            console.log('🧪 [Restart] Testando endpoints após reinicialização...');

            try {
                const { default: fetch } = await import('node-fetch');

                // Testar status do Discord
                const discordResponse = await fetch('http://127.0.0.1:3000/api/debug/discord-status');
                const discordData = await discordResponse.json();
                console.log('🔍 [Restart] Discord Status:', discordData);

                // Testar status do MatchFound
                const matchFoundResponse = await fetch('http://127.0.0.1:3000/api/debug/matchfound-status');
                const matchFoundData = await matchFoundResponse.json();
                console.log('🔍 [Restart] MatchFound Status:', matchFoundData);

                if (matchFoundData.matchFoundStatus.hasDiscordService) {
                    console.log('✅ [Restart] DiscordService está sendo passado corretamente!');
                } else {
                    console.log('❌ [Restart] DiscordService NÃO está sendo passado corretamente!');
                }

            } catch (error) {
                console.error('❌ [Restart] Erro ao testar endpoints:', error.message);
            }
        }, 5000);

    }, 2000);
}); 