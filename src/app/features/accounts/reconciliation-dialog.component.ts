import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MAT_DIALOG_DATA, MatDialog, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { forkJoin } from 'rxjs';
import { AccountApi } from '../../core/api';
import { DataStore } from '../../core/data.store';
import { toIsoDate } from '../../core/format';
import { Account, Reconciliation, ReconciliationStatus } from '../../core/models';
import { NotifyService } from '../../core/notify.service';
import { confirm } from '../../shared/confirm-dialog.component';
import { MoneyPipe } from '../../shared/money.pipe';

@Component({
  selector: 'app-reconciliation-dialog',
  imports: [
    FormsModule,
    DatePipe,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatDatepickerModule,
    MatButtonModule,
    MatIconModule,
    MoneyPipe,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h2 mat-dialog-title>Rapprochement bancaire — {{ account.name }}</h2>
    <mat-dialog-content>
      <p class="muted">
        Pointez dans la liste les opérations présentes sur votre relevé, puis saisissez le solde du relevé. Quand le
        solde pointé correspond, les opérations pointées sont rapprochées et verrouillées.
      </p>

      @if (status(); as s) {
        <div class="grid grid-3 summary">
          <div class="kpi">
            <div class="label">Solde pointé</div>
            <div class="value amount">{{ s.clearedBalance | money: currency }}</div>
            <div class="delta muted">{{ s.clearedCount }} opération(s) pointée(s) à rapprocher</div>
          </div>
          <div class="kpi">
            <div class="label">Solde du relevé</div>
            <div class="value amount">{{ statementBalance() ?? 0 | money: currency }}</div>
          </div>
          <div class="kpi">
            <div class="label">Écart</div>
            <div class="value amount" [class.positive]="difference() === 0" [class.negative]="difference() !== 0">
              {{ difference() | money: currency }}
            </div>
          </div>
        </div>

        <div class="form-grid">
          <mat-form-field>
            <mat-label>Date du relevé</mat-label>
            <input matInput [matDatepicker]="picker" [(ngModel)]="statementDate" />
            <mat-datepicker-toggle matIconSuffix [for]="picker" />
            <mat-datepicker #picker />
          </mat-form-field>
          <mat-form-field>
            <mat-label>Solde du relevé</mat-label>
            <input matInput type="number" step="0.01" [ngModel]="statementBalance()" (ngModelChange)="statementBalance.set($event)" />
            <span matTextSuffix>&nbsp;{{ currency }}</span>
          </mat-form-field>
        </div>
      }

      @if (history().length > 0) {
        <h3>Historique</h3>
        <div class="history">
          @for (r of history(); track r.id; let first = $first) {
            <div class="history-row">
              <mat-icon class="muted">task_alt</mat-icon>
              <span>Relevé du {{ r.statementDate | date: 'dd/MM/yyyy' }}</span>
              <span class="amount">{{ r.statementBalance | money: currency }}</span>
              <span class="muted">{{ r.transactionCount }} opération(s)</span>
              <span class="spacer"></span>
              @if (first) {
                <button matButton (click)="undo(r)"><mat-icon>undo</mat-icon> Annuler</button>
              }
            </div>
          }
        </div>
      }
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button matButton mat-dialog-close>Fermer</button>
      <button matButton="filled" [disabled]="difference() !== 0 || !statementDate || saving()" (click)="reconcile()">
        Rapprocher
      </button>
    </mat-dialog-actions>
  `,
  styles: `
    .summary {
      margin: 16px 0 24px;
    }
    h3 {
      font: var(--mat-sys-title-small);
      margin: 16px 0 8px;
    }
    .history-row {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 6px 0;
      border-bottom: 1px solid var(--hermes-border);
    }
  `,
})
export class ReconciliationDialogComponent implements OnInit {
  static open(dialog: MatDialog, account: Account): MatDialogRef<ReconciliationDialogComponent, boolean> {
    return dialog.open(ReconciliationDialogComponent, { data: account, width: '680px' });
  }

  protected readonly account = inject<Account>(MAT_DIALOG_DATA);
  private readonly api = inject(AccountApi);
  private readonly store = inject(DataStore);
  private readonly notify = inject(NotifyService);
  private readonly dialog = inject(MatDialog);
  private readonly dialogRef = inject(MatDialogRef<ReconciliationDialogComponent, boolean>);

  protected readonly currency = this.account.currency.code;
  protected readonly status = signal<ReconciliationStatus | null>(null);
  protected readonly history = signal<Reconciliation[]>([]);
  protected readonly statementBalance = signal<number | null>(null);
  protected readonly saving = signal(false);
  protected statementDate: Date | null = new Date();

  protected readonly difference = computed(() => {
    const cleared = this.status()?.clearedBalance ?? 0;
    return Math.round(((this.statementBalance() ?? 0) - cleared) * 100) / 100;
  });

  ngOnInit(): void {
    this.load();
  }

  private load(): void {
    forkJoin({
      status: this.api.reconciliationStatus(this.account.id),
      history: this.api.reconciliations(this.account.id),
    }).subscribe({
      next: ({ status, history }) => {
        this.status.set(status);
        this.history.set(history);
        if (this.statementBalance() === null) {
          this.statementBalance.set(status.clearedBalance);
        }
      },
      error: (error) => this.notify.error(error),
    });
  }

  protected reconcile(): void {
    this.saving.set(true);
    this.api.reconcile(this.account.id, toIsoDate(this.statementDate)!, this.statementBalance() ?? 0).subscribe({
      next: (r) => {
        this.notify.success(`${r.transactionCount} opération(s) rapprochée(s)`);
        this.store.transactionsChanged();
        this.dialogRef.close(true);
      },
      error: (error) => {
        this.saving.set(false);
        this.notify.error(error);
      },
    });
  }

  protected undo(reconciliation: Reconciliation): void {
    confirm(this.dialog, {
      title: 'Annuler le rapprochement',
      message: 'Les opérations de ce rapprochement redeviendront simplement pointées.',
      confirmLabel: 'Annuler le rapprochement',
    }).subscribe((ok) => {
      if (!ok) {
        return;
      }
      this.api.undoReconciliation(this.account.id, reconciliation.id).subscribe({
        next: () => {
          this.store.transactionsChanged();
          this.load();
        },
        error: (error) => this.notify.error(error),
      });
    });
  }
}
