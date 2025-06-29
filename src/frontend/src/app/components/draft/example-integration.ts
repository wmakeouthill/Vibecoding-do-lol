import { Component, ViewChild } from '@angular/core';
import { DraftPickBanComponent } from './draft-pick-ban';
import { DraftChampionModalComponent } from './draft-champion-modal';
import { DraftConfirmationModalComponent } from './draft-confirmation-modal';
import { Champion } from '../../services/champion.service';

@Component({
  selector: 'app-example-draft-integration',
  template: `
    <!-- Componente Principal de Draft -->
    <app-draft-pick-ban
      #draftComponent
      [matchData]="matchData"
      [isLeader]="isLeader"
      [currentPlayer]="currentPlayer"
      (onPickBanComplete)="handlePickBanComplete($event)"
      (onPickBanCancel)="handlePickBanCancel()"
      (onOpenChampionModal)="openChampionModal()"
      (onOpenConfirmationModal)="openConfirmationModal()">
    </app-draft-pick-ban>

    <!-- Modal de Seleção de Campeões -->
    <app-draft-champion-modal
      [session]="draftComponent.session"
      [currentPlayer]="currentPlayer"
      [isVisible]="showChampionModal"
      (onClose)="closeChampionModal()"
      (onChampionSelected)="handleChampionSelected($event)">
    </app-draft-champion-modal>

    <!-- Modal de Confirmação Final -->
    <app-draft-confirmation-modal
      [session]="draftComponent.session"
      [currentPlayer]="currentPlayer"
      [isVisible]="showConfirmationModal"
      (onClose)="closeConfirmationModal()"
      (onConfirm)="handleConfirmDraft()"
      (onCancel)="handleCancelDraft()"
      (onEditPick)="handleEditPick($event)">
    </app-draft-confirmation-modal>
  `
})
export class ExampleDraftIntegrationComponent {
  @ViewChild('draftComponent') draftComponent!: DraftPickBanComponent;

  // Dados da partida (exemplo)
  matchData = {
    id: 'match-123',
    blueTeam: [
      { id: 1, summonerName: 'Player1', lane: 'top' },
      { id: 2, summonerName: 'Player2', lane: 'jungle' },
      { id: 3, summonerName: 'Player3', lane: 'mid' },
      { id: 4, summonerName: 'Player4', lane: 'adc' },
      { id: 5, summonerName: 'Player5', lane: 'support' }
    ],
    redTeam: [
      { id: 6, summonerName: 'Player6', lane: 'top' },
      { id: 7, summonerName: 'Player7', lane: 'jungle' },
      { id: 8, summonerName: 'Player8', lane: 'mid' },
      { id: 9, summonerName: 'Player9', lane: 'adc' },
      { id: 10, summonerName: 'Player10', lane: 'support' }
    ]
  };

  isLeader = true;
  currentPlayer = { id: 1, summonerName: 'Player1' };

  // Estados dos modais
  showChampionModal = false;
  showConfirmationModal = false;

  // ========== MÉTODOS PARA O MODAL DE CAMPEÕES ==========
  
  openChampionModal(): void {
    this.showChampionModal = true;
  }

  closeChampionModal(): void {
    this.showChampionModal = false;
  }

  handleChampionSelected(champion: Champion): void {
    // Processar a seleção do campeão no componente principal
    this.draftComponent.onChampionSelected(champion);
    this.closeChampionModal();
  }

  // ========== MÉTODOS PARA O MODAL DE CONFIRMAÇÃO ==========
  
  openConfirmationModal(): void {
    this.showConfirmationModal = true;
  }

  closeConfirmationModal(): void {
    this.showConfirmationModal = false;
  }

  handleConfirmDraft(): void {
    // Confirmar o draft e prosseguir
    console.log('Draft confirmado!');
    this.closeConfirmationModal();
    this.handlePickBanComplete({
      session: this.draftComponent.session,
      blueTeam: this.draftComponent.session?.blueTeam,
      redTeam: this.draftComponent.session?.redTeam
    });
  }

  handleCancelDraft(): void {
    // Cancelar o draft
    console.log('Draft cancelado!');
    this.closeConfirmationModal();
    this.handlePickBanCancel();
  }

  handleEditPick(data: { playerId: string, phaseIndex: number }): void {
    // Implementar lógica de edição de pick
    console.log('Editando pick:', data);
    
    // Exemplo: Voltar para o modal de campeões para editar
    this.closeConfirmationModal();
    this.openChampionModal();
  }

  // ========== MÉTODOS DO COMPONENTE PRINCIPAL ==========
  
  handlePickBanComplete(data: any): void {
    console.log('Draft completado:', data);
    // Implementar lógica para prosseguir com a partida
    // Por exemplo: navegar para a tela de jogo
  }

  handlePickBanCancel(): void {
    console.log('Draft cancelado');
    // Implementar lógica para cancelar a partida
    // Por exemplo: voltar para a tela de lobby
  }
} 