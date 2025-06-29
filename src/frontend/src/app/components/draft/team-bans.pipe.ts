import { Pipe, PipeTransform } from '@angular/core';

@Pipe({ name: 'teamBans', pure: true })
export class TeamBansPipe implements PipeTransform {
  transform(phases: any[], team: 'blue' | 'red'): any[] {
    if (!Array.isArray(phases)) return [];
    
    return phases
      .filter(phase => phase.team === team && phase.action === 'ban' && phase.champion)
      .map(phase => phase.champion);
  }
} 