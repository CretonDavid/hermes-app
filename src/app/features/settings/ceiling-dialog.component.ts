import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import {
  MAT_DIALOG_DATA,
  MatDialog,
  MatDialogModule,
  MatDialogRef,
} from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { showFormErrors } from '../../shared/form-errors';
import { AccountApi } from '../../core/api';
import { DataStore } from '../../core/data.store';
import { Account, AccountRequest } from '../../core/models';
import { NotifyService } from '../../core/notify.service';
import { AmountInputDirective } from '../../shared/amount-input.directive';
import { CEILING_PRESETS } from '../../shared/ceiling';
import { DIALOG_SMALL } from '../../shared/confirm-dialog.component';
import { DialogCloseComponent } from '../../shared/dialog-close.component';
import { protectDirtyForm } from '../../shared/dialog-guard';
import { MoneyPipe } from '../../shared/money.pipe';

// Plafond de versements d'un compte bancaire d'épargne, réglé depuis les paramètres
@Component({
  selector: 'app-ceiling-dialog',
  imports: [
    ReactiveFormsModule,
    MatDialogModule,
    DialogCloseComponent,
    AmountInputDirective,
    MoneyPipe,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h2 mat-dialog-title>Plafond · {{ data.name }}</h2>
    <mat-dialog-content>
      <form [formGroup]="form" (ngSubmit)="save()">
        <mat-form-field style="width: 100%">
          <mat-label>Plafond (facultatif)</mat-label>
          <input matInput appAmount formControlName="ceiling" />
          <span matTextSuffix>&nbsp;{{ data.currency.code }}</span>
          <mat-hint>Laissez vide s'il n'y en a pas</mat-hint>
          <mat-error>Le plafond doit être supérieur à 0</mat-error>
        </mat-form-field>

        <!-- Plafonds réglementaires français, en euros -->
        @if (data.currency.code === 'EUR') {
          <div class="presets" role="group" aria-label="Plafonds réglementaires">
            @for (preset of presets; track preset.label) {
              <button
                type="button"
                class="chip"
                [class.selected]="form.controls.ceiling.value === preset.amount"
                (click)="form.controls.ceiling.setValue(preset.amount); form.markAsDirty()"
              >
                {{ preset.label }} · {{ preset.amount | money: 'EUR' }}
              </button>
            }
          </div>
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
    .presets {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      padding-top: 12px;
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
export class CeilingDialogComponent {
  static open(dialog: MatDialog, account: Account): MatDialogRef<CeilingDialogComponent> {
    return dialog.open(CeilingDialogComponent, { data: account, width: DIALOG_SMALL });
  }

  protected readonly data = inject<Account>(MAT_DIALOG_DATA);
  private readonly api = inject(AccountApi);
  private readonly store = inject(DataStore);
  private readonly notify = inject(NotifyService);
  private readonly dialogRef = inject(MatDialogRef<CeilingDialogComponent>);

  protected readonly presets = CEILING_PRESETS;
  protected readonly saving = signal(false);
  protected readonly form = new FormGroup({
    ceiling: new FormControl<number | null>(this.data.ceiling, Validators.min(0.01)),
  });

  constructor() {
    protectDirtyForm(this.form);
  }

  protected save(): void {
    if (this.form.invalid) {
      showFormErrors(this.form);
      return;
    }
    const a = this.data;
    // L'API ne modifie un compte qu'en entier : on renvoie le reste tel quel
    const request: AccountRequest = {
      name: a.name,
      description: a.description,
      bankName: a.bankName,
      accountTypeId: a.accountType.id,
      currencyId: a.currency.id,
      initialBalance: a.initialBalance,
      ceiling: this.form.controls.ceiling.value || null,
      openingDate: a.openingDate,
      closed: a.closed,
    };
    this.saving.set(true);
    this.api.update(a.id, request).subscribe({
      next: () => {
        this.notify.success(request.ceiling ? 'Plafond enregistré' : 'Plafond retiré');
        this.store.reloadAccounts();
        this.dialogRef.close(true);
      },
      error: (error) => {
        this.saving.set(false);
        this.notify.error(error);
      },
    });
  }
}
