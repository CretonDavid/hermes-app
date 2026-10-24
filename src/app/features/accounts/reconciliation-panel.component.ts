import { DatePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  model,
  output,
  signal,
  untracked,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatDialog } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { AccountApi } from '../../core/api';
import { DataStore } from '../../core/data.store';
import { toIsoDate } from '../../core/format';
import { Account, ReconciliationStatus } from '../../core/models';
import { NotifyService } from '../../core/notify.service';
import { confirm } from '../../shared/confirm-dialog.component';
import { MoneyPipe } from '../../shared/money.pipe';

/**
 * Rapprochement guidé, affiché au-dessus de la liste des opérations du compte : l'utilisateur
 * saisit le solde de son relevé puis coche les opérations dans la liste ; l'écart se met à jour
 * en direct et la validation n'est possible que lorsqu'il est nul.
 */
@Component({
  selector: 'app-reconciliation-panel',
  imports: [
    FormsModule,
    DatePipe,
    MatFormFieldModule,
    MatInputModule,
    MatDatepickerModule,
    MatButtonModule,
    MatIconModule,
    MoneyPipe,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="card panel">
      <div class="row header">
        <h2><mat-icon>fact_check</mat-icon> Rapprochement avec votre relevé bancaire</h2>
        <span class="spacer"></span>
        <button matButton (click)="closed.emit()">Quitter</button>
      </div>

      <ol class="steps">
        <li>Reportez la date et le <strong>solde final</strong> indiqués sur votre relevé.</li>
        <li>
          Dans la liste ci-dessous, cliquez sur le rond
          <mat-icon inline>radio_button_unchecked</mat-icon> de chaque opération qui figure sur le
          relevé.
        </li>
        <li>Quand l'écart est à zéro, validez : les opérations pointées sont verrouillées.</li>
      </ol>

      <div class="form">
        <mat-form-field>
          <mat-label>Date du relevé</mat-label>
          <input
            matInput
            [matDatepicker]="picker"
            [ngModel]="statementDate()"
            (ngModelChange)="statementDate.set($event)"
          />
          <mat-datepicker-toggle matIconSuffix [for]="picker" />
          <mat-datepicker #picker />
        </mat-form-field>
        <mat-form-field>
          <mat-label>Solde final du relevé</mat-label>
          <input
            matInput
            type="number"
            step="0.01"
            [ngModel]="statementBalance()"
            (ngModelChange)="statementBalance.set($event)"
          />
          <span matTextSuffix>&nbsp;{{ currency() }}</span>
        </mat-form-field>

        <div class="kpi">
          <div class="label">Solde pointé</div>
          <div class="value amount">{{ account().clearedBalance | money: currency() }}</div>
        </div>
        <div class="kpi">
          <div class="label">Écart restant</div>
          @if (difference() === null) {
            <div class="value muted">—</div>
          } @else {
            <div
              class="value amount"
              [class.positive]="difference() === 0"
              [class.negative]="difference() !== 0"
            >
              {{ difference() | money: currency() : true }}
            </div>
          }
        </div>

        <button matButton="filled" [disabled]="!canValidate() || saving()" (click)="validate()">
          <mat-icon>lock</mat-icon> Valider le rapprochement
        </button>
      </div>

      <p class="status muted">
        @if (difference() === null) {
          Saisissez le solde de votre relevé pour commencer.
        } @else if (difference() === 0 && (status()?.clearedCount ?? 0) === 0) {
          Aucune nouvelle opération pointée depuis le dernier rapprochement.
        } @else if (difference() === 0) {
          Tout concorde : {{ status()?.clearedCount }} opération(s) pointée(s) seront rapprochées.
        } @else {
          Il manque {{ abs(difference()!) | money: currency() }} :
          {{
            difference()! > 0
              ? 'une recette non pointée ou une dépense en trop'
              : 'une dépense non pointée ou une recette en trop'
          }}
          ? Vérifiez aussi les montants saisis.
        }
      </p>

      @if (status()?.lastReconciliation; as last) {
        <p class="last muted">
          Dernier rapprochement : relevé du {{ last.statementDate | date: 'dd/MM/yyyy' }} ({{
            last.statementBalance | money: currency()
          }}, {{ last.transactionCount }} opération(s)).
          <button matButton (click)="undo()">Annuler ce rapprochement</button>
        </p>
      }
    </div>
  `,
  styles: `
    .panel {
      margin-bottom: 16px;
      border: 2px solid var(--mat-sys-primary);
    }
    .header h2 {
      margin: 0;
    }
    .steps {
      margin: 8px 0 16px;
      padding-left: 20px;
      line-height: 1.8;
      font: var(--mat-sys-body-medium);
    }
    .form {
      display: grid;
      grid-template-columns: 200px 220px 1fr 1fr auto;
      gap: 16px;
      align-items: center;
    }
    .status,
    .last {
      margin: 8px 0 0;
      font: var(--mat-sys-body-medium);
    }
  `,
})
export class ReconciliationPanelComponent {
  readonly account = input.required<Account>();
  readonly statementDate = model<Date | null>(new Date());
  readonly closed = output<void>();

  private readonly api = inject(AccountApi);
  private readonly store = inject(DataStore);
  private readonly notify = inject(NotifyService);
  private readonly dialog = inject(MatDialog);

  protected readonly status = signal<ReconciliationStatus | null>(null);
  protected readonly statementBalance = signal<number | null>(null);
  protected readonly saving = signal(false);

  protected readonly currency = computed(() => this.account().currency.code);
  protected readonly difference = computed(() => {
    const balance = this.statementBalance();
    if (balance === null || balance === undefined || (balance as unknown) === '') {
      return null;
    }
    return Math.round((Number(balance) - this.account().clearedBalance) * 100) / 100;
  });
  protected readonly canValidate = computed(
    () =>
      this.difference() === 0 && (this.status()?.clearedCount ?? 0) > 0 && !!this.statementDate(),
  );
  protected readonly abs = Math.abs;

  constructor() {
    // Rechargé à chaque pointage pour connaître le nombre d'opérations à rapprocher
    effect(() => {
      const id = this.account().id;
      this.store.version();
      untracked(() =>
        this.api.reconciliationStatus(id).subscribe({
          next: (status) => this.status.set(status),
          error: (error) => this.notify.error(error),
        }),
      );
    });
  }

  protected validate(): void {
    this.saving.set(true);
    this.api
      .reconcile(
        this.account().id,
        toIsoDate(this.statementDate())!,
        Number(this.statementBalance()),
      )
      .subscribe({
        next: (r) => {
          this.saving.set(false);
          this.notify.success(
            `Rapprochement validé : ${r.transactionCount} opération(s) verrouillée(s)`,
          );
          this.store.transactionsChanged();
          this.closed.emit();
        },
        error: (error) => {
          this.saving.set(false);
          this.notify.error(error);
        },
      });
  }

  protected undo(): void {
    const last = this.status()?.lastReconciliation;
    if (!last) {
      return;
    }
    confirm(this.dialog, {
      title: 'Annuler le rapprochement',
      message:
        'Les opérations de ce rapprochement seront déverrouillées et redeviendront simplement pointées.',
      confirmLabel: 'Annuler le rapprochement',
    }).subscribe((ok) => {
      if (ok) {
        this.api.undoReconciliation(this.account().id, last.id).subscribe({
          next: () => {
            this.notify.success('Rapprochement annulé');
            this.store.transactionsChanged();
          },
          error: (error) => this.notify.error(error),
        });
      }
    });
  }
}
