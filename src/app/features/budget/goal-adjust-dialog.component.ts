import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import {
  MAT_DIALOG_DATA,
  MatDialog,
  MatDialogModule,
  MatDialogRef,
} from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { GoalApi } from '../../core/api';
import { Goal } from '../../core/models';
import { NotifyService } from '../../core/notify.service';
import { AmountInputDirective } from '../../shared/amount-input.directive';
import { DIALOG_SMALL } from '../../shared/confirm-dialog.component';
import { DialogCloseComponent } from '../../shared/dialog-close.component';
import { protectDirtyForm } from '../../shared/dialog-guard';
import { showFormErrors } from '../../shared/form-errors';
import { MoneyPipe } from '../../shared/money.pipe';

export interface GoalAdjustData {
  goal: Goal;
  // Argent libre du compte : solde moins ses budgets spéciaux
  free: number;
}

type Direction = 'IN' | 'OUT';

const round2 = (value: number) => Math.round(value * 100) / 100;

// Déplace de l'argent entre la part libre du compte et un budget spécial, sans opération bancaire
@Component({
  selector: 'app-goal-adjust-dialog',
  imports: [
    ReactiveFormsModule,
    MatDialogModule,
    MatButtonModule,
    MatButtonToggleModule,
    MatFormFieldModule,
    MatInputModule,
    AmountInputDirective,
    DialogCloseComponent,
    MoneyPipe,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h2 mat-dialog-title>{{ goal.name }} : affecter de l'argent</h2>
    <mat-dialog-content>
      <form class="fields" [formGroup]="form" (ngSubmit)="save()">
        <mat-button-toggle-group
          formControlName="direction"
          class="direction"
          hideSingleSelectionIndicator
          aria-label="Sens du mouvement"
        >
          <mat-button-toggle value="IN" [disabled]="maxIn() <= 0">
            Affecter au budget
          </mat-button-toggle>
          <mat-button-toggle value="OUT" [disabled]="goal.savedAmount <= 0">
            Rendre libre
          </mat-button-toggle>
        </mat-button-toggle-group>

        <p class="muted figures">
          Libre sur {{ goal.accountName }} :
          <strong>{{ data.free | money: goal.currencyCode }}</strong> · Mis de côté :
          <strong>{{ goal.savedAmount | money: goal.currencyCode }}</strong>
          @if (!goal.reached) {
            · Il manque <strong>{{ goal.remaining | money: goal.currencyCode }}</strong>
          }
        </p>

        <mat-form-field>
          <mat-label>Montant</mat-label>
          <input matInput appAmount formControlName="amount" placeholder="0,00" />
          <span matTextSuffix>&nbsp;{{ goal.currencyCode }}</span>
          <mat-error>Entre 0,01 et {{ max() | money: goal.currencyCode }}</mat-error>
        </mat-form-field>
        <button type="button" matButton class="fill" (click)="fillMax()" [disabled]="max() <= 0">
          {{ direction() === 'IN' ? 'Tout ce qui est possible' : 'Tout rendre libre' }} ({{
            max() | money: goal.currencyCode
          }})
        </button>
        <button type="submit" hidden></button>
      </form>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button matButton mat-dialog-close>Annuler</button>
      <button matButton="filled" (click)="save()" [disabled]="saving() || max() <= 0">
        Valider
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
    .direction {
      width: 100%;

      mat-button-toggle {
        flex: 1;
      }
    }
    .figures {
      margin: 0;
      font: var(--mat-sys-body-small);
    }
    .fill {
      align-self: flex-start;
    }
  `,
})
export class GoalAdjustDialogComponent {
  static open(dialog: MatDialog, data: GoalAdjustData): MatDialogRef<GoalAdjustDialogComponent> {
    return dialog.open(GoalAdjustDialogComponent, { data, width: DIALOG_SMALL });
  }

  protected readonly data = inject<GoalAdjustData>(MAT_DIALOG_DATA);
  protected readonly goal = this.data.goal;
  private readonly api = inject(GoalApi);
  private readonly notify = inject(NotifyService);
  private readonly dialogRef = inject(MatDialogRef<GoalAdjustDialogComponent>);

  // Pas plus que l'argent libre ni que ce qu'il manque au budget
  protected readonly maxIn = signal(
    round2(Math.max(0, Math.min(this.data.free, this.goal.remaining))),
  );
  protected readonly saving = signal(false);
  protected readonly form = new FormGroup({
    direction: new FormControl<Direction>(this.maxIn() > 0 ? 'IN' : 'OUT', { nonNullable: true }),
    amount: new FormControl<number | null>(null),
  });
  protected readonly direction = toSignal(this.form.controls.direction.valueChanges, {
    initialValue: this.form.controls.direction.value,
  });
  protected readonly max = computed(() =>
    this.direction() === 'IN' ? this.maxIn() : this.goal.savedAmount,
  );

  constructor() {
    protectDirtyForm(this.form);
  }

  protected fillMax(): void {
    this.form.controls.amount.setValue(this.max());
    this.form.markAsDirty();
  }

  protected save(): void {
    this.form.controls.amount.setValidators([
      Validators.required,
      Validators.min(0.01),
      Validators.max(this.max()),
    ]);
    this.form.controls.amount.updateValueAndValidity();
    showFormErrors(this.form);
    if (this.form.invalid) {
      return;
    }
    const amount = this.form.controls.amount.value!;
    const signed = this.direction() === 'IN' ? amount : -amount;
    this.saving.set(true);
    this.api.adjust(this.goal.id, signed).subscribe({
      next: () => {
        this.notify.success(
          signed > 0
            ? `Argent affecté à ${this.goal.name}`
            : `Argent de ${this.goal.name} rendu libre`,
        );
        this.dialogRef.close(true);
      },
      error: (error) => {
        this.saving.set(false);
        this.notify.error(error);
      },
    });
  }
}
