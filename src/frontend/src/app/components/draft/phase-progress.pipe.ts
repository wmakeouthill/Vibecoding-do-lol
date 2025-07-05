import { Pipe, PipeTransform } from '@angular/core';

@Pipe({ name: 'phaseProgress', pure: true })
export class PhaseProgressPipe implements PipeTransform {
  transform(session: any): number {
    if (!session) return 0;

    if (session.phase === 'completed') {
      return 100;
    }

    if (!session.phases || !Array.isArray(session.phases)) {
      return 0;
    }

    const totalPhases = session.phases.length;
    const currentAction = session.currentAction || 0;

    // Calcular progresso baseado na ação atual
    const progress = (currentAction / totalPhases) * 100;

    // Garantir que o progresso esteja entre 0 e 100
    return Math.min(100, Math.max(0, progress));
  }
}
