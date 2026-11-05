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
import { CurrencyApi } from '../../core/api';
import { DataStore } from '../../core/data.store';
import { Currency } from '../../core/models';
import { NotifyService } from '../../core/notify.service';
import { DialogCloseComponent } from '../../shared/dialog-close.component';
import { protectDirtyForm } from '../../shared/dialog-guard';

@Component({
  selector: 'app-currency-dialog',
  imports: [
    ReactiveFormsModule,
    MatDialogModule,
    DialogCloseComponent,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h2 mat-dialog-title>{{ data ? 'Modifier la devise' : 'Nouvelle devise' }}</h2>
    <mat-dialog-content>
      <form class="form-grid" [formGroup]="form" (ngSubmit)="save()">
        <mat-form-field>
          <mat-label>Code (3 lettres)</mat-label>
          <input matInput formControlName="code" maxlength="3" style="text-transform: uppercase" />
          <mat-error>3 lettres, ex. BTC</mat-error>
        </mat-form-field>
        <mat-form-field>
          <mat-label>Symbole</mat-label>
          <input matInput formControlName="symbol" />
        </mat-form-field>
        <mat-form-field class="full">
          <mat-label>Nom</mat-label>
          <input matInput formControlName="name" />
        </mat-form-field>
        <button type="submit" hidden></button>
      </form>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button matButton mat-dialog-close>Annuler</button>
      <button matButton="filled" (click)="save()" [disabled]="saving()">Enregistrer</button>
    </mat-dialog-actions>
    <app-dialog-close />
  `,
})
export class CurrencyDialogComponent {
  static open(dialog: MatDialog, currency?: Currency): MatDialogRef<CurrencyDialogComponent> {
    return dialog.open(CurrencyDialogComponent, { data: currency ?? null, width: '460px' });
  }

  protected readonly data = inject<Currency | null>(MAT_DIALOG_DATA);
  private readonly api = inject(CurrencyApi);
  private readonly store = inject(DataStore);
  private readonly notify = inject(NotifyService);
  private readonly dialogRef = inject(MatDialogRef<CurrencyDialogComponent>);

  protected readonly saving = signal(false);
  protected readonly form = new FormGroup({
    code: new FormControl(this.data?.code ?? '', {
      nonNullable: true,
      validators: [Validators.required, Validators.pattern(/^[A-Za-z]{3}$/)],
    }),
    symbol: new FormControl(this.data?.symbol ?? '', {
      nonNullable: true,
      validators: Validators.required,
    }),
    name: new FormControl(this.data?.name ?? '', {
      nonNullable: true,
      validators: Validators.required,
    }),
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
    const request$ = this.data ? this.api.update(this.data.id, request) : this.api.create(request);
    request$.subscribe({
      next: () => {
        this.store.reloadCurrencies();
        this.dialogRef.close(true);
      },
      error: (error) => {
        this.saving.set(false);
        this.notify.error(error);
      },
    });
  }
}
