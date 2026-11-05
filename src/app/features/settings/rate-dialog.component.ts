import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDatepickerModule } from '@angular/material/datepicker';
import {
  MAT_DIALOG_DATA,
  MatDialog,
  MatDialogModule,
  MatDialogRef,
} from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { CurrencyApi } from '../../core/api';
import { DataStore } from '../../core/data.store';
import { fromIsoDate, toIsoDate } from '../../core/format';
import { ExchangeRate } from '../../core/models';
import { NotifyService } from '../../core/notify.service';
import { DialogCloseComponent } from '../../shared/dialog-close.component';

@Component({
  selector: 'app-rate-dialog',
  imports: [
    ReactiveFormsModule,
    MatDialogModule,
    DialogCloseComponent,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatDatepickerModule,
    MatButtonModule,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h2 mat-dialog-title>{{ data ? 'Modifier le taux' : 'Nouveau taux de change' }}</h2>
    <mat-dialog-content>
      <form class="form-grid" [formGroup]="form" (ngSubmit)="save()">
        <mat-form-field>
          <mat-label>1 unité de</mat-label>
          <mat-select formControlName="baseCurrencyId">
            @for (c of store.currencies(); track c.id) {
              <mat-option [value]="c.id">{{ c.code }} — {{ c.name }}</mat-option>
            }
          </mat-select>
        </mat-form-field>
        <mat-form-field>
          <mat-label>vaut … en</mat-label>
          <mat-select formControlName="quoteCurrencyId">
            @for (c of store.currencies(); track c.id) {
              <mat-option [value]="c.id">{{ c.code }} — {{ c.name }}</mat-option>
            }
          </mat-select>
        </mat-form-field>
        <mat-form-field>
          <mat-label>Taux</mat-label>
          <input matInput type="number" step="0.0001" min="0" formControlName="rate" />
          <mat-error>Taux positif obligatoire</mat-error>
        </mat-form-field>
        <mat-form-field>
          <mat-label>À partir du</mat-label>
          <input matInput [matDatepicker]="picker" formControlName="date" />
          <mat-datepicker-toggle matIconSuffix [for]="picker" />
          <mat-datepicker #picker />
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
export class RateDialogComponent {
  static open(dialog: MatDialog, rate?: ExchangeRate): MatDialogRef<RateDialogComponent> {
    return dialog.open(RateDialogComponent, { data: rate ?? null, width: '560px' });
  }

  protected readonly data = inject<ExchangeRate | null>(MAT_DIALOG_DATA);
  protected readonly store = inject(DataStore);
  private readonly api = inject(CurrencyApi);
  private readonly notify = inject(NotifyService);
  private readonly dialogRef = inject(MatDialogRef<RateDialogComponent>);

  protected readonly saving = signal(false);
  protected readonly form = new FormGroup({
    baseCurrencyId: new FormControl<number | null>(
      this.data?.baseCurrency.id ?? this.store.user()?.referenceCurrency?.id ?? null,
      Validators.required,
    ),
    quoteCurrencyId: new FormControl<number | null>(
      this.data?.quoteCurrency.id ?? null,
      Validators.required,
    ),
    rate: new FormControl<number | null>(this.data?.rate ?? null, [
      Validators.required,
      Validators.min(0.00000001),
    ]),
    date: new FormControl<Date | null>(
      fromIsoDate(this.data?.date) ?? new Date(),
      Validators.required,
    ),
  });

  protected save(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const v = this.form.getRawValue();
    const request = {
      baseCurrencyId: v.baseCurrencyId!,
      quoteCurrencyId: v.quoteCurrencyId!,
      rate: v.rate!,
      date: toIsoDate(v.date)!,
    };
    this.saving.set(true);
    const request$ = this.data
      ? this.api.updateRate(this.data.id, request)
      : this.api.createRate(request);
    request$.subscribe({
      next: () => {
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
