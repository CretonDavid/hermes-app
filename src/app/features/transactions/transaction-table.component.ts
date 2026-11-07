import { DatePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  effect,
  inject,
  input,
  output,
  viewChild,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatSortModule, Sort } from '@angular/material/sort';
import { MatTableModule } from '@angular/material/table';
import { MatTooltipModule } from '@angular/material/tooltip';
import { TransactionApi } from '../../core/api';
import { DataStore } from '../../core/data.store';
import { STATUS_LABELS, paymentMethodLabel, reimbursementPeriodLabel } from '../../core/format';
import { Transaction, TransactionSort, TransactionSortField } from '../../core/models';
import { NotifyService } from '../../core/notify.service';
import { MoneyPipe, formatMoney } from '../../shared/money.pipe';
import { TransactionFormDialogComponent } from './transaction-form-dialog.component';

@Component({
  selector: 'app-transaction-table',
  imports: [
    MatTableModule,
    MatSortModule,
    MatCheckboxModule,
    MatIconModule,
    MatButtonModule,
    MatTooltipModule,
    DatePipe,
    MoneyPipe,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="table-wrapper" [class.scrollable]="scrollable()" #wrapper>
      <table
        mat-table
        [dataSource]="transactions()"
        matSort
        matSortDisableClear
        [matSortDisabled]="!sort()"
        [matSortActive]="sort()?.field ?? ''"
        [matSortDirection]="sort()?.direction ?? ''"
        (matSortChange)="onSort($event)"
      >
        <ng-container matColumnDef="select">
          <th mat-header-cell *matHeaderCellDef class="select-cell">
            <mat-checkbox
              aria-label="Sélectionner toutes les opérations de la page"
              [checked]="allSelected()"
              [indeterminate]="selectedIds().size > 0 && !allSelected()"
              (change)="toggleAll($event.checked)"
            />
          </th>
          <td mat-cell *matCellDef="let t" class="select-cell" (click)="$event.stopPropagation()">
            <mat-checkbox
              [attr.aria-label]="'Sélectionner ' + t.label"
              [checked]="selectedIds().has(t.id)"
              (change)="toggle(t, $event.checked)"
            />
          </td>
        </ng-container>

        <ng-container matColumnDef="status">
          <th mat-header-cell *matHeaderCellDef>Pointage</th>
          <!-- Toute la cellule est réservée au pointage : un clic à côté du bouton n'ouvre pas l'opération -->
          <td mat-cell *matCellDef="let t" class="status-cell" (click)="$event.stopPropagation()">
            <button
              matIconButton
              [matTooltip]="statusTooltip(t)"
              [attr.aria-label]="statusTooltip(t) + ' : ' + t.label"
              [disabled]="t.status === 'RECONCILED'"
              (click)="toggleStatus(t)"
              [class]="'status ' + t.status"
            >
              <mat-icon>{{
                t.status === 'RECONCILED'
                  ? 'lock'
                  : t.status === 'CLEARED'
                    ? 'check_circle'
                    : 'radio_button_unchecked'
              }}</mat-icon>
            </button>
          </td>
        </ng-container>

        <ng-container matColumnDef="date">
          <th mat-header-cell *matHeaderCellDef mat-sort-header="date">Date</th>
          <td mat-cell *matCellDef="let t" class="date">
            {{ t.operationDate | date: 'dd/MM/yyyy' }}
          </td>
        </ng-container>

        <ng-container matColumnDef="label">
          <th mat-header-cell *matHeaderCellDef mat-sort-header="label">Libellé</th>
          <td mat-cell *matCellDef="let t">
            <div class="label">
              @if (t.transfer) {
                <mat-icon class="kind" matTooltip="Virement interne">swap_horiz</mat-icon>
              } @else if (t.reimbursement) {
                <mat-icon class="kind" [matTooltip]="reimbursementTooltip(t)">handshake</mat-icon>
              } @else if (t.recurringTransactionId) {
                <mat-icon class="kind" matTooltip="Récurrence">event_repeat</mat-icon>
              }
              <span>{{ t.label }}</span>
            </div>
            @if (t.transfer) {
            } @else if (t.payee && t.payee !== t.label) {
              <div class="sub">{{ t.payee }}</div>
            } @else if (t.paymentMethod) {
              <div class="sub">{{ methodLabel(t.paymentMethod) }}</div>
            }
          </td>
        </ng-container>

        <ng-container matColumnDef="category">
          <th mat-header-cell *matHeaderCellDef>Catégorie</th>
          <td mat-cell *matCellDef="let t">
            @if (t.transfer) {
              <span
                class="chip"
                [matTooltip]="
                  (t.direction === 'DEBIT' ? 'Vers ' : 'Depuis ') +
                  t.transfer.accountName +
                  ' · ni dépense ni revenu'
                "
                ><mat-icon>swap_horiz</mat-icon>Virement interne</span
              >
            } @else if (t.category) {
              <span class="chip">
                <span class="category-dot" [style.background]="categoryColor(t.category.id)"></span>
                {{ t.category.name }}
              </span>
            } @else {
              <span class="chip uncategorized">Non catégorisée</span>
            }
          </td>
        </ng-container>

        <ng-container matColumnDef="account">
          <th mat-header-cell *matHeaderCellDef mat-sort-header="account">Compte bancaire</th>
          <td mat-cell *matCellDef="let t" class="muted" [title]="t.accountName">
            {{ t.accountName }}
          </td>
        </ng-container>

        <ng-container matColumnDef="amount">
          <th mat-header-cell *matHeaderCellDef mat-sort-header="amount" arrowPosition="before">
            Montant
          </th>
          <td
            mat-cell
            *matCellDef="let t"
            class="amount"
            [class.positive]="t.direction === 'CREDIT'"
          >
            {{ (t.direction === 'DEBIT' ? -t.amount : t.amount) | money: t.currencyCode : true }}
          </td>
        </ng-container>

        <tr mat-header-row *matHeaderRowDef="columns(); sticky: scrollable()"></tr>
        <tr
          mat-row
          *matRowDef="let row; columns: columns()"
          class="clickable"
          tabindex="0"
          [attr.aria-label]="rowLabel(row)"
          (click)="edit(row)"
          (keydown)="onRowKey($event, row)"
        ></tr>
      </table>
    </div>
    @if (transactions().length === 0) {
      <div class="empty">
        <mat-icon>receipt_long</mat-icon>
        <p>{{ emptyMessage() }}</p>
      </div>
    } @else if (showStatus()) {
      <div class="legend">
        <span><mat-icon>radio_button_unchecked</mat-icon> Non pointée</span>
        <span><mat-icon class="cleared">check_circle</mat-icon> Pointée (vue sur le relevé)</span>
        <span><mat-icon class="reconciled">lock</mat-icon> Rapprochée (verrouillée)</span>
      </div>
    }
  `,
  styles: `
    .scrollable {
      // L'en-tête, les filtres et la pagination restent visibles pendant le défilement
      max-height: calc(100vh - 400px);
      min-height: 320px;
      overflow: auto;

      th {
        background: var(--mat-sys-surface-container-lowest);
      }
    }
    // Écran étroit : le montant reste visible, le compte est la colonne la moins indispensable
    @media (max-width: 1000px) {
      .mat-column-account {
        display: none;
      }
    }
    .date {
      white-space: nowrap;
      color: var(--hermes-muted);
    }
    .label {
      display: flex;
      align-items: center;
      gap: 6px;
      font-weight: 500;
      min-width: 200px;
      overflow-wrap: anywhere;
    }
    .kind {
      font-size: 18px;
      width: 18px;
      height: 18px;
      color: var(--hermes-muted);
    }
    .sub {
      font: var(--mat-sys-body-small);
      color: var(--hermes-muted);
      overflow-wrap: anywhere;
    }
    .select-cell {
      width: 40px;
      padding-right: 0 !important;
      cursor: default;
    }
    .status-cell {
      width: 64px;
      cursor: default;
    }
    .status mat-icon {
      font-size: 20px;
    }
    .status.CLEARED {
      color: var(--hermes-positive);
    }
    .status.RECONCILED {
      color: var(--mat-sys-primary);
    }
    .status.PENDING {
      color: var(--mat-sys-outline);
    }
    .uncategorized {
      font-style: italic;
    }
    .legend {
      display: flex;
      flex-wrap: wrap;
      gap: 4px 16px;
      padding: 10px 16px 0;
      font: var(--mat-sys-body-small);
      color: var(--hermes-muted);

      span {
        display: inline-flex;
        align-items: center;
        gap: 4px;
      }
      mat-icon {
        font-size: 16px;
        width: 16px;
        height: 16px;
      }
      .cleared {
        color: var(--hermes-positive);
      }
      .reconciled {
        color: var(--mat-sys-primary);
      }
    }
  `,
})
export class TransactionTableComponent {
  readonly transactions = input.required<Transaction[]>();
  readonly showAccount = input(true);
  readonly showStatus = input(true);
  readonly emptyMessage = input('Aucune opération');
  // Défilement interne avec en-tête fixe
  readonly scrollable = input(false);
  // Tri par colonne : désactivé tant qu'aucun tri n'est fourni
  readonly sort = input<TransactionSort | null>(null);
  // Sélection multiple : désactivée tant que selectable est faux
  readonly selectable = input(false);
  readonly selectedIds = input<ReadonlySet<number>>(new Set());
  readonly sortChange = output<TransactionSort>();
  readonly selectedIdsChange = output<ReadonlySet<number>>();
  readonly changed = output<void>();

  private readonly store = inject(DataStore);
  private readonly api = inject(TransactionApi);
  private readonly notify = inject(NotifyService);
  private readonly dialog = inject(MatDialog);
  private readonly wrapper = viewChild.required<ElementRef<HTMLElement>>('wrapper');

  protected readonly columns = computed(() => [
    ...(this.selectable() ? ['select'] : []),
    ...(this.showStatus() ? ['status'] : []),
    'date',
    'label',
    'category',
    ...(this.showAccount() ? ['account'] : []),
    'amount',
  ]);
  protected readonly allSelected = computed(() => {
    const rows = this.transactions();
    return rows.length > 0 && rows.every((t) => this.selectedIds().has(t.id));
  });

  protected methodLabel = paymentMethodLabel;

  constructor() {
    // Une nouvelle page ou un nouveau tri repart du haut de la liste
    effect(() => {
      this.transactions();
      this.wrapper().nativeElement.scrollTop = 0;
    });
  }

  protected categoryColor(id: number): string {
    return this.store.categoryOption(id)?.color ?? '#9e9e9e';
  }

  protected reimbursementTooltip(t: Transaction): string {
    const r = t.reimbursement!;
    return `Remboursement de « ${r.label} » par ${r.payerName} pour ${reimbursementPeriodLabel(r.period, r.periodStart)}`;
  }

  protected statusTooltip(t: Transaction): string {
    return t.status === 'RECONCILED'
      ? STATUS_LABELS.RECONCILED
      : `${STATUS_LABELS[t.status]} — cliquer pour changer`;
  }

  protected rowLabel(t: Transaction): string {
    const amount = formatMoney(t.direction === 'DEBIT' ? -t.amount : t.amount, t.currencyCode, true);
    return `Modifier ${t.label}, ${amount}, du ${t.operationDate.split('-').reverse().join('/')}`;
  }

  protected onSort(sort: Sort): void {
    this.sortChange.emit({
      field: sort.active as TransactionSortField,
      direction: sort.direction === 'asc' ? 'asc' : 'desc',
    });
  }

  protected toggle(t: Transaction, checked: boolean): void {
    const next = new Set(this.selectedIds());
    if (checked) {
      next.add(t.id);
    } else {
      next.delete(t.id);
    }
    this.selectedIdsChange.emit(next);
  }

  protected toggleAll(checked: boolean): void {
    this.selectedIdsChange.emit(new Set(checked ? this.transactions().map((t) => t.id) : []));
  }

  // La ligne s'ouvre au clavier, sans intercepter les touches de ses boutons
  protected onRowKey(event: KeyboardEvent, t: Transaction): void {
    if (event.target === event.currentTarget && (event.key === 'Enter' || event.key === ' ')) {
      event.preventDefault();
      this.edit(t);
    }
  }

  protected toggleStatus(t: Transaction): void {
    this.api.setStatus(t.id, t.status === 'CLEARED' ? 'PENDING' : 'CLEARED').subscribe({
      next: () => {
        this.store.transactionsChanged();
        this.changed.emit();
      },
      error: (error) => this.notify.error(error),
    });
  }

  protected edit(t: Transaction): void {
    TransactionFormDialogComponent.open(this.dialog, { transaction: t })
      .afterClosed()
      .subscribe((changed) => changed && this.changed.emit());
  }
}
