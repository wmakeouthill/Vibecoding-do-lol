import { Pipe, PipeTransform } from '@angular/core';

@Pipe({ name: 'currentActionText', pure: true })
export class CurrentActionTextPipe implements PipeTransform {
  transform(session: any): string {
    if (!session) return '';

    const currentPhase = session.phases[session.currentAction];
    if (!currentPhase) return '';

    return currentPhase.action === 'ban' ? 'Banir Campeão' : 'Escolher Campeão';
  }
} 