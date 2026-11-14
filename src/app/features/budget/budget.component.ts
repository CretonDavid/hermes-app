import { DatePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { RouterLink } from '@angular/router';
import { addMonths, endOfMonth, format, isSameMonth } from 'date-fns';
import { BudgetApi } from '../../core/api';
import { DataStore } from '../../core/data.store';
import { toIsoDate } from '../../core/format';
import { Budget, BudgetEnvelope } from '../../core/models';
import { NotifyService } from '../../core/notify.service';
import { BudgetBarComponent, budgetLevel } from '../../shared/budget-bar.component';
import { MoneyPipe } from '../../shared/money.pipe';
import { EnvelopeDialogComponent } from './envelope-dialog.component';

// Budget du mois : une enveloppe par catégorie de dépense, comparée aux dépenses du mois
@Component({
  selector: 'app-budget',
  imports: [
    DatePipe,
    RouterLink,
    MatButtonModule,
    MatIconModule,
    MatTooltipModule,
    MoneyPipe,
    BudgetBarComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page">
      <div class="page-header">
        <div style="flex: 1">
          <h1>Budget</h1>
          <div class="subtitle">Enveloppes mensuelles par catégorie de dépense</div>
        </div>
        <div class="month-nav">
          <button matIconButton (click)="shift(-1)" aria-label="Mois précédent">
            <mat-icon>chevron_left</mat-icon>
          </button>
          <span class="month" aria-live="polite">{{ month() | date: 'MMMM yyyy' }}</span>
          <button matIconButton (click)="shift(1)" aria-label="Mois suivant">
            <mat-icon>chevron_right</mat-icon>
          </button>
          <button matButton (click)="month.set(today)" [disabled]="isCurrentMonth()">
            Ce mois-ci
          </button>
        </div>
        <button matButton="filled" (click)="create()">
          <mat-icon>add</mat-icon> Nouvelle enveloppe
        </button>
      </div>

      @if (budget(); as b) {
        @if (b.missingRates.length) {
          <div class="card warning-card">
            <mat-icon>currency_exchange</mat-icon>
            Taux de change manquants pour {{ b.missingRates.join(', ') }} : ces dépenses ne sont pas
            comptées.
            <a routerLink="/settings" [queryParams]="{ tab: 'rates' }">Ajouter des taux</a>
          </div>
        }

        @if (b.envelopes.length) {
          <div class="grid grid-3 kpis">
            <div class="card kpi">
              <div class="label">Budget du mois</div>
              <div class="value amount">{{ b.budgeted | money: b.currencyCode }}</div>
              <div class="delta muted">
                {{ b.envelopes.length }} enveloppe{{ b.envelopes.length > 1 ? 's' : '' }}
              </div>
            </div>
            <div class="card kpi">
              <div class="label">Dépensé dans les enveloppes</div>
              <div class="value amount">{{ b.spent | money: b.currencyCode }}</div>
              <app-budget-bar class="kpi-bar" [spent]="b.spent" [amount]="b.budgeted" />
            </div>
            <div class="card kpi">
              <div class="label">{{ b.spent > b.budgeted ? 'Dépassement' : 'Reste' }}</div>
              <div class="value amount" [class.negative]="b.spent > b.budgeted">
                {{ abs(b.budgeted - b.spent) | money: b.currencyCode }}
              </div>
              <div class="delta muted">
                Hors enveloppe : {{ b.unbudgeted | money: b.currencyCode }}
                <mat-icon
                  class="info"
                  matTooltip="Dépenses du mois dans des catégories sans enveloppe, non catégorisées comprises"
                  >info</mat-icon
                >
              </div>
            </div>
          </div>

          <div class="card">
            <h2><mat-icon>donut_large</mat-icon> Enveloppes</h2>
            @for (e of b.envelopes; track e.id) {
              <div class="envelope">
                <span class="icon" [style.background]="color(e)">
                  <mat-icon>{{ icon(e) }}</mat-icon>
                </span>
                <div class="body">
                  <div class="line">
                    <a
                      class="name"
                      routerLink="/transactions"
                      [queryParams]="transactionsLink(e)"
                      matTooltip="Voir les opérations du mois"
                      >{{ e.category.name }}</a
                    >
                    @if (e.monthOnly) {
                      <span class="chip" matTooltip="Montant propre à ce mois">Ce mois-ci</span>
                    }
                    <span class="spacer"></span>
                    <span class="amount figures">
                      {{ e.spent | money: b.currencyCode }}
                      <span class="muted">/ {{ e.amount | money: b.currencyCode }}</span>
                    </span>
                  </div>
                  <app-budget-bar [spent]="e.spent" [amount]="e.amount" />
                  <div class="status" [class]="level(e)">
                    @if (e.remaining < 0) {
                      Dépassé de {{ -e.remaining | money: b.currencyCode }}
                    } @else {
                      Reste {{ e.remaining | money: b.currencyCode }}
                    }
                  </div>
                </div>
                <button
                  matIconButton
                  (click)="edit(e)"
                  matTooltip="Modifier l'enveloppe"
                  [attr.aria-label]="'Modifier l’enveloppe ' + e.category.name"
                >
                  <mat-icon>edit</mat-icon>
                </button>
              </div>
            }
          </div>
        } @else {
          <div class="card empty-state">
            <mat-icon>donut_large</mat-icon>
            <h2>Aucune enveloppe pour {{ month() | date: 'MMMM yyyy' }}</h2>
            <p class="muted">
              Fixez un montant mensuel par catégorie de dépense (Alimentation, Loisirs…) pour suivre
              ce qu'il reste à dépenser.
            </p>
            <button matButton="filled" (click)="create()">
              <mat-icon>add</mat-icon> Créer une enveloppe
            </button>
          </div>
        }
      }
    </div>
  `,
  styles: `
    .month-nav {
      display: flex;
      align-items: center;
      gap: 4px;

      .month {
        min-width: 140px;
        text-align: center;
        font: var(--mat-sys-title-medium);
        text-transform: capitalize;
      }
    }
    .warning-card {
      display: flex;
      align-items: center;
      gap: 12px;
      margin-bottom: 16px;
      background: var(--mat-sys-tertiary-container);
      color: var(--mat-sys-on-tertiary-container);
      border: none;

      a {
        color: inherit;
        font-weight: 500;
      }
    }
    .kpis {
      margin-bottom: 16px;
    }
    .kpi-bar {
      margin-top: 10px;
    }
    .info {
      font-size: 16px;
      width: 16px;
      height: 16px;
      vertical-align: middle;
      cursor: help;
    }
    .envelope {
      display: flex;
      align-items: center;
      gap: 14px;
      padding: 12px 0;
      border-top: 1px solid var(--hermes-border);

      &:first-of-type {
        border-top: none;
      }
    }
    .icon {
      display: grid;
      place-items: center;
      flex: none;
      width: 36px;
      height: 36px;
      border-radius: 50%;
      color: #fff;

      mat-icon {
        font-size: 20px;
        width: 20px;
        height: 20px;
      }
    }
    .body {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    .line {
      display: flex;
      align-items: baseline;
      gap: 8px;
    }
    .name {
      font: var(--mat-sys-title-small);
      color: inherit;
      text-decoration: none;

      &:hover {
        text-decoration: underline;
      }
    }
    .spacer {
      flex: 1;
    }
    .figures {
      white-space: nowrap;
    }
    .status {
      font: var(--mat-sys-body-small);
      color: var(--hermes-muted);

      &.near {
        color: var(--hermes-warning);
      }
      &.over {
        color: var(--hermes-negative);
      }
    }
    .empty-state {
      display: flex;
      flex-direction: column;
      align-items: center;
      text-align: center;
      gap: 8px;
      padding: 40px 24px;

      > mat-icon {
        font-size: 40px;
        width: 40px;
        height: 40px;
        color: var(--mat-sys-primary);
      }
      h2 {
        margin: 0;
      }
      p {
        max-width: 460px;
        margin: 0 0 8px;
      }
    }
  `,
})
export class BudgetComponent {
  private readonly api = inject(BudgetApi);
  private readonly store = inject(DataStore);
  private readonly notify = inject(NotifyService);
  private readonly dialog = inject(MatDialog);

  protected readonly today = new Date();
  protected readonly month = signal(this.today);
  protected readonly budget = signal<Budget | null>(null);
  protected readonly isCurrentMonth = computed(() => isSameMonth(this.month(), this.today));
  private readonly monthKey = computed(() => format(this.month(), 'yyyy-MM'));

  protected readonly abs = Math.abs;
  protected readonly level = (e: BudgetEnvelope) => budgetLevel(e.spent, e.amount);

  constructor() {
    effect(() => {
      const month = this.monthKey();
      this.store.version();
      untracked(() => this.load(month));
    });
  }

  protected shift(months: number): void {
    this.month.update((month) => addMonths(month, months));
  }

  protected create(): void {
    this.openDialog();
  }

  protected edit(envelope: BudgetEnvelope): void {
    this.openDialog(envelope);
  }

  protected color(e: BudgetEnvelope): string {
    return this.store.categoryOption(e.category.id)?.color ?? e.category.color ?? '#9e9e9e';
  }

  protected icon(e: BudgetEnvelope): string {
    return this.store.categoryOption(e.category.id)?.icon ?? e.category.icon ?? 'sell';
  }

  // Dépenses du mois de la catégorie (sous-catégories comprises)
  protected transactionsLink(e: BudgetEnvelope): Record<string, string | number> {
    return {
      categoryId: e.category.id,
      kind: 'EXPENSE',
      from: toIsoDate(new Date(this.month().getFullYear(), this.month().getMonth(), 1))!,
      to: toIsoDate(endOfMonth(this.month()))!,
    };
  }

  private openDialog(envelope?: BudgetEnvelope): void {
    EnvelopeDialogComponent.open(this.dialog, {
      month: this.monthKey(),
      currencyCode: this.budget()?.currencyCode ?? this.store.referenceCurrency(),
      envelope,
    })
      .afterClosed()
      .subscribe((changed) => changed && this.load(this.monthKey()));
  }

  private load(month: string): void {
    this.api.month(month).subscribe({
      next: (budget) => {
        // Une réponse tardive d'un autre mois est ignorée
        if (budget.month === this.monthKey()) {
          this.budget.set(budget);
        }
      },
      error: (error) => this.notify.error(error),
    });
  }
}
