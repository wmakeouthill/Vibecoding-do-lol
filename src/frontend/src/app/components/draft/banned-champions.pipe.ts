import { Pipe, PipeTransform } from '@angular/core';

@Pipe({ name: 'bannedChampions', pure: true })
export class BannedChampionsPipe implements PipeTransform {
  transform(phases: any[]): any[] {
    if (!Array.isArray(phases)) return [];
    
    return phases
      .filter(phase => phase.action === 'ban' && phase.champion)
      .map(phase => phase.champion)
      .filter((champion, index, self) =>
        index === self.findIndex(c => c.id === champion.id)
      );
  }
} 