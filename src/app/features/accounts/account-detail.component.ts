import { DatePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  numberAttribute,
  signal,
  untracked,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatMenuModule } from '@angular/material/menu';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { MatTooltipModule } from '@angular/material/tooltip';
import { Title } from '@angular/platform-browser';
import { Router, RouterLink } from '@angular/router';
import { ChartConfiguration } from 'chart.js';
import { subMonths } from 'date-fns';
import { Subject, debounceTime, forkJoin } from 'rxjs';
import { AccountApi, RecurringApi, StatsApi, TransactionApi } from '../../core/api';
import { DataStore } from '../../core/data.store';
import { formatDay, toIsoDate } from '../../core/format';
import {
  Account,
  BalancePoint,
  Transaction,
  TransactionTotals,
  UpcomingOccurrence,
} from '../../core/models';
import { NotifyService } from '../../core/notify.service';
import { ChartComponent } from '../../shared/chart.component';
import { DATE_AXIS, SAVINGS_COLOR, SAVINGS_FILL } from '../../shared/charts';
import { confirm } from '../../shared/confirm-dialog.component';
import { upcomingNet } from '../../shared/forecast';
import { MoneyPipe, formatAxisMoney, formatMoney } from '../../shared/money.pipe';
import { TransactionFormDialogComponent } from '../transactions/transaction-form-dialog.component';
import { TransactionTableComponent } from '../transactions/transaction-table.component';
import { AccountFormDialogComponent } from './account-form-dialog.component';
import { ReconciliationPanelComponent } from './reconciliation-panel.component';

