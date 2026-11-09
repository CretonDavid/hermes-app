import { DatePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import {
  MAT_DIALOG_DATA,
  MatDialog,
  MatDialogModule,
  MatDialogRef,
} from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatTabsModule } from '@angular/material/tabs';
import { forkJoin } from 'rxjs';
import { RecurringApi, TransactionApi } from '../../core/api';
import { DataStore } from '../../core/data.store';
import { frequencyLabel } from '../../core/format';
import { RecurringTransaction, ReimbursementTracking, Transaction } from '../../core/models';
import { NotifyService } from '../../core/notify.service';
import { DialogCloseComponent } from '../../shared/dialog-close.component';
import { MoneyPipe } from '../../shared/money.pipe';
import { TransactionFormDialogComponent } from '../transactions/transaction-form-dialog.component';
import { ReimbursementCardComponent } from './reimbursement-card.component';

export type RecurringHistoryTab = 'reimbursements' | 'operations';

export interface RecurringHistoryData {
  recurring: RecurringTransaction;
  tab?: RecurringHistoryTab;
}

const PAGE_SIZE = 20;

/**
 * Historique d'une dépense récurrente remboursée par des tiers : le suivi des remboursements et
 * les opérations qu'elle a créées.
 */
@Component({
  selector: 'app-recurring-history-dialog',
  imports: [
    DatePipe,
    MatButtonModule,
    MatDialogModule,
    MatIconModule,
    MatTabsModule,
    MoneyPipe,
    DialogCloseComponent,
    ReimbursementCardComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let r = data.recurring;
    <h2 mat-dialog-title>Historique · {{ r.label }}</h2>
    <mat-dialog-content>
      <p class="muted intro">
        Dépense · {{ frequency }} · {{ r.accountName }} ·
        {{ -r.amount | money: r.currencyCode : true }}
      </p>

      <mat-tab-group
        [selectedIndex]="data.tab === 'operations' ? 1 : 0"
        mat-stretch-tabs="false"
        animationDuration="0ms"
      >
        <mat-tab label="Remboursements">
          <div class="tab">
            @if (tracking(); as t) {
              <app-reimbursement-card [tracking]="t" (changed)="store.transactionsChanged()" />
            }
          </div>
        </mat-tab>
        <mat-tab [label]="operationsLabel()">
          <div class="tab">
            @for (t of operations(); track t.id) {
              <button type="button" class="operation" (click)="open(t)">
                <span class="date">{{ t.operationDate | date: 'dd/MM/yyyy' }}</span>
                <span class="text">
                  {{ t.label }}
                  <span class="muted small">· {{ t.accountName }}</span>
                </span>
                <span class="amount">
                  {{ -t.amount | money: t.currencyCode : true }}
                </span>
              </button>
            } @empty {
              @if (loaded()) {
                <p class="muted">Aucune opération créée pour l'instant.</p>
              }
            }
            @if (operations().length < total()) {
              <button matButton class="more" (click)="more()">
                Afficher {{ Math.min(pageSize, total() - operations().length) }} de plus
              </button>
            }
          </div>
        </mat-tab>
      </mat-tab-group>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button matButton mat-dialog-close>Fermer</button>
    </mat-dialog-actions>
    <app-dialog-close />
  `,
  styles: `
    .intro {
      margin-top: 0;
    }
    .tab {
      padding-top: 16px;
    }
    .small {
      font: var(--mat-sys-body-small);
    }
    .operation {
      display: flex;
      align-items: center;
      gap: 12px;
      width: 100%;
      padding: 10px 4px;
      border: 0;
      border-bottom: 1px solid var(--hermes-border);
      background: none;
      color: inherit;
      font: inherit;
      text-align: left;
      cursor: pointer;
      &:hover {
        background: var(--hermes-surface);
      }
      .date {
        width: 84px;
        flex-shrink: 0;
        color: var(--mat-sys-primary);
        font: var(--mat-sys-label-large);
      }
      .text {
        flex: 1;
        min-width: 0;
      }
    }
    .more {
      margin-top: 8px;
    }
  `,
})
export class RecurringHistoryDialogComponent {
  static open(
    dialog: MatDialog,
    data: RecurringHistoryData,
  ): MatDialogRef<RecurringHistoryDialogComponent> {
    return dialog.open(RecurringHistoryDialogComponent, {
      data,
      width: '900px',
      autoFocus: 'dialog',
    });
  }

  protected readonly data = inject<RecurringHistoryData>(MAT_DIALOG_DATA);
  protected readonly store = inject(DataStore);
  private readonly recurringApi = inject(RecurringApi);
  private readonly transactionApi = inject(TransactionApi);
  private readonly notify = inject(NotifyService);
  private readonly dialog = inject(MatDialog);

  protected readonly Math = Math;
  protected readonly pageSize = PAGE_SIZE;
  protected readonly frequency = frequencyLabel(
    this.data.recurring.frequency,
    this.data.recurring.interval,
  );
  protected readonly tracking = signal<ReimbursementTracking | null>(null);
  protected readonly operations = signal<Transaction[]>([]);
  protected readonly total = signal(0);
  protected readonly loaded = signal(false);

  constructor() {
    // Rechargé après un rattachement ou une modification d'opération
    effect(() => {
      this.store.version();
      untracked(() => this.load());
    });
  }

  protected operationsLabel(): string {
    return this.loaded() ? `Opérations créées (${this.total()})` : 'Opérations créées';
  }

  protected open(transaction: Transaction): void {
    TransactionFormDialogComponent.open(this.dialog, { transaction });
  }

  protected more(): void {
    const page = Math.floor(this.operations().length / PAGE_SIZE);
    this.transactionApi
      .search({ recurringTransactionId: this.data.recurring.id }, page, PAGE_SIZE)
      .subscribe({
        next: (result) => {
          this.operations.update((list) => [...list, ...result.content]);
          this.total.set(result.totalElements);
        },
        error: (error) => this.notify.error(error),
      });
  }

  private load(): void {
    const id = this.data.recurring.id;
    // Garde le même nombre d'opérations affichées après un rechargement
    const size = Math.max(PAGE_SIZE, this.operations().length);
    forkJoin({
      operations: this.transactionApi.search({ recurringTransactionId: id }, 0, size),
      tracking: this.recurringApi.reimbursements(),
    }).subscribe({
      next: ({ operations, tracking }) => {
        this.operations.set(operations.content);
        this.total.set(operations.totalElements);
        this.tracking.set(tracking.find((t) => t.recurringTransactionId === id) ?? null);
        this.loaded.set(true);
      },
      error: (error) => this.notify.error(error),
    });
  }
}
