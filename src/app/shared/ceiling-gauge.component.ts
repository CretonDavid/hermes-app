import {
  ChangeDetectionStrategy,
  Component,
  booleanAttribute,
  computed,
  input,
} from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { ceilingProgress } from './ceiling';
import { MoneyPipe } from './money.pipe';

// Jauge du plafond d'un compte bancaire : barre qui se remplit et ce qu'il reste à épargner.
// « compact » pour la carte du compte, détaillée pour sa fiche.
@Component({
  selector: 'app-ceiling-gauge',
  imports: [MoneyPipe, DecimalPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let p = progress();
    @if (!compact()) {
      <div class="headline">
        @if (p.reached) {
          <span class="value">Plafond atteint</span>
        } @else {
          <span class="muted">Encore possible d'épargner</span>
          <span class="value amount">{{ p.remaining | money: currency() }}</span>
        }
      </div>
    }
    <div
      class="bar"
      [class.full]="p.reached"
      role="progressbar"
      aria-valuemin="0"
      aria-valuemax="100"
      [attr.aria-valuenow]="p.percent | number: '1.0-0'"
      [attr.aria-label]="label()"
    >
      <div class="fill" [style.width.%]="p.percent"></div>
    </div>
    <div class="caption muted">
      @if (compact()) {
        @if (p.reached) {
          Plafond atteint
        } @else {
          Encore <span class="amount">{{ p.remaining | money: currency() }}</span> possibles
        }
        · plafond <span class="amount">{{ ceiling() | money: currency() }}</span>
      } @else {
        {{ p.percent | number: '1.0-0' }} % du plafond de
        <span class="amount">{{ ceiling() | money: currency() }}</span>
        @if (p.exceeded > 0) {
          · dépassé de <span class="amount">{{ p.exceeded | money: currency() }}</span
          >, intérêts compris
        }
      }
    </div>
  `,
  styles: `
    :host {
      display: block;
    }
    .headline {
      display: flex;
      align-items: baseline;
      flex-wrap: wrap;
      gap: 4px 12px;
      margin-bottom: 10px;
      .value {
        font: var(--mat-sys-title-large);
      }
    }
    .bar {
      height: 8px;
      border-radius: 999px;
      background: var(--mat-sys-surface-container-highest);
      overflow: hidden;
    }
    :host(.compact) .bar {
      height: 6px;
    }
    .fill {
      height: 100%;
      border-radius: inherit;
      background: var(--mat-sys-primary);
      transition: width 0.3s ease;
    }
    .full .fill {
      background: var(--hermes-saffron);
    }
    .caption {
      margin-top: 6px;
      font: var(--mat-sys-body-small);
    }
  `,
  host: { '[class.compact]': 'compact()' },
})
export class CeilingGaugeComponent {
  readonly balance = input.required<number>();
  readonly ceiling = input.required<number>();
  readonly currency = input.required<string>();
  readonly compact = input(false, { transform: booleanAttribute });

  protected readonly progress = computed(() => ceilingProgress(this.balance(), this.ceiling()));

  protected readonly label = computed(() => {
    const p = this.progress();
    return `Plafond rempli à ${Math.round(p.percent)} %`;
  });
}
