import { AsyncPipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormArray, FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
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
import { AFTER_SAVE_ERRORS, showFormErrors } from '../../shared/form-errors';
import { GoalApi, TransactionApi } from '../../core/api';
import { DataStore } from '../../core/data.store';
import { PAYMENT_METHODS, fromIsoDate, toIsoDate } from '../../core/format';
import {
  Goal,
  GoalAllocationRequest,
  PayeeSuggestion,
  PaymentMethod,
  Transaction,
  TransactionDirection,
  TransactionRequest,
  TransactionSplitRequest,
  TransactionStatus,
  Transfer,
  TransferRequest,
} from '../../core/models';
import { NotifyService } from '../../core/notify.service';
import { CategoryPickerComponent } from '../../shared/category-picker.component';
import { ceilingOverflow } from '../../shared/ceiling';
import { AmountInputDirective } from '../../shared/amount-input.directive';
import { DIALOG_LARGE, confirm } from '../../shared/confirm-dialog.component';
import { MoneyPipe } from '../../shared/money.pipe';
import { DialogCloseComponent } from '../../shared/dialog-close.component';
import { protectDirtyForm } from '../../shared/dialog-guard';
import { customTransferLabel } from './transfer-label';
import { setRequired } from '../../shared/required';

type Mode = 'DEBIT' | 'CREDIT' | 'TRANSFER';

// Ligne d'une ventilation : la dernière prend automatiquement le reste du montant
type SplitRow = FormGroup<{
  categoryId: FormControl<number | null>;
  label: FormControl<string>;
  amount: FormControl<number | null>;
}>;

const round2 = (value: number) => Math.round(value * 100) / 100;

// Affectations d'une opération aux budgets spéciaux, par budget
const allocationMap = (t: Transaction) =>
  new Map(t.goalAllocations.map((a) => [a.goalId, a.amount]));

const allocationRequests = (t: Transaction): GoalAllocationRequest[] =>
  t.goalAllocations.map((a) => ({ goalId: a.goalId, amount: a.amount }));

export interface TransactionFormData {
  transaction?: Transaction;
  accountId?: number;
  mode?: Mode;
}

function initialMode(data: TransactionFormData): Mode {
  const transaction = data.transaction;
  if (!transaction) {
    return data.mode ?? 'DEBIT';
  }
  return transaction.transfer ? 'TRANSFER' : transaction.direction;
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
  private readonly goalApi = inject(GoalApi);
  private readonly notify = inject(NotifyService);
  private readonly dialog = inject(MatDialog);
  private readonly dialogRef = inject(MatDialogRef<TransactionFormDialogComponent, boolean>);

  protected readonly paymentMethods = PAYMENT_METHODS;
  protected readonly saving = signal(false);
  protected readonly editing = !!this.data.transaction;
  protected readonly reconciled = this.data.transaction?.status === 'RECONCILED';

  protected readonly mode = signal<Mode>(initialMode(this.data));
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
    // Ventilation sur plusieurs catégories : vide tant que l'opération n'est pas ventilée
    splits: new FormArray<SplitRow>([]),
    // Montant affecté à chaque budget spécial du compte crédité, dans l'ordre de accountGoals()
    goalAmounts: new FormArray<FormControl<number | null>>([]),
    paymentMethod: new FormControl<PaymentMethod | null>(null),
    notes: new FormControl('', { nonNullable: true }),
    cleared: new FormControl(false, { nonNullable: true }),
  });

  protected readonly splitting = signal(false);
  // Le message sous la ventilation guide la saisie : les montants ne passent en rouge qu'à l'enregistrement
  protected readonly splitErrors = AFTER_SAVE_ERRORS;
  private readonly splitValues = toSignal(this.form.controls.splits.valueChanges, {
    initialValue: [],
  });
  // Montant de la dernière ligne : ce que les autres lignes laissent du montant de l'opération.
  // Recalculé à chaque changement, même à valeur égale, pour suivre l'ajout et le retrait de lignes
  protected readonly splitRemainder = computed(
    () => {
      this.splitValues();
      const rows = this.form.controls.splits.controls;
      const others = rows
        .slice(0, -1)
        .reduce((sum, row) => sum + (row.controls.amount.value ?? 0), 0);
      return round2(this.amountValue() - others);
    },
    { equal: () => false },
  );

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
    effect(() => {
      const remainder = this.splitRemainder();
      this.form.controls.splits.controls
        .at(-1)
        ?.controls.amount.setValue(remainder > 0 ? remainder : null, { emitEvent: false });
    });
    // Un champ par budget spécial du compte crédité, rempli des affectations déjà enregistrées
    effect(() => {
      const goals = this.accountGoals();
      const saved = this.savedAllocations();
      untracked(() => {
        const amounts = this.form.controls.goalAmounts;
        amounts.clear({ emitEvent: false });
        for (const goal of goals) {
          const capacity = this.goalCapacity(goal);
          const control = new FormControl<number | null>(saved.get(goal.id) ?? null, [
            Validators.min(0.01),
            Validators.max(capacity),
          ]);
          if (capacity <= 0) {
            control.disable({ emitEvent: false });
          }
          amounts.push(control, { emitEvent: false });
        }
        amounts.updateValueAndValidity();
      });
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
  private readonly targetAmount = toSignal(this.form.controls.targetAmount.valueChanges, {
    initialValue: null,
  });
  // En modification, le versement déjà enregistré est compris dans le solde : on le retire
  private readonly previousCredit = signal<{ accountId: number; amount: number } | null>(null);

  // Avertit (sans bloquer : les intérêts peuvent dépasser) quand le versement ferait
  // dépasser le plafond du compte bancaire qui le reçoit
  protected readonly ceilingWarning = computed(() => {
    const mode = this.mode();
    const account = mode === 'TRANSFER' ? this.toAccount() : this.fromAccount();
    if (mode === 'DEBIT' || !account?.ceiling) {
      return null;
    }
    const credit = this.needsTargetAmount() ? this.targetAmount() : this.amount();
    const previous = this.previousCredit();
    const base = account.balance - (previous?.accountId === account.id ? previous.amount : 0);
    const overflow = ceilingOverflow(base, account.ceiling, credit ?? 0);
    return overflow > 0 ? { account, overflow, currency: account.currency.code } : null;
  });
  // ---------- Budgets spéciaux ----------

  private readonly goals = signal<Goal[]>([]);
  // Affectations déjà enregistrées de l'opération modifiée, par budget
  private readonly savedAllocations = signal(new Map<number, number>());
  // Compte crédité : celui d'un revenu, ou celui qui reçoit le virement
  protected readonly creditAccount = computed(() => {
    const mode = this.mode();
    if (mode === 'DEBIT') {
      return undefined;
    }
    return mode === 'TRANSFER' ? this.toAccount() : this.fromAccount();
  });
  protected readonly accountGoals = computed(() => {
    const account = this.creditAccount();
    return account ? this.goals().filter((g) => g.accountId === account.id && !g.usedDate) : [];
  });
  private readonly goalValues = toSignal(this.form.controls.goalAmounts.valueChanges, {
    initialValue: [],
  });
  // Montant crédité, inconnu pour un virement entre devises converti automatiquement
  private readonly creditedAmount = computed(() =>
    this.needsTargetAmount() ? this.targetAmount() : this.amount(),
  );
  protected readonly allocationExcess = computed(() => {
    this.goalValues();
    const credited = this.creditedAmount();
    const allocated = this.form.controls.goalAmounts
      .getRawValue()
      .reduce<number>((sum, value) => sum + (value ?? 0), 0);
    return credited === null ? 0 : round2(allocated - credited);
  });

  // Ce qu'un budget peut encore recevoir de cette opération, ses affectations actuelles comprises
  protected goalCapacity(goal: Goal): number {
    return round2(goal.remaining + (this.savedAllocations().get(goal.id) ?? 0));
  }

  private allocationsToSave(): GoalAllocationRequest[] | null {
    if (this.allocationExcess() > 0) {
      this.notify.error('Les montants affectés aux budgets spéciaux dépassent le montant crédité');
      return null;
    }
    const values = this.form.controls.goalAmounts.getRawValue();
    return this.accountGoals()
      .map((goal, index) => ({ goalId: goal.id, amount: values[index] ?? 0 }))
      .filter((allocation) => allocation.amount > 0);
  }

  protected readonly labelPlaceholder = computed(
    () => this.payee().trim() || 'Par défaut : le bénéficiaire',
  );
  private readonly label = toSignal(this.form.controls.label.valueChanges, { initialValue: '' });
  protected readonly transferLockedHint =
    'Une opération et un virement ne sont pas interchangeables : supprimez celle-ci et créez-en une nouvelle pour changer de nature.';

  protected readonly payeeSuggestions: Observable<PayeeSuggestion[]> =
    this.form.controls.payee.valueChanges.pipe(
      startWith(''),
      debounceTime(200),
      distinctUntilChanged(),
      switchMap((q) => (q.length >= 1 ? this.api.payees(q, 8) : of([]))),
    );

  ngOnInit(): void {
    this.goalApi.list().subscribe({
      next: (goals) => this.goals.set(goals),
      error: (error) => this.notify.error(error),
    });
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
    if (!t.transfer) {
      this.savedAllocations.set(allocationMap(t));
    }
    if (t.splits.length) {
      for (const split of t.splits) {
        this.form.controls.splits.push(
          this.splitRow(split.category?.id ?? null, split.amount, split.label ?? ''),
        );
      }
      this.refreshSplitRows();
      this.splitting.set(true);
    }
    if (t.direction === 'CREDIT' && !t.transfer) {
      this.previousCredit.set({ accountId: t.accountId, amount: t.amount });
    }
    if (!t.payee && !t.transfer) {
      // Opération sans tiers (import par exemple) : le libellé est l'information principale
      this.form.patchValue({ payee: '', label: t.label });
    }

    if (t.transfer) {
      // On recharge le virement complet pour connaître les deux côtés
      this.api.getTransfer(t.id).subscribe((transfer) => {
        this.savedAllocations.set(allocationMap(transfer.credit));
        this.transferId = transfer.debit.id;
        this.previousCredit.set({
          accountId: transfer.credit.accountId,
          amount: transfer.credit.amount,
        });
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
    // Les catégories de dépense et de revenu sont distinctes
    for (const row of this.form.controls.splits.controls) {
      row.controls.categoryId.setValue(null);
    }
    if (mode === 'TRANSFER' && !this.form.controls.toAccountId.value) {
      const other = this.store
        .openAccounts()
        .find((a) => a.id !== this.form.controls.accountId.value);
      this.form.controls.toAccountId.setValue(other?.id ?? null);
    }
  }

  // ---------- Ventilation ----------

  protected startSplit(): void {
    const rows = this.form.controls.splits;
    rows.clear();
    // La catégorie déjà choisie devient la première ligne
    rows.push(this.splitRow(this.form.controls.categoryId.value, null));
    rows.push(this.splitRow(null, null));
    this.form.controls.categoryId.setValue(null);
    this.refreshSplitRows();
    this.splitting.set(true);
    this.form.markAsDirty();
  }

  protected cancelSplit(): void {
    const first = this.form.controls.splits.at(0)?.controls.categoryId.value ?? null;
    this.form.controls.splits.clear();
    this.splitting.set(false);
    this.form.controls.categoryId.setValue(first);
    this.form.markAsDirty();
  }

  // La nouvelle ligne s'ajoute à la fin et reçoit le reste : l'ancienne dernière ligne devient
  // saisissable, vide, pour que l'utilisateur y indique son montant
  protected addSplitRow(): void {
    const rows = this.form.controls.splits;
    rows.at(-1)?.controls.amount.setValue(null, { emitEvent: false });
    rows.push(this.splitRow(null, null));
    this.refreshSplitRows();
  }

  protected removeSplitRow(index: number): void {
    this.form.controls.splits.removeAt(index);
    this.refreshSplitRows();
  }

  private splitRow(categoryId: number | null, amount: number | null, label = ''): SplitRow {
    return new FormGroup({
      categoryId: new FormControl<number | null>(categoryId),
      label: new FormControl(label, { nonNullable: true }),
      amount: new FormControl<number | null>(amount, [Validators.required, Validators.min(0.01)]),
    });
  }

  // Seule la dernière ligne est calculée : son montant n'est pas saisissable
  private refreshSplitRows(): void {
    const rows = this.form.controls.splits.controls;
    rows.forEach((row, index) => {
      if (index === rows.length - 1) {
        row.controls.amount.disable({ emitEvent: false });
      } else {
        row.controls.amount.enable({ emitEvent: false });
      }
    });
    this.form.controls.splits.updateValueAndValidity();
  }

  private splitsToSave(): TransactionSplitRequest[] | null {
    if (!this.splitting()) {
      return [];
    }
    const rows = this.form.controls.splits.getRawValue();
    if (rows.some((row) => row.categoryId === null)) {
      this.notify.error('Choisissez une catégorie pour chaque ligne de la ventilation');
      return null;
    }
    const remainder = this.splitRemainder();
    if (remainder <= 0) {
      this.notify.error("La ventilation dépasse le montant de l'opération");
      return null;
    }
    return rows.map((row, index) => ({
      categoryId: row.categoryId!,
      label: row.label.trim() || null,
      amount: index === rows.length - 1 ? remainder : row.amount!,
    }));
  }

  protected selectPayee(suggestion: PayeeSuggestion): void {
    if (this.splitting()) {
      return;
    }
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
    showFormErrors(this.form);
    const v = this.form.getRawValue();
    if (this.form.invalid || !v.accountId || !v.amount || !v.operationDate) {
      return;
    }

    const request$ = this.mode() === 'TRANSFER' ? this.saveTransfer() : this.saveTransaction();
    if (!request$) {
      return;
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

  // Requête d'enregistrement du virement, ou null si la saisie est incomplète
  private saveTransfer(): Observable<unknown> | null {
    const v = this.form.getRawValue();
    if (!v.toAccountId) {
      this.notify.error('Choisissez le compte bancaire qui reçoit le virement');
      return null;
    }
    const goalAllocations = this.allocationsToSave();
    if (!goalAllocations) {
      return null;
    }
    const request: TransferRequest = {
      fromAccountId: v.accountId!,
      toAccountId: v.toAccountId,
      amount: v.amount!,
      targetAmount: this.needsTargetAmount() ? v.targetAmount : null,
      label: v.label.trim() || null,
      notes: v.notes.trim() || null,
      goalAllocations,
      operationDate: toIsoDate(v.operationDate)!,
    };
    return this.transferId
      ? this.api.updateTransfer(this.transferId, request)
      : this.api.createTransfer(request);
  }

  // Requête d'enregistrement de la dépense ou du revenu, ou null si la saisie est incomplète
  private saveTransaction(): Observable<unknown> | null {
    const v = this.form.getRawValue();
    const label = v.label.trim() || v.payee.trim();
    if (!label) {
      this.notify.error('Indiquez au moins un bénéficiaire ou un libellé');
      return null;
    }
    const splits = this.splitsToSave();
    const goalAllocations = this.allocationsToSave();
    if (!splits || !goalAllocations) {
      return null;
    }
    const request: TransactionRequest = {
      accountId: v.accountId!,
      direction: this.mode() as TransactionDirection,
      amount: v.amount!,
      label,
      payee: v.payee.trim() || null,
      notes: v.notes.trim() || null,
      categoryId: splits.length ? null : v.categoryId,
      splits,
      goalAllocations,
      paymentMethod: v.paymentMethod,
      operationDate: toIsoDate(v.operationDate)!,
      valueDate: toIsoDate(v.valueDate),
      status: this.statusToSave(v.cleared),
    };
    return this.data.transaction
      ? this.api.update(this.data.transaction.id, request)
      : this.api.create(request);
  }

  // Une opération rapprochée garde son statut : il n'est pas transmis
  private statusToSave(cleared: boolean): TransactionStatus | undefined {
    if (this.reconciled) {
      return undefined;
    }
    return cleared ? 'CLEARED' : 'PENDING';
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
          goalAllocations: allocationRequests(transfer.credit),
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
          // Une ligne dont la catégorie a été supprimée ne peut pas être recréée telle quelle
          splits: t.splits.every((s) => s.category)
            ? t.splits.map((s) => ({
                categoryId: s.category!.id,
                label: s.label,
                amount: s.amount,
              }))
            : [],
          goalAllocations: allocationRequests(t),
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
