import { ChangeDetectionStrategy, Component, effect, inject, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatDialog } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSelectModule } from '@angular/material/select';
import { ActivatedRoute } from '@angular/router';
import { Subject, debounceTime } from 'rxjs';
import { TransactionApi } from '../../core/api';
import { DataStore } from '../../core/data.store';
import { toIsoDate } from '../../core/format';
import { Transaction, TransactionFilter, TransactionKind, TransactionStatus } from '../../core/models';
import { NotifyService } from '../../core/notify.service';
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
    MatPaginatorModule,
    MatProgressBarModule,
    TransactionTableComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page">
      <div class="page-header">
        <div>
          <h1>Opérations</h1>
          <div class="subtitle">{{ total() }} opération(s)</div>
        </div>
        <button matButton="filled" (click)="create()"><mat-icon>add</mat-icon> Nouvelle opération</button>
      </div>

      <div class="card">
        <div class="filters">
          <mat-form-field style="min-width: 260px">
            <mat-label>Rechercher</mat-label>
            <mat-icon matPrefix>search</mat-icon>
            <input matInput [ngModel]="search()" (ngModelChange)="searchInput.next($event)" placeholder="Libellé, tiers, notes" />
          </mat-form-field>

          <mat-form-field>
            <mat-label>Comptes</mat-label>
            <mat-select multiple [ngModel]="accountIds()" (ngModelChange)="update(accountIds, $event)">
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
              <mat-option value="TRANSFER">Virements</mat-option>
            </mat-select>
          </mat-form-field>

          <mat-form-field style="min-width: 220px">
            <mat-label>Catégorie</mat-label>
            <mat-select [ngModel]="categoryId()" (ngModelChange)="update(categoryId, $event)">
              <mat-option [value]="null">Toutes</mat-option>
              <mat-option [value]="-1"><em>Non catégorisées</em></mat-option>
              @for (option of store.categoryTree(); track option.category.id) {
                <mat-option [value]="option.category.id">
                  <span [style.padding-left.px]="option.depth * 16">{{ option.category.name }}</span>
                </mat-option>
              }
            </mat-select>
          </mat-form-field>

          <mat-form-field>
            <mat-label>Statut</mat-label>
            <mat-select [ngModel]="status()" (ngModelChange)="update(status, $event)">
              <mat-option [value]="null">Tous</mat-option>
              <mat-option value="PENDING">Non pointées</mat-option>
              <mat-option value="CLEARED">Pointées</mat-option>
              <mat-option value="RECONCILED">Rapprochées</mat-option>
            </mat-select>
          </mat-form-field>

          <mat-form-field style="width: 250px">
            <mat-label>Période</mat-label>
            <mat-date-range-input [rangePicker]="range">
              <input matStartDate [ngModel]="from()" (ngModelChange)="update(from, $event)" placeholder="Du" />
              <input matEndDate [ngModel]="to()" (ngModelChange)="update(to, $event)" placeholder="au" />
            </mat-date-range-input>
            <mat-datepicker-toggle matIconSuffix [for]="range" />
            <mat-date-range-picker #range />
          </mat-form-field>

          @if (hasFilters()) {
            <button matButton (click)="reset()" style="margin-top: 8px"><mat-icon>filter_alt_off</mat-icon> Effacer</button>
          }
        </div>

        @if (loading()) {
          <mat-progress-bar mode="indeterminate" />
        }
        <app-transaction-table [transactions]="transactions()" emptyMessage="Aucune opération ne correspond aux filtres" />
        <mat-paginator
          [length]="total()"
          [pageIndex]="page()"
          [pageSize]="size()"
          [pageSizeOptions]="[25, 50, 100, 200]"
          (page)="changePage($event)"
        />
      </div>
    </div>
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

  protected readonly transactions = signal<Transaction[]>([]);
  protected readonly total = signal(0);
  protected readonly loading = signal(false);
  protected readonly searchInput = new Subject<string>();

  constructor() {
    // Filtre initial depuis l'URL (?categoryId=… ou ?accountId=…)
    const query = inject(ActivatedRoute).snapshot.queryParamMap;
    if (query.get('categoryId')) {
      this.categoryId.set(Number(query.get('categoryId')));
    }
    if (query.get('accountId')) {
      this.accountIds.set([Number(query.get('accountId'))]);
    }

    this.searchInput.pipe(debounceTime(300)).subscribe((value) => this.update(this.search, value));

    effect(() => {
      this.store.version();
      untracked(() => this.load());
    });
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
    this.load();
  }

  protected create(): void {
    TransactionFormDialogComponent.open(this.dialog, { accountId: this.accountIds()[0] });
  }

  load(): void {
    const categoryId = this.categoryId();
    const filter: TransactionFilter = {
      search: this.search() || undefined,
      accountIds: this.accountIds(),
      kind: this.kind() ?? undefined,
      status: this.status() ?? undefined,
      categoryIds: categoryId && categoryId > 0 ? [categoryId] : undefined,
      uncategorized: categoryId === -1 ? true : undefined,
      from: toIsoDate(this.from()) ?? undefined,
      to: toIsoDate(this.to()) ?? undefined,
    };
    this.loading.set(true);
    this.api.search(filter, this.page(), this.size()).subscribe({
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