@Component({
  selector: 'app-account-detail',
  imports: [
    FormsModule,
    RouterLink,
    DatePipe,
    MatButtonModule,
    MatIconModule,
    MatMenuModule,
    MatFormFieldModule,
    MatInputModule,
    MatPaginatorModule,
    MatTooltipModule,
    MoneyPipe,
    ChartComponent,
    TransactionTableComponent,
    ReconciliationPanelComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (account(); as a) {
      <div class="page">
        <div class="page-header">
          <button matIconButton routerLink="/accounts" aria-label="Retour aux comptes bancaires">
            <mat-icon>arrow_back</mat-icon>
          </button>
          <div style="flex: 1">
            <h1>{{ a.name }}</h1>
            <div class="subtitle">
              {{ a.accountType.name }}{{ a.bankName ? ' · ' + a.bankName : '' }} · ouvert le
              {{ a.openingDate | date: 'dd/MM/yyyy' }}{{ a.closed ? ' · clôturé' : '' }}
            </div>
          </div>
          @if (!reconciling()) {
            <button
              matButton="tonal"
              (click)="reconcile()"
              matTooltip="Vérifier que le solde pointé correspond à votre relevé bancaire"
            >
              <mat-icon>fact_check</mat-icon> Rapprocher avec un relevé
            </button>
          }
          <button matButton="filled" (click)="newTransaction()" [disabled]="a.closed">
            <mat-icon>add</mat-icon> Opération
          </button>
          <button matIconButton [matMenuTriggerFor]="menu" aria-label="Autres actions sur ce compte bancaire">
            <mat-icon>more_vert</mat-icon>
          </button>
          <mat-menu #menu>
            <button mat-menu-item (click)="edit()">
              <mat-icon>edit</mat-icon> Modifier ce compte bancaire
            </button>
            <button mat-menu-item routerLink="/import" [queryParams]="{ accountId: a.id }">
              <mat-icon>upload_file</mat-icon> Importer un relevé
            </button>
            <button mat-menu-item (click)="remove()">
              <mat-icon>delete</mat-icon> Supprimer ce compte bancaire
            </button>
          </mat-menu>
        </div>

        <div class="grid grid-4" style="margin-bottom: 16px">
          <div class="card kpi">
            <div class="label">
              Solde à date
              <mat-icon
                class="info"
                matTooltip="Solde de départ + toutes les opérations jusqu’à aujourd’hui"
                >info</mat-icon
              >
            </div>
            <div class="value amount" [class.negative]="a.balance < 0">
              {{ a.balance | money: a.currency.code }}
            </div>
          </div>
          <div class="card kpi">
            <div class="label">
              Solde prévu à 30 jours
              <mat-icon
                class="info"
                matTooltip="Solde avec les opérations datées dans le futur et les récurrences des 30 prochains jours"
                >info</mat-icon
              >
            </div>
            <div class="value amount" [class.negative]="forecast30(a) < 0">
              {{ forecast30(a) | money: a.currency.code }}
            </div>
            <div class="delta muted">
              @if (upcoming30(a) !== 0) {
                Récurrences à venir : {{ upcoming30(a) | money: a.currency.code : true }}
              } @else {
                Aucune récurrence sur 30 jours
              }
            </div>
          </div>
          <div class="card kpi">
            <div class="label">
              Solde pointé
              <mat-icon
                class="info"
                matTooltip="Solde de départ + opérations pointées ou rapprochées. Une fois celles de votre relevé pointées, il doit correspondre au solde de ce relevé."
                >info</mat-icon
              >
            </div>
            <div class="value amount" [class.negative]="a.clearedBalance < 0">
              {{ a.clearedBalance | money: a.currency.code }}
            </div>
            <div class="delta muted">
              @if (pending(); as p) {
                {{ p.count }} non pointée{{ p.count > 1 ? 's' : '' }} :
                {{ p.net | money: a.currency.code : true }}
              } @else {
                Toutes les opérations sont pointées
              }
            </div>
          </div>
          <div class="card kpi">
            <div class="label">
              Solde de départ
              <mat-icon class="info" matTooltip="Solde indiqué à la création du compte bancaire"
                >info</mat-icon
              >
            </div>
            <div class="value amount">{{ a.initialBalance | money: a.currency.code }}</div>
          </div>
        </div>

        @if (chart(); as config) {
          <div class="card" style="margin-bottom: 16px">
            <h2><mat-icon>show_chart</mat-icon> Évolution du solde sur 12 mois</h2>
            <app-chart
              [config]="config"
              [height]="220"
              label="Courbe de l'évolution du solde du compte bancaire sur 12 mois"
            />
          </div>
        }

        @if (reconciling()) {
          <app-reconciliation-panel
            [account]="a"
            [(statementDate)]="statementDate"
            (statementDateChange)="loadTransactions()"
            (closed)="stopReconciling()"
          />
        }

        <div class="card">
          <div class="row" style="margin-bottom: 8px">
            <h2 style="margin: 0; flex: 1">
              <mat-icon>receipt_long</mat-icon>
              {{
                reconciling() ? 'Opérations à pointer (jusqu’à la date du relevé)' : 'Opérations'
              }}
            </h2>
            @if (!reconciling()) {
              <mat-form-field style="width: 280px">
                <mat-icon matPrefix>search</mat-icon>
                <input
                  matInput
                  placeholder="Rechercher"
                  (input)="searchInput.next($any($event.target).value)"
                />
              </mat-form-field>
            }
          </div>
          <app-transaction-table
            [transactions]="transactions()"
            [showAccount]="false"
            [emptyMessage]="
              reconciling()
                ? 'Toutes les opérations sont déjà rapprochées'
                : 'Aucune opération sur ce compte bancaire pour l’instant'
            "
          />
          @if (!reconciling() && total() > size()) {
            <mat-paginator
              [length]="total()"
              [pageIndex]="page()"
              [pageSize]="size()"
              [pageSizeOptions]="[25, 50, 100]"
              (page)="changePage($event)"
            />
          }
        </div>
      </div>
    }
  `,
})
export class AccountDetailComponent {
  readonly id = input.required({ transform: numberAttribute });

  protected readonly store = inject(DataStore);
  private readonly transactionApi = inject(TransactionApi);
  private readonly accountApi = inject(AccountApi);
  private readonly statsApi = inject(StatsApi);
  private readonly recurringApi = inject(RecurringApi);
  private readonly title = inject(Title);
  private readonly notify = inject(NotifyService);
  private readonly dialog = inject(MatDialog);
  private readonly router = inject(Router);

  protected readonly account = computed(() => this.store.account(this.id()));
  protected readonly transactions = signal<Transaction[]>([]);
  protected readonly total = signal(0);
  protected readonly page = signal(0);
  protected readonly size = signal(50);
  protected readonly search = signal('');
  protected readonly history = signal<BalancePoint[]>([]);
  protected readonly searchInput = new Subject<string>();
  protected readonly reconciling = signal(false);
  protected readonly statementDate = signal<Date | null>(new Date());
  private readonly upcoming = signal<UpcomingOccurrence[]>([]);
  // Opérations non pointées : elles expliquent l'écart entre le solde à date et le solde pointé
  protected readonly pending = signal<TransactionTotals | null>(null);

  protected upcoming30(account: Account): number {
    return upcomingNet(this.upcoming(), account.id, account.currency.code);
  }

  protected forecast30(account: Account): number {
    return account.forecastBalance + this.upcoming30(account);
  }

  protected readonly chart = computed<ChartConfiguration | null>(() => {
    const points = this.history();
    const currency = this.account()?.currency.code ?? 'EUR';
    if (points.length < 2) {
      return null;
    }
    return {
      type: 'line',
      data: {
        labels: points.map((p) => formatDay(p.date)),
        datasets: [
          {
            data: points.map((p) => p.value),
            borderColor: SAVINGS_COLOR,
            backgroundColor: SAVINGS_FILL,
            fill: true,
            pointRadius: 0,
          },
        ],
      },
      options: {
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: (ctx) => formatMoney(ctx.parsed.y, currency) } },
        },
        scales: {
          x: DATE_AXIS,
          y: { ticks: { callback: (v) => formatAxisMoney(Number(v), currency) } },
        },
      },
    };
  });

  constructor() {
    this.searchInput.pipe(debounceTime(300)).subscribe((value) => {
      this.search.set(value);
      this.page.set(0);
      this.loadTransactions();
    });

    effect(() => {
      this.id();
      this.account()?.openingDate;
      this.store.version();
      untracked(() => {
        this.loadTransactions();
        this.loadHistory();
        this.loadBalanceDetails();
      });
    });

    // L'onglet du navigateur indique le compte consulté
    effect(() => {
      const name = this.account()?.name;
      if (name) {
        this.title.setTitle(`${name} · Hermès`);
      }
    });
  }

  protected changePage(event: PageEvent): void {
    this.page.set(event.pageIndex);
    this.size.set(event.pageSize);
    this.loadTransactions();
  }

  protected newTransaction(): void {
    TransactionFormDialogComponent.open(this.dialog, { accountId: this.id() });
  }

  protected edit(): void {
    AccountFormDialogComponent.open(this.dialog, this.account());
  }

  protected reconcile(): void {
    this.reconciling.set(true);
    this.loadTransactions();
  }

  protected stopReconciling(): void {
    this.reconciling.set(false);
    this.loadTransactions();
  }

  protected remove(): void {
    const account = this.account()!;
    confirm(this.dialog, {
      title: 'Supprimer ce compte bancaire',
      message: `Le compte bancaire « ${account.name} », toutes ses opérations et ses récurrences seront définitivement supprimés.\nLes virements vers d'autres comptes bancaires y seront conservés comme opérations simples.\n\nPour garder l'historique, préférez clôturer ce compte bancaire.`,
      confirmLabel: 'Supprimer définitivement',
      danger: true,
    }).subscribe((ok) => {
      if (!ok) {
        return;
      }
      this.accountApi.delete(account.id).subscribe({
        next: () => {
          this.notify.success('Compte bancaire supprimé');
          this.store.transactionsChanged();
          this.router.navigate(['/accounts']);
        },
        error: (error) => this.notify.error(error),
      });
    });
  }

  protected loadTransactions(): void {
    if (this.reconciling()) {
      // Opérations restant à rapprocher jusqu'à la date du relevé
      this.transactionApi
        .search(
          { accountIds: [this.id()], to: toIsoDate(this.statementDate()) ?? undefined },
          0,
          500,
        )
        .subscribe({
          next: (page) => {
            const open = page.content.filter((t) => t.status !== 'RECONCILED');
            this.transactions.set(open);
            this.total.set(open.length);
          },
          error: (error) => this.notify.error(error),
        });
      return;
    }
    this.transactionApi
      .search(
        { accountIds: [this.id()], search: this.search() || undefined },
        this.page(),
        this.size(),
      )
      .subscribe({
        next: (page) => {
          this.transactions.set(page.content);
          this.total.set(page.totalElements);
        },
        error: (error) => this.notify.error(error),
      });
  }

  // 12 derniers mois, sans remonter avant l'ouverture du compte
  private historyStart(): string {
    const start = toIsoDate(subMonths(new Date(), 12))!;
    const opening = this.account()?.openingDate;
    return opening && opening > start ? opening : start;
  }

  private loadBalanceDetails(): void {
    forkJoin({
      upcoming: this.recurringApi.upcoming(30),
      pending: this.transactionApi.totals({ accountIds: [this.id()], status: 'PENDING' }),
    }).subscribe({
      next: ({ upcoming, pending }) => {
        this.upcoming.set(upcoming);
        this.pending.set(pending[0] ?? null);
      },
      error: (error) => this.notify.error(error),
    });
  }

  private loadHistory(): void {
    this.statsApi
      .balanceHistory({
        accountIds: [this.id()],
        from: this.historyStart(),
        to: toIsoDate(new Date())!,
        granularity: 'WEEK',
      })
      .subscribe({
        next: (history) => this.history.set(history.accounts[0]?.points ?? []),
        error: () => this.history.set([]),
      });
  }
}
