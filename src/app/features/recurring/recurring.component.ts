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
import { RouterLink } from '@angular/router';
import { RecurringApi, StatsApi } from '../../core/api';
import { DataStore } from '../../core/data.store';
import { frequencyLabel, reimbursementPeriodLabel } from '../../core/format';
import {
  RecurringMonthly,
  RecurringTransaction,
  ReimbursementTracking,
  UpcomingOccurrence,
} from '../../core/models';
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
    RouterLink,
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
        @if (monthly().missingRates.length) {
          <div class="card warning-card">
            <mat-icon>currency_exchange</mat-icon>
            Taux de change manquants pour {{ monthly().missingRates.join(', ') }} : ces récurrences
            ne sont pas comptées.
            <a routerLink="/settings" [queryParams]="{ tab: 'rates' }">Ajouter des taux</a>
          </div>
        }
        <div class="grid grid-4" style="margin-bottom: 16px">
          <div class="card kpi">
            <div class="label">
              Ce mois-ci
              <mat-icon
                class="info"
                matTooltip="Ce qui sort réellement des comptes ce mois-ci : échéances déjà prélevées et à venir d’ici la fin du mois. Une dépense annuelle compte en entier le mois où elle tombe, et pas les autres mois. Les remboursements des tiers ne sont pas déduits."
                >info</mat-icon
              >
            </div>
            <div class="value amount">
              {{ monthly().monthExpenses | money: monthly().currencyCode }}
            </div>
            <div class="delta muted">Échéances passées et à venir du mois</div>
          </div>
          <div class="card kpi">
            <div class="label">
              Coût net / mois
              <mat-icon
                class="info"
                matTooltip="Coût de toutes les dépenses récurrentes ramené à un mois moyen : une dépense annuelle compte pour 1/12 chaque mois, une trimestrielle pour 1/3. La part remboursée par des tiers est déduite : un abonnement de 20 € remboursé à 50 % compte pour 10 €."
                >info</mat-icon
              >
            </div>
            <div class="value amount">
              {{ monthly().expenses | money: monthly().currencyCode }}
            </div>
            <div class="delta muted">
              Moyenne sur l’année, part remboursée par des tiers déduite
            </div>
          </div>
          <div class="card kpi">
            <div class="label">Revenus récurrents / mois</div>
            <div class="value amount" [class.positive]="monthly().income > 0">
              {{ monthly().income | money: monthly().currencyCode }}
            </div>
            <div class="delta muted">Estimation, au taux de change du jour</div>
          </div>
          <div class="card kpi">
            <div class="label">Virements programmés / mois</div>
            <div class="value amount">
              {{ monthly().transfers | money: monthly().currencyCode }}
            </div>
            <div class="delta muted">Estimation, au taux de change du jour</div>
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
    .warning-card {
      display: flex;
      align-items: center;
      gap: 12px;
      margin-bottom: 16px;
      background: var(--mat-sys-tertiary-container);
      color: var(--mat-sys-on-tertiary-container);
      border: none;

      a {
        color: inherit;
        font-weight: 500;
      }
    }
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
      color: var(--hermes-warning);
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
  private readonly stats = inject(StatsApi);
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

  // Totaux des récurrences, convertis par l'API dans la devise de référence
  protected readonly monthly = signal<RecurringMonthly>({
    currencyCode: this.store.referenceCurrency(),
    missingRates: [],
    monthExpenses: 0,
    expenses: 0,
    income: 0,
    transfers: 0,
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
      monthly: this.stats.recurringMonthly(),
    }).subscribe({
      next: ({ items, upcoming, reimbursements, monthly }) => {
        this.items.set(items);
        this.monthly.set(monthly);
        this.reimbursements.set(reimbursements);
        this.upcoming.set(untilEndOfMonth(upcoming));
      },
      error: (error) => this.notify.error(error),
    });
  }
}
