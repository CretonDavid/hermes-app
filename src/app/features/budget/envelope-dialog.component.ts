import { DatePipe, TitleCasePipe } from '@angular/common';
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
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatRadioModule } from '@angular/material/radio';
import { Observable } from 'rxjs';
import { BudgetApi } from '../../core/api';
import { BudgetEnvelope } from '../../core/models';
import { NotifyService } from '../../core/notify.service';
import { AmountInputDirective } from '../../shared/amount-input.directive';
import { CategoryPickerComponent } from '../../shared/category-picker.component';
import { DIALOG_SMALL, confirm } from '../../shared/confirm-dialog.component';
import { DialogCloseComponent } from '../../shared/dialog-close.component';
import { protectDirtyForm } from '../../shared/dialog-guard';
import { showFormErrors } from '../../shared/form-errors';
import { MoneyPipe } from '../../shared/money.pipe';

export interface EnvelopeDialogData {
  // Mois affiché, aaaa-mm
  month: string;
  currencyCode: string;
  // Absente à la création
  envelope?: BudgetEnvelope;
}

// Création d'une enveloppe, ou modification de son montant pour un mois ou à partir d'un mois
@Component({
  selector: 'app-envelope-dialog',
  imports: [
    DatePipe,
    TitleCasePipe,
    ReactiveFormsModule,
    MatDialogModule,
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatRadioModule,
    AmountInputDirective,
    CategoryPickerComponent,
    DialogCloseComponent,
    MoneyPipe,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h2 mat-dialog-title>
      {{ envelope ? 'Enveloppe · ' + envelope.category.name : 'Nouvelle enveloppe' }}
    </h2>
    <mat-dialog-content>
      <form class="fields" [formGroup]="form" (ngSubmit)="save()">
        @if (!envelope) {
          <app-category-picker
            formControlName="categoryId"
            type="EXPENSE"
            label="Catégorie de dépense"
          />
        }
        <mat-form-field>
          <mat-label>Budget mensuel</mat-label>
          <input matInput appAmount formControlName="amount" placeholder="0,00" />
          <span matTextSuffix>&nbsp;{{ data.currencyCode }}</span>
          <mat-error>Indiquez un montant supérieur à 0</mat-error>
        </mat-form-field>

        @if (envelope) {
          <mat-radio-group formControlName="monthOnly" class="scope" aria-label="Mois concernés">
            <mat-radio-button [value]="false">
              À partir de {{ monthDate | date: 'MMMM yyyy' }}
              <span class="muted">· les mois précédents ne changent pas</span>
            </mat-radio-button>
            <mat-radio-button [value]="true">
              {{ monthDate | date: 'MMMM yyyy' | titlecase }} seulement
            </mat-radio-button>
          </mat-radio-group>
          @if (envelope.monthOnly && envelope.usualAmount !== null) {
            <button matButton type="button" class="revert" (click)="revert()">
              <mat-icon>undo</mat-icon> Revenir au montant habituel ({{
                envelope.usualAmount | money: data.currencyCode
              }})
            </button>
          }
        } @else {
          <p class="muted hint">
            <mat-icon inline>info</mat-icon>
            Le montant vaut chaque mois à partir de {{ monthDate | date: 'MMMM yyyy' }}. Une
            catégorie principale couvre aussi ses sous-catégories.
          </p>
        }
        <button type="submit" hidden></button>
      </form>
    </mat-dialog-content>
    <mat-dialog-actions>
      @if (envelope) {
        <button matButton class="delete" (click)="remove()">
          <mat-icon>delete</mat-icon> Supprimer
        </button>
      }
      <span class="spacer"></span>
      <button matButton mat-dialog-close>Annuler</button>
      <button matButton="filled" (click)="save()" [disabled]="saving()">
        {{ envelope ? 'Enregistrer' : 'Créer' }}
      </button>
    </mat-dialog-actions>
    <app-dialog-close />
  `,
  styles: `
    .fields {
      display: flex;
      flex-direction: column;
      gap: 12px;
      padding-top: 4px;
    }
    .scope {
      display: flex;
      flex-direction: column;
    }
    .revert {
      align-self: flex-start;
    }
    .hint {
      margin: 0;
      font: var(--mat-sys-body-small);
    }
    .delete {
      color: var(--mat-sys-error);
    }
    .spacer {
      flex: 1;
    }
  `,
})
export class EnvelopeDialogComponent {
  static open(dialog: MatDialog, data: EnvelopeDialogData): MatDialogRef<EnvelopeDialogComponent> {
    return dialog.open(EnvelopeDialogComponent, { data, width: DIALOG_SMALL });
  }

  protected readonly data = inject<EnvelopeDialogData>(MAT_DIALOG_DATA);
  private readonly api = inject(BudgetApi);
  private readonly notify = inject(NotifyService);
  private readonly dialog = inject(MatDialog);
  private readonly dialogRef = inject(MatDialogRef<EnvelopeDialogComponent>);

  protected readonly envelope = this.data.envelope;
  protected readonly monthDate = new Date(`${this.data.month}-01T00:00:00`);
  protected readonly saving = signal(false);
  protected readonly form = new FormGroup({
    categoryId: new FormControl<number | null>(null),
    amount: new FormControl<number | null>(this.envelope?.amount ?? null, [
      Validators.required,
      Validators.min(0.01),
    ]),
    // Un mois qui a déjà son propre montant se modifie par défaut pour ce mois seulement
    monthOnly: new FormControl(this.envelope?.monthOnly ?? false, { nonNullable: true }),
  });

  constructor() {
    protectDirtyForm(this.form);
  }

  protected save(): void {
    showFormErrors(this.form);
    const v = this.form.getRawValue();
    if (this.form.invalid) {
      return;
    }
    if (!this.envelope && v.categoryId === null) {
      this.notify.error('Choisissez une catégorie de dépense');
      return;
    }
    const request$: Observable<void> = this.envelope
      ? this.api.updateAmount(this.envelope.id, {
          amount: v.amount!,
          month: this.data.month,
          monthOnly: v.monthOnly,
        })
      : this.api.createEnvelope({
          categoryId: v.categoryId!,
          amount: v.amount!,
          month: this.data.month,
        });
    this.run(request$, this.envelope ? 'Enveloppe modifiée' : 'Enveloppe créée');
  }

  protected revert(): void {
    this.run(
      this.api.clearMonthAmount(this.envelope!.id, this.data.month),
      'Montant habituel rétabli',
    );
  }

  protected remove(): void {
    const envelope = this.envelope!;
    confirm(this.dialog, {
      title: "Supprimer l'enveloppe",
      message: `L'enveloppe « ${envelope.category.name} » sera supprimée pour tous les mois. Les opérations ne changent pas.`,
      confirmLabel: 'Supprimer',
      danger: true,
    }).subscribe((ok) => {
      if (ok) {
        this.run(this.api.deleteEnvelope(envelope.id), 'Enveloppe supprimée');
      }
    });
  }

  private run(request$: Observable<void>, message: string): void {
    this.saving.set(true);
    request$.subscribe({
      next: () => {
        this.notify.success(message);
        this.dialogRef.close(true);
      },
      error: (error) => {
        this.saving.set(false);
        this.notify.error(error);
      },
    });
  }
}
