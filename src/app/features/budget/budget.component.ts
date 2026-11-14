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
import { MatMenuModule } from '@angular/material/menu';
import { MatTooltipModule } from '@angular/material/tooltip';
import { RouterLink } from '@angular/router';
import { addMonths, endOfMonth, format, isSameMonth } from 'date-fns';
import { BudgetApi, GoalApi } from '../../core/api';
import { DataStore } from '../../core/data.store';
import { toIsoDate } from '../../core/format';
import { Budget, BudgetEnvelope, Goal } from '../../core/models';
import { NotifyService } from '../../core/notify.service';
import { BudgetBarComponent, budgetLevel } from '../../shared/budget-bar.component';
import { MoneyPipe } from '../../shared/money.pipe';
import { confirm } from '../../shared/confirm-dialog.component';
import { EnvelopeDialogComponent } from './envelope-dialog.component';
import { GoalDialogComponent } from './goal-dialog.component';
import { GoalUseDialogComponent } from './goal-use-dialog.component';

// Budget du mois : une enveloppe par catégorie de dépense, comparée aux dépenses du mois
@Component({
  selector: 'app-budget',
  imports: [
    DatePipe,
    RouterLink,
    MatButtonModule,
    MatIconModule,
    MatMenuModule,
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

      <!-- Budgets spéciaux : objectifs d'épargne mis de côté sur un compte, indépendants du mois -->
      <div class="section-header">
        <h2><mat-icon>flag</mat-icon> Budgets spéciaux</h2>
        <button matButton="tonal" (click)="createGoal()">
          <mat-icon>add</mat-icon> Nouveau budget spécial
        </button>
      </div>
      @if (activeGoals().length) {
        <div class="goals-grid">
          @for (g of activeGoals(); track g.id) {
            <div class="card goal" [class.reached]="g.reached">
              <div class="goal-head">
                <mat-icon class="goal-icon">{{ g.reached ? 'lock' : 'flag' }}</mat-icon>
                <div class="goal-title">
                  <h3>{{ g.name }}</h3>
                  <span class="muted">{{ g.accountName }}</span>
                </div>
                <button
                  matIconButton
                  [matMenuTriggerFor]="goalMenu"
                  [attr.aria-label]="'Actions sur ' + g.name"
                >
                  <mat-icon>more_vert</mat-icon>
                </button>
                <mat-menu #goalMenu>
                  <button mat-menu-item (click)="editGoal(g)">
                    <mat-icon>edit</mat-icon> Modifier
                  </button>
                  <button mat-menu-item (click)="useGoal(g)">
                    <mat-icon>shopping_bag</mat-icon> Marquer comme utilisé
                  </button>
                  <button mat-menu-item (click)="deleteGoal(g)">
                    <mat-icon>delete</mat-icon> Supprimer
                  </button>
                </mat-menu>
              </div>
              <div class="goal-amount amount">
                {{ g.savedAmount | money: g.currencyCode }}
                <span class="muted">/ {{ g.targetAmount | money: g.currencyCode }}</span>
              </div>
              <div
                class="goal-bar"
                role="progressbar"
                aria-valuemin="0"
                aria-valuemax="100"
                [attr.aria-valuenow]="goalPercent(g)"
                [attr.aria-label]="g.name + ' : objectif atteint à ' + goalPercent(g) + ' %'"
              >
                <div class="fill" [style.width.%]="goalPercent(g)"></div>
              </div>
              <div class="goal-status">
                @if (g.reached) {
                  <mat-icon inline>lock</mat-icon> Objectif atteint : plus d’affectation possible
                } @else {
                  Il manque {{ g.remaining | money: g.currencyCode }}
                }
              </div>
              @if (g.withdrawn > 0) {
                <div
                  class="goal-withdrawn muted"
                  matTooltip="Des retraits ont fait passer le solde du compte sous le total de ses budgets spéciaux"
                >
                  {{ g.withdrawn | money: g.currencyCode }} repris par des retraits
                </div>
              }
            </div>
          }
        </div>
      } @else {
        <p class="muted goals-empty">
          Mettez de l'argent de côté pour un projet (une moto, des vacances…) sur un compte
          d'épargne : à chaque virement vers ce compte, vous choisissez la part qui va au projet.
        </p>
      }

      @if (usedGoals().length) {
        <div class="card used-goals">
          <h2><mat-icon>history</mat-icon> Budgets spéciaux utilisés</h2>
          @for (g of usedGoals(); track g.id) {
            <div class="used-goal">
              <div class="flex">
                <strong>{{ g.name }}</strong>
                <span class="muted">
                  · {{ g.savedAmount | money: g.currencyCode }} sur {{ g.accountName }}, utilisé le
                  {{ g.usedDate | date: 'dd/MM/yyyy' }}
                </span>
              </div>
              <button matButton (click)="restoreGoal(g)">Rétablir</button>
              <button
                matIconButton
                (click)="deleteGoal(g)"
                matTooltip="Supprimer"
                [attr.aria-label]="'Supprimer ' + g.name"
              >
                <mat-icon>delete</mat-icon>
              </button>
            </div>
          }
        </div>
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
    .section-header {
      display: flex;
      align-items: center;
      gap: 12px;
      margin: 28px 0 12px;

      h2 {
        flex: 1;
        margin: 0;
        display: flex;
        align-items: center;
        gap: 8px;
        font: var(--mat-sys-title-large);
      }
    }
    // Trois cartes par ligne au plus
    .goals-grid {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 16px;

      @media (max-width: 1100px) {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }
      @media (max-width: 700px) {
        grid-template-columns: minmax(0, 1fr);
      }
    }
    .goal {
      display: flex;
      flex-direction: column;
      gap: 10px;
    }
    .goal-head {
      display: flex;
      align-items: flex-start;
      gap: 10px;
    }
    .goal-icon {
      margin-top: 2px;
      color: var(--mat-sys-primary);
    }
    .reached .goal-icon {
      color: var(--hermes-positive);
    }
    .goal-title {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;

      h3 {
        margin: 0;
        font: var(--mat-sys-title-medium);
        overflow-wrap: anywhere;
      }
      .muted {
        font: var(--mat-sys-body-small);
      }
    }
    .goal-amount {
      font: var(--mat-sys-headline-small);
    }
    .goal-bar {
      height: 8px;
      border-radius: 999px;
      background: var(--mat-sys-surface-container-highest);
      overflow: hidden;

      .fill {
        height: 100%;
        border-radius: inherit;
        background: var(--mat-sys-primary);
        transition: width 0.3s ease;
      }
    }
    .reached .goal-bar .fill {
      background: var(--hermes-positive);
    }
    .goal-status,
    .goal-withdrawn {
      font: var(--mat-sys-body-small);
    }
    .reached .goal-status {
      color: var(--hermes-positive);
    }
    .goal-withdrawn {
      cursor: help;
    }
    .goals-empty {
      margin: 0;
      max-width: 640px;
    }
    .used-goals {
      margin-top: 16px;
    }
    .used-goal {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 4px 0;
      border-top: 1px solid var(--hermes-border);

      &:first-of-type {
        border-top: none;
      }
      .flex {
        flex: 1;
        min-width: 0;
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
  private readonly goalApi = inject(GoalApi);
  private readonly store = inject(DataStore);
  private readonly notify = inject(NotifyService);
  private readonly dialog = inject(MatDialog);

  protected readonly today = new Date();
  protected readonly month = signal(this.today);
  protected readonly budget = signal<Budget | null>(null);
  private readonly goals = signal<Goal[]>([]);
  protected readonly activeGoals = computed(() => this.goals().filter((g) => !g.usedDate));
  // Les plus récemment utilisés d'abord
  protected readonly usedGoals = computed(() =>
    this.goals()
      .filter((g) => g.usedDate)
      .sort((a, b) => b.usedDate!.localeCompare(a.usedDate!)),
  );
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
    effect(() => {
      this.store.version();
      untracked(() => this.loadGoals());
    });
  }

  // ---------- Budgets spéciaux ----------

  protected goalPercent(goal: Goal): number {
    return goal.targetAmount > 0
      ? Math.min(100, Math.round((Math.max(0, goal.savedAmount) / goal.targetAmount) * 100))
      : 0;
  }

  protected createGoal(): void {
    GoalDialogComponent.open(this.dialog)
      .afterClosed()
      .subscribe((changed) => changed && this.loadGoals());
  }

  protected editGoal(goal: Goal): void {
    GoalDialogComponent.open(this.dialog, goal)
      .afterClosed()
      .subscribe((changed) => changed && this.loadGoals());
  }

  protected useGoal(goal: Goal): void {
    GoalUseDialogComponent.open(this.dialog, goal)
      .afterClosed()
      .subscribe((changed) => changed && this.loadGoals());
  }

  protected restoreGoal(goal: Goal): void {
    this.goalApi.restore(goal.id).subscribe({
      next: () => {
        this.notify.success(`${goal.name} est de nouveau en cours`);
        this.loadGoals();
      },
      error: (error) => this.notify.error(error),
    });
  }

  protected deleteGoal(goal: Goal): void {
    confirm(this.dialog, {
      title: 'Supprimer le budget spécial',
      message: `« ${goal.name} » sera supprimé avec ses affectations. L'argent reste sur ${goal.accountName}.`,
      confirmLabel: 'Supprimer',
      danger: true,
    }).subscribe((ok) => {
      if (!ok) {
        return;
      }
      this.goalApi.delete(goal.id).subscribe({
        next: () => {
          this.notify.success('Budget spécial supprimé');
          this.loadGoals();
        },
        error: (error) => this.notify.error(error),
      });
    });
  }

  private loadGoals(): void {
    this.goalApi.list().subscribe({
      next: (goals) => this.goals.set(goals),
      error: (error) => this.notify.error(error),
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
