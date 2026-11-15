import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
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
import { GoalApi } from '../../core/api';
import { fromIsoDate, toIsoDate } from '../../core/format';
import { Goal } from '../../core/models';
import { NotifyService } from '../../core/notify.service';
import { DIALOG_SMALL } from '../../shared/confirm-dialog.component';
import { DialogCloseComponent } from '../../shared/dialog-close.component';
import { showFormErrors } from '../../shared/form-errors';
import { MoneyPipe } from '../../shared/money.pipe';

// Le budget spécial a servi (la moto est achetée) : son montant est libéré à partir de la date choisie
@Component({
  selector: 'app-goal-use-dialog',
  imports: [
    ReactiveFormsModule,
    MatDialogModule,
    MatButtonModule,
    MatDatepickerModule,
    MatFormFieldModule,
    MatInputModule,
    DialogCloseComponent,
    MoneyPipe,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h2 mat-dialog-title>{{ goal.name }} : marquer comme utilisé</h2>
    <mat-dialog-content>
      <p>
        Les {{ goal.savedAmount | money: goal.currencyCode }} mis de côté sur
        {{ goal.accountName }} sont libérés à cette date : un retrait du même jour (l'achat) ne
        touche pas vos autres budgets spéciaux. Le budget passe dans l'historique.
      </p>
      <mat-form-field style="width: 100%">
        <mat-label>Date d'utilisation</mat-label>
        <input
          matInput
          [matDatepicker]="picker"
          [formControl]="date"
          [min]="minDate"
          (keydown.enter)="save()"
        />
        <mat-datepicker-toggle matIconSuffix [for]="picker" />
        <mat-datepicker #picker />
        <mat-error>Date obligatoire, après la création du budget (jj/mm/aaaa)</mat-error>
      </mat-form-field>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button matButton mat-dialog-close>Annuler</button>
      <button matButton="filled" (click)="save()" [disabled]="saving()">
        Marquer comme utilisé
      </button>
    </mat-dialog-actions>
    <app-dialog-close />
  `,
})
export class GoalUseDialogComponent {
  static open(dialog: MatDialog, goal: Goal): MatDialogRef<GoalUseDialogComponent, boolean> {
    return dialog.open(GoalUseDialogComponent, { data: goal, width: DIALOG_SMALL });
  }

  protected readonly goal = inject<Goal>(MAT_DIALOG_DATA);
  private readonly api = inject(GoalApi);
  private readonly notify = inject(NotifyService);
  private readonly dialogRef = inject(MatDialogRef<GoalUseDialogComponent, boolean>);

  protected readonly minDate = fromIsoDate(this.goal.startDate);
  protected readonly saving = signal(false);
  protected readonly date = new FormControl<Date | null>(new Date(), Validators.required);

  protected save(): void {
    showFormErrors(this.date);
    if (this.date.invalid) {
      return;
    }
    this.saving.set(true);
    this.api.use(this.goal.id, toIsoDate(this.date.value)!).subscribe({
      next: () => {
        this.notify.success(`${this.goal.name} est marqué comme utilisé`);
        this.dialogRef.close(true);
      },
      error: (error) => {
        this.saving.set(false);
        this.notify.error(error);
      },
    });
  }
}
