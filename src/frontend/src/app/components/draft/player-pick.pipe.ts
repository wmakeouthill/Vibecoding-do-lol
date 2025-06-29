import { Pipe, PipeTransform } from '@angular/core';

@Pipe({ name: 'playerPick', pure: true })
export class PlayerPickPipe implements PipeTransform {
  transform(phases: any[], team: 'blue' | 'red', player: any): any {
    if (!Array.isArray(phases) || !player) return null;
    
    console.log('🎯 [PlayerPickPipe] === Mapeando pick para jogador ===');
    console.log('🎯 [PlayerPickPipe] Team:', team);
    console.log('🎯 [PlayerPickPipe] Player:', {
      id: player.id,
      summonerName: player.summonerName,
      name: player.name,
      teamIndex: player.teamIndex,
      lane: player.lane
    });
    
    // ✅ CORREÇÃO: Usar teamIndex diretamente do jogador
    const playerIndex = player.teamIndex;
    
    if (playerIndex === undefined || playerIndex === null) {
      console.log('❌ [PlayerPickPipe] teamIndex não encontrado');
      return null;
    }

    console.log('🎯 [PlayerPickPipe] PlayerIndex (teamIndex):', playerIndex);

    // Mapear o índice do jogador para as fases de pick correspondentes
    // Baseado no fluxo da partida ranqueada
    if (team === 'blue') {
      // Blue team picks: ações 7, 10, 11, 18, 19
      const bluePickActions = [6, 9, 10, 17, 18]; // -1 porque currentAction é 0-based
      const playerPickAction = bluePickActions[playerIndex];
      
      console.log('🎯 [PlayerPickPipe] Blue team - Pick actions:', bluePickActions);
      console.log('🎯 [PlayerPickPipe] Player pick action index:', playerPickAction);
      
      if (playerPickAction !== undefined) {
        const pickPhase = phases[playerPickAction];
        console.log('🎯 [PlayerPickPipe] Pick phase encontrada:', pickPhase);
        console.log('🎯 [PlayerPickPipe] Champion:', pickPhase?.champion?.name || 'null');
        return pickPhase?.champion || null;
      }
    } else {
      // Red team picks: ações 8, 9, 12, 17, 20
      const redPickActions = [7, 8, 11, 16, 19]; // -1 porque currentAction é 0-based
      const playerPickAction = redPickActions[playerIndex];
      
      console.log('🎯 [PlayerPickPipe] Red team - Pick actions:', redPickActions);
      console.log('🎯 [PlayerPickPipe] Player pick action index:', playerPickAction);
      
      if (playerPickAction !== undefined) {
        const pickPhase = phases[playerPickAction];
        console.log('🎯 [PlayerPickPipe] Pick phase encontrada:', pickPhase);
        console.log('🎯 [PlayerPickPipe] Champion:', pickPhase?.champion?.name || 'null');
        return pickPhase?.champion || null;
      }
    }

    console.log('❌ [PlayerPickPipe] Nenhum pick encontrado para o jogador');
    return null;
  }
} 