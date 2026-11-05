import { PercentPipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatSelectModule } from '@angular/material/select';
import { MatTabsModule } from '@angular/material/tabs';
import { RouterLink } from '@angular/router';
import { ChartConfiguration } from 'chart.js';
import { forkJoin } from 'rxjs';
import { StatsApi, StatsQuery } from '../../core/api';
import { DataStore } from '../../core/data.store';
import { formatDay, formatMonth, today, trimLeadingEmpty } from '../../core/format';
import {
  BalanceHistory,
  CategoryStat,
  CategoryTrendStat,
  CategoryType,
  MonthlyStat,
  PayeeStat,
  SavingsStats,
  StatsSummary,
} from '../../core/models';
import { NotifyService } from '../../core/notify.service';
import { ChartComponent } from '../../shared/chart.component';
import {
  DATE_AXIS,
  EXPENSE_COLOR,
  INCOME_COLOR,
  SAVINGS_COLOR,
  SAVINGS_FILL,
  barValues,
  categoryColors,
  donutChart,
  incomeExpenseChart,
} from '../../shared/charts';
import { MoneyPipe, formatAxisMoney, formatMoney } from '../../shared/money.pipe';
import { NoAccountComponent } from '../../shared/no-account.component';
import { Period, PeriodPickerComponent, presetPeriod } from '../../shared/period-picker.component';

const LINE_COLORS = [
  '#8a63d2',
  '#0f9d82',
  '#ef6c00',
  '#ab47bc',
  '#0097a7',
  '#ec407a',
  '#a1887f',
  '#78909c',
];

// Avant l'ouverture du premier compte, l'historique ne contient que des zéros sans signification
function withoutLeadingZeros(history: BalanceHistory): BalanceHistory {
  const first = history.points.findIndex((p) => p.value !== 0);
  if (first <= 0) {
    return history;
  }
  return {
    ...history,
    points: history.points.slice(first),
    accounts: history.accounts.map((a) => ({ ...a, points: a.points.slice(first) })),
  };
}

@Component({
  selector: 'app-stats',
  imports: [
    FormsModule,
    RouterLink,
    PercentPipe,
    MatTabsModule,
    MatButtonModule,
    MatButtonToggleModule,
    MatFormFieldModule,
    MatSelectModule,
    MatIconModule,
    MoneyPipe,
    ChartComponent,
    PeriodPickerComponent,
    NoAccountComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './stats.component.html',
  styleUrl: './stats.component.scss',
})
export class StatsComponent {
  protected readonly store = inject(DataStore);
  private readonly api = inject(StatsApi);
  private readonly notify = inject(NotifyService);

  protected readonly period = signal<Period>(presetPeriod('12months')!);
  protected readonly accountIds = signal<number[]>([]);
  protected readonly categoryType = signal<CategoryType>('EXPENSE');
  // Fil d'Ariane de la catégorie explorée (vide = catégories principales)
  protected readonly drill = signal<{ id: number; name: string }[]>([]);
  // Catégorie dont on affiche l'évolution (par défaut, celle explorée)
  protected readonly selected = signal<{ id: number; name: string } | null>(null);
  protected readonly trendTarget = computed(() => this.selected() ?? this.drill().at(-1) ?? null);

  protected readonly summary = signal<StatsSummary | null>(null);
  protected readonly monthly = signal<MonthlyStat[]>([]);
  protected readonly categories = signal<CategoryStat[]>([]);
  protected readonly trend = signal<CategoryTrendStat[]>([]);
  protected readonly history = signal<BalanceHistory | null>(null);
  protected readonly savings = signal<SavingsStats | null>(null);
  protected readonly payees = signal<PayeeStat[]>([]);
  protected readonly missingRates = signal<string[]>([]);

  protected readonly currency = computed(
    () => this.summary()?.currencyCode ?? this.store.referenceCurrency(),
  );
  protected readonly isEmpty = computed(() => {
    const s = this.summary();
    return (
      !!s && s.income === 0 && s.expenses === 0 && s.savings === 0 && this.categories().length === 0
    );
  });
  // Sans aucune donnée, un 0,00 € de comparaison serait trompeur
  protected readonly hasPrevious = computed(() => {
    const s = this.summary();
    return !!s && (s.previousIncome !== 0 || s.previousExpenses !== 0);
  });
  private readonly query = computed<StatsQuery>(() => ({
    ...this.period(),
    accountIds: this.accountIds(),
  }));

  protected readonly monthlyChart = computed(() =>
    this.monthly().length ? incomeExpenseChart(this.monthly(), this.currency()) : null,
  );

  protected readonly categoryChart = computed(() =>
    this.categories().length
      ? donutChart(
          this.categories(),
          this.currency(),
          'Cliquez sur une catégorie pour voir le détail de ses sous-catégories.',
        )
      : null,
  );

  protected readonly trendChart = computed<ChartConfiguration | null>(() => {
    const current = this.trendTarget();
    if (!current || !this.trend().length) {
      return null;
    }
    const currency = this.currency();
    return {
      type: 'bar',
      data: {
        labels: this.trend().map((t) => formatMonth(t.month)),
        datasets: [
          {
            label: current.name,
            data: this.trend().map((t) => t.amount),
            backgroundColor: SAVINGS_COLOR,
            borderRadius: 4,
          },
        ],
      },
      options: {
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: (c) => formatMoney(c.parsed.y, currency) } },
        },
        scales: { y: { ticks: { callback: (v) => formatAxisMoney(Number(v), currency) } } },
      },
    };
  });

  protected readonly netWorthChart = computed<ChartConfiguration | null>(() => {
    const history = this.history();
    if (!history || history.points.length < 2) {
      return null;
    }
    const currency = history.currencyCode;
    return {
      type: 'line',
      data: {
        labels: history.points.map((p) => formatDay(p.date)),
        datasets: [
          {
            label: 'Patrimoine total',
            data: history.points.map((p) => p.value),
            borderColor: SAVINGS_COLOR,
            backgroundColor: SAVINGS_FILL,
            fill: true,
            pointRadius: 0,
          },
        ],
      },
      options: {
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: (c) => formatMoney(c.parsed.y, currency) } },
        },
        scales: {
          x: DATE_AXIS,
          y: { ticks: { callback: (v) => formatAxisMoney(Number(v), currency) } },
        },
      },
    };
  });

  protected readonly accountsChart = computed<ChartConfiguration | null>(() => {
    const history = this.history();
    if (!history || history.points.length < 2 || history.accounts.length === 0) {
      return null;
    }
    const currencies = [...new Set(history.accounts.map((a) => a.currencyCode))];
    const currencyAxes = Object.fromEntries(
      currencies.map((code, i) => [
        code,
        {
          position: i === 0 ? 'left' : 'right',
          grid: { drawOnChartArea: i === 0 },
          border: { display: false },
          ticks: { callback: (v: string | number) => formatAxisMoney(Number(v), code) },
        },
      ]),
    );
    return {
      type: 'line',
      data: {
        labels: history.points.map((p) => formatDay(p.date)),
        datasets: history.accounts.map((a, i) => ({
          label: `${a.name} (${a.currencyCode})`,
          data: a.points.map((p) => p.value),
          yAxisID: a.currencyCode,
          borderColor: LINE_COLORS[i % LINE_COLORS.length],
          backgroundColor: LINE_COLORS[i % LINE_COLORS.length],
          pointRadius: 0,
        })),
      },
      options: {
        interaction: { mode: 'index', intersect: false },
        plugins: {
          tooltip: {
            callbacks: {
              label: (c) =>
                ` ${c.dataset.label} : ${formatMoney(c.parsed.y, history.accounts[c.datasetIndex].currencyCode)}`,
            },
          },
        },
        scales: { x: DATE_AXIS, ...currencyAxes },
      },
    } as ChartConfiguration;
  });

  protected readonly monthLabel = formatMonth;

  protected readonly savingsChart = computed<ChartConfiguration | null>(() => {
    const savings = this.savings();
    if (!savings || !savings.months.length) {
      return null;
    }
    const currency = savings.currencyCode;
    const hasWithdrawals = savings.months.some((m) => m.withdrawals !== 0);
    return {
      type: 'bar',
      data: {
        labels: savings.months.map((m) => formatMonth(m.month)),
        datasets: [
          {
            label: 'Versements',
            data: savings.months.map((m) => m.deposits),
            backgroundColor: INCOME_COLOR,
            borderRadius: 4,
          },
          ...(hasWithdrawals
            ? [
                {
                  label: 'Retraits',
                  data: savings.months.map((m) => -m.withdrawals),
                  backgroundColor: EXPENSE_COLOR,
                  borderRadius: 4,
                },
              ]
            : []),
        ],
      },
      options: {
        plugins: {
          tooltip: {
            callbacks: {
              label: (c) => ` ${c.dataset.label} : ${formatMoney(c.parsed.y, currency)}`,
            },
          },
        },
        scales: {
          y: { stacked: true, ticks: { callback: (v) => formatAxisMoney(Number(v), currency) } },
          x: { stacked: true },
        },
      },
    } as ChartConfiguration;
  });

  protected readonly savingsBalanceChart = computed<ChartConfiguration | null>(() => {
    const savings = this.savings();
    if (!savings || !savings.months.length) {
      return null;
    }
    const currency = savings.currencyCode;
    return {
      type: 'line',
      data: {
        labels: savings.months.map((m) => formatMonth(m.month)),
        datasets: [
          {
            label: "Encours d'épargne",
            data: savings.months.map((m) => m.balance),
            borderColor: SAVINGS_COLOR,
            backgroundColor: SAVINGS_FILL,
            fill: true,
          },
        ],
      },
      options: {
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: (c) => formatMoney(c.parsed.y, currency) } },
        },
        scales: { y: { ticks: { callback: (v) => formatAxisMoney(Number(v), currency) } } },
      },
    };
  });

  protected readonly savingsRateChart = computed<ChartConfiguration | null>(() => {
    const savings = this.savings();
    if (!savings || !savings.months.length) {
      return null;
    }
    return {
      type: 'line',
      data: {
        labels: savings.months.map((m) => formatMonth(m.month)),
        datasets: [
          {
            label: 'Part des revenus non dépensée',
            data: savings.months.map((m) =>
              m.savingsRate === null ? null : Math.round(m.savingsRate * 1000) / 10,
            ),
            borderColor: INCOME_COLOR,
            backgroundColor: INCOME_COLOR,
            spanGaps: true,
          },
        ],
      },
      options: {
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: (c) => ` ${c.parsed.y} %` } },
        },
        scales: { y: { ticks: { callback: (v) => `${v} %` } } },
      },
    };
  });

  protected readonly payeesChart = computed<ChartConfiguration | null>(() => {
    const payees = this.payees();
    if (!payees.length) {
      return null;
    }
    const currency = this.currency();
    return {
      type: 'bar',
      plugins: [barValues((value) => formatMoney(value, currency))],
      data: {
        labels: payees.map((p) => p.payee),
        datasets: [
          { data: payees.map((p) => p.amount), backgroundColor: EXPENSE_COLOR, borderRadius: 4 },
        ],
      },
      options: {
        indexAxis: 'y',
        // Réserve la place du montant écrit au bout de la barre la plus longue
        layout: { padding: { right: 96 } },
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: (c) => formatMoney(c.parsed.x, currency) } },
        },
        scales: { x: { ticks: { callback: (v) => formatAxisMoney(Number(v), currency) } } },
      },
    };
  });

  protected readonly colors = computed(() => categoryColors(this.categories()));

  constructor() {
    effect(() => {
      this.query();
      this.store.version();
      untracked(() => this.loadAll());
    });
  }

  protected setType(type: CategoryType): void {
    this.categoryType.set(type);
    this.drill.set([]);
    this.selected.set(null);
    this.loadCategories();
  }

  // Une catégorie avec sous-catégories s'ouvre ; une feuille affiche son évolution mensuelle
  protected openCategory(index: number): void {
    const item = this.categories()[index];
    if (!item?.categoryId) {
      return;
    }
    const target = { id: item.categoryId, name: item.name };
    if (item.hasChildren && !item.direct) {
      this.drill.update((d) => [...d, target]);
      this.selected.set(null);
      this.loadCategories();
    } else {
      this.selected.set(target);
      this.loadTrend();
    }
  }

  protected drillTo(index: number): void {
    this.drill.update((d) => d.slice(0, index));
    this.selected.set(null);
    this.loadCategories();
  }

  private loadAll(): void {
    const query = this.query();
    forkJoin({
      summary: this.api.summary(query),
      monthly: this.api.monthly(query),
      // L'historique s'arrête aujourd'hui : un solde futur n'est pas encore connu
      history: this.api.balanceHistory({
        ...query,
        to: query.to && query.to > today() ? today() : query.to,
      }),
      savings: this.api.savings({ from: query.from, to: query.to }),
      payees: this.api.payees({ ...query, limit: 15 }),
    }).subscribe({
      next: (r) => {
        this.summary.set(r.summary);
        this.monthly.set(
          trimLeadingEmpty(r.monthly.items, (m) => !!(m.income || m.expenses || m.savings)),
        );
        this.history.set(withoutLeadingZeros(r.history));
        this.savings.set({
          ...r.savings,
          months: trimLeadingEmpty(
            r.savings.months,
            (m) => !!(m.deposits || m.withdrawals || m.balance),
          ),
        });
        this.payees.set(r.payees.items);
        this.missingRates.set([...new Set([...r.summary.missingRates, ...r.history.missingRates])]);
      },
      error: (error) => this.notify.error(error),
    });
    this.loadCategories();
  }

  private loadCategories(): void {
    const parent = this.drill().at(-1);
    this.api
      .categories({ ...this.query(), type: this.categoryType(), parentId: parent?.id })
      .subscribe({
        next: (r) => {
          this.categories.set(r.items);
          this.loadTrend();
        },
        error: (error) => this.notify.error(error),
      });
  }

  private loadTrend(): void {
    const current = this.trendTarget();
    if (!current) {
      this.trend.set([]);
      return;
    }
    this.api.categoryTrend({ ...this.query(), categoryId: current.id }).subscribe({
      next: (r) => this.trend.set(r.items),
      error: (error) => this.notify.error(error),
    });
  }
}
