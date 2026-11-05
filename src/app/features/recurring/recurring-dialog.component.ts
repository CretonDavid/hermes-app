import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
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
import { format } from 'date-fns';
import {
  FREQUENCIES,
  PAYMENT_METHODS,
  frequencyLabel,
  fromIsoDate,
  toIsoDate,
} from '../../core/format';
import {
  PaymentMethod,
  RecurrenceFrequency,
  RecurringTransaction,
  RecurringTransactionRequest,
} from '../../core/models';
import { NotifyService } from '../../core/notify.service';
import { CategoryPickerComponent } from '../../shared/category-picker.component';
import { formatMoney } from '../../shared/money.pipe';
import { AmountInputDirective } from '../../shared/amount-input.directive';
import { DIALOG_LARGE } from '../../shared/confirm-dialog.component';
import { DialogCloseComponent } from '../../shared/dialog-close.component';
import { protectDirtyForm } from '../../shared/dialog-guard';

type Mode = 'DEBIT' | 'CREDIT' | 'TRANSFER';

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
              ? 'Il faut au moins deux comptes'
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
          <mat-label>{{ mode() === 'TRANSFER' ? 'Depuis le compte' : 'Compte' }}</mat-label>
          <mat-select formControlName="accountId">
            @for (account of store.openAccounts(); track account.id) {
              <mat-option [value]="account.id">{{ account.name }}</mat-option>
            }
          </mat-select>
        </mat-form-field>

        @if (mode() === 'TRANSFER') {
          <mat-form-field>
            <mat-label>Vers le compte</mat-label>
            <mat-select formControlName="targetAccountId" required>
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
            <mat-hint>Vide : conversion au taux du jour</mat-hint>
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
      width: DIALOG_LARGE,
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
  protected readonly mode = signal<Mode>(
    this.data ? (this.data.transfer ? 'TRANSFER' : this.data.direction) : 'DEBIT',
  );

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
  });

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
  private readonly amount = toSignal(this.form.controls.amount.valueChanges, {
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
    const what =
      this.mode() === 'TRANSFER'
        ? `${money} seront virés de « ${account} » vers « ${target ?? '…'} »`
        : this.mode() === 'DEBIT'
          ? `${money} seront débités de « ${account} »`
          : `${money} seront crédités sur « ${account} »`;
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
    return `${what} ${repeat}, à partir du ${format(start, 'dd/MM/yyyy')}${end}.${now}`;
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
  }

  protected setMode(mode: Mode): void {
    this.mode.set(mode);
    this.form.markAsDirty();
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
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const v = this.form.getRawValue();
    const transfer = this.mode() === 'TRANSFER';
    if (transfer && !v.targetAccountId) {
      this.notify.error('Choisissez le compte qui reçoit le virement');
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
