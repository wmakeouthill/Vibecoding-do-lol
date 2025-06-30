import { Pipe, PipeTransform } from '@angular/core';

@Pipe({ name: 'currentPlayerName', pure: true })
export class CurrentPlayerNamePipe implements PipeTransform {
  transform(session: any): string {
    if (!session || !session.phases || session.currentAction === undefined) {
      return '';
    }

    const currentPhase = session.phases[session.currentAction];
    if (!currentPhase) {
      return '';
    }

    return currentPhase.playerName || currentPhase.playerId || 'Jogador Desconhecido';
  }
} 