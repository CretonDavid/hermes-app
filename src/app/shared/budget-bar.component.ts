import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

/** Part du budget consommée : « ok », « proche » à partir de 90 %, « dépassé » au-delà de 100 % */
export type BudgetLevel = 'ok' | 'near' | 'over';

export function budgetLevel(spent: number, amount: number): BudgetLevel {
  if (spent > amount) {
    return 'over';
  }
  return amount > 0 && spent >= amount * 0.9 ? 'near' : 'ok';
}

// Barre de consommation d'une enveloppe de budget
@Component({
  selector: 'app-budget-bar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div
      class="bar"
      [class]="level()"
      role="progressbar"
      aria-valuemin="0"
      aria-valuemax="100"
      [attr.aria-valuenow]="percent()"
      [attr.aria-label]="'Budget consommé à ' + percent() + ' %'"
    >
      <div class="fill" [style.width.%]="width()"></div>
    </div>
  `,
  styles: `
    :host {
      display: block;
    }
    .bar {
      height: 8px;
      border-radius: 999px;
      background: var(--mat-sys-surface-container-highest);
      overflow: hidden;
    }
    .fill {
      height: 100%;
      border-radius: inherit;
      background: var(--mat-sys-primary);
      transition: width 0.3s ease;
    }
    .near .fill {
      background: var(--hermes-warning);
    }
    .over .fill {
      background: var(--hermes-negative);
    }
  `,
})
export class BudgetBarComponent {
  readonly spent = input.required<number>();
  readonly amount = input.required<number>();

  protected readonly level = computed(() => budgetLevel(this.spent(), this.amount()));
  protected readonly percent = computed(() =>
    this.amount() > 0 ? Math.round((Math.max(0, this.spent()) / this.amount()) * 100) : 0,
  );
  protected readonly width = computed(() => Math.min(100, this.percent()));
}
