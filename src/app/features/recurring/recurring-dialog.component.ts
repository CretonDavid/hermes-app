import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormArray, FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
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
import { MatSelectModule } from '@angular/material/select';
import { MatTooltipModule } from '@angular/material/tooltip';
import { RecurringApi } from '../../core/api';
import { DataStore } from '../../core/data.store';
import { addYears, format } from 'date-fns';
import {
  FREQUENCIES,
  PAYMENT_METHODS,
  REIMBURSEMENT_PERIODS,
  frequencyLabel,
  fromIsoDate,
  reimbursementPeriodLabel,
  reimbursementPeriodStart,
  reimbursementPeriodStarts,
  toIsoDate,
} from '../../core/format';
import {
  PaymentMethod,
  RecurrenceFrequency,
  RecurringTransaction,
  RecurringTransactionRequest,
  ReimbursementPayer,
  ReimbursementPeriod,
} from '../../core/models';
import { NotifyService } from '../../core/notify.service';
import { CategoryPickerComponent } from '../../shared/category-picker.component';
import { formatMoney } from '../../shared/money.pipe';
import { AmountInputDirective } from '../../shared/amount-input.directive';
import { DialogCloseComponent } from '../../shared/dialog-close.component';
import { protectDirtyForm } from '../../shared/dialog-guard';
import { setRequired } from '../../shared/required';

type Mode = 'DEBIT' | 'CREDIT' | 'TRANSFER';

function initialMode(recurring: RecurringTransaction | null): Mode {
  if (!recurring) {
    return 'DEBIT';
  }
  return recurring.transfer ? 'TRANSFER' : recurring.direction;
}

function movementSummary(mode: Mode, money: string, account: string, target?: string): string {
  switch (mode) {
    case 'TRANSFER':
      return `${money} seront virés de « ${account} » vers « ${target ?? '…'} »`;
    case 'DEBIT':
      return `${money} seront débités de « ${account} »`;
    default:
      return `${money} seront crédités sur « ${account} »`;
  }
}

// « Anne », « Anne et Paul », « Anne, Paul et Léa »
function joinNames(names: string[]): string {
  return names.length > 1 ? `${names.slice(0, -1).join(', ')} et ${names.at(-1)}` : names[0];
}

