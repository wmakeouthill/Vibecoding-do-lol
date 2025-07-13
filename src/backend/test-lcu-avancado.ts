import { LCUService } from './services/LCUService';

async function testLCUAvancado() {
    console.log('🚀 TESTE AVANÇADO DO LCU - Criação de Lobby');
    console.log('============================================');

    const lcuService = new LCUService();

    try {
        // 1. Inicializar LCU
        console.log('\n1️⃣ Inicializando LCU Service...');
        await lcuService.initialize();

        if (!lcuService.isClientConnected()) {
            console.error('❌ LCU não está conectado!');
            return;
        }

        console.log('✅ LCU conectado com sucesso');

        // 2. Verificar summoner atual
        const summoner = await lcuService.getCurrentSummoner();
        console.log('👤 Summoner:', summoner.displayName, `(ID: ${summoner.summonerId})`);

        // 3. Testar diferentes estruturas de lobby
        console.log('\n2️⃣ Testando diferentes estruturas de lobby...');

        const estruturas = [
            {
                nome: 'Estrutura 1 - Básica',
                dados: {
                    queueId: 0
                }
            },
            {
                nome: 'Estrutura 2 - Com gameConfig',
                dados: {
                    queueId: 0,
                    gameConfig: {
                        gameMode: 'CLASSIC',
                        mapId: 11,
                        pickType: 'BLIND_PICK',
                        spectatorType: 'ALL',
                        teamSize: 5
                    }
                }
            },
            {
                nome: 'Estrutura 3 - Com lobbyName e password',
                dados: {
                    queueId: 0,
                    gameConfig: {
                        gameMode: 'CLASSIC',
                        mapId: 11,
                        pickType: 'BLIND_PICK',
                        spectatorType: 'ALL',
                        teamSize: 5
                    },
                    lobbyName: 'TESTE AUTOMATICO',
                    lobbyPassword: 'ordem123'
                }
            },
            {
                nome: 'Estrutura 4 - Apenas queueId e password',
                dados: {
                    queueId: 0,
                    lobbyPassword: 'ordem123'
                }
            },
            {
                nome: 'Estrutura 5 - Com customGameLobby',
                dados: {
                    customGameLobby: {
                        queueId: 0,
                        gameConfig: {
                            gameMode: 'CLASSIC',
                            mapId: 11,
                            pickType: 'BLIND_PICK',
                            spectatorType: 'ALL',
                            teamSize: 5
                        },
                        lobbyName: 'TESTE AUTOMATICO',
                        lobbyPassword: 'ordem123'
                    }
                }
            }
        ];

        for (const estrutura of estruturas) {
            console.log(`\n🔍 Testando: ${estrutura.nome}`);
            console.log('📋 Dados:', JSON.stringify(estrutura.dados, null, 2));

            try {
                const response = await lcuService.makeLCURequest('POST', '/lol-lobby/v2/lobby', estrutura.dados);
                console.log('✅ SUCESSO! Lobby criado!');
                console.log('📊 Resposta:', JSON.stringify(response.data, null, 2));

                // Se chegou aqui, encontramos a estrutura correta!
                console.log('\n🎉 ESTRUTURA FUNCIONAL ENCONTRADA!');
                console.log('📝 Use esta estrutura no CustomGameService:');
                console.log(JSON.stringify(estrutura.dados, null, 2));
                return;

            } catch (error: any) {
                const status = error.response?.status;
                const message = error.response?.data?.message;
                console.log(`❌ Falhou: ${status} - ${message}`);
            }
        }

        // 4. Testar endpoint alternativo se todas falharem
        console.log('\n3️⃣ Testando endpoint alternativo...');

        try {
            const response = await lcuService.makeLCURequest('POST', '/lol-lobby/v1/lobby', {
                queueId: 0,
                gameConfig: {
                    gameMode: 'CLASSIC',
                    mapId: 11,
                    pickType: 'BLIND_PICK',
                    spectatorType: 'ALL',
                    teamSize: 5
                },
                lobbyPassword: 'ordem123'
            });
            console.log('✅ SUCESSO com endpoint v1!');
            console.log('📊 Resposta:', JSON.stringify(response.data, null, 2));
        } catch (error: any) {
            console.log('❌ Endpoint v1 também falhou:', error.response?.data?.message);
        }

        // 5. Verificar se há algum lobby existente
        console.log('\n4️⃣ Verificando lobby existente...');

        try {
            const lobby = await lcuService.getLobbyData();
            console.log('📋 Lobby existente encontrado:', JSON.stringify(lobby.data, null, 2));
        } catch (error: any) {
            console.log('✅ Nenhum lobby ativo (esperado)');
        }

        console.log('\n❌ Nenhuma estrutura funcionou. O problema pode ser:');
        console.log('1. API do LCU mudou na versão atual');
        console.log('2. Restrição de segurança impede criação automática');
        console.log('3. Cliente em estado que bloqueia criação');

    } catch (error: any) {
        console.error('❌ Erro no teste:', error);
    }
}

testLCUAvancado(); 