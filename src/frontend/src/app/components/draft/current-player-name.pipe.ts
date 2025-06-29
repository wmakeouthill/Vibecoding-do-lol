import { Pipe, PipeTransform } from '@angular/core';

@Pipe({ name: 'currentPlayerName', pure: true })
export class CurrentPlayerNamePipe implements PipeTransform {
  transform(session: any): string {
    if (!session) return '';

    const currentPhase = session.phases[session.currentAction];
    if (!currentPhase) return '';

    return currentPhase.playerName || 'Jogador Desconhecido';
  }
} 