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
import { Router, RouterLink } from '@angular/router';
import { addDays, endOfMonth, format, startOfMonth, subMonths } from 'date-fns';
import { forkJoin } from 'rxjs';
import { BudgetApi, GoalApi, RecurringApi, StatsApi, TransactionApi } from '../../core/api';
import { DataStore } from '../../core/data.store';
import { toIsoDate, trimLeadingEmpty } from '../../core/format';
import {
  Budget,
  BudgetEnvelope,
  CategoryStat,
  Goal,
  MonthlyStat,
  StatsSummary,
  Transaction,
  UpcomingOccurrence,
} from '../../core/models';
import { NotifyService } from '../../core/notify.service';
import { ChartComponent } from '../../shared/chart.component';
import { donutChart, incomeExpenseChart } from '../../shared/charts';
import { withFutureTransactions } from '../../shared/forecast';
import { BudgetRingComponent } from '../../shared/budget-ring.component';
import { GOAL_COLORS, goalColors } from '../../shared/goal-colors';
import { MoneyPipe, PercentagePipe } from '../../shared/money.pipe';
import { AccountFormDialogComponent } from '../accounts/account-form-dialog.component';
import { TransactionFormDialogComponent } from '../transactions/transaction-form-dialog.component';

// Part consommée d'une enveloppe, pour classer les plus entamées
const ratio = (e: BudgetEnvelope) => (e.amount > 0 ? e.spent / e.amount : 0);

@Component({
  selector: 'app-dashboard',
  imports: [
    RouterLink,
    DatePipe,
    PercentagePipe,
    MatButtonModule,
    MatIconModule,
    MoneyPipe,
    ChartComponent,
    BudgetRingComponent,
    MatTooltipModule,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.scss',
})
export class DashboardComponent {
  protected readonly store = inject(DataStore);
  private readonly statsApi = inject(StatsApi);
  private readonly transactionApi = inject(TransactionApi);
  private readonly recurringApi = inject(RecurringApi);
  private readonly budgetApi = inject(BudgetApi);
  private readonly goalApi = inject(GoalApi);
  private readonly notify = inject(NotifyService);
  private readonly dialog = inject(MatDialog);
  private readonly router = inject(Router);

  protected readonly summary = signal<StatsSummary | null>(null);
  protected readonly categories = signal<CategoryStat[]>([]);
  protected readonly months = signal<MonthlyStat[]>([]);
  protected readonly recent = signal<Transaction[]>([]);
  protected readonly upcoming = signal<UpcomingOccurrence[]>([]);
  protected readonly budget = signal<Budget | null>(null);
  // Budgets spéciaux en cours, dans l'ordre de création
  protected readonly activeGoals = signal<Goal[]>([]);
  private readonly goalColorMap = computed(() => goalColors(this.activeGoals()));
  protected readonly hasBudgets = computed(
    () => !!this.budget()?.envelopes.length || this.activeGoals().length > 0,
  );
  // Les enveloppes les plus consommées du mois
  protected readonly topEnvelopes = computed<BudgetEnvelope[]>(() =>
    [...(this.budget()?.envelopes ?? [])].sort((a, b) => ratio(b) - ratio(a)).slice(0, 4),
  );
  protected readonly now = new Date();
  private readonly dataLoaded = signal(false);

  protected readonly hasAccount = computed(() => this.store.accounts().length > 0);
  // Des opérations uniquement futures comptent aussi pour le guide de démarrage
  protected readonly hasTransactions = signal(false);
  // Guide de démarrage tant qu'il n'y a ni compte ni opération
  protected readonly showOnboarding = computed(
    () =>
      this.store.loaded() && this.dataLoaded() && (!this.hasAccount() || !this.hasTransactions()),
  );

  protected readonly currency = computed(
    () => this.summary()?.currencyCode ?? this.store.referenceCurrency(),
  );
  protected readonly donut = computed(() =>
    this.categories().length
      ? donutChart(
          this.categories(),
          this.currency(),
          'Cliquez sur une catégorie pour voir ses opérations du mois.',
          this.summary()?.expenses,
        )
      : null,
  );
  protected readonly bars = computed(() =>
    this.months().length ? incomeExpenseChart(this.months(), this.currency()) : null,
  );
  // Le mois en cours n'est comparé qu'au même nombre de jours du mois précédent
  protected readonly previousMonth = subMonths(this.now, 1);
  protected readonly comparison = signal<{
    expenses: number;
    previousIncome: number;
    previousExpenses: number;
  } | null>(null);
  protected readonly expenseDelta = computed(() => {
    const c = this.comparison();
    if (!c || !c.previousExpenses) {
      return null;
    }
    return (c.expenses - c.previousExpenses) / c.previousExpenses;
  });

  constructor() {
    effect(() => {
      this.store.version();
      untracked(() => this.load());
    });
  }

  protected createAccount(): void {
    AccountFormDialogComponent.open(this.dialog);
  }

  protected newTransaction(): void {
    TransactionFormDialogComponent.open(this.dialog, {});
  }

  protected editTransaction(transaction: Transaction): void {
    TransactionFormDialogComponent.open(this.dialog, { transaction });
  }

  protected categoryColor(id: number): string {
    return this.store.categoryOption(id)?.color ?? '#9e9e9e';
  }

  protected categoryIcon(id: number): string {
    return this.store.categoryOption(id)?.icon ?? 'sell';
  }

  protected envelopePercent(e: BudgetEnvelope): number {
    return e.amount > 0 ? Math.round((Math.max(0, e.spent) / e.amount) * 100) : 0;
  }

  // Dépenses du mois de la catégorie de l'enveloppe, sous-catégories comprises
  protected envelopeLink(e: BudgetEnvelope): Record<string, string | number> {
    return {
      categoryId: e.category.id,
      kind: 'EXPENSE',
      from: toIsoDate(startOfMonth(this.now))!,
      to: toIsoDate(endOfMonth(this.now))!,
    };
  }

  protected goalColor(goal: Goal): string {
    return this.goalColorMap().get(goal.id) ?? GOAL_COLORS[0];
  }

  protected goalPercent(goal: Goal): number {
    return goal.targetAmount > 0
      ? Math.min(100, Math.round((Math.max(0, goal.savedAmount) / goal.targetAmount) * 100))
      : 0;
  }

  protected operationColor(t: Transaction): string {
    return t.transfer ? '#78909c' : (this.store.categoryOption(t.category?.id)?.color ?? '#9e9e9e');
  }

  protected operationIcon(t: Transaction): string {
    if (t.transfer) {
      return 'swap_horiz';
    }
    return this.store.categoryOption(t.category?.id)?.icon ?? 'sell';
  }

  // Ouvre les dépenses du mois de la catégorie cliquée
  protected openCategory(index: number): void {
    const item = this.categories()[index];
    const queryParams = {
      from: toIsoDate(startOfMonth(this.now)),
      to: toIsoDate(endOfMonth(this.now)),
      kind: 'EXPENSE',
      categoryId: item?.categoryId ?? -1,
    };
    this.router.navigate(['/transactions'], { queryParams });
  }

  private load(): void {
    const month = {
      from: toIsoDate(startOfMonth(this.now))!,
      to: toIsoDate(endOfMonth(this.now))!,
    };
    const sixMonths = { from: toIsoDate(startOfMonth(subMonths(this.now, 5)))!, to: month.to };
    forkJoin({
      summary: this.statsApi.summary(month),
      toDate: this.statsApi.summary({ from: month.from, to: toIsoDate(this.now)! }),
      previousToDate: this.statsApi.summary({
        from: toIsoDate(startOfMonth(this.previousMonth))!,
        to: toIsoDate(this.previousMonth)!,
      }),
      categories: this.statsApi.categories({ ...month, type: 'EXPENSE' }),
      months: this.statsApi.monthly(sixMonths),
      // « Dernières opérations » s'arrête à aujourd'hui, le futur va dans « À venir »
      recent: this.transactionApi.search({ to: toIsoDate(this.now)! }, 0, 8),
      any: this.transactionApi.search({}, 0, 1),
      future: this.transactionApi.search(
        { from: toIsoDate(addDays(this.now, 1))!, to: toIsoDate(addDays(this.now, 30))! },
        0,
        100,
      ),
      upcoming: this.recurringApi.upcoming(30),
      budget: this.budgetApi.month(format(this.now, 'yyyy-MM')),
      goals: this.goalApi.list(),
    }).subscribe({
      next: (r) => {
        this.dataLoaded.set(true);
        this.summary.set(r.summary);
        this.comparison.set({
          expenses: r.toDate.expenses,
          previousIncome: r.previousToDate.income,
          previousExpenses: r.previousToDate.expenses,
        });
        this.categories.set(r.categories.items);
        this.months.set(trimLeadingEmpty(r.months.items, (m) => !!(m.income || m.expenses)));
        this.recent.set(r.recent.content);
        this.hasTransactions.set(r.any.totalElements > 0);
        this.upcoming.set(withFutureTransactions(r.upcoming, r.future.content).slice(0, 8));
        this.budget.set(r.budget);
        this.activeGoals.set(r.goals.filter((g) => !g.usedDate));
      },
      error: (error) => this.notify.error(error),
    });
  }
}
