import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MAT_DIALOG_DATA, MatDialog, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatTooltipModule } from '@angular/material/tooltip';
import { AccountApi } from '../../core/api';
import { DataStore } from '../../core/data.store';
import { fromIsoDate, toIsoDate } from '../../core/format';
import { Account, AccountRequest } from '../../core/models';
import { NotifyService } from '../../core/notify.service';
import { AccountTypeDialogComponent } from './account-type-dialog.component';

@Component({
  selector: 'app-account-form-dialog',
  imports: [
    ReactiveFormsModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatDatepickerModule,
    MatCheckboxModule,
    MatButtonModule,
    MatIconModule,
    MatTooltipModule,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h2 mat-dialog-title>{{ data ? 'Modifier le compte' : 'Nouveau compte' }}</h2>
    <mat-dialog-content>
      <form class="form-grid" [formGroup]="form" (ngSubmit)="save()">
        <mat-form-field class="full">
          <mat-label>Nom du compte</mat-label>
          <input matInput formControlName="name" placeholder="Ex. Compte joint" />
          <mat-error>Nom obligatoire</mat-error>
        </mat-form-field>

        <div class="type-field">
          <mat-form-field>
            <mat-label>Type de compte</mat-label>
            <mat-select formControlName="accountTypeId">
              @for (type of store.accountTypes(); track type.id) {
                <mat-option [value]="type.id">{{ type.name }}{{ type.savings ? ' (épargne)' : '' }}</mat-option>
              }
            </mat-select>
            @if (store.accountTypes().length === 0) {
              <mat-hint>Créez d'abord un type de compte →</mat-hint>
            }
            <mat-error>Type obligatoire</mat-error>
          </mat-form-field>
          <button matIconButton type="button" matTooltip="Nouveau type de compte" (click)="newType()">
            <mat-icon>add</mat-icon>
          </button>
        </div>

        <mat-form-field>
          <mat-label>Devise</mat-label>
          <mat-select formControlName="currencyId">
            @for (currency of store.currencies(); track currency.id) {
              <mat-option [value]="currency.id">{{ currency.code }} — {{ currency.name }}</mat-option>
            }
          </mat-select>
        </mat-form-field>

        <mat-form-field>
          <mat-label>Banque</mat-label>
          <input matInput formControlName="bankName" />
        </mat-form-field>

        <mat-form-field>
          <mat-label>Date d'ouverture</mat-label>
          <input matInput [matDatepicker]="picker" formControlName="openingDate" />
          <mat-datepicker-toggle matIconSuffix [for]="picker" />
          <mat-datepicker #picker />
        </mat-form-field>

        <mat-form-field>
          <mat-label>Solde initial</mat-label>
          <input matInput type="number" step="0.01" formControlName="initialBalance" />
          <mat-hint>Solde à la date d'ouverture</mat-hint>
        </mat-form-field>

        <mat-form-field class="full">
          <mat-label>Description</mat-label>
          <input matInput formControlName="description" />
        </mat-form-field>

        @if (data) {
          <mat-checkbox formControlName="closed" class="full">Compte clôturé</mat-checkbox>
        }
        <button type="submit" hidden></button>
      </form>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button matButton mat-dialog-close>Annuler</button>
      <button matButton="filled" (click)="save()" [disabled]="saving()">Enregistrer</button>
    </mat-dialog-actions>
  `,
  styles: `
    .type-field {
      display: flex;
      align-items: flex-start;
      gap: 4px;
      button {
        margin-top: 8px;
      }
    }
  `,
})
export class AccountFormDialogComponent {
  static open(dialog: MatDialog, account?: Account): MatDialogRef<AccountFormDialogComponent, Account> {
    return dialog.open(AccountFormDialogComponent, { data: account ?? null, width: '620px' });
  }

  protected readonly data = inject<Account | null>(MAT_DIALOG_DATA);
  protected readonly store = inject(DataStore);
  private readonly api = inject(AccountApi);
  private readonly notify = inject(NotifyService);
  private readonly dialog = inject(MatDialog);
  private readonly dialogRef = inject(MatDialogRef<AccountFormDialogComponent, Account>);

  protected readonly saving = signal(false);

  private readonly defaultCurrencyId =
    this.store.user()?.referenceCurrency?.id ?? this.store.currencies().find((c) => c.code === 'EUR')?.id ?? null;

  protected readonly form = new FormGroup({
    name: new FormControl(this.data?.name ?? '', { nonNullable: true, validators: Validators.required }),
    accountTypeId: new FormControl<number | null>(
      this.data?.accountType.id ?? this.store.accountTypes()[0]?.id ?? null,
      Validators.required,
    ),
    currencyId: new FormControl<number | null>(this.data?.currency.id ?? this.defaultCurrencyId, Validators.required),
    bankName: new FormControl(this.data?.bankName ?? '', { nonNullable: true }),
    openingDate: new FormControl<Date | null>(fromIsoDate(this.data?.openingDate) ?? new Date()),
    initialBalance: new FormControl<number | null>(this.data?.initialBalance ?? 0),
    description: new FormControl(this.data?.description ?? '', { nonNullable: true }),
    closed: new FormControl(this.data?.closed ?? false, { nonNullable: true }),
  });

  protected newType(): void {
    AccountTypeDialogComponent.open(this.dialog)
      .afterClosed()
      .subscribe((type) => type && this.form.controls.accountTypeId.setValue(type.id));
  }

  protected save(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const v = this.form.getRawValue();
    const request: AccountRequest = {
      name: v.name.trim(),
      description: v.description.trim() || null,
      bankName: v.bankName.trim() || null,
      accountTypeId: v.accountTypeId!,
      currencyId: v.currencyId!,
      initialBalance: v.initialBalance ?? 0,
      openingDate: toIsoDate(v.openingDate) ?? toIsoDate(new Date())!,
      closed: v.closed,
    };
    this.saving.set(true);
    const request$ = this.data ? this.api.update(this.data.id, request) : this.api.create(request);
    request$.subscribe({
      next: (account) => {
        this.notify.success(this.data ? 'Compte modifié' : 'Compte créé');
        this.store.transactionsChanged();
        this.dialogRef.close(account);
      },
      error: (error) => {
        this.saving.set(false);
        this.notify.error(error);
      },
    });
  }
}
