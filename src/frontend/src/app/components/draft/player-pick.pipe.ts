import { Pipe, PipeTransform } from '@angular/core';

@Pipe({ name: 'playerPick', pure: true })
export class PlayerPickPipe implements PipeTransform {
  transform(phases: any[], team: 'blue' | 'red', player: any): any {
    if (!Array.isArray(phases) || !player) return null;
    
    // ✅ CORREÇÃO: Usar teamIndex diretamente do jogador
    const playerIndex = player.teamIndex;
    
    if (playerIndex === undefined || playerIndex === null) {
      return null;
    }

    // Mapear o índice do jogador para as fases de pick correspondentes
    // Baseado no fluxo da partida ranqueada
    if (team === 'blue') {
      // Blue team picks: ações 7, 10, 11, 18, 19
      const bluePickActions = [6, 9, 10, 17, 18]; // -1 porque currentAction é 0-based
      const playerPickAction = bluePickActions[playerIndex];
      
      if (playerPickAction !== undefined) {
        const pickPhase = phases[playerPickAction];
        return pickPhase?.champion || null;
      }
    } else {
      // Red team picks: ações 8, 9, 12, 17, 20
      const redPickActions = [7, 8, 11, 16, 19]; // -1 porque currentAction é 0-based
      const playerPickAction = redPickActions[playerIndex];
      
      if (playerPickAction !== undefined) {
        const pickPhase = phases[playerPickAction];
        return pickPhase?.champion || null;
      }
    }

    return null;
  }
} 