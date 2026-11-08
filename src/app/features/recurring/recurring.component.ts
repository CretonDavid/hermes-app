import { DatePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatTableModule } from '@angular/material/table';
import { MatTooltipModule } from '@angular/material/tooltip';
import { forkJoin } from 'rxjs';
import { RecurringApi } from '../../core/api';
import { DataStore } from '../../core/data.store';
import { frequencyLabel, reimbursementPeriodLabel } from '../../core/format';
import { RecurringTransaction, ReimbursementTracking, UpcomingOccurrence } from '../../core/models';
import { NotifyService } from '../../core/notify.service';
import { confirm } from '../../shared/confirm-dialog.component';
import { untilEndOfMonth } from '../../shared/forecast';
import { formatMoney, MoneyPipe } from '../../shared/money.pipe';
import { NoAccountComponent } from '../../shared/no-account.component';
import { RecurringDialogComponent } from './recurring-dialog.component';
import {
  RecurringHistoryDialogComponent,
  RecurringHistoryTab,
} from './recurring-history-dialog.component';

@Component({
  selector: 'app-recurring',
  imports: [
    DatePipe,
    MatButtonModule,
    MatIconModule,
    MatTableModule,
    MatTooltipModule,
    MoneyPipe,
    NoAccountComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page">
      <div class="page-header">
        <div>
          <h1>Récurrences</h1>
          <div class="subtitle">
            Loyer, salaire, abonnements, épargne automatique… créés automatiquement à échéance
          </div>
        </div>
        @if (store.openAccounts().length > 0) {
          <button matButton="filled" (click)="create()">
            <mat-icon>add</mat-icon> Nouvelle récurrence
          </button>
        }
      </div>

      @if (store.loaded() && store.accounts().length === 0) {
        <app-no-account
          message="Les récurrences (loyer, salaire, abonnements…) sont rattachées à un compte bancaire."
        />
      } @else {
        <div class="grid grid-3" style="margin-bottom: 16px">
          <div class="card kpi">
            <div class="label">Dépenses récurrentes / mois</div>
            <div class="value amount">
              {{ monthly().expenses | money: store.referenceCurrency() }}
            </div>
            <div class="delta muted">Estimation, dans la devise des comptes bancaires</div>
          </div>
          <div class="card kpi">
            <div class="label">Revenus récurrents / mois</div>
            <div class="value amount" [class.positive]="monthly().income > 0">
              {{ monthly().income | money: store.referenceCurrency() }}
            </div>
            <div class="delta muted">Estimation, dans la devise des comptes bancaires</div>
          </div>
          <div class="card kpi">
            <div class="label">Virements programmés / mois</div>
            <div class="value amount">
              {{ monthly().transfers | money: store.referenceCurrency() }}
            </div>
            <div class="delta muted">Estimation, dans la devise des comptes bancaires</div>
          </div>
        </div>

        <div class="grid layout">
          <div class="card">
            <table mat-table [dataSource]="items()">
              <ng-container matColumnDef="label">
                <th mat-header-cell *matHeaderCellDef>Libellé</th>
                <td mat-cell *matCellDef="let r">
                  <div class="label-cell">
                    @if (overdue().get(r.id); as message) {
                      <mat-icon
                        class="overdue"
                        tabindex="0"
                        role="button"
                        matTooltipClass="multiline-tooltip"
                        [matTooltip]="message"
                        [attr.aria-label]="message"
                        (click)="history(r, 'reimbursements')"
                        (keydown.enter)="history(r, 'reimbursements')"
                        >error</mat-icon
                      >
                    }
                    <div>
                      <div class="label">{{ r.label }}</div>
                      <div class="muted small">
                        {{
                          r.transfer ? 'Virement' : r.direction === 'CREDIT' ? 'Revenu' : 'Dépense'
                        }}
                        · {{ r.accountName
                        }}{{
                          r.transfer
                            ? ' → ' + r.targetAccountName
                            : r.category
                              ? ' · ' + r.category.name
                              : ''
                        }}
                        @if (r.reimbursementPayers.length) {
                          · remboursée par {{ payerNames(r) }}
                        }
                      </div>
                    </div>
                  </div>
                </td>
              </ng-container>
              <ng-container matColumnDef="frequency">
                <th mat-header-cell *matHeaderCellDef>Fréquence</th>
                <td mat-cell *matCellDef="let r">{{ label(r) }}</td>
              </ng-container>
              <ng-container matColumnDef="next">
                <th mat-header-cell *matHeaderCellDef>Prochaine</th>
                <td mat-cell *matCellDef="let r">
                  @if (r.active && r.nextDate) {
                    {{ r.nextDate | date: 'dd/MM/yyyy' }}
                  } @else {
                    <span class="chip">{{ r.nextDate ? 'En pause' : 'Terminée' }}</span>
                  }
                </td>
              </ng-container>
              <ng-container matColumnDef="amount">
                <th mat-header-cell *matHeaderCellDef>Montant</th>
                <td
                  mat-cell
                  *matCellDef="let r"
                  class="amount"
                  [class.positive]="!r.transfer && r.direction === 'CREDIT'"
                >
                  {{
                    (r.direction === 'DEBIT' ? -r.amount : r.amount) | money: r.currencyCode : true
                  }}
                </td>
              </ng-container>
              <ng-container matColumnDef="actions">
                <th mat-header-cell *matHeaderCellDef></th>
                <td mat-cell *matCellDef="let r" style="text-align: right; white-space: nowrap">
                  @if (r.reimbursementPayers.length) {
                    <button
                      matIconButton
                      matTooltip="Historique des remboursements et des opérations"
                      [attr.aria-label]="'Historique de ' + r.label"
                      (click)="history(r)"
                    >
                      <mat-icon>history</mat-icon>
                    </button>
                  }
                  <button
                    matIconButton
                    matTooltip="Modifier"
                    [attr.aria-label]="'Modifier ' + r.label"
                    (click)="edit(r)"
                  >
                    <mat-icon>edit</mat-icon>
                  </button>
                  <button
                    matIconButton
                    matTooltip="Supprimer"
                    [attr.aria-label]="'Supprimer ' + r.label"
                    (click)="remove(r)"
                  >
                    <mat-icon>delete</mat-icon>
                  </button>
                </td>
              </ng-container>
              <tr mat-header-row *matHeaderRowDef="columns"></tr>
              <tr
                mat-row
                *matRowDef="let row; columns: columns"
                [class.inactive]="!row.active"
              ></tr>
            </table>
            @if (items().length === 0) {
              <div class="empty">
                <mat-icon>event_repeat</mat-icon>
                <p>
                  Aucune récurrence.<br />Ajoutez votre loyer, votre salaire ou vos abonnements :
                  ils seront créés automatiquement à chaque échéance.
                </p>
                <button matButton="filled" (click)="create()">
                  <mat-icon>add</mat-icon> Nouvelle récurrence
                </button>
              </div>
            }
          </div>

          <div class="card">
            <h2><mat-icon>event_upcoming</mat-icon> D'ici la fin du mois</h2>
            @for (o of upcoming(); track o.recurringTransactionId + o.date) {
              <div class="upcoming">
                <span class="date">{{ o.date | date: 'dd/MM/yyyy' }}</span>
                <span class="flex">{{ o.label }}</span>
                <span class="amount" [class.positive]="o.direction === 'CREDIT'">
                  {{
                    (o.direction === 'DEBIT' ? -o.amount : o.amount) | money: o.currencyCode : true
                  }}
                </span>
              </div>
            } @empty {
              <p class="muted">Plus rien de prévu ce mois-ci</p>
            }
          </div>
        </div>
      }
    </div>
  `,
  styles: `
    // Chaque bloc garde sa propre hauteur au lieu de s'étirer sur le plus grand
    .layout {
      grid-template-columns: minmax(0, 2fr) minmax(0, 1fr);
      align-items: start;
    }
    @media (max-width: 1320px) {
      .layout {
        grid-template-columns: minmax(0, 1fr);
      }
    }
    td.mat-mdc-cell {
      padding-top: 12px;
      padding-bottom: 12px;
    }
    .label {
      font-weight: 500;
    }
    // Pastille d'alerte centrée verticalement à gauche du libellé et du détail
    .label-cell {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .overdue {
      flex-shrink: 0;
      width: 20px;
      height: 20px;
      font-size: 20px;
      color: var(--mat-sys-error);
      cursor: help;
    }
    .small {
      font: var(--mat-sys-body-small);
    }
    tr.inactive {
      opacity: 0.55;
    }
    .upcoming {
      display: flex;
      gap: 12px;
      padding: 8px 0;
      border-bottom: 1px solid var(--hermes-border);
      .date {
        width: 84px;
        flex-shrink: 0;
        color: var(--mat-sys-primary);
        font: var(--mat-sys-label-large);
      }
      .flex {
        flex: 1;
      }
    }
  `,
})
export class RecurringComponent {
  protected readonly store = inject(DataStore);
  private readonly api = inject(RecurringApi);
  private readonly notify = inject(NotifyService);
  private readonly dialog = inject(MatDialog);

  protected readonly columns = ['label', 'frequency', 'next', 'amount', 'actions'];
  protected readonly items = signal<RecurringTransaction[]>([]);
  protected readonly upcoming = signal<UpcomingOccurrence[]>([]);
  protected readonly reimbursements = signal<ReimbursementTracking[]>([]);
  // Par récurrence, les périodes terminées sans remboursement complet (la plus ancienne d'abord)
  protected readonly overdue = computed(() => {
    const messages = new Map<number, string>();
    for (const t of this.reimbursements()) {
      const lines = t.payers.flatMap((payer) =>
        payer.periods
          .filter((p) => p.status === 'UNPAID' || p.status === 'PARTIAL')
          .reverse()
          .map(
            (p) =>
              `${payer.name} ne vous a pas encore ${p.status === 'PARTIAL' ? 'entièrement ' : ''}remboursé ` +
              `pour ${reimbursementPeriodLabel(payer.period, p.start)} : reste ${formatMoney(p.remaining, t.currencyCode)}.`,
          ),
      );
      if (lines.length) {
        messages.set(
          t.recurringTransactionId,
          [...lines, 'Cliquez pour voir le suivi des remboursements.'].join('\n'),
        );
      }
    }
    return messages;
  });

  // Equivalent mensuel des récurrences actives
  protected readonly monthly = computed(() => {
    const perMonth = { DAILY: 30.44, WEEKLY: 4.348, MONTHLY: 1, YEARLY: 1 / 12 };
    const totals = { expenses: 0, income: 0, transfers: 0 };
    for (const r of this.items()) {
      if (!r.active || !r.nextDate) {
        continue;
      }
      const amount = (r.amount * perMonth[r.frequency]) / r.interval;
      if (r.transfer) {
        totals.transfers += amount;
      } else if (r.direction === 'DEBIT') {
        totals.expenses += amount;
      } else {
        totals.income += amount;
      }
    }
    return totals;
  });

  constructor() {
    effect(() => {
      this.store.version();
      untracked(() => this.load());
    });
  }

  protected label(r: RecurringTransaction): string {
    return frequencyLabel(r.frequency, r.interval);
  }

  protected payerNames(r: RecurringTransaction): string {
    const names = r.reimbursementPayers.map((p) => p.name);
    return names.length > 1 ? `${names.slice(0, -1).join(', ')} et ${names.at(-1)}` : names[0];
  }

  protected create(): void {
    RecurringDialogComponent.open(this.dialog);
  }

  protected edit(r: RecurringTransaction): void {
    RecurringDialogComponent.open(this.dialog, r);
  }

  protected history(r: RecurringTransaction, tab?: RecurringHistoryTab): void {
    RecurringHistoryDialogComponent.open(this.dialog, { recurring: r, tab });
  }

  protected remove(r: RecurringTransaction): void {
    confirm(this.dialog, {
      title: 'Supprimer la récurrence',
      message: `« ${r.label} » ne sera plus générée. Les opérations déjà créées sont conservées.`,
      confirmLabel: 'Supprimer',
      danger: true,
    }).subscribe((ok) => {
      if (ok) {
        this.api.delete(r.id).subscribe({
          next: () => this.store.transactionsChanged(),
          error: (error) => this.notify.error(error),
        });
      }
    });
  }

  private load(): void {
    forkJoin({
      items: this.api.list(),
      upcoming: this.api.upcoming(31),
      reimbursements: this.api.reimbursements(),
    }).subscribe({
      next: ({ items, upcoming, reimbursements }) => {
        this.items.set(items);
        this.reimbursements.set(reimbursements);
        this.upcoming.set(untilEndOfMonth(upcoming));
      },
      error: (error) => this.notify.error(error),
    });
  }
}
