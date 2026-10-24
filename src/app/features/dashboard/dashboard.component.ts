import { DatePipe, PercentPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { Router, RouterLink } from '@angular/router';
import { endOfMonth, startOfMonth, subMonths } from 'date-fns';
import { forkJoin } from 'rxjs';
import { RecurringApi, StatsApi, TransactionApi } from '../../core/api';
import { DataStore } from '../../core/data.store';
import { toIsoDate } from '../../core/format';
import { CategoryStat, MonthlyStat, StatsSummary, Transaction, UpcomingOccurrence } from '../../core/models';
import { NotifyService } from '../../core/notify.service';
import { ChartComponent } from '../../shared/chart.component';
import { donutChart, incomeExpenseChart } from '../../shared/charts';
import { MoneyPipe } from '../../shared/money.pipe';
import { AccountFormDialogComponent } from '../accounts/account-form-dialog.component';
import { TransactionTableComponent } from '../transactions/transaction-table.component';

@Component({
  selector: 'app-dashboard',
  imports: [RouterLink, DatePipe, PercentPipe, MatButtonModule, MatIconModule, MoneyPipe, ChartComponent, TransactionTableComponent],
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
  protected readonly now = new Date();

  protected readonly currency = computed(() => this.summary()?.currencyCode ?? this.store.referenceCurrency());
  protected readonly donut = computed(() =>
    this.categories().length ? donutChart(this.categories(), this.currency()) : null,
  );
  protected readonly bars = computed(() =>
    this.months().length ? incomeExpenseChart(this.months(), this.currency()) : null,
  );
  protected readonly expenseDelta = computed(() => {
    const s = this.summary();
    if (!s || !s.previousExpenses) {
      return null;
    }
    return (s.expenses - s.previousExpenses) / s.previousExpenses;
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

  protected openCategory(index: number): void {
    const item = this.categories()[index];
    if (item?.categoryId) {
      this.router.navigate(['/transactions'], { queryParams: { categoryId: item.categoryId } });
    }
  }

  private load(): void {
    const month = { from: toIsoDate(startOfMonth(this.now))!, to: toIsoDate(endOfMonth(this.now))! };
    const sixMonths = { from: toIsoDate(startOfMonth(subMonths(this.now, 5)))!, to: month.to };
    forkJoin({
      summary: this.statsApi.summary(month),
      categories: this.statsApi.categories({ ...month, type: 'EXPENSE' }),
      months: this.statsApi.monthly(sixMonths),
      recent: this.transactionApi.search({}, 0, 8),
      upcoming: this.recurringApi.upcoming(30),
    }).subscribe({
      next: (r) => {
        this.summary.set(r.summary);
        this.categories.set(r.categories.items);
        this.months.set(r.months.items);
        this.recent.set(r.recent.content);
        this.upcoming.set(r.upcoming.slice(0, 8));
      },
      error: (error) => this.notify.error(error),
    });
  }
}
