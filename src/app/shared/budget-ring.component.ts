import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { budgetLevel } from './budget-bar.component';

const RADIUS = 26;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

// Anneau de consommation d'une enveloppe : couleur de la catégorie, orange à 90 %, rouge au-delà
@Component({
  selector: 'app-budget-ring',
  imports: [MatIconModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <svg viewBox="0 0 64 64" aria-hidden="true">
      <circle class="track" cx="32" cy="32" [attr.r]="radius" />
      <circle
        class="progress"
        cx="32"
        cy="32"
        [attr.r]="radius"
        [style.stroke]="stroke()"
        [attr.stroke-dasharray]="circumference"
        [attr.stroke-dashoffset]="offset()"
      />
    </svg>
    <mat-icon [style.color]="color()">{{ icon() }}</mat-icon>
  `,
  styles: `
    :host {
      position: relative;
      display: grid;
      place-items: center;
      width: 64px;
      height: 64px;
    }
    svg {
      position: absolute;
      inset: 0;
      transform: rotate(-90deg);
    }
    circle {
      fill: none;
      stroke-width: 6;
    }
    .track {
      stroke: var(--mat-sys-surface-container-highest);
    }
    .progress {
      stroke-linecap: round;
      transition: stroke-dashoffset 0.4s ease;
    }
    mat-icon {
      position: relative;
      font-size: 22px;
      width: 22px;
      height: 22px;
    }
  `,
})
export class BudgetRingComponent {
  readonly spent = input.required<number>();
  readonly amount = input.required<number>();
  readonly color = input('#9e9e9e');
  readonly icon = input('sell');

  protected readonly radius = RADIUS;
  protected readonly circumference = CIRCUMFERENCE;
  protected readonly offset = computed(() => {
    const ratio = this.amount() > 0 ? Math.max(0, this.spent()) / this.amount() : 0;
    return CIRCUMFERENCE * (1 - Math.min(1, ratio));
  });
  protected readonly stroke = computed(() => {
    switch (budgetLevel(this.spent(), this.amount())) {
      case 'over':
        return 'var(--hermes-negative)';
      case 'near':
        return 'var(--hermes-warning)';
      default:
        return this.color();
    }
  });
}