@Component({
  selector: 'app-recurring-dialog',
  imports: [
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
    MatCheckboxModule,
    MatIconModule,
    CategoryPickerComponent,
    MatTooltipModule,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h2 mat-dialog-title>
      {{ data ? 'Modifier la récurrence' : 'Nouvelle récurrence' }}
    </h2>
    <mat-dialog-content>
      <mat-button-toggle-group
        class="mode"
        [value]="mode()"
        (change)="setMode($event.value)"
        hideSingleSelectionIndicator
      >
        <mat-button-toggle value="DEBIT"
          ><mat-icon>remove_circle</mat-icon> Dépense</mat-button-toggle
        >
        <mat-button-toggle value="CREDIT"><mat-icon>add_circle</mat-icon> Revenu</mat-button-toggle>
        <mat-button-toggle
          value="TRANSFER"
          [disabled]="store.openAccounts().length < 2"
          [matTooltip]="
            store.openAccounts().length < 2
              ? 'Il faut au moins deux comptes bancaires'
              : 'Épargne programmée, virement mensuel…'
          "
          ><mat-icon>swap_horiz</mat-icon> Virement</mat-button-toggle
        >
      </mat-button-toggle-group>

      <form class="form-grid" [formGroup]="form" (ngSubmit)="save()">
        <mat-form-field>
          <mat-label>Montant</mat-label>
          <input matInput appAmount formControlName="amount" placeholder="0,00" />
          <span matTextSuffix>&nbsp;{{ currency() }}</span>
          <mat-error>Saisissez un montant supérieur à 0</mat-error>
        </mat-form-field>

        <mat-form-field>
          <mat-label>Libellé</mat-label>
          <input matInput formControlName="label" placeholder="Ex. Loyer, Salaire, Netflix…" />
          <mat-error>Libellé obligatoire</mat-error>
        </mat-form-field>

        <mat-form-field>
          <mat-label>{{
            mode() === 'TRANSFER' ? 'Depuis le compte bancaire' : 'Compte bancaire'
          }}</mat-label>
          <mat-select formControlName="accountId">
            @for (account of store.openAccounts(); track account.id) {
              <mat-option [value]="account.id">{{ account.name }}</mat-option>
            }
          </mat-select>
        </mat-form-field>

        @if (mode() === 'TRANSFER') {
          <mat-form-field>
            <mat-label>Vers le compte bancaire</mat-label>
            <mat-select formControlName="targetAccountId">
              @for (account of store.openAccounts(); track account.id) {
                @if (account.id !== form.controls.accountId.value) {
                  <mat-option [value]="account.id">{{ account.name }}</mat-option>
                }
              }
            </mat-select>
          </mat-form-field>
        } @else {
          <app-category-picker
            formControlName="categoryId"
            [type]="mode() === 'CREDIT' ? 'INCOME' : 'EXPENSE'"
            label="Catégorie (facultatif)"
          />
        }

        @if (mode() === 'TRANSFER' && targetCurrency() && targetCurrency() !== currency()) {
          <mat-form-field>
            <mat-label>Montant reçu (facultatif)</mat-label>
            <input matInput appAmount formControlName="targetAmount" />
            <span matTextSuffix>&nbsp;{{ targetCurrency() }}</span>
            <mat-hint>Vide : conversion au dernier taux enregistré</mat-hint>
          </mat-form-field>
        } @else if (mode() !== 'TRANSFER') {
          <mat-form-field>
            <mat-label>{{ mode() === 'DEBIT' ? 'Payé à' : 'Reçu de' }} (facultatif)</mat-label>
            <input matInput formControlName="payee" />
          </mat-form-field>
        }

        <mat-form-field>
          <mat-label>Répétition</mat-label>
          <mat-select [value]="repeat()" (valueChange)="setRepeat($event)">
            @for (r of repeats; track r.value) {
              <mat-option [value]="r.value">{{ r.label }}</mat-option>
            }
            <mat-option value="custom">Personnalisée…</mat-option>
          </mat-select>
        </mat-form-field>

        @if (repeat() === 'custom') {
          <div class="custom-repeat">
            <mat-form-field>
              <mat-label>Tous les</mat-label>
              <input matInput type="number" min="1" max="365" formControlName="interval" />
            </mat-form-field>
            <mat-form-field>
              <mat-label>Unité</mat-label>
              <mat-select formControlName="frequency">
                @for (f of frequencies; track f.value) {
                  <mat-option [value]="f.value">{{ interval() > 1 ? f.units : f.unit }}</mat-option>
                }
              </mat-select>
            </mat-form-field>
          </div>
        }

        <mat-form-field>
          <mat-label>Première échéance</mat-label>
          <input matInput [matDatepicker]="startPicker" formControlName="startDate" />
          <mat-datepicker-toggle matIconSuffix [for]="startPicker" />
          <mat-datepicker #startPicker />
          @if (startsInPast()) {
            <mat-hint>Les échéances passées seront créées</mat-hint>
          }
        </mat-form-field>

        <mat-form-field>
          <mat-label>Jusqu’au (facultatif)</mat-label>
          <input matInput [matDatepicker]="endPicker" formControlName="endDate" />
          <mat-datepicker-toggle matIconSuffix [for]="endPicker" />
          <mat-datepicker #endPicker />
        </mat-form-field>

        @if (mode() !== 'TRANSFER') {
          <mat-form-field>
            <mat-label>Moyen de paiement (facultatif)</mat-label>
            <mat-select formControlName="paymentMethod">
              <mat-option [value]="null">—</mat-option>
              @for (method of paymentMethods; track method.value) {
                <mat-option [value]="method.value">{{ method.label }}</mat-option>
              }
            </mat-select>
          </mat-form-field>
        }

        <div style="display: flex; align-items: center">
          <mat-checkbox formControlName="active">Active</mat-checkbox>
        </div>

        @if (mode() === 'DEBIT') {
          <div class="full">
            <mat-checkbox [checked]="reimbursed()" (change)="setReimbursed($event.checked)">
              Remboursée par un ou plusieurs tiers
            </mat-checkbox>
          </div>
          @if (reimbursed()) {
            <div class="full payers" formArrayName="payers">
              @for (payer of payers.controls; track payer; let i = $index) {
                <div class="payer" [formGroupName]="i">
                  <mat-form-field subscriptSizing="dynamic">
                    <mat-label>Tiers</mat-label>
                    <input matInput formControlName="name" placeholder="Ex. Alex" />
                    <mat-error>Nom obligatoire</mat-error>
                  </mat-form-field>
                  <mat-form-field subscriptSizing="dynamic">
                    <mat-label>Part</mat-label>
                    <input
                      matInput
                      type="number"
                      min="0.01"
                      max="100"
                      step="0.01"
                      formControlName="share"
                    />
                    <span matTextSuffix>&nbsp;%</span>
                    <mat-error>Entre 0,01 et 100 %</mat-error>
                  </mat-form-field>
                  <mat-form-field subscriptSizing="dynamic">
                    <mat-label>Rembourse</mat-label>
                    <mat-select
                      formControlName="period"
                      (selectionChange)="periodChanged(payer, $event.value)"
                    >
                      @for (p of reimbursementPeriods; track p.value) {
                        <mat-option [value]="p.value">{{ p.label }}</mat-option>
                      }
                    </mat-select>
                  </mat-form-field>
                  <mat-form-field subscriptSizing="dynamic">
                    <mat-label>Depuis</mat-label>
                    <mat-select formControlName="startDate" panelWidth="">
                      @for (start of payerStarts(payer); track start) {
                        <mat-option [value]="start">{{
                          periodLabel(payer.value.period!, start)
                        }}</mat-option>
                      }
                    </mat-select>
                  </mat-form-field>
                  <button
                    matIconButton
                    type="button"
                    matTooltip="Retirer ce tiers"
                    aria-label="Retirer ce tiers"
                    (click)="removePayer(i)"
                  >
                    <mat-icon>person_remove</mat-icon>
                  </button>
                </div>
              }
              <div class="payer-actions">
                <button matButton type="button" (click)="addPayer()">
                  <mat-icon>person_add</mat-icon> Ajouter un tiers
                </button>
                <button
                  matButton
                  type="button"
                  matTooltip="Répartit la dépense à parts égales entre vous et les tiers"
                  (click)="splitEqually()"
                >
                  <mat-icon>pie_chart</mat-icon> Parts égales
                </button>
                <span class="own" [class.negative]="ownShare() < 0">
                  @if (ownShare() < 0) {
                    Les parts dépassent 100 %
                  } @else {
                    Votre part : {{ formatShare(ownShare()) }}
                    @if (amount()) {
                      ({{ ownAmount() }} par échéance)
                    }
                  }
                </span>
              </div>
            </div>
          }
        }

        @if (summary(); as text) {
          <p class="full summary"><mat-icon inline>event_repeat</mat-icon> {{ text }}</p>
        }
        <button type="submit" hidden></button>
      </form>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button matButton mat-dialog-close>Annuler</button>
      <button matButton="filled" (click)="save()" [disabled]="saving()">Enregistrer</button>
    </mat-dialog-actions>
    <app-dialog-close />
  `,
  styles: `
    .mode {
      width: 100%;
      margin-bottom: 20px;
      mat-button-toggle {
        flex: 1;
      }
    }
    .custom-repeat {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 8px;
    }
    .payer {
      display: grid;
      grid-template-columns: minmax(0, 1fr) 104px 170px 112px 40px;
      gap: 8px;
      align-items: start;
      margin-bottom: 12px;
      button {
        margin-top: 8px;
      }
    }
    .payer-actions {
      display: flex;
      align-items: center;
      flex-wrap: wrap;
      gap: 4px;
      margin-bottom: 8px;
      .own {
        margin-left: auto;
        font: var(--mat-sys-body-medium);
      }
    }
    .summary {
      margin: 0;
      padding: 10px 14px;
      border-radius: 12px;
      background: var(--mat-sys-secondary-container);
      color: var(--mat-sys-on-secondary-container);
      font: var(--mat-sys-body-medium);
    }
  `,
})
export class RecurringDialogComponent {
  static open(
    dialog: MatDialog,
    recurring?: RecurringTransaction,
  ): MatDialogRef<RecurringDialogComponent, boolean> {
    return dialog.open(RecurringDialogComponent, {
      data: recurring ?? null,
      // Plus large que les autres formulaires pour tenir les tiers sur une ligne
      width: '760px',
      autoFocus: recurring ? 'dialog' : 'input[formcontrolname="amount"]',
    });
  }

  protected readonly data = inject<RecurringTransaction | null>(MAT_DIALOG_DATA);
  protected readonly store = inject(DataStore);
  private readonly api = inject(RecurringApi);
  private readonly notify = inject(NotifyService);
  private readonly dialogRef = inject(MatDialogRef<RecurringDialogComponent, boolean>);

  protected readonly frequencies = FREQUENCIES;
  protected readonly paymentMethods = PAYMENT_METHODS;
  protected readonly saving = signal(false);
  protected readonly mode = signal<Mode>(initialMode(this.data));

  protected readonly form = new FormGroup({
    label: new FormControl(this.data?.label ?? '', {
      nonNullable: true,
      validators: Validators.required,
    }),
    accountId: new FormControl<number | null>(
      this.data?.accountId ?? this.store.openAccounts()[0]?.id ?? null,
      Validators.required,
    ),
    targetAccountId: new FormControl<number | null>(this.data?.targetAccountId ?? null),
    categoryId: new FormControl<number | null>(this.data?.category?.id ?? null),
    amount: new FormControl<number | null>(this.data?.amount ?? null, [
      Validators.required,
      Validators.min(0.01),
    ]),
    targetAmount: new FormControl<number | null>(this.data?.targetAmount ?? null),
    payee: new FormControl(this.data?.payee ?? '', { nonNullable: true }),
    frequency: new FormControl<RecurrenceFrequency>(this.data?.frequency ?? 'MONTHLY', {
      nonNullable: true,
    }),
    interval: new FormControl(this.data?.interval ?? 1, {
      nonNullable: true,
      validators: [Validators.min(1)],
    }),
    startDate: new FormControl<Date | null>(
      fromIsoDate(this.data?.startDate) ?? new Date(),
      Validators.required,
    ),
    endDate: new FormControl<Date | null>(fromIsoDate(this.data?.endDate)),
    paymentMethod: new FormControl<PaymentMethod | null>(this.data?.paymentMethod ?? null),
    active: new FormControl(this.data?.active ?? true, { nonNullable: true }),
    payers: new FormArray(
      (this.data?.reimbursementPayers ?? []).map((p) => RecurringDialogComponent.payerForm(p)),
    ),
  });

  protected readonly reimbursementPeriods = REIMBURSEMENT_PERIODS;
  protected readonly payers = this.form.controls.payers;
  private readonly reimbursedValue = signal(this.payers.length > 0);
  protected readonly reimbursed = computed(() => this.mode() === 'DEBIT' && this.reimbursedValue());
  private readonly payerValues = toSignal(this.payers.valueChanges, {
    initialValue: this.payers.value,
  });
  // Part restant à votre charge, en pourcentage
  protected readonly ownShare = computed(
    () =>
      Math.round(
        (100 - this.payerValues().reduce((sum, p) => sum + (Number(p.share) || 0), 0)) * 100,
      ) / 100,
  );
  protected readonly ownAmount = computed(() =>
    formatMoney(((this.amount() ?? 0) * Math.max(this.ownShare(), 0)) / 100, this.currency()),
  );

  private static payerForm(payer?: Partial<ReimbursementPayer>) {
    return new FormGroup({
      id: new FormControl<number | null>(payer?.id ?? null),
      name: new FormControl(payer?.name ?? '', {
        nonNullable: true,
        validators: Validators.required,
      }),
      share: new FormControl<number | null>(payer?.share ?? 100, [
        Validators.required,
        Validators.min(0.01),
        Validators.max(100),
      ]),
      period: new FormControl<ReimbursementPeriod>(payer?.period ?? 'YEARLY', {
        nonNullable: true,
      }),
      // Un nouveau tiers doit par défaut à partir de la période en cours
      startDate: new FormControl<string>(
        payer?.startDate ?? reimbursementPeriodStart(payer?.period ?? 'YEARLY', new Date()),
        { nonNullable: true },
      ),
    });
  }

  // Périodes proposées pour « Depuis » : du début de la récurrence à l'an prochain
  protected payerStarts(payer: FormGroup): string[] {
    const period = payer.value.period as ReimbursementPeriod;
    const chosen = payer.value.startDate as string;
    const recurrenceStart = toIsoDate(this.startDate()) ?? chosen;
    const from = recurrenceStart < chosen ? recurrenceStart : chosen;
    const nextYear = toIsoDate(addYears(new Date(), 1))!;
    return reimbursementPeriodStarts(period, from, chosen > nextYear ? chosen : nextYear);
  }

  protected periodLabel(period: ReimbursementPeriod, start: string): string {
    return reimbursementPeriodLabel(period, start);
  }

  // Le début reste dans la même période quand le rythme change (mars 2026 → 2026 → T1 2026)
  protected periodChanged(payer: FormGroup, period: ReimbursementPeriod): void {
    payer.patchValue({ startDate: reimbursementPeriodStart(period, payer.value.startDate) });
  }

  private readonly accountId = toSignal(this.form.controls.accountId.valueChanges, {
    initialValue: this.form.controls.accountId.value,
  });
  private readonly targetAccountId = toSignal(this.form.controls.targetAccountId.valueChanges, {
    initialValue: this.form.controls.targetAccountId.value,
  });
  private readonly frequency = toSignal(this.form.controls.frequency.valueChanges, {
    initialValue: this.form.controls.frequency.value,
  });
  protected readonly interval = toSignal(this.form.controls.interval.valueChanges, {
    initialValue: this.form.controls.interval.value,
  });
  private readonly startDate = toSignal(this.form.controls.startDate.valueChanges, {
    initialValue: this.form.controls.startDate.value,
  });
  private readonly endDate = toSignal(this.form.controls.endDate.valueChanges, {
    initialValue: this.form.controls.endDate.value,
  });
  protected readonly amount = toSignal(this.form.controls.amount.valueChanges, {
    initialValue: this.form.controls.amount.value,
  });

  // Répétitions courantes, sous la forme FREQUENCE:intervalle
  protected readonly repeats = [
    { value: 'WEEKLY:1', label: 'Chaque semaine' },
    { value: 'WEEKLY:2', label: 'Toutes les 2 semaines' },
    { value: 'MONTHLY:1', label: 'Chaque mois' },
    { value: 'MONTHLY:2', label: 'Tous les 2 mois' },
    { value: 'MONTHLY:3', label: 'Chaque trimestre' },
    { value: 'MONTHLY:6', label: 'Chaque semestre' },
    { value: 'YEARLY:1', label: 'Chaque année' },
    { value: 'DAILY:1', label: 'Chaque jour' },
  ];
  private readonly customRepeat = signal(false);
  protected readonly repeat = computed(() => {
    const value = `${this.frequency()}:${this.interval()}`;
    return this.customRepeat() || !this.repeats.some((r) => r.value === value) ? 'custom' : value;
  });

  protected readonly summary = computed(() => {
    const amount = this.amount();
    const start = this.startDate();
    if (!amount || !start) {
      return null;
    }
    const money = formatMoney(amount, this.currency());
    const account = this.store.account(this.accountId())?.name ?? '';
    const target = this.store.account(this.targetAccountId())?.name;
    const what = movementSummary(this.mode(), money, account, target);
    const repeat =
      this.frequency() === 'MONTHLY' && this.interval() === 1
        ? `le ${start.getDate()} de chaque mois`
        : (this.repeats.find((r) => r.value === this.repeat())?.label.toLowerCase() ??
          frequencyLabel(this.frequency(), this.interval()).toLowerCase());
    const end = this.endDate() ? ` jusqu'au ${format(this.endDate()!, 'dd/MM/yyyy')}` : '';
    const now =
      !this.data && (this.startsInPast() || toIsoDate(start) === toIsoDate(new Date()))
        ? " Les échéances jusqu'à aujourd'hui seront ajoutées dès l'enregistrement."
        : '';
    const payers = this.payerValues().filter((p) => p.name?.trim() && p.share);
    const names = payers.map((p) => `${p.name!.trim()} (${this.formatShare(Number(p.share))})`);
    const refund =
      this.reimbursed() && names.length
        ? ` Remboursée par ${joinNames(names)} ; votre part : ${this.formatShare(Math.max(this.ownShare(), 0))}.`
        : '';
    return `${what} ${repeat}, à partir du ${format(start, 'dd/MM/yyyy')}${end}.${refund}${now}`;
  });

  protected readonly currency = computed(
    () => this.store.account(this.accountId())?.currency.code ?? 'EUR',
  );
  protected readonly targetCurrency = computed(
    () => this.store.account(this.targetAccountId())?.currency.code ?? null,
  );
  protected readonly categoryOptions = computed(() =>
    this.store.categoryOptions(this.mode() === 'CREDIT' ? 'INCOME' : 'EXPENSE'),
  );
  protected readonly unit = computed(() => {
    const f = FREQUENCIES.find((x) => x.value === this.frequency())!;
    return this.interval() > 1 ? f.units : f.unit;
  });
  protected readonly startsInPast = computed(() => {
    const start = this.startDate();
    return !this.data && !!start && toIsoDate(start)! < toIsoDate(new Date())!;
  });

  constructor() {
    protectDirtyForm(this.form);
    effect(() => setRequired(this.form.controls.targetAccountId, this.mode() === 'TRANSFER'));
  }

  protected formatShare(share: number): string {
    return `${share.toLocaleString('fr-FR', { maximumFractionDigits: 2 })} %`;
  }

  protected setReimbursed(checked: boolean): void {
    this.reimbursedValue.set(checked);
    if (checked && this.payers.length === 0) {
      this.addPayer();
    }
  }

  // Chaque ajout ou retrait répartit la dépense à parts égales entre vous et les tiers
  protected addPayer(): void {
    this.payers.push(RecurringDialogComponent.payerForm());
    this.splitEqually();
    this.form.markAsDirty();
  }

  protected removePayer(index: number): void {
    this.payers.removeAt(index);
    this.form.markAsDirty();
    if (this.payers.length === 0) {
      this.reimbursedValue.set(false);
    } else {
      this.splitEqually();
    }
  }

  // Parts égales entre vous et chaque tiers ; l'arrondi éventuel reste à votre charge
  protected splitEqually(): void {
    const share = Math.floor(10000 / (this.payers.length + 1)) / 100;
    this.payers.controls.forEach((c) => c.controls.share.setValue(share));
    this.form.markAsDirty();
  }

  protected setMode(mode: Mode): void {
    this.mode.set(mode);
    this.form.controls.categoryId.setValue(null);
    if (mode === 'TRANSFER' && !this.form.controls.targetAccountId.value) {
      const other = this.store
        .openAccounts()
        .find((a) => a.id !== this.form.controls.accountId.value);
      this.form.controls.targetAccountId.setValue(other?.id ?? null);
    }
  }

  protected setRepeat(value: string): void {
    this.form.markAsDirty();
    if (value === 'custom') {
      this.customRepeat.set(true);
      return;
    }
    this.customRepeat.set(false);
    const [frequency, interval] = value.split(':');
    this.form.patchValue({
      frequency: frequency as RecurrenceFrequency,
      interval: Number(interval),
    });
  }

  protected save(): void {
    // Des tiers masqués (case décochée, revenu ou virement) ne doivent pas bloquer l'enregistrement
    if (!this.reimbursed()) {
      this.payers.clear();
    }
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    if (this.ownShare() < 0) {
      this.notify.error('Les parts des tiers dépassent 100 %');
      return;
    }
    const v = this.form.getRawValue();
    const transfer = this.mode() === 'TRANSFER';
    if (transfer && !v.targetAccountId) {
      this.notify.error('Choisissez le compte bancaire qui reçoit le virement');
      return;
    }
    const request: RecurringTransactionRequest = {
      accountId: v.accountId!,
      targetAccountId: transfer ? v.targetAccountId : null,
      direction: transfer ? null : (this.mode() as 'DEBIT' | 'CREDIT'),
      amount: v.amount!,
      targetAmount: transfer ? v.targetAmount : null,
      label: v.label.trim(),
      payee: transfer ? null : v.payee.trim() || null,
      categoryId: transfer ? null : v.categoryId,
      paymentMethod: transfer ? 'TRANSFER' : v.paymentMethod,
      frequency: v.frequency,
      interval: v.interval,
      startDate: toIsoDate(v.startDate)!,
      endDate: toIsoDate(v.endDate),
      active: v.active,
      reimbursementPayers: v.payers.map((p) => ({
        id: p.id,
        name: p.name.trim(),
        share: p.share!,
        period: p.period,
        startDate: p.startDate,
      })),
    };
    this.saving.set(true);
    const request$ = this.data ? this.api.update(this.data.id, request) : this.api.create(request);
    request$.subscribe({
      next: () => {
        this.notify.success('Récurrence enregistrée');
        this.store.transactionsChanged();
        this.dialogRef.close(true);
      },
      error: (error) => {
        this.saving.set(false);
        this.notify.error(error);
      },
    });
  }
}
