import { Pipe, PipeTransform } from '@angular/core';

@Pipe({ name: 'currentActionIcon', pure: true })
export class CurrentActionIconPipe implements PipeTransform {
  transform(session: any): string {
    if (!session) return '';

    const currentPhase = session.phases[session.currentAction];
    if (!currentPhase) return '';

    return currentPhase.action === 'ban' ? '🚫' : '⭐';
  }
} 