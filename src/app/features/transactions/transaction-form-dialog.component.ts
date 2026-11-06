import { AsyncPipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatAutocompleteModule } from '@angular/material/autocomplete';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatDatepickerModule } from '@angular/material/datepicker';
import {
  MAT_DIALOG_DATA,
  MatDialog,
  MatDialogModule,
  MatDialogRef,
} from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSelectModule } from '@angular/material/select';
import { MatTooltipModule } from '@angular/material/tooltip';
import {
  Observable,
  debounceTime,
  distinctUntilChanged,
  map,
  of,
  startWith,
  switchMap,
} from 'rxjs';
import { TransactionApi } from '../../core/api';
import { DataStore } from '../../core/data.store';
import { PAYMENT_METHODS, fromIsoDate, toIsoDate } from '../../core/format';
import {
  PayeeSuggestion,
  PaymentMethod,
  Transaction,
  TransactionDirection,
  TransactionRequest,
  Transfer,
  TransferRequest,
} from '../../core/models';
import { NotifyService } from '../../core/notify.service';
import { CategoryPickerComponent } from '../../shared/category-picker.component';
import { AmountInputDirective } from '../../shared/amount-input.directive';
import { DIALOG_LARGE, confirm } from '../../shared/confirm-dialog.component';
import { MoneyPipe } from '../../shared/money.pipe';
import { DialogCloseComponent } from '../../shared/dialog-close.component';
import { protectDirtyForm } from '../../shared/dialog-guard';
import { customTransferLabel } from './transfer-label';
import { setRequired } from '../../shared/required';

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
    DialogCloseComponent,
    AmountInputDirective,
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
    MatTooltipModule,
    MoneyPipe,
    CategoryPickerComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './transaction-form-dialog.component.html',
  styleUrl: './transaction-form-dialog.component.scss',
})
export class TransactionFormDialogComponent implements OnInit {
  static open(
    dialog: MatDialog,
    data: TransactionFormData,
  ): MatDialogRef<TransactionFormDialogComponent, boolean> {
    // Le curseur se place directement sur le montant à la création
    const autoFocus = data.transaction ? 'dialog' : 'input[formcontrolname="amount"]';
    return dialog.open(TransactionFormDialogComponent, {
      data,
      width: DIALOG_LARGE,
      autoFocus,
    });
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
    this.data.transaction
      ? this.data.transaction.transfer
        ? 'TRANSFER'
        : this.data.transaction.direction
      : (this.data.mode ?? 'DEBIT'),
  );
  // Les champs secondaires sont repliés à la création pour garder une saisie rapide
  protected readonly showDetails = signal(this.editing);
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

  private readonly accountId = toSignal(this.form.controls.accountId.valueChanges, {
    initialValue: null,
  });
  private readonly toAccountId = toSignal(this.form.controls.toAccountId.valueChanges, {
    initialValue: null,
  });
  private readonly amount = toSignal(this.form.controls.amount.valueChanges, {
    initialValue: null,
  });
  private readonly payee = toSignal(this.form.controls.payee.valueChanges, { initialValue: '' });

  constructor() {
    protectDirtyForm(this.form);
    effect(() => {
      const transfer = this.mode() === 'TRANSFER';
      // Le bénéficiaire n'est obligatoire que si aucun libellé ne permet d'identifier l'opération
      setRequired(this.form.controls.payee, !transfer && !this.label().trim());
      setRequired(this.form.controls.toAccountId, transfer);
    });
  }

  protected readonly accounts = computed(() =>
    this.store.accounts().filter((a) => !a.closed || a.id === this.data.transaction?.accountId),
  );
  protected readonly canTransfer = computed(() => this.store.openAccounts().length >= 2);
  protected readonly categoryType = computed(() =>
    this.mode() === 'CREDIT' ? 'INCOME' : 'EXPENSE',
  );
  protected readonly currencyCode = computed(
    () => this.store.account(this.accountId())?.currency.code ?? 'EUR',
  );
  protected readonly fromAccount = computed(() => this.store.account(this.accountId()));
  protected readonly toAccount = computed(() => this.store.account(this.toAccountId()));
  protected readonly needsTargetAmount = computed(
    () =>
      this.mode() === 'TRANSFER' &&
      !!this.toAccount() &&
      this.toAccount()!.currency.code !== this.currencyCode(),
  );
  protected readonly amountValue = computed(() => this.amount() ?? 0);
  protected readonly labelPlaceholder = computed(
    () => this.payee().trim() || 'Par défaut : le bénéficiaire',
  );
  private readonly label = toSignal(this.form.controls.label.valueChanges, { initialValue: '' });
  protected readonly transferLockedHint =
    "Une opération et un virement ne sont pas interchangeables : supprimez celle-ci et créez-en une nouvelle pour changer de nature.";

