import { DatePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { RecurringApi } from '../../core/api';
import { REIMBURSEMENT_PERIODS, reimbursementPeriodLabel } from '../../core/format';
import {
  PayerTracking,
  ReimbursementPayment,
  ReimbursementPeriodStatus,
  ReimbursementTracking,
} from '../../core/models';
import { NotifyService } from '../../core/notify.service';
import { confirm } from '../../shared/confirm-dialog.component';
import { MoneyPipe, formatMoney } from '../../shared/money.pipe';
import { ReimbursementLinkDialogComponent } from './reimbursement-link-dialog.component';

// Nombre de périodes affichées par tiers avant « Afficher les périodes précédentes »
const VISIBLE_PERIODS = 3;

/**
 * Suivi d'une dépense récurrente remboursée par des tiers : pour chacun, ce qui est dû et reçu,
 * période par période.
 */
@Component({
  selector: 'app-reimbursement-card',
  imports: [DatePipe, MatButtonModule, MatIconModule, MatTooltipModule, MoneyPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let t = tracking();
    <div class="card">
      <h2><mat-icon>handshake</mat-icon> {{ t.label }}</h2>

      @for (payer of t.payers; track payer.payerId) {
        <div class="payer">
          <div class="payer-name">
            {{ payer.name }}
            <span class="muted">· {{ shareLabel(payer.share) }} · {{ rhythm(payer) }}</span>
          </div>

          @for (p of visible(payer); track p.start) {
            <div class="period">
              <div class="name">
                {{ name(payer, p) }}
                @if (!p.ended) {
                  <span class="muted small">en cours</span>
                }
              </div>
              <div class="figures">
                <span>
                  <span class="muted small">{{ p.ended ? 'Dû' : 'Dû à ce jour' }}</span>
                  <span class="amount">{{ p.due | money: t.currencyCode }}</span>
                </span>
                <span>
                  <span class="muted small">Reçu</span>
                  <span class="amount" [class.positive]="p.received > 0">
                    {{ p.received | money: t.currencyCode }}
                  </span>
                </span>
              </div>
              <span class="chip status" [class]="p.status">
                <mat-icon>{{ icons[p.status] }}</mat-icon>
                {{ statusLabel(p) }}
              </span>
              <button
                matButton
                [attr.aria-label]="
                  'Rattacher un remboursement de ' + payer.name + ' pour ' + name(payer, p)
                "
                (click)="link(payer, p)"
              >
                <mat-icon>add_link</mat-icon> Rattacher
              </button>
            </div>
            @for (payment of p.payments; track payment.transactionId) {
              <div class="payment">
                <mat-icon class="muted">subdirectory_arrow_right</mat-icon>
                <span class="date">{{ payment.date | date: 'dd/MM/yyyy' }}</span>
                <span class="text">
                  {{ payment.label }} <span class="muted small">· {{ payment.accountName }}</span>
                </span>
                <span class="amount positive">
                  {{ payment.amount | money: t.currencyCode : true }}
                </span>
                <button
                  matIconButton
                  matTooltip="Détacher ce remboursement"
                  [attr.aria-label]="'Détacher ' + payment.label"
                  (click)="unlink(payer, p, payment)"
                >
                  <mat-icon>link_off</mat-icon>
                </button>
              </div>
            }
          } @empty {
            <p class="muted">Aucune échéance pour l'instant.</p>
          }

          @if (hidden(payer) > 0) {
            <button matButton class="more" (click)="expand(payer)">
              Afficher
              {{
                hidden(payer) > 1
                  ? 'les ' + hidden(payer) + ' périodes précédentes'
                  : 'la période précédente'
              }}
            </button>
          }
        </div>
      }
    </div>
  `,
  styles: `
    .small {
      font: var(--mat-sys-body-small);
    }
    .payer + .payer {
      margin-top: 20px;
    }
    .payer-name {
      font: var(--mat-sys-title-small);
      margin-bottom: 4px;
      .muted {
        font: var(--mat-sys-body-medium);
      }
    }
    .period {
      display: grid;
      grid-template-columns: 140px minmax(0, 1fr) auto auto;
      align-items: center;
      gap: 16px;
      padding: 12px 0 8px;
      border-top: 1px solid var(--hermes-border);
    }
    .name {
      font: var(--mat-sys-title-medium);
      display: flex;
      flex-direction: column;
    }
    .figures {
      display: flex;
      gap: 32px;
      > span {
        display: flex;
        flex-direction: column;
      }
    }
    .status.PAID {
      color: var(--hermes-positive);
    }
    .status.UNPAID,
    .status.PARTIAL {
      color: var(--hermes-negative);
    }
    .payment {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 0 0 4px 12px;
      .date {
        width: 84px;
        flex-shrink: 0;
      }
      .text {
        flex: 1;
        min-width: 0;
      }
    }
    .more {
      margin-top: 4px;
    }
  `,
})
export class ReimbursementCardComponent {
  readonly tracking = input.required<ReimbursementTracking>();
  readonly changed = output<void>();

  private readonly api = inject(RecurringApi);
  private readonly notify = inject(NotifyService);
  private readonly dialog = inject(MatDialog);

  protected readonly icons = {
    PAID: 'check_circle',
    PARTIAL: 'error',
    UNPAID: 'error',
    IN_PROGRESS: 'schedule',
  } as const;

  // Tiers dont toutes les périodes sont affichées
  private readonly expanded = signal<ReadonlySet<number>>(new Set());

  protected visible(payer: PayerTracking): ReimbursementPeriodStatus[] {
    return this.expanded().has(payer.payerId)
      ? payer.periods
      : payer.periods.slice(0, VISIBLE_PERIODS);
  }

  protected hidden(payer: PayerTracking): number {
    return payer.periods.length - this.visible(payer).length;
  }

  protected expand(payer: PayerTracking): void {
    this.expanded.update((set) => new Set([...set, payer.payerId]));
  }

  protected shareLabel(share: number): string {
    return share === 100
      ? 'en totalité'
      : `${share.toLocaleString('fr-FR', { maximumFractionDigits: 2 })} %`;
  }

  protected rhythm(payer: PayerTracking): string {
    return REIMBURSEMENT_PERIODS.find((p) => p.value === payer.period)!.label.toLowerCase();
  }

  protected name(payer: PayerTracking, p: ReimbursementPeriodStatus): string {
    return reimbursementPeriodLabel(payer.period, p.start);
  }

  protected statusLabel(p: ReimbursementPeriodStatus): string {
    const remaining = formatMoney(p.remaining, this.tracking().currencyCode);
    switch (p.status) {
      case 'PAID':
        return p.due === 0 && p.received === 0 ? 'Rien à rembourser' : 'Remboursé';
      case 'PARTIAL':
        return `Reste ${remaining}`;
      case 'UNPAID':
        return 'Non remboursé';
      default:
        return p.received > 0 ? `Reste ${remaining} à ce jour` : 'En attente';
    }
  }

  protected link(payer: PayerTracking, period: ReimbursementPeriodStatus): void {
    ReimbursementLinkDialogComponent.open(this.dialog, { tracking: this.tracking(), payer, period })
      .afterClosed()
      .subscribe((linked) => {
        if (linked) {
          this.changed.emit();
        }
      });
  }

  protected unlink(
    payer: PayerTracking,
    period: ReimbursementPeriodStatus,
    payment: ReimbursementPayment,
  ): void {
    confirm(this.dialog, {
      title: 'Détacher le remboursement',
      message: `« ${payment.label} » ne comptera plus comme remboursement de ${payer.name} pour ${this.name(payer, period)}. L'opération est conservée.`,
      confirmLabel: 'Détacher',
    }).subscribe((ok) => {
      if (ok) {
        this.api
          .unlinkReimbursement(this.tracking().recurringTransactionId, payment.transactionId)
          .subscribe({
            next: () => this.changed.emit(),
            error: (error) => this.notify.error(error),
          });
      }
    });
  }
}
