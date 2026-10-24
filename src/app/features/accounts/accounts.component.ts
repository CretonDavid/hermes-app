import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { Router, RouterLink } from '@angular/router';
import { DataStore } from '../../core/data.store';
import { Account } from '../../core/models';
import { MoneyPipe } from '../../shared/money.pipe';
import { AccountFormDialogComponent } from './account-form-dialog.component';

interface AccountGroup {
  name: string;
  savings: boolean;
  accounts: Account[];
  totals: { currency: string; amount: number }[];
}

@Component({
  selector: 'app-accounts',
  imports: [MatButtonModule, MatIconModule, MatSlideToggleModule, RouterLink, MoneyPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page">
      <div class="page-header">
        <div>
          <h1>Comptes</h1>
          <div class="subtitle">{{ store.openAccounts().length }} compte(s) ouvert(s)</div>
        </div>
        @if (hasClosed()) {
          <mat-slide-toggle [checked]="showClosed()" (change)="showClosed.set($event.checked)">
            Afficher les comptes clôturés
          </mat-slide-toggle>
        }
        <button matButton="filled" (click)="create()">
          <mat-icon>add</mat-icon> Nouveau compte
        </button>
      </div>

      @if (store.loaded() && store.accounts().length === 0) {
        <div class="card empty">
          <mat-icon>account_balance</mat-icon>
          <p>Vous n'avez encore aucun compte. Commencez par créer votre compte courant.</p>
          <button matButton="filled" (click)="create()">Créer un compte</button>
        </div>
      }

      @for (group of groups(); track group.name) {
        <section class="group">
          <div class="group-header">
            <h2>
              <mat-icon>{{ group.savings ? 'savings' : 'account_balance' }}</mat-icon>
              {{ group.name }}
            </h2>
            <div class="totals">
              @for (total of group.totals; track total.currency) {
                <span class="amount">{{ total.amount | money: total.currency }}</span>
              }
            </div>
          </div>
          <div class="grid grid-3">
            @for (account of group.accounts; track account.id) {
              <a
                class="card account-card"
                [class.closed]="account.closed"
                [routerLink]="['/accounts', account.id]"
              >
                <div class="top">
                  <div>
                    <div class="name">{{ account.name }}</div>
                    <div class="muted small">
                      {{ account.bankName ?? account.accountType.name }}
                      @if (account.closed) {
                        · clôturé
                      }
                    </div>
                  </div>
                  <button matIconButton (click)="edit(account, $event)">
                    <mat-icon>edit</mat-icon>
                  </button>
                </div>
                <div class="balance amount" [class.negative]="account.balance < 0">
                  {{ account.balance | money: account.currency.code }}
                </div>
                @if (account.forecastBalance !== account.balance) {
                  <div class="muted small">
                    Avec les opérations à venir :
                    {{ account.forecastBalance | money: account.currency.code }}
                  </div>
                }
              </a>
            }
          </div>
        </section>
      }
    </div>
  `,
  styles: `
    .group {
      margin-bottom: 32px;
    }
    .group-header {
      display: flex;
      align-items: baseline;
      justify-content: space-between;
      margin-bottom: 12px;
      h2 {
        display: flex;
        align-items: center;
        gap: 8px;
        font: var(--mat-sys-title-medium);
        margin: 0;
      }
      .totals {
        display: flex;
        gap: 16px;
        font: var(--mat-sys-title-medium);
      }
    }
    .account-card {
      text-decoration: none;
      color: inherit;
      display: block;
      transition: box-shadow 0.15s;
      &:hover {
        box-shadow: var(--mat-sys-level2);
      }
      &.closed {
        opacity: 0.6;
      }
    }
    .top {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
    }
    .name {
      font: var(--mat-sys-title-medium);
    }
    .small {
      font: var(--mat-sys-body-small);
    }
    .balance {
      font: var(--mat-sys-headline-small);
      margin: 16px 0 4px;
    }
  `,
})
export class AccountsComponent {
  protected readonly store = inject(DataStore);
  private readonly dialog = inject(MatDialog);
  private readonly router = inject(Router);

  protected readonly showClosed = signal(false);
  protected readonly hasClosed = computed(() => this.store.accounts().some((a) => a.closed));

  protected readonly groups = computed<AccountGroup[]>(() => {
    const accounts = this.store.accounts().filter((a) => this.showClosed() || !a.closed);
    const groups = new Map<string, AccountGroup>();
    for (const account of accounts) {
      const key = account.accountType.name;
      const group = groups.get(key) ?? {
        name: key,
        savings: account.accountType.savings,
        accounts: [],
        totals: [],
      };
      group.accounts.push(account);
      groups.set(key, group);
    }
    for (const group of groups.values()) {
      const totals = new Map<string, number>();
      group.accounts.forEach((a) =>
        totals.set(a.currency.code, (totals.get(a.currency.code) ?? 0) + a.balance),
      );
      group.totals = [...totals.entries()].map(([currency, amount]) => ({ currency, amount }));
    }
    // Comptes courants d'abord, épargne ensuite
    return [...groups.values()].sort(
      (a, b) => Number(a.savings) - Number(b.savings) || a.name.localeCompare(b.name),
    );
  });

  protected create(): void {
    AccountFormDialogComponent.open(this.dialog)
      .afterClosed()
      .subscribe((account) => account && this.router.navigate(['/accounts', account.id]));
  }

  protected edit(account: Account, event: Event): void {
    event.preventDefault();
    event.stopPropagation();
    AccountFormDialogComponent.open(this.dialog, account);
  }
}
