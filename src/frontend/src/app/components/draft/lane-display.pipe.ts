import { Pipe, PipeTransform } from '@angular/core';

@Pipe({ name: 'laneDisplay', pure: true })
export class LaneDisplayPipe implements PipeTransform {
  transform(lane: string): string {
    if (!lane) return '';

    // Mapear lanes para exibição amigável
    const laneDisplayMap: { [key: string]: string } = {
      'TOP': 'Topo',
      'JUNGLE': 'Selva',
      'MID': 'Meio',
      'ADC': 'ADC',
      'SUPPORT': 'Suporte',
      'BOTTOM': 'ADC',
      'BOT': 'ADC',
      'FILL': 'Qualquer',
      'top': 'Topo',
      'jungle': 'Selva',
      'mid': 'Meio',
      'bot': 'ADC',
      'support': 'Suporte',
      'fill': 'Qualquer'
    };

    return laneDisplayMap[lane] || lane;
  }
}
