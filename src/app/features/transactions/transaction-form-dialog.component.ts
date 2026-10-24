import { AsyncPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatAutocompleteModule } from '@angular/material/autocomplete';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MAT_DIALOG_DATA, MatDialog, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSelectModule } from '@angular/material/select';
import { Observable, debounceTime, distinctUntilChanged, of, startWith, switchMap } from 'rxjs';
import { TransactionApi } from '../../core/api';
import { DataStore } from '../../core/data.store';
import { PAYMENT_METHODS, fromIsoDate, toIsoDate } from '../../core/format';
import {
  PayeeSuggestion,
  PaymentMethod,
  Transaction,
  TransactionDirection,
  TransactionRequest,
  TransferRequest,
} from '../../core/models';
import { NotifyService } from '../../core/notify.service';
import { confirm } from '../../shared/confirm-dialog.component';

type Mode = 'DEBIT' | 'CREDIT' | 'TRANSFER';

export interface TransactionFormData {
  transaction?: Transaction;
  accountId?: number;
  mode?: Mode;
}

@Component({
  selector: 'app-transaction-form-dialog',
  imports: [
    AsyncPipe,
    ReactiveFormsModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatDatepickerModule,
    MatButtonModule,
    MatButtonToggleModule,
    MatAutocompleteModule,
    MatCheckboxModule,
    MatIconModule,
    MatProgressBarModule,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './transaction-form-dialog.component.html',
  styles: `
    .mode {
      width: 100%;
      margin-bottom: 20px;
      mat-button-toggle {
        flex: 1;
      }
    }
    .amount-field input {
      font-size: 20px;
      font-variant-numeric: tabular-nums;
    }
    .locked {
      display: flex;
      gap: 8px;
      align-items: center;
      padding: 10px 14px;
      margin-bottom: 16px;
      border-radius: 12px;
      background: var(--mat-sys-tertiary-container);
      color: var(--mat-sys-on-tertiary-container);
      font: var(--mat-sys-body-medium);
    }
    .option-indent {
      display: inline-flex;
      align-items: center;
      gap: 8px;
    }
  `,
})
export class TransactionFormDialogComponent implements OnInit {
  static open(dialog: MatDialog, data: TransactionFormData): MatDialogRef<TransactionFormDialogComponent, boolean> {
    return dialog.open(TransactionFormDialogComponent, { data, width: '640px', maxHeight: '92vh', autoFocus: 'first-tabbable' });
  }

  protected readonly data = inject<TransactionFormData>(MAT_DIALOG_DATA);
  protected readonly store = inject(DataStore);
  private readonly api = inject(TransactionApi);
  private readonly notify = inject(NotifyService);
  private readonly dialog = inject(MatDialog);
  private readonly dialogRef = inject(MatDialogRef<TransactionFormDialogComponent, boolean>);

  protected readonly paymentMethods = PAYMENT_METHODS;
  protected readonly saving = signal(false);
  protected readonly editing = !!this.data.transaction;
  protected readonly reconciled = this.data.transaction?.status === 'RECONCILED';

  protected readonly mode = signal<Mode>(
    this.data.transaction ? (this.data.transaction.transfer ? 'TRANSFER' : this.data.transaction.direction) : (this.data.mode ?? 'DEBIT'),
  );
  // Pour un virement en édition, id de l'opération de débit
  private transferId: number | null = null;

  protected readonly form = new FormGroup({
    accountId: new FormControl<number | null>(null, Validators.required),
    toAccountId: new FormControl<number | null>(null),
    amount: new FormControl<number | null>(null, [Validators.required, Validators.min(0.01)]),
    targetAmount: new FormControl<number | null>(null),
    operationDate: new FormControl<Date | null>(new Date(), Validators.required),
    valueDate: new FormControl<Date | null>(null),
    label: new FormControl('', { nonNullable: true }),
    payee: new FormControl('', { nonNullable: true }),
    categoryId: new FormControl<number | null>(null),
    paymentMethod: new FormControl<PaymentMethod | null>(null),
    notes: new FormControl('', { nonNullable: true }),
    cleared: new FormControl(false, { nonNullable: true }),
  });

  private readonly accountId = toSignal(this.form.controls.accountId.valueChanges, { initialValue: null });
  private readonly toAccountId = toSignal(this.form.controls.toAccountId.valueChanges, { initialValue: null });

  protected readonly accounts = computed(() =>
    this.store.accounts().filter((a) => !a.closed || a.id === this.data.transaction?.accountId),
  );
  protected readonly categoryOptions = computed(() =>
    this.store.categoryOptions(this.mode() === 'CREDIT' ? 'INCOME' : 'EXPENSE'),
  );
  protected readonly currencyCode = computed(() => this.store.account(this.accountId())?.currency.code ?? 'EUR');
  protected readonly targetCurrency = computed(() => this.store.account(this.toAccountId())?.currency.code ?? null);
  protected readonly needsTargetAmount = computed(
    () => this.mode() === 'TRANSFER' && !!this.targetCurrency() && this.targetCurrency() !== this.currencyCode(),
  );

  protected readonly payeeSuggestions: Observable<PayeeSuggestion[]> = this.form.controls.payee.valueChanges.pipe(
    startWith(''),
    debounceTime(200),
    distinctUntilChanged(),
    switchMap((q) => (q.length >= 1 ? this.api.payees(q, 8) : of([]))),
  );

  ngOnInit(): void {
    const t = this.data.transaction;
    if (!t) {
      const accountId = this.data.accountId ?? this.store.openAccounts()[0]?.id ?? null;
      this.form.patchValue({ accountId });
      return;
    }

    this.form.patchValue({
      accountId: t.accountId,
      amount: t.amount,
      operationDate: fromIsoDate(t.operationDate),
      valueDate: fromIsoDate(t.valueDate),
      label: t.label,
      payee: t.payee ?? '',
      categoryId: t.category?.id ?? null,
      paymentMethod: t.paymentMethod,
      notes: t.notes ?? '',
      cleared: t.status !== 'PENDING',
    });

    if (t.transfer) {
      // On recharge le virement complet pour connaître les deux côtés
      this.api.getTransfer(t.id).subscribe((transfer) => {
        this.transferId = transfer.debit.id;
        this.form.patchValue({
          accountId: transfer.debit.accountId,
          toAccountId: transfer.credit.accountId,
          amount: transfer.debit.amount,
          targetAmount: transfer.credit.amount,
        });
      });
    }
    if (this.reconciled) {
      this.form.controls.accountId.disable();
      this.form.controls.amount.disable();
      this.form.controls.operationDate.disable();
      this.form.controls.cleared.disable();
    }
  }

  protected setMode(mode: Mode): void {
    if (this.editing && (mode === 'TRANSFER') !== (this.mode() === 'TRANSFER')) {
      return;
    }
    this.mode.set(mode);
    this.form.controls.categoryId.setValue(null);
  }

  protected selectPayee(suggestion: PayeeSuggestion): void {
    if (!this.form.controls.categoryId.value && suggestion.lastCategoryId) {
      const option = this.store.categoryOption(suggestion.lastCategoryId);
      if (option && option.category.type === (this.mode() === 'CREDIT' ? 'INCOME' : 'EXPENSE')) {
        this.form.controls.categoryId.setValue(suggestion.lastCategoryId);
      }
    }
    if (!this.form.controls.label.value) {
      this.form.controls.label.setValue(suggestion.payee);
    }
  }

  protected save(): void {
    this.form.markAllAsTouched();
    const v = this.form.getRawValue();
    if (this.form.invalid || !v.accountId || !v.amount || !v.operationDate) {
      return;
    }

    let request$: Observable<unknown>;
    if (this.mode() === 'TRANSFER') {
      if (!v.toAccountId) {
        this.notify.error('Choisissez le compte crédité');
        return;
      }
      const request: TransferRequest = {
        fromAccountId: v.accountId,
        toAccountId: v.toAccountId,
        amount: v.amount,
        targetAmount: this.needsTargetAmount() ? v.targetAmount : null,
        label: v.label.trim() || null,
        notes: v.notes.trim() || null,
        operationDate: toIsoDate(v.operationDate)!,
      };
      request$ = this.transferId ? this.api.updateTransfer(this.transferId, request) : this.api.createTransfer(request);
    } else {
      const label = v.label.trim() || v.payee.trim();
      if (!label) {
        this.notify.error('Indiquez un libellé ou un tiers');
        return;
      }
      const request: TransactionRequest = {
        accountId: v.accountId,
        direction: this.mode() as TransactionDirection,
        amount: v.amount,
        label,
        payee: v.payee.trim() || null,
        notes: v.notes.trim() || null,
        categoryId: v.categoryId,
        paymentMethod: v.paymentMethod,
        operationDate: toIsoDate(v.operationDate)!,
        valueDate: toIsoDate(v.valueDate),
        status: this.reconciled ? undefined : v.cleared ? 'CLEARED' : 'PENDING',
      };
      request$ = this.data.transaction
        ? this.api.update(this.data.transaction.id, request)
        : this.api.create(request);
    }

    this.saving.set(true);
    request$.subscribe({
      next: () => {
        this.notify.success(this.editing ? 'Opération modifiée' : 'Opération enregistrée');
        this.store.transactionsChanged();
        this.dialogRef.close(true);
      },
      error: (error) => {
        this.saving.set(false);
        this.notify.error(error);
      },
    });
  }

  protected delete(): void {
    const t = this.data.transaction!;
    confirm(this.dialog, {
      title: "Supprimer l'opération",
      message: t.transfer
        ? 'Les deux opérations du virement seront supprimées.'
        : `« ${t.label} » sera définitivement supprimée.`,
      confirmLabel: 'Supprimer',
      danger: true,
    }).subscribe((ok) => {
      if (!ok) {
        return;
      }
      this.api.delete(t.id).subscribe({
        next: () => {
          this.notify.success('Opération supprimée');
          this.store.transactionsChanged();
          this.dialogRef.close(true);
        },
        error: (error) => this.notify.error(error),
      });
    });
  }
}
