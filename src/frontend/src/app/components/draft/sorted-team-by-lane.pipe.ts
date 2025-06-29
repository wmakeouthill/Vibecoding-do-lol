import { Pipe, PipeTransform } from '@angular/core';

@Pipe({ name: 'sortedTeamByLane', pure: true })
export class SortedTeamByLanePipe implements PipeTransform {
  transform(players: any[]): any[] {
    if (!Array.isArray(players)) return [];
    const laneOrder = ['top', 'jungle', 'mid', 'adc', 'support'];
    return [...players].sort((a, b) => {
      const laneA = a.lane || 'unknown';
      const laneB = b.lane || 'unknown';
      const indexA = laneOrder.indexOf(laneA);
      const indexB = laneOrder.indexOf(laneB);
      if (indexA === -1 && indexB === -1) return 0;
      if (indexA === -1) return 1;
      if (indexB === -1) return -1;
      return indexA - indexB;
    });
  }
} 