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
import { Router, RouterLink } from '@angular/router';
import { addDays, endOfMonth, startOfMonth, subMonths } from 'date-fns';
import { forkJoin } from 'rxjs';
import { RecurringApi, StatsApi, TransactionApi } from '../../core/api';
import { DataStore } from '../../core/data.store';
import { reimbursementPeriodLabel, toIsoDate, trimLeadingEmpty } from '../../core/format';
import {
  CategoryStat,
  MonthlyStat,
  ReimbursementTracking,
  StatsSummary,
  Transaction,
  UpcomingOccurrence,
} from '../../core/models';
import { NotifyService } from '../../core/notify.service';
import { ChartComponent } from '../../shared/chart.component';
import { donutChart, incomeExpenseChart } from '../../shared/charts';
import { withFutureTransactions } from '../../shared/forecast';
import { MoneyPipe, PercentagePipe } from '../../shared/money.pipe';
import { AccountFormDialogComponent } from '../accounts/account-form-dialog.component';
import { TransactionFormDialogComponent } from '../transactions/transaction-form-dialog.component';

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
  private readonly notify = inject(NotifyService);
  private readonly dialog = inject(MatDialog);
  private readonly router = inject(Router);

  protected readonly summary = signal<StatsSummary | null>(null);
  protected readonly categories = signal<CategoryStat[]>([]);
  protected readonly months = signal<MonthlyStat[]>([]);
  protected readonly recent = signal<Transaction[]>([]);
  protected readonly upcoming = signal<UpcomingOccurrence[]>([]);
  private readonly reimbursements = signal<ReimbursementTracking[]>([]);
  // Périodes terminées sans remboursement complet, la plus ancienne d'abord
  protected readonly overdueReimbursements = computed(() =>
    this.reimbursements().flatMap((t) =>
      t.periods
        .filter((p) => p.status === 'UNPAID' || p.status === 'PARTIAL')
        .reverse()
        .map((p) => ({
          key: `${t.recurringTransactionId}-${p.start}`,
          payer: t.payer,
          label: t.label,
          period: reimbursementPeriodLabel(t.period, p.start),
          remaining: p.remaining,
          currencyCode: t.currencyCode,
          partial: p.status === 'PARTIAL',
        })),
    ),
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
      reimbursements: this.recurringApi.reimbursements(),
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
        this.reimbursements.set(r.reimbursements);
        this.hasTransactions.set(r.any.totalElements > 0);
        this.upcoming.set(withFutureTransactions(r.upcoming, r.future.content).slice(0, 8));
      },
      error: (error) => this.notify.error(error),
    });
  }
}
