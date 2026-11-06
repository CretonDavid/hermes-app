import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import {
  MAT_DIALOG_DATA,
  MatDialog,
  MatDialogModule,
  MatDialogRef,
} from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { AccountApi } from '../../core/api';
import { DataStore } from '../../core/data.store';
import { AccountType } from '../../core/models';
import { NotifyService } from '../../core/notify.service';
import { DIALOG_SMALL } from '../../shared/confirm-dialog.component';
import { DialogCloseComponent } from '../../shared/dialog-close.component';
import { protectDirtyForm } from '../../shared/dialog-guard';

@Component({
  selector: 'app-account-type-dialog',
  imports: [
    ReactiveFormsModule,
    MatDialogModule,
    DialogCloseComponent,
    MatFormFieldModule,
    MatInputModule,
    MatCheckboxModule,
    MatButtonModule,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h2 mat-dialog-title>{{ data ? 'Modifier le type de compte bancaire' : 'Nouveau type de compte bancaire' }}</h2>
    <mat-dialog-content>
      <form [formGroup]="form" (ngSubmit)="save()" style="padding-top: 8px">
        <mat-form-field style="margin-bottom: 16px">
          <mat-label>Nom</mat-label>
          <input matInput formControlName="name" placeholder="Ex. Compte courant, Livret A, PEA…" />
          <mat-error>Nom obligatoire</mat-error>
        </mat-form-field>
        <mat-checkbox formControlName="savings">Compte d'épargne</mat-checkbox>
        <p class="muted" style="font: var(--mat-sys-body-small); margin: 4px 0 0 40px">
          Les virements vers ces comptes bancaires sont comptés comme de l'épargne dans les statistiques.
        </p>
      </form>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button matButton mat-dialog-close>Annuler</button>
      <button matButton="filled" (click)="save()" [disabled]="saving()">Enregistrer</button>
    </mat-dialog-actions>
    <app-dialog-close />
  `,
})
export class AccountTypeDialogComponent {
  static open(
    dialog: MatDialog,
    type?: AccountType,
  ): MatDialogRef<AccountTypeDialogComponent, AccountType> {
    return dialog.open(AccountTypeDialogComponent, { data: type ?? null, width: DIALOG_SMALL });
  }

  protected readonly data = inject<AccountType | null>(MAT_DIALOG_DATA);
  private readonly api = inject(AccountApi);
  private readonly store = inject(DataStore);
  private readonly notify = inject(NotifyService);
  private readonly dialogRef = inject(MatDialogRef<AccountTypeDialogComponent, AccountType>);

  protected readonly saving = signal(false);
  protected readonly form = new FormGroup({
    name: new FormControl(this.data?.name ?? '', {
      nonNullable: true,
      validators: Validators.required,
    }),
    savings: new FormControl(this.data?.savings ?? false, { nonNullable: true }),
  });

  constructor() {
    protectDirtyForm(this.form);
  }

  protected save(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.saving.set(true);
    const request = this.form.getRawValue();
    const request$ = this.data
      ? this.api.updateType(this.data.id, request)
      : this.api.createType(request);
    request$.subscribe({
      next: (type) => {
        this.store.reloadAccountTypes();
        this.store.reloadAccounts();
        this.dialogRef.close(type);
      },
      error: (error) => {
        this.saving.set(false);
        this.notify.error(error);
      },
    });
  }
}
