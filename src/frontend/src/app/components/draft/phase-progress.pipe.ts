import { Pipe, PipeTransform } from '@angular/core';

@Pipe({ name: 'phaseProgress', pure: true })
export class PhaseProgressPipe implements PipeTransform {
  transform(session: any): number {
    if (!session) return 0;

    if (session.phase === 'completed') {
      return 100;
    }

    return (session.currentAction / session.phases.length) * 100;
  }
} 