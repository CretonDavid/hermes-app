import { DatePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
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
  ReimbursementPayment,
  ReimbursementPeriodStatus,
  ReimbursementTracking,
} from '../../core/models';
import { NotifyService } from '../../core/notify.service';
import { confirm } from '../../shared/confirm-dialog.component';
import { MoneyPipe, formatMoney } from '../../shared/money.pipe';
import { ReimbursementLinkDialogComponent } from './reimbursement-link-dialog.component';

// Nombre de périodes affichées avant « Afficher les périodes précédentes »
const VISIBLE_PERIODS = 3;

/**
 * Suivi d'une dépense récurrente remboursée par un tiers : ce qui est dû et reçu, période par période.
 */
@Component({
  selector: 'app-reimbursement-card',
  imports: [DatePipe, MatButtonModule, MatIconModule, MatTooltipModule, MoneyPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let t = tracking();
    <div class="card">
      <h2>
        <mat-icon>handshake</mat-icon>
        <span class="title">
          {{ t.label }}
          <span class="muted subtitle">
            Remboursée par {{ t.payer }} ·
            {{ t.share === 100 ? 'en totalité' : t.share + ' %' }} · {{ rhythm() }}
          </span>
        </span>
      </h2>

      @for (p of visible(); track p.start) {
        <div class="period" [class.alert]="p.status === 'UNPAID' || p.status === 'PARTIAL'">
          <div class="name">
            {{ name(p) }}
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
            class="link"
            [attr.aria-label]="'Rattacher un remboursement pour ' + name(p)"
            (click)="link(p)"
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
            <span class="amount positive">{{ payment.amount | money: t.currencyCode : true }}</span>
            <button
              matIconButton
              matTooltip="Détacher ce remboursement"
              [attr.aria-label]="'Détacher ' + payment.label"
              (click)="unlink(p, payment)"
            >
              <mat-icon>link_off</mat-icon>
            </button>
          </div>
        }
      } @empty {
        <p class="muted">Aucune échéance pour l'instant.</p>
      }

      @if (hidden() > 0) {
        <button matButton class="more" (click)="expanded.set(true)">
          Afficher {{ hidden() > 1 ? 'les ' + hidden() + ' périodes précédentes' : 'la période précédente' }}
        </button>
      }
    </div>
  `,
  styles: `
    h2 {
      align-items: flex-start;
    }
    .title {
      display: flex;
      flex-direction: column;
    }
    .subtitle {
      font: var(--mat-sys-body-medium);
    }
    .small {
      font: var(--mat-sys-body-small);
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
      margin-top: 8px;
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

  protected readonly expanded = signal(false);
  protected readonly visible = computed(() =>
    this.expanded() ? this.tracking().periods : this.tracking().periods.slice(0, VISIBLE_PERIODS),
  );
  protected readonly hidden = computed(
    () => this.tracking().periods.length - this.visible().length,
  );
  protected readonly rhythm = computed(() =>
    REIMBURSEMENT_PERIODS.find((p) => p.value === this.tracking().period)!.label.toLowerCase(),
  );

  protected name(p: ReimbursementPeriodStatus): string {
    return reimbursementPeriodLabel(this.tracking().period, p.start);
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

  protected link(period: ReimbursementPeriodStatus): void {
    ReimbursementLinkDialogComponent.open(this.dialog, { tracking: this.tracking(), period })
      .afterClosed()
      .subscribe((linked) => {
        if (linked) {
          this.changed.emit();
        }
      });
  }

  protected unlink(period: ReimbursementPeriodStatus, payment: ReimbursementPayment): void {
    confirm(this.dialog, {
      title: 'Détacher le remboursement',
      message: `« ${payment.label} » ne comptera plus comme remboursement pour ${this.name(period)}. L'opération est conservée.`,
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
