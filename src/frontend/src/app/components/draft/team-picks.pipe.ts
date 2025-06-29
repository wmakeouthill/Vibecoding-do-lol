import { Pipe, PipeTransform } from '@angular/core';

@Pipe({ name: 'teamPicks', pure: true })
export class TeamPicksPipe implements PipeTransform {
  transform(phases: any[], team: 'blue' | 'red'): any[] {
    if (!Array.isArray(phases)) return [];
    
    return phases
      .filter(phase => phase.team === team && phase.action === 'pick' && phase.champion)
      .map(phase => phase.champion);
  }
} 