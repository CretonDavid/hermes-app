import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatTableModule } from '@angular/material/table';
import { MatTooltipModule } from '@angular/material/tooltip';
import { TransactionApi } from '../../core/api';
import { DataStore } from '../../core/data.store';
import { STATUS_LABELS, paymentMethodLabel } from '../../core/format';
import { Transaction } from '../../core/models';
import { NotifyService } from '../../core/notify.service';
import { MoneyPipe } from '../../shared/money.pipe';
import { TransactionFormDialogComponent } from './transaction-form-dialog.component';

@Component({
  selector: 'app-transaction-table',
  imports: [MatTableModule, MatIconModule, MatButtonModule, MatTooltipModule, DatePipe, MoneyPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="table-wrapper">
      <table mat-table [dataSource]="transactions()">
        <ng-container matColumnDef="status">
          <th mat-header-cell *matHeaderCellDef>
            <mat-icon
              class="help"
              matTooltip="Pointage : ○ non pointée · ✓ pointée (vue sur le relevé bancaire) · cadenas = rapprochée. Cliquez sur le rond pour pointer."
              >help</mat-icon
            >
          </th>
          <td mat-cell *matCellDef="let t" class="status-cell">
            <button
              matIconButton
              [matTooltip]="statusTooltip(t)"
              [disabled]="t.status === 'RECONCILED'"
              (click)="toggleStatus(t, $event)"
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
          <th mat-header-cell *matHeaderCellDef>Date</th>
          <td mat-cell *matCellDef="let t" class="date">
            {{ t.operationDate | date: 'dd/MM/yyyy' }}
          </td>
        </ng-container>

        <ng-container matColumnDef="label">
          <th mat-header-cell *matHeaderCellDef>Libellé</th>
          <td mat-cell *matCellDef="let t">
            <div class="label">
              @if (t.transfer) {
                <mat-icon class="kind" matTooltip="Virement interne">swap_horiz</mat-icon>
              } @else if (t.recurringTransactionId) {
                <mat-icon class="kind" matTooltip="Opération récurrente">event_repeat</mat-icon>
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
          <th mat-header-cell *matHeaderCellDef>Compte</th>
          <td mat-cell *matCellDef="let t" class="muted">{{ t.accountName }}</td>
        </ng-container>

        <ng-container matColumnDef="amount">
          <th mat-header-cell *matHeaderCellDef>Montant</th>
          <td
            mat-cell
            *matCellDef="let t"
            class="amount"
            [class.positive]="t.direction === 'CREDIT'"
          >
            {{ (t.direction === 'DEBIT' ? -t.amount : t.amount) | money: t.currencyCode : true }}
          </td>
        </ng-container>

        <tr mat-header-row *matHeaderRowDef="columns()"></tr>
        <tr
          mat-row
          *matRowDef="let row; columns: columns()"
          class="clickable"
          (click)="edit(row)"
        ></tr>
      </table>
    </div>
    @if (transactions().length === 0) {
      <div class="empty">
        <mat-icon>receipt_long</mat-icon>
        <p>{{ emptyMessage() }}</p>
      </div>
    }
  `,
  styles: `
    .date {
      white-space: nowrap;
      color: var(--hermes-muted);
    }
    .label {
      display: flex;
      align-items: center;
      gap: 6px;
      font-weight: 500;
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
    }
    .status-cell {
      width: 48px;
      padding-right: 0 !important;
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
    .help {
      font-size: 18px;
      width: 18px;
      height: 18px;
      color: var(--hermes-muted);
      cursor: help;
      margin-left: 10px;
    }
    .uncategorized {
      font-style: italic;
    }
  `,
})
export class TransactionTableComponent {
  readonly transactions = input.required<Transaction[]>();
  readonly showAccount = input(true);
  readonly showStatus = input(true);
  readonly emptyMessage = input('Aucune opération');
  readonly changed = output<void>();

  private readonly store = inject(DataStore);
  private readonly api = inject(TransactionApi);
  private readonly notify = inject(NotifyService);
  private readonly dialog = inject(MatDialog);

  protected readonly columns = computed(() => [
    ...(this.showStatus() ? ['status'] : []),
    'date',
    'label',
    'category',
    ...(this.showAccount() ? ['account'] : []),
    'amount',
  ]);

  protected methodLabel = paymentMethodLabel;

  protected categoryColor(id: number): string {
    return this.store.categoryOption(id)?.color ?? '#9e9e9e';
  }

  protected statusTooltip(t: Transaction): string {
    return t.status === 'RECONCILED'
      ? STATUS_LABELS.RECONCILED
      : `${STATUS_LABELS[t.status]} — cliquer pour changer`;
  }

  protected toggleStatus(t: Transaction, event: Event): void {
    event.stopPropagation();
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
