# Sistema de Draft Modular

Este diretório contém a nova estrutura modular do sistema de pick/ban, dividida em 3 componentes independentes e reutilizáveis.

## 📁 Estrutura dos Componentes

### 1. `draft-pick-ban` - Componente Principal

**Arquivos:**

- `draft-pick-ban.ts` - Lógica principal do draft
- `draft-pick-ban.html` - Template da tela principal
- `draft-pick-ban.scss` - Estilos da tela principal

**Responsabilidades:**

- Gerenciar o estado da sessão de draft
- Controlar o fluxo de picks e bans
- Exibir os times e progresso
- Coordenar a comunicação com os modais

**Inputs:**

- `matchData` - Dados da partida
- `isLeader` - Se é o líder
- `currentPlayer` - Jogador atual

**Outputs:**

- `onPickBanComplete` - Quando o draft é completado
- `onPickBanCancel` - Quando o draft é cancelado
- `onOpenChampionModal` - Para abrir modal de campeões
- `onOpenConfirmationModal` - Para abrir modal de confirmação

### 2. `draft-champion-modal` - Modal de Seleção de Campeões

**Arquivos:**

- `draft-champion-modal.ts` - Lógica do modal
- `draft-champion-modal.html` - Template do modal
- `draft-champion-modal.scss` - Estilos do modal

**Responsabilidades:**

- Exibir grid de campeões
- Filtrar por lane e busca
- Permitir seleção de campeão
- Gerenciar timer do modal
- Verificar campeões banidos/picked

**Inputs:**

- `session` - Sessão atual do draft
- `currentPlayer` - Jogador atual
- `isVisible` - Se o modal está visível

**Outputs:**

- `onClose` - Quando o modal é fechado
- `onChampionSelected` - Quando um campeão é selecionado

### 3. `draft-confirmation-modal` - Modal de Confirmação Final

**Arquivos:**

- `draft-confirmation-modal.ts` - Lógica do modal
- `draft-confirmation-modal.html` - Template do modal
- `draft-confirmation-modal.scss` - Estilos do modal

**Responsabilidades:**

- Exibir resumo final dos picks/bans
- Permitir edição de picks
- Confirmar ou cancelar o draft
- Gerenciar bots

**Inputs:**

- `session` - Sessão atual do draft
- `currentPlayer` - Jogador atual
- `isVisible` - Se o modal está visível

**Outputs:**

- `onClose` - Quando o modal é fechado
- `onConfirm` - Quando o draft é confirmado
- `onCancel` - Quando o draft é cancelado
- `onEditPick` - Quando um pick é editado

## 🔄 Como Usar

### Exemplo de Implementação

```typescript
// No componente pai
export class ParentComponent {
  showChampionModal = false;
  showConfirmationModal = false;
  
  onOpenChampionModal() {
    this.showChampionModal = true;
  }
  
  onChampionSelected(champion: Champion) {
    // Processar seleção do campeão
    this.draftComponent.onChampionSelected(champion);
    this.showChampionModal = false;
  }
  
  onOpenConfirmationModal() {
    this.showConfirmationModal = true;
  }
}
```

```html
<!-- Template do componente pai -->
<app-draft-pick-ban
  [matchData]="matchData"
  [isLeader]="isLeader"
  [currentPlayer]="currentPlayer"
  (onPickBanComplete)="handleComplete($event)"
  (onPickBanCancel)="handleCancel()"
  (onOpenChampionModal)="onOpenChampionModal()"
  (onOpenConfirmationModal)="onOpenConfirmationModal()">
</app-draft-pick-ban>

<app-draft-champion-modal
  [session]="draftComponent.session"
  [currentPlayer]="currentPlayer"
  [isVisible]="showChampionModal"
  (onClose)="showChampionModal = false"
  (onChampionSelected)="onChampionSelected($event)">
</app-draft-champion-modal>

<app-draft-confirmation-modal
  [session]="draftComponent.session"
  [currentPlayer]="currentPlayer"
  [isVisible]="showConfirmationModal"
  (onClose)="showConfirmationModal = false"
  (onConfirm)="handleConfirm()"
  (onCancel)="handleCancel()"
  (onEditPick)="handleEditPick($event)">
</app-draft-confirmation-modal>
```

## 🎯 Vantagens da Nova Estrutura

1. **Modularidade**: Cada componente tem responsabilidades específicas
2. **Reutilização**: Os modais podem ser usados em outros contextos
3. **Manutenibilidade**: Código mais organizado e fácil de manter
4. **Testabilidade**: Cada componente pode ser testado isoladamente
5. **Performance**: Cache inteligente em cada componente
6. **Responsividade**: CSS otimizado para diferentes telas

## 🔧 Funcionalidades Mantidas

- ✅ Sistema completo de pick/ban
- ✅ Detecção automática de bots
- ✅ Timer com timeout automático
- ✅ Filtros por lane e busca
- ✅ Cache inteligente para performance
- ✅ Interface responsiva
- ✅ Animações e transições
- ✅ Validação de campeões banidos/picked
- ✅ Edição de picks na confirmação final

## 📝 Notas Importantes

1. **Backup**: O componente original foi mantido em `custom-pick-ban-backup/`
2. **Compatibilidade**: Todos os métodos e funcionalidades foram preservados
3. **Performance**: Sistema de cache otimizado em cada componente
4. **Responsividade**: CSS adaptado para mobile e desktop
5. **Acessibilidade**: Mantidos os indicadores visuais e feedback

## 🚀 Próximos Passos

1. Atualizar as rotas para usar os novos componentes
2. Testar a integração completa
3. Validar performance em diferentes dispositivos
4. Documentar APIs específicas se necessário
