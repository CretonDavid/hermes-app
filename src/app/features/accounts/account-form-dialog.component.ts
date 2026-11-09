import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatAutocompleteModule } from '@angular/material/autocomplete';
import { MatButtonModule } from '@angular/material/button';
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
import { Observable, map, of, switchMap } from 'rxjs';
import { AccountApi } from '../../core/api';
import { DataStore } from '../../core/data.store';
import { fromIsoDate, toIsoDate } from '../../core/format';
import { Account, AccountRequest } from '../../core/models';
import { NotifyService } from '../../core/notify.service';
import { AmountInputDirective } from '../../shared/amount-input.directive';
import { CEILING_PRESETS } from '../../shared/ceiling';
import { MoneyPipe } from '../../shared/money.pipe';
import { DIALOG_LARGE } from '../../shared/confirm-dialog.component';
import { DialogCloseComponent } from '../../shared/dialog-close.component';
import { protectDirtyForm } from '../../shared/dialog-guard';

// Types proposés tant que l'utilisateur ne les a pas encore créés
const SUGGESTED_TYPES: { name: string; savings: boolean }[] = [
  { name: 'Compte courant', savings: false },
  { name: 'Compte joint', savings: false },
  { name: 'Livret A', savings: true },
  { name: "Livret d'épargne", savings: true },
  { name: 'Assurance vie', savings: true },
  { name: 'PEA', savings: true },
  { name: 'Compte titres', savings: true },
  { name: 'Espèces', savings: false },
];

const SAVINGS_PATTERN = /livret|[ée]pargne|assurance|pea|pel|cel|titres|placement|ldd/i;

