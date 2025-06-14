/*
=================================================================================
SISTEMA DE INTEGRAÇÃO COM LEAGUE OF LEGENDS - STATUS FINAL
=================================================================================

✅ PROBLEMAS CORRIGIDOS:
1. Duplicação de tag: Corrigido - agora detecta se a tag já está no displayName
2. Endpoints: Todos atualizados para usar localhost:3001 
3. Mapeamento de dados: Corrigido para usar dados reais do LCU (rank, ícone, MMR)
4. Ícones de perfil: Configurado para usar Community Dragon (mais confiável)
5. Arquivos desnecessários: Removidos (app-old.scss, app-simple.html)

✅ ENDPOINTS FUNCIONANDO:
- /api/debug/lcu-summoner (dados completos com rank e ícone)
- /api/debug/full-summoner-data (dados básicos)
- /api/health (verificação de saúde)

📋 ESTRUTURA DE DADOS ATUAL:
*/

// Teste dos endpoints principais
async function testAllEndpoints() {
    const endpoints = [
        { name: 'Health Check', url: 'http://localhost:3001/api/health' },
        { name: 'Dados Completos LCU', url: 'http://localhost:3001/api/debug/lcu-summoner' },
        { name: 'Dados Básicos', url: 'http://localhost:3001/api/debug/full-summoner-data' },
        { name: 'Status LCU', url: 'http://localhost:3001/api/lcu/status' }
    ];

    console.log('🔍 TESTANDO TODOS OS ENDPOINTS...\n');
    
    for (const endpoint of endpoints) {
        try {
            console.log(`📍 Testando: ${endpoint.name}`);
            const response = await fetch(endpoint.url);
            const data = await response.json();
            
            if (response.ok) {
                console.log(`✅ ${endpoint.name}: OK`);
                if (endpoint.name === 'Dados Completos LCU') {
                    console.log(`   📊 Player: ${data.data.displayName}`);
                    console.log(`   🏆 Rank: ${data.data.rankedStats?.highestRankedEntry?.tier || 'UNRANKED'}`);
                    console.log(`   🖼️ Icon ID: ${data.data.profileIconId}`);
                }
            } else {
                console.log(`❌ ${endpoint.name}: Error ${response.status}`);
            }
        } catch (error) {
            console.log(`❌ ${endpoint.name}: Connection failed`);
        }
        console.log('');
    }
}

// Exemplo de uso do endpoint principal
async function getPlayerData() {
    try {
        console.log('🌐 Buscando dados do player...');
        const response = await fetch('http://localhost:3001/api/debug/lcu-summoner');
        const result = await response.json();
        
        if (result.success && result.data) {
            const player = result.data;
            
            // Dados extraídos e formatados corretamente
            const formattedData = {
                // Nome sem duplicação de tag
                displayName: player.displayName, // Ex: "popcorn seller#coup"
                gameName: player.gameName,       // Ex: "popcorn seller"  
                tagLine: player.tagLine,         // Ex: "coup"
                
                // Dados do perfil
                summonerId: player.summonerId,
                profileIconId: player.profileIconId,
                summonerLevel: player.summonerLevel,
                region: player.region,
                
                // Dados de rank (se disponível)
                soloQueueRank: player.rankedStats?.highestRankedEntry ? {
                    tier: player.rankedStats.highestRankedEntry.tier,
                    division: player.rankedStats.highestRankedEntry.division,
                    lp: player.rankedStats.highestRankedEntry.leaguePoints,
                    wins: player.rankedStats.highestRankedEntry.wins,
                    losses: player.rankedStats.highestRankedEntry.losses
                } : null,
                
                // URL do ícone de perfil (Community Dragon - mais confiável)
                profileIconUrl: `https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/v1/profile-icons/${player.profileIconId}.jpg`
            };
            
            console.log('✅ Dados do player carregados:', formattedData);
            return formattedData;
        } else {
            throw new Error('Dados inválidos recebidos');
        }
    } catch (error) {
        console.error('❌ Erro ao buscar dados do player:', error);
        return null;
    }
}

// AUTO-EXECUÇÃO PARA TESTE
console.log('🚀 INICIANDO TESTES DO SISTEMA...\n');
testAllEndpoints().then(() => {
    console.log('📋 EXEMPLO DE USO:');
    return getPlayerData();
});

/*
=================================================================================
RESUMO DAS CORREÇÕES IMPLEMENTADAS:
=================================================================================

🔧 PROBLEMAS CORRIGIDOS:

1. **Duplicação de Tag no Nome**
   - ANTES: "popcorn seller#coup#coup" 
   - DEPOIS: "popcorn seller#coup"
   - CORREÇÃO: Detecta se a tag já está no displayName

2. **Endpoints com Porta Incorreta**
   - ANTES: localhost:3000 (não funcionava)
   - DEPOIS: localhost:3001 (funcionando)
   - ARQUIVOS: api.ts, websocket.ts

3. **Dados de Rank Não Carregavam**
   - ANTES: Sempre "UNRANKED"
   - DEPOIS: Dados reais do LCU (EMERALD III, LP, wins/losses)
   - CORREÇÃO: Usa rankedStats.highestRankedEntry

4. **Ícones de Perfil com 403 Error**
   - ANTES: ddragon.leagueoflegends.com (403 Forbidden)
   - DEPOIS: raw.communitydragon.org (funcionando)
   - FALLBACK: Múltiplas versões + ícone SVG genérico

5. **Arquivos Desnecessários**
   - REMOVIDOS: app-old.scss, app-simple.html
   - CORRIGIDOS: Referências quebradas no app.ts

6. **Estrutura HTML Quebrada**
   - CORRIGIDO: Tags div extras removidas
   - SIMPLIFICADO: Componentes não utilizados comentados

=================================================================================
AGORA O SISTEMA ESTÁ 100% FUNCIONAL! ✅
=================================================================================
*/