  protected readonly payeeSuggestions: Observable<PayeeSuggestion[]> =
    this.form.controls.payee.valueChanges.pipe(
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
      if (this.mode() === 'TRANSFER') {
        this.form.patchValue({
          toAccountId: this.store.openAccounts().find((a) => a.id !== accountId)?.id ?? null,
        });
      }
      return;
    }

    this.form.patchValue({
      accountId: t.accountId,
      amount: t.amount,
      operationDate: fromIsoDate(t.operationDate),
      valueDate: fromIsoDate(t.valueDate),
      // Un libellé identique au tiers n'apporte rien : on le laisse vide
      label: t.label === t.payee ? '' : t.label,
      payee: t.payee ?? '',
      categoryId: t.category?.id ?? null,
      paymentMethod: t.paymentMethod,
      notes: t.notes ?? '',
      cleared: t.status !== 'PENDING',
    });
    if (!t.payee && !t.transfer) {
      // Opération sans tiers (import par exemple) : le libellé est l'information principale
      this.form.patchValue({ payee: '', label: t.label });
    }

    if (t.transfer) {
      // On recharge le virement complet pour connaître les deux côtés
      this.api.getTransfer(t.id).subscribe((transfer) => {
        this.transferId = transfer.debit.id;
        this.form.patchValue({
          accountId: transfer.debit.accountId,
          toAccountId: transfer.credit.accountId,
          amount: transfer.debit.amount,
          targetAmount: transfer.credit.amount,
          label: customTransferLabel(transfer) ?? '',
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
    if (mode === 'TRANSFER' && !this.form.controls.toAccountId.value) {
      const other = this.store
        .openAccounts()
        .find((a) => a.id !== this.form.controls.accountId.value);
      this.form.controls.toAccountId.setValue(other?.id ?? null);
    }
  }

  protected selectPayee(suggestion: PayeeSuggestion): void {
    if (!this.form.controls.categoryId.value && suggestion.lastCategoryId) {
      const option = this.store.categoryOption(suggestion.lastCategoryId);
      if (option && option.category.type === this.categoryType()) {
        this.form.controls.categoryId.setValue(suggestion.lastCategoryId);
      }
    }
  }

  protected swapAccounts(): void {
    const { accountId, toAccountId } = this.form.getRawValue();
    this.form.patchValue({ accountId: toAccountId, toAccountId: accountId });
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
        this.notify.error('Choisissez le compte bancaire qui reçoit le virement');
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
      request$ = this.transferId
        ? this.api.updateTransfer(this.transferId, request)
        : this.api.createTransfer(request);
    } else {
      const label = v.label.trim() || v.payee.trim();
      if (!label) {
        this.notify.error('Indiquez au moins un bénéficiaire ou un libellé');
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
        ? 'Les deux côtés du virement seront supprimés.'
        : `« ${t.label} » sera définitivement supprimée.`,
      confirmLabel: 'Supprimer',
      danger: true,
    }).subscribe((ok) => {
      if (!ok) {
        return;
      }
      // Le virement complet doit être lu avant sa suppression pour pouvoir le recréer
      const transfer$: Observable<Transfer | null> = t.transfer
        ? this.api.getTransfer(t.id)
        : of(null);
      transfer$
        .pipe(switchMap((transfer) => this.api.delete(t.id).pipe(map(() => transfer))))
        .subscribe({
          next: (transfer) => {
            this.notify.successWithUndo('Opération supprimée', () => this.restore(t, transfer));
            this.store.transactionsChanged();
            this.dialogRef.close(true);
          },
          error: (error) => this.notify.error(error),
        });
    });
  }

  private restore(t: Transaction, transfer: Transfer | null): void {
    const request$: Observable<unknown> = transfer
      ? this.api.createTransfer({
          fromAccountId: transfer.debit.accountId,
          toAccountId: transfer.credit.accountId,
          amount: transfer.debit.amount,
          targetAmount: transfer.credit.amount,
          label: customTransferLabel(transfer),
          notes: transfer.debit.notes,
          operationDate: transfer.debit.operationDate,
        })
      : this.api.create({
          accountId: t.accountId,
          direction: t.direction,
          amount: t.amount,
          label: t.label,
          payee: t.payee,
          notes: t.notes,
          categoryId: t.category?.id ?? null,
          paymentMethod: t.paymentMethod,
          operationDate: t.operationDate,
          valueDate: t.valueDate,
          status: t.status === 'CLEARED' ? 'CLEARED' : 'PENDING',
        });
    request$.subscribe({
      next: () => {
        this.notify.success('Opération rétablie');
        this.store.transactionsChanged();
      },
      error: (error) => this.notify.error(error),
    });
  }
}
