import { Pipe, PipeTransform } from '@angular/core';

@Pipe({ name: 'laneDisplay', pure: true })
export class LaneDisplayPipe implements PipeTransform {
  transform(lane: string): string {
    const laneNames: { [key: string]: string } = {
      'top': '🛡️ Top',
      'jungle': '🌲 Jungle',
      'mid': '⚡ Mid',
      'adc': '🏹 ADC',
      'support': '💎 Support',
      'unknown': '❓ Unknown'
    };
    return laneNames[lane] || laneNames['unknown'];
  }
} 