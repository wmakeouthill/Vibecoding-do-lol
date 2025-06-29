import { Pipe, PipeTransform } from '@angular/core';

@Pipe({ name: 'currentPhaseText', pure: true })
export class CurrentPhaseTextPipe implements PipeTransform {
  transform(session: any): string {
    if (!session) return '';

    if (session.phase === 'completed') {
      return 'Seleção Completa';
    }

    const currentPhase = session.phases[session.currentAction];
    if (!currentPhase) return '';

    const actionIndex = session.currentAction + 1; // +1 para mostrar ação 1-20

    if (currentPhase.action === 'ban') {
      if (actionIndex <= 6) {
        // Primeira fase de bans (1-6)
        const banNumber = actionIndex;
        return `Ban ${banNumber} de 6 (1ª Fase)`;
      } else {
        // Segunda fase de bans (13-16)
        const banNumber = actionIndex - 6;
        return `Ban ${banNumber} de 4 (2ª Fase)`;
      }
    } else {
      if (actionIndex >= 7 && actionIndex <= 12) {
        // Primeira fase de picks (7-12)
        const pickNumber = actionIndex - 6;
        return `Pick ${pickNumber} de 6 (1ª Fase)`;
      } else {
        // Segunda fase de picks (17-20)
        const pickNumber = actionIndex - 12;
        return `Pick ${pickNumber} de 4 (2ª Fase)`;
      }
    }
  }
} 