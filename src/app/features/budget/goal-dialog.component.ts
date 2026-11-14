import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
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
import { MatSelectModule } from '@angular/material/select';
import { Observable } from 'rxjs';
import { GoalApi } from '../../core/api';
import { DataStore } from '../../core/data.store';
import { Goal } from '../../core/models';
import { NotifyService } from '../../core/notify.service';
import { AmountInputDirective } from '../../shared/amount-input.directive';
import { DIALOG_SMALL } from '../../shared/confirm-dialog.component';
import { DialogCloseComponent } from '../../shared/dialog-close.component';
import { protectDirtyForm } from '../../shared/dialog-guard';
import { showFormErrors } from '../../shared/form-errors';

// Création d'un budget spécial, ou modification de son nom et de son objectif
@Component({
  selector: 'app-goal-dialog',
  imports: [
    ReactiveFormsModule,
    MatDialogModule,
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatSelectModule,
    AmountInputDirective,
    DialogCloseComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h2 mat-dialog-title>{{ goal ? 'Modifier le budget spécial' : 'Nouveau budget spécial' }}</h2>
    <mat-dialog-content>
      <form class="fields" [formGroup]="form" (ngSubmit)="save()">
        <mat-form-field>
          <mat-label>Nom</mat-label>
          <input matInput formControlName="name" maxlength="100" placeholder="Ex. Moto" />
          <mat-error>Indiquez un nom</mat-error>
        </mat-form-field>

        @if (goal) {
          <p class="muted hint">
            <mat-icon inline>account_balance</mat-icon> Mis de côté sur {{ goal.accountName }}
          </p>
        } @else {
          <mat-form-field>
            <mat-label>Compte bancaire</mat-label>
            <mat-select formControlName="accountId">
              @for (account of accounts(); track account.id) {
                <mat-option [value]="account.id">
                  {{ account.name }} ({{ account.currency.code }})
                </mat-option>
              }
            </mat-select>
            <mat-hint>L'argent du budget reste sur ce compte</mat-hint>
            <mat-error>Choisissez un compte bancaire</mat-error>
          </mat-form-field>
        }

        <mat-form-field>
          <mat-label>Objectif</mat-label>
          <input matInput appAmount formControlName="targetAmount" placeholder="0,00" />
          <span matTextSuffix>&nbsp;{{ currencyCode() }}</span>
          <mat-error>Indiquez un montant supérieur à 0</mat-error>
        </mat-form-field>

        @if (!goal) {
          <mat-form-field>
            <mat-label>Déjà mis de côté (facultatif)</mat-label>
            <input matInput appAmount formControlName="initialAmount" placeholder="0,00" />
            <span matTextSuffix>&nbsp;{{ currencyCode() }}</span>
            <mat-hint>Montant déjà présent sur le compte pour ce budget</mat-hint>
            <mat-error>Le montant ne peut pas être négatif</mat-error>
          </mat-form-field>
          <p class="muted hint">
            <mat-icon inline>info</mat-icon>
            Lors d'un virement vers ce compte, vous pourrez en affecter une partie à ce budget. Un
            retrait ne l'entame que si le solde passe sous le total de ses budgets spéciaux.
          </p>
        }
        <button type="submit" hidden></button>
      </form>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button matButton mat-dialog-close>Annuler</button>
      <button matButton="filled" (click)="save()" [disabled]="saving()">
        {{ goal ? 'Enregistrer' : 'Créer' }}
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
    .hint {
      margin: 0;
      font: var(--mat-sys-body-small);
    }
  `,
})
export class GoalDialogComponent {
  static open(dialog: MatDialog, goal?: Goal): MatDialogRef<GoalDialogComponent, boolean> {
    return dialog.open(GoalDialogComponent, { data: goal ?? null, width: DIALOG_SMALL });
  }

  protected readonly goal = inject<Goal | null>(MAT_DIALOG_DATA);
  private readonly store = inject(DataStore);
  private readonly api = inject(GoalApi);
  private readonly notify = inject(NotifyService);
  private readonly dialogRef = inject(MatDialogRef<GoalDialogComponent, boolean>);

  // Comptes ouverts, ceux d'épargne en premier
  protected readonly accounts = computed(() =>
    [...this.store.openAccounts()].sort(
      (a, b) => Number(b.accountType.savings) - Number(a.accountType.savings),
    ),
  );
  protected readonly saving = signal(false);
  protected readonly form = new FormGroup({
    name: new FormControl(this.goal?.name ?? '', {
      nonNullable: true,
      validators: Validators.required,
    }),
    accountId: new FormControl<number | null>(
      this.goal?.accountId ?? this.accounts()[0]?.id ?? null,
      Validators.required,
    ),
    targetAmount: new FormControl<number | null>(this.goal?.targetAmount ?? null, [
      Validators.required,
      Validators.min(0.01),
    ]),
    initialAmount: new FormControl<number | null>(null, Validators.min(0)),
  });
  private readonly accountId = toSignal(this.form.controls.accountId.valueChanges, {
    initialValue: this.form.controls.accountId.value,
  });
  protected readonly currencyCode = computed(
    () => this.goal?.currencyCode ?? this.store.account(this.accountId())?.currency.code ?? 'EUR',
  );

  constructor() {
    protectDirtyForm(this.form);
  }

  protected save(): void {
    showFormErrors(this.form);
    if (this.form.invalid) {
      return;
    }
    const v = this.form.getRawValue();
    const request$: Observable<Goal> = this.goal
      ? this.api.update(this.goal.id, { name: v.name.trim(), targetAmount: v.targetAmount! })
      : this.api.create({
          name: v.name.trim(),
          accountId: v.accountId!,
          targetAmount: v.targetAmount!,
          initialAmount: v.initialAmount ?? 0,
        });
    this.saving.set(true);
    request$.subscribe({
      next: () => {
        this.notify.success(this.goal ? 'Budget spécial modifié' : 'Budget spécial créé');
        this.dialogRef.close(true);
      },
      error: (error) => {
        this.saving.set(false);
        this.notify.error(error);
      },
    });
  }
}