@Component({
  selector: 'app-account-form-dialog',
  imports: [
    ReactiveFormsModule,
    MatDialogModule,
    DialogCloseComponent,
    AmountInputDirective,
    MoneyPipe,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatAutocompleteModule,
    MatDatepickerModule,
    MatCheckboxModule,
    MatButtonModule,
    MatIconModule,
    MatProgressBarModule,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h2 mat-dialog-title>{{ data ? 'Modifier le compte bancaire' : 'Nouveau compte bancaire' }}</h2>
    <mat-dialog-content>
      <form class="form-grid" [formGroup]="form" (ngSubmit)="save()">
        <mat-form-field class="full">
          <mat-label>Nom du compte bancaire</mat-label>
          <input
            matInput
            formControlName="name"
            maxlength="50"
            placeholder="Ex. Compte courant BNP"
            cdkFocusInitial
          />
          <mat-error>
            {{
              form.controls.name.hasError('maxlength')
                ? 'Le nom ne doit pas dépasser 50 caractères'
                : 'Donnez un nom à ce compte bancaire'
            }}
          </mat-error>
        </mat-form-field>

        <mat-form-field>
          <mat-label>Type de compte bancaire</mat-label>
          <input
            matInput
            formControlName="typeName"
            [matAutocomplete]="types"
            placeholder="Choisir ou saisir un type"
          />
          <mat-autocomplete
            #types="matAutocomplete"
            (optionSelected)="onTypeSelected($event.option.value)"
          >
            @for (t of typeOptions(); track t.name) {
              <mat-option [value]="t.name">
                {{ t.name }}
                @if (t.savings) {
                  <span class="muted"> · épargne</span>
                }
              </mat-option>
            }
          </mat-autocomplete>
          @if (isNewType()) {
            <mat-hint>Nouveau type : il sera créé avec le compte bancaire</mat-hint>
          }
          <mat-error>Choisissez ou saisissez un type</mat-error>
        </mat-form-field>

        <mat-form-field>
          <mat-label>Devise</mat-label>
          <mat-select formControlName="currencyId">
            @for (currency of store.currencies(); track currency.id) {
              <mat-option [value]="currency.id"
                >{{ currency.code }} — {{ currency.name }}</mat-option
              >
            }
          </mat-select>
        </mat-form-field>

        @if (isNewType()) {
          <div class="full savings">
            <mat-checkbox formControlName="savings">C'est un compte d'épargne</mat-checkbox>
            <span class="muted"
              >Les virements vers ce compte bancaire seront comptés comme de l'épargne dans les
              statistiques.</span
            >
          </div>
        }

        <mat-form-field>
          <mat-label>Solde de départ</mat-label>
          <input matInput appAmount formControlName="initialBalance" />
          <span matTextSuffix>&nbsp;{{ currencyCode() }}</span>
          <mat-error>Indiquez le solde, 0 s'il est vide</mat-error>
        </mat-form-field>

        <mat-form-field>
          <mat-label>Au</mat-label>
          <input matInput [matDatepicker]="picker" formControlName="openingDate" />
          <mat-datepicker-toggle matIconSuffix [for]="picker" />
          <mat-datepicker #picker />
          <mat-error>Date obligatoire (jj/mm/aaaa)</mat-error>
        </mat-form-field>
        <p class="full help">
          <mat-icon inline>info</mat-icon>
          Indiquez le solde de votre compte bancaire à cette date : inutile de saisir les opérations
          plus anciennes. Le solde affiché ensuite est calculé automatiquement à partir de vos
          opérations.
        </p>

        <mat-form-field>
          <mat-label>Plafond (facultatif)</mat-label>
          <input matInput appAmount formControlName="ceiling" />
          <span matTextSuffix>&nbsp;{{ currencyCode() }}</span>
          <mat-hint>Livret A, LDDS… : laissez vide s'il n'y en a pas</mat-hint>
          <mat-error>Le plafond doit être supérieur à 0</mat-error>
        </mat-form-field>

        <!-- Plafonds réglementaires français, en euros -->
        <div class="presets" role="group" aria-label="Plafonds réglementaires">
          @if (currencyCode() === 'EUR') {
            @for (preset of ceilingPresets; track preset.label) {
              <button
                type="button"
                class="chip"
                [class.selected]="form.controls.ceiling.value === preset.amount"
                (click)="form.controls.ceiling.setValue(preset.amount); form.markAsDirty()"
              >
                {{ preset.label }} · {{ preset.amount | money: 'EUR' }}
              </button>
            }
          }
        </div>

        <mat-form-field>
          <mat-label>Banque (facultatif)</mat-label>
          <input matInput formControlName="bankName" />
        </mat-form-field>

        <mat-form-field>
          <mat-label>Description (facultatif)</mat-label>
          <input matInput formControlName="description" />
        </mat-form-field>

        @if (data) {
          <div class="full savings">
            <mat-checkbox formControlName="closed">Compte bancaire clôturé</mat-checkbox>
            <span class="muted"
              >Il reste visible dans l'historique et les statistiques, mais on ne peut plus y
              ajouter d'opérations.</span
            >
          </div>
        }
        <button type="submit" hidden></button>
      </form>
    </mat-dialog-content>
    @if (saving()) {
      <mat-progress-bar mode="indeterminate" />
    }
    <mat-dialog-actions align="end">
      <button matButton mat-dialog-close>Annuler</button>
      <button matButton="filled" (click)="save()" [disabled]="saving()">
        {{ data ? 'Enregistrer' : 'Créer le compte bancaire' }}
      </button>
    </mat-dialog-actions>
    <app-dialog-close />
  `,
  styles: `
    .savings {
      display: flex;
      flex-direction: column;
      gap: 0;
      .muted {
        font: var(--mat-sys-body-small);
        margin-left: 40px;
      }
    }
    .help {
      font: var(--mat-sys-body-small);
      color: var(--hermes-muted);
      margin: -12px 0 10px;
    }
    .chip.new {
      margin-left: 8px;
    }
    .presets {
      display: flex;
      flex-wrap: wrap;
      align-content: flex-start;
      gap: 6px;
      padding-top: 6px;
      .chip {
        border: 1px solid transparent;
        cursor: pointer;
        &:hover {
          color: var(--mat-sys-on-surface);
        }
        &.selected {
          border-color: var(--mat-sys-primary);
          color: var(--mat-sys-primary);
        }
      }
    }
  `,
})
export class AccountFormDialogComponent {
  static open(
    dialog: MatDialog,
    account?: Account,
  ): MatDialogRef<AccountFormDialogComponent, Account> {
    return dialog.open(AccountFormDialogComponent, {
      data: account ?? null,
      width: DIALOG_LARGE,
    });
  }

  protected readonly data = inject<Account | null>(MAT_DIALOG_DATA);
  protected readonly store = inject(DataStore);
  private readonly api = inject(AccountApi);
  private readonly notify = inject(NotifyService);
  private readonly dialogRef = inject(MatDialogRef<AccountFormDialogComponent, Account>);

  protected readonly saving = signal(false);
  protected readonly ceilingPresets = CEILING_PRESETS;

  private readonly defaultCurrencyId =
    this.store.user()?.referenceCurrency?.id ??
    this.store.currencies().find((c) => c.code === 'EUR')?.id ??
    null;

  protected readonly form = new FormGroup({
    name: new FormControl(this.data?.name ?? '', {
      nonNullable: true,
      validators: Validators.required,
    }),
    typeName: new FormControl(
      this.data?.accountType.name ?? this.store.accountTypes()[0]?.name ?? '',
      {
        nonNullable: true,
        validators: Validators.required,
      },
    ),
    savings: new FormControl(false, { nonNullable: true }),
    currencyId: new FormControl<number | null>(
      this.data?.currency.id ?? this.defaultCurrencyId,
      Validators.required,
    ),
    bankName: new FormControl(this.data?.bankName ?? '', { nonNullable: true }),
    openingDate: new FormControl<Date | null>(
      fromIsoDate(this.data?.openingDate) ?? new Date(),
      Validators.required,
    ),
    initialBalance: new FormControl<number | null>(
      this.data?.initialBalance ?? 0,
      Validators.required,
    ),
    ceiling: new FormControl<number | null>(this.data?.ceiling ?? null, Validators.min(0.01)),
    description: new FormControl(this.data?.description ?? '', { nonNullable: true }),
    closed: new FormControl(this.data?.closed ?? false, { nonNullable: true }),
  });

  private readonly typeName = toSignal(this.form.controls.typeName.valueChanges, {
    initialValue: this.form.controls.typeName.value,
  });
  private readonly currencyId = toSignal(this.form.controls.currencyId.valueChanges, {
    initialValue: this.form.controls.currencyId.value,
  });

  protected readonly currencyCode = computed(
    () => this.store.currencies().find((c) => c.id === this.currencyId())?.code ?? '',
  );

  private readonly existingType = computed(() => {
    const name = this.typeName().trim().toLowerCase();
    return this.store.accountTypes().find((t) => t.name.toLowerCase() === name);
  });

  protected readonly isNewType = computed(
    () => this.typeName().trim() !== '' && !this.existingType(),
  );

  // Types existants puis suggestions, filtrés sur le texte saisi
  protected readonly typeOptions = computed(() => {
    const query = this.typeName().trim().toLowerCase();
    const existing = this.store
      .accountTypes()
      .map((t) => ({ name: t.name, savings: t.savings, existing: true }));
    const names = new Set(existing.map((t) => t.name.toLowerCase()));
    const suggestions = SUGGESTED_TYPES.filter((s) => !names.has(s.name.toLowerCase())).map(
      (s) => ({ ...s, existing: false }),
    );
    const all = [...existing, ...suggestions];
    const exact = all.some((t) => t.name.toLowerCase() === query);
    return exact || !query ? all : all.filter((t) => t.name.toLowerCase().includes(query));
  });

  constructor() {
    protectDirtyForm(this.form);
    // Pré-coche « épargne » quand le nom du nouveau type l'évoque
    this.form.controls.typeName.valueChanges.subscribe((name) => {
      if (!this.existingType()) {
        const suggestion = SUGGESTED_TYPES.find(
          (s) => s.name.toLowerCase() === name.trim().toLowerCase(),
        );
        this.form.controls.savings.setValue(suggestion?.savings ?? SAVINGS_PATTERN.test(name));
      }
    });
  }

  protected onTypeSelected(name: string): void {
    this.form.controls.typeName.setValue(name);
  }

  protected save(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const v = this.form.getRawValue();
    const existing = this.existingType();
    const typeId$: Observable<number> = existing
      ? of(existing.id)
      : this.api.createType({ name: v.typeName.trim(), savings: v.savings }).pipe(map((t) => t.id));

    this.saving.set(true);
    typeId$
      .pipe(
        switchMap((accountTypeId) => {
          const request: AccountRequest = {
            name: v.name.trim(),
            description: v.description.trim() || null,
            bankName: v.bankName.trim() || null,
            accountTypeId,
            currencyId: v.currencyId!,
            initialBalance: v.initialBalance!,
            ceiling: v.ceiling || null,
            openingDate: toIsoDate(v.openingDate)!,
            closed: v.closed,
          };
          return this.data ? this.api.update(this.data.id, request) : this.api.create(request);
        }),
      )
      .subscribe({
        next: (account) => {
          this.notify.success(
            this.data ? 'Compte bancaire modifié' : `Compte bancaire « ${account.name} » créé`,
          );
          this.store.reloadAccountTypes();
          this.store.transactionsChanged();
          this.dialogRef.close(account);
        },
        error: (error) => {
          this.saving.set(false);
          this.store.reloadAccountTypes();
          this.notify.error(error);
        },
      });
  }
}
