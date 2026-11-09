import {
  ChangeDetectionStrategy,
  Component,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatDialog } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatMenuModule } from '@angular/material/menu';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSelectModule } from '@angular/material/select';
import { ActivatedRoute } from '@angular/router';
import { format } from 'date-fns';
import { EMPTY, Subject, debounceTime, expand, map, reduce } from 'rxjs';
import { TransactionApi } from '../../core/api';
import { DataStore } from '../../core/data.store';
import { fromIsoDate, toIsoDate } from '../../core/format';
import {
  Transaction,
  TransactionFilter,
  TransactionKind,
  TransactionSort,
  TransactionStatus,
  TransactionTotals,
} from '../../core/models';
import { NotifyService } from '../../core/notify.service';
import { MoneyPipe } from '../../shared/money.pipe';
import { NoAccountComponent } from '../../shared/no-account.component';
import { BulkCategoryDialogComponent } from './bulk-category-dialog.component';
import { transactionsToCsv } from './transactions-csv';
import { TransactionFormDialogComponent } from './transaction-form-dialog.component';
import { TransactionTableComponent } from './transaction-table.component';

@Component({
  selector: 'app-transactions',
  imports: [
    FormsModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatDatepickerModule,
    MatButtonModule,
    MatIconModule,
    MatMenuModule,
    MatPaginatorModule,
    MatProgressBarModule,
    MoneyPipe,
    TransactionTableComponent,
    NoAccountComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page">
      <div class="page-header">
        <div>
          <h1>Opérations</h1>
          <div class="subtitle">
            {{ total() }} opération{{ total() > 1 ? 's' : ''
            }}{{ hasFilters() ? ' correspondant aux filtres' : '' }} · cliquez sur une ligne pour la
            modifier
          </div>
        </div>
        @if (hasFilters()) {
          <button matButton (click)="reset()">
            <mat-icon>filter_alt_off</mat-icon> Effacer les filtres
          </button>
        }
        @if (total() > 0) {
          <button matButton="tonal" [matMenuTriggerFor]="totalsMenu">
            <mat-icon>functions</mat-icon> Totaux
          </button>
          <mat-menu #totalsMenu="matMenu" class="totals-menu" xPosition="before">
            <div class="totals">
              <strong>Total {{ hasFilters() ? 'filtré' : 'général' }}</strong>
              <table>
                <thead>
                  <tr>
                    <th scope="col">Devise</th>
                    <th scope="col">Entrées</th>
                    <th scope="col">Sorties</th>
                    <th scope="col">Net</th>
                  </tr>
                </thead>
                <tbody>
                  @for (t of totals(); track t.currencyCode) {
                    <tr>
                      <th scope="row">{{ t.currencyCode }}</th>
                      <td class="amount positive">
                        {{ t.credits | money: t.currencyCode : true }}
                      </td>
                      <td class="amount">{{ -t.debits | money: t.currencyCode : true }}</td>
                      <td class="amount" [class.positive]="t.net > 0" [class.negative]="t.net < 0">
                        {{ t.net | money: t.currencyCode : true }}
                      </td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          </mat-menu>
          <button matButton="tonal" (click)="export()" [disabled]="exporting()">
            <mat-icon>download</mat-icon> Exporter en CSV
          </button>
        }
        <!-- Sans opération ni filtre, l'écran vide propose déjà « Saisir une opération » -->
        @if (store.openAccounts().length > 0 && (total() > 0 || hasFilters())) {
          <button matButton="filled" (click)="create()">
            <mat-icon>add</mat-icon> Nouvelle opération
          </button>
        }
      </div>

      @if (store.loaded() && store.accounts().length === 0) {
        <app-no-account />
      } @else {
        <div class="card">
          <div class="filters">
            <mat-form-field class="search">
              <mat-label>Rechercher</mat-label>
              <mat-icon matPrefix>search</mat-icon>
              <input
                matInput
                [ngModel]="search()"
                (ngModelChange)="searchInput.next($event)"
                placeholder="Libellé, bénéficiaire, notes"
              />
            </mat-form-field>

            <mat-form-field class="accounts">
              <mat-label>Comptes bancaires</mat-label>
              <mat-select
                multiple
                [panelWidth]="null"
                [ngModel]="accountIds()"
                (ngModelChange)="update(accountIds, $event)"
                placeholder="Tous"
              >
                @for (account of store.accounts(); track account.id) {
                  <mat-option [value]="account.id">{{ account.name }}</mat-option>
                }
              </mat-select>
            </mat-form-field>

            <mat-form-field>
              <mat-label>Type</mat-label>
              <mat-select [ngModel]="kind()" (ngModelChange)="update(kind, $event)">
                <mat-option [value]="null">Tous</mat-option>
                <mat-option value="EXPENSE">Dépenses</mat-option>
                <mat-option value="INCOME">Revenus</mat-option>
                <mat-option value="TRANSFER">Virements internes</mat-option>
              </mat-select>
            </mat-form-field>

            <mat-form-field class="category">
              <mat-label>Catégorie</mat-label>
              <mat-select [ngModel]="categoryId()" (ngModelChange)="update(categoryId, $event)">
                <mat-option [value]="null">Toutes</mat-option>
                <mat-option [value]="-1"><em>Non catégorisées</em></mat-option>
                @for (option of store.categoryTree(); track option.category.id) {
                  <mat-option [value]="option.category.id">
                    <span [style.padding-left.px]="option.depth * 16">{{
                      option.category.name
                    }}</span>
                  </mat-option>
                }
              </mat-select>
              @if (categoryId() && categoryId()! > 0) {
                <mat-hint>Sous-catégories incluses</mat-hint>
              }
            </mat-form-field>

            <mat-form-field class="status">
              <mat-label>Pointage</mat-label>
              <mat-select [ngModel]="status()" (ngModelChange)="update(status, $event)">
                <mat-option [value]="null">Toutes</mat-option>
                <mat-option value="PENDING">Non pointées</mat-option>
                <mat-option value="CLEARED">Pointées</mat-option>
                <mat-option value="RECONCILED">Rapprochées</mat-option>
              </mat-select>
            </mat-form-field>

            <mat-form-field class="period">
              <mat-label>Période</mat-label>
              <mat-date-range-input [rangePicker]="range">
                <input
                  matStartDate
                  [ngModel]="from()"
                  (ngModelChange)="update(from, $event)"
                  placeholder="Du"
                />
                <input
                  matEndDate
                  [ngModel]="to()"
                  (ngModelChange)="update(to, $event)"
                  placeholder="au"
                />
              </mat-date-range-input>
              <mat-datepicker-toggle matIconSuffix [for]="range" />
              <mat-date-range-picker #range />
            </mat-form-field>
          </div>

          @if (selectedIds().size > 0) {
            <div class="selection" role="status">
              <strong>
                {{ selectedIds().size }} sélectionnée{{ selectedIds().size > 1 ? 's' : '' }}
              </strong>
              <button matButton="tonal" (click)="categorize()">
                <mat-icon>sell</mat-icon> Catégoriser
              </button>
              <button matButton (click)="selectedIds.set(emptySelection)">
                Tout désélectionner
              </button>
            </div>
          }
          @if (loading()) {
            <mat-progress-bar mode="indeterminate" />
          }
          <app-transaction-table
            [transactions]="transactions()"
            [emptyMessage]="emptyMessage()"
            [scrollable]="true"
            [sort]="sort()"
            [selectable]="true"
            [selectedIds]="selectedIds()"
            (sortChange)="changeSort($event)"
            (selectedIdsChange)="selectedIds.set($event)"
          />
          @if (!loading() && total() === 0) {
            <div class="row" style="justify-content: center; margin-bottom: 16px">
              @if (hasFilters()) {
                <button matButton="tonal" (click)="reset()">Effacer les filtres</button>
              } @else if (store.openAccounts().length > 0) {
                <button matButton="filled" (click)="create()">
                  <mat-icon>add</mat-icon> Saisir une opération
                </button>
              }
            </div>
          }
          @if (total() > size()) {
            <mat-paginator
              [length]="total()"
              [pageIndex]="page()"
              [pageSize]="size()"
              [pageSizeOptions]="[25, 50, 100, 200]"
              (page)="changePage($event)"
            />
          }
        </div>
      }
    </div>
  `,
  styles: `
    // Largeurs minimales : chaque étiquette reste entière et les six filtres tiennent sur une ligne
    .filters mat-form-field {
      flex: 1 1 100px;
    }
    .filters .search {
      flex: 2 1 150px;
    }
    .filters .accounts {
      flex: 1.5 1 205px;
    }
    .filters .category {
      flex: 1.5 1 140px;
    }
    .filters .status {
      flex: 1 1 135px;
    }
    // Juste la largeur des deux dates : la place restante va aux autres filtres
    .filters .period {
      flex: 0 0 240px;
    }
    .selection {
      display: flex;
      align-items: center;
      flex-wrap: wrap;
      gap: 12px;
      margin-top: 12px;
      padding: 8px 8px 8px 16px;
      border-radius: 12px;
      background: var(--mat-sys-secondary-container);
      color: var(--mat-sys-on-secondary-container);
    }
    .totals {
      padding: 8px 16px;
      table {
        margin-top: 8px;
        border-collapse: collapse;
        white-space: nowrap;
      }
      th,
      td {
        padding: 4px 0 4px 20px;
        text-align: right;
        font-weight: 400;
      }
      th:first-child {
        padding-left: 0;
        text-align: left;
      }
      thead th {
        color: var(--hermes-muted);
      }
    }
  `,
})
export class TransactionsComponent {
  protected readonly store = inject(DataStore);
  private readonly api = inject(TransactionApi);
  private readonly notify = inject(NotifyService);
  private readonly dialog = inject(MatDialog);

  protected readonly search = signal('');
  protected readonly accountIds = signal<number[]>([]);
  protected readonly kind = signal<TransactionKind | null>(null);
  protected readonly categoryId = signal<number | null>(null);
  protected readonly status = signal<TransactionStatus | null>(null);
  protected readonly from = signal<Date | null>(null);
  protected readonly to = signal<Date | null>(null);
  protected readonly page = signal(0);
  protected readonly size = signal(50);

  protected readonly sort = signal<TransactionSort>({ field: 'date', direction: 'desc' });
  protected readonly emptySelection: ReadonlySet<number> = new Set();
  protected readonly selectedIds = signal<ReadonlySet<number>>(this.emptySelection);
  protected readonly totals = signal<TransactionTotals[]>([]);
  protected readonly exporting = signal(false);

  protected readonly transactions = signal<Transaction[]>([]);
  protected readonly total = signal(0);
  protected readonly loading = signal(false);
  protected readonly searchInput = new Subject<string>();

  constructor() {
    // Filtres initiaux depuis l'URL, ex. depuis le tableau de bord : ?categoryId=…&from=…&to=…
    const query = inject(ActivatedRoute).snapshot.queryParamMap;
    if (query.get('categoryId')) {
      this.categoryId.set(Number(query.get('categoryId')));
    }
    if (query.get('accountId')) {
      this.accountIds.set([Number(query.get('accountId'))]);
    }
    if (query.get('kind')) {
      this.kind.set(query.get('kind') as TransactionKind);
    }
    this.from.set(fromIsoDate(query.get('from')));
    this.to.set(fromIsoDate(query.get('to')));

    this.searchInput.pipe(debounceTime(300)).subscribe((value) => this.update(this.search, value));

    effect(() => {
      this.store.version();
      untracked(() => this.load());
    });
  }

  protected emptyMessage(): string {
    return this.hasFilters()
      ? 'Aucune opération ne correspond à ces filtres'
      : "Vous n'avez encore saisi aucune opération";
  }

  protected update<T>(target: { set(value: T): void }, value: T): void {
    target.set(value);
    this.page.set(0);
    this.load();
  }

  protected hasFilters(): boolean {
    return !!(
      this.search() ||
      this.accountIds().length ||
      this.kind() ||
      this.categoryId() ||
      this.status() ||
      this.from() ||
      this.to()
    );
  }

  protected reset(): void {
    this.search.set('');
    this.accountIds.set([]);
    this.kind.set(null);
    this.categoryId.set(null);
    this.status.set(null);
    this.from.set(null);
    this.to.set(null);
    this.page.set(0);
    this.load();
  }

  protected changePage(event: PageEvent): void {
    this.page.set(event.pageIndex);
    this.size.set(event.pageSize);
    this.loadPage();
  }

  protected changeSort(sort: TransactionSort): void {
    this.sort.set(sort);
    this.page.set(0);
    this.loadPage();
  }

  protected categorize(): void {
    BulkCategoryDialogComponent.open(this.dialog, [...this.selectedIds()]);
  }

  // Exporte toutes les opérations correspondant aux filtres, page après page
  protected export(): void {
    const size = 500;
    const filter = this.filter();
    const sort = this.sort();
    this.exporting.set(true);
    this.api
      .search(filter, 0, size, sort)
      .pipe(
        expand((page) =>
          page.page + 1 < page.totalPages
            ? this.api.search(filter, page.page + 1, size, sort)
            : EMPTY,
        ),
        map((page) => page.content),
        reduce((all, content) => [...all, ...content], [] as Transaction[]),
      )
      .subscribe({
        next: (transactions) => {
          this.exporting.set(false);
          this.download(transactionsToCsv(transactions));
        },
        error: (error) => {
          this.exporting.set(false);
          this.notify.error(error);
        },
      });
  }

  private download(content: string): void {
    const url = URL.createObjectURL(new Blob([content], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `hermes-operations-${format(new Date(), 'yyyy-MM-dd')}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  protected create(): void {
    TransactionFormDialogComponent.open(this.dialog, { accountId: this.accountIds()[0] });
  }

  load(): void {
    this.selectedIds.set(this.emptySelection);
    this.loadPage();
    this.api.totals(this.filter()).subscribe({
      next: (totals) => this.totals.set(totals),
      error: (error) => this.notify.error(error),
    });
  }

  private filter(): TransactionFilter {
    const categoryId = this.categoryId();
    return {
      search: this.search() || undefined,
      accountIds: this.accountIds(),
      kind: this.kind() ?? undefined,
      status: this.status() ?? undefined,
      categoryIds: categoryId && categoryId > 0 ? [categoryId] : undefined,
      uncategorized: categoryId === -1 ? true : undefined,
      from: toIsoDate(this.from()) ?? undefined,
      to: toIsoDate(this.to()) ?? undefined,
    };
  }

  private loadPage(): void {
    this.loading.set(true);
    this.api.search(this.filter(), this.page(), this.size(), this.sort()).subscribe({
      next: (page) => {
        this.transactions.set(page.content);
        this.total.set(page.totalElements);
        this.loading.set(false);
      },
      error: (error) => {
        this.loading.set(false);
        this.notify.error(error);
      },
    });
  }
}
