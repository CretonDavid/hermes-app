import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import {
  MAT_DIALOG_DATA,
  MatDialog,
  MatDialogModule,
  MatDialogRef,
} from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatRadioModule } from '@angular/material/radio';
import { subMonths } from 'date-fns';
import { RecurringApi, TransactionApi } from '../../core/api';
import { fromIsoDate, reimbursementPeriodLabel, toIsoDate } from '../../core/format';
import {
  PayerTracking,
  ReimbursementPeriodStatus,
  ReimbursementTracking,
  Transaction,
} from '../../core/models';
import { NotifyService } from '../../core/notify.service';
import { DIALOG_LARGE } from '../../shared/confirm-dialog.component';
import { DialogCloseComponent } from '../../shared/dialog-close.component';
import { MoneyPipe } from '../../shared/money.pipe';

export interface ReimbursementLinkData {
  tracking: ReimbursementTracking;
  payer: PayerTracking;
  period: ReimbursementPeriodStatus;
}

/**
 * Choix de l'opération reçue qui rembourse une période : les revenus depuis trois mois avant le
 * début de la période, dans la devise de la dépense.
 */
@Component({
  selector: 'app-reimbursement-link-dialog',
  imports: [
    DatePipe,
    MatDialogModule,
    DialogCloseComponent,
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatRadioModule,
    MoneyPipe,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h2 mat-dialog-title>Rattacher un remboursement</h2>
    <mat-dialog-content>
      <p class="intro">
        <strong>{{ data.tracking.label }} · {{ periodName }}</strong><br />
        <span class="muted">
          Dû par {{ data.payer.name }} :
          {{ data.period.due | money: data.tracking.currencyCode }}
          @if (data.period.received > 0) {
            · déjà reçu {{ data.period.received | money: data.tracking.currencyCode }}
          }
          · reste {{ data.period.remaining | money: data.tracking.currencyCode }}
        </span>
      </p>

      <mat-form-field class="search" subscriptSizing="dynamic">
        <mat-label>Rechercher (libellé, bénéficiaire, montant)</mat-label>
        <mat-icon matIconPrefix>search</mat-icon>
        <input matInput [value]="query()" (input)="query.set($any($event.target).value)" />
      </mat-form-field>

      @if (loading()) {
        <p class="muted">Chargement des opérations reçues…</p>
      } @else {
        <mat-radio-group
          class="list"
          [value]="selected()"
          (change)="selected.set($event.value)"
          aria-label="Opération reçue"
        >
          @for (t of candidates(); track t.id) {
            <mat-radio-button [value]="t.id" class="row">
              <span class="line">
                <span class="date">{{ t.operationDate | date: 'dd/MM/yyyy' }}</span>
                <span class="text">
                  <span>{{ t.label }}</span>
                  <span class="muted small">
                    {{ t.accountName }}{{ t.payee ? ' · ' + t.payee : '' }}
                    @if (t.reimbursement) {
                      · déjà rattachée à « {{ t.reimbursement.label }} »
                    }
                  </span>
                </span>
                <span class="amount positive">
                  {{ t.amount | money: t.currencyCode : true }}
                </span>
              </span>
            </mat-radio-button>
          } @empty {
            <p class="muted">
              Aucune opération reçue en {{ data.tracking.currencyCode }} depuis le
              {{ from | date: 'dd/MM/yyyy' }}{{ query() ? ' pour cette recherche' : '' }}.
            </p>
          }
        </mat-radio-group>
      }
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button matButton mat-dialog-close>Annuler</button>
      <button matButton="filled" (click)="save()" [disabled]="!selected() || saving()">
        Rattacher
      </button>
    </mat-dialog-actions>
    <app-dialog-close />
  `,
  styles: `
    .intro {
      margin: 0 0 16px;
    }
    .search {
      width: 100%;
      margin-bottom: 8px;
    }
    .list {
      display: flex;
      flex-direction: column;
    }
    .row {
      border-bottom: 1px solid var(--hermes-border);
      padding: 4px 0;
      ::ng-deep .mdc-form-field {
        width: 100%;
      }
      ::ng-deep .mdc-label {
        flex: 1;
        cursor: pointer;
      }
    }
    .line {
      display: flex;
      align-items: center;
      gap: 12px;
      width: 100%;
    }
    .date {
      width: 84px;
      flex-shrink: 0;
    }
    .text {
      flex: 1;
      display: flex;
      flex-direction: column;
      min-width: 0;
    }
    .small {
      font: var(--mat-sys-body-small);
    }
  `,
})
export class ReimbursementLinkDialogComponent {
  static open(
    dialog: MatDialog,
    data: ReimbursementLinkData,
  ): MatDialogRef<ReimbursementLinkDialogComponent, boolean> {
    return dialog.open(ReimbursementLinkDialogComponent, {
      data,
      width: DIALOG_LARGE,
      autoFocus: 'input',
    });
  }

  protected readonly data = inject<ReimbursementLinkData>(MAT_DIALOG_DATA);
  private readonly recurringApi = inject(RecurringApi);
  private readonly transactionApi = inject(TransactionApi);
  private readonly notify = inject(NotifyService);
  private readonly dialogRef = inject(MatDialogRef<ReimbursementLinkDialogComponent, boolean>);

  protected readonly periodName = reimbursementPeriodLabel(
    this.data.payer.period,
    this.data.period.start,
  );
  protected readonly from = subMonths(fromIsoDate(this.data.period.start)!, 3);
  protected readonly loading = signal(true);
  protected readonly saving = signal(false);
  protected readonly query = signal('');
  protected readonly selected = signal<number | null>(null);
  private readonly incomes = signal<Transaction[]>([]);

  // Les remboursements déjà rattachés à cette période ne sont pas proposés
  protected readonly candidates = computed(() => {
    const linked = new Set(this.data.period.payments.map((p) => p.transactionId));
    const q = this.query().trim().toLowerCase().replace(',', '.');
    return this.incomes().filter(
      (t) =>
        t.currencyCode === this.data.tracking.currencyCode &&
        !linked.has(t.id) &&
        (!q ||
          t.label.toLowerCase().includes(q) ||
          (t.payee ?? '').toLowerCase().includes(q) ||
          t.amount.toFixed(2).includes(q)),
    );
  });

  constructor() {
    this.transactionApi
      .search({ kind: 'INCOME', from: toIsoDate(this.from)!, to: toIsoDate(new Date())! }, 0, 500)
      .subscribe({
        next: (page) => {
          this.incomes.set(page.content);
          this.loading.set(false);
        },
        error: (error) => {
          this.loading.set(false);
          this.notify.error(error);
        },
      });
  }

  protected save(): void {
    const id = this.selected();
    if (!id) {
      return;
    }
    this.saving.set(true);
    this.recurringApi
      .linkReimbursement(
        this.data.tracking.recurringTransactionId,
        this.data.payer.payerId,
        id,
        this.data.period.start,
      )
      .subscribe({
        next: () => {
          this.notify.success('Remboursement rattaché');
          this.dialogRef.close(true);
        },
        error: (error) => {
          this.saving.set(false);
          this.notify.error(error);
        },
      });
  }
}
