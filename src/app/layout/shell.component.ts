import { ChangeDetectionStrategy, Component, OnInit, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatListModule } from '@angular/material/list';
import { MatSidenavModule } from '@angular/material/sidenav';
import { MatTooltipModule } from '@angular/material/tooltip';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AuthService } from '../core/auth/auth.service';
import { DataStore } from '../core/data.store';
import { ThemeService } from '../core/theme.service';
import { TransactionFormDialogComponent } from '../features/transactions/transaction-form-dialog.component';
import { MoneyPipe } from '../shared/money.pipe';

interface NavItem {
  path: string;
  label: string;
  icon: string;
  exact?: boolean;
}

@Component({
  selector: 'app-shell',
  imports: [
    RouterOutlet,
    RouterLink,
    RouterLinkActive,
    MatSidenavModule,
    MatListModule,
    MatIconModule,
    MatButtonModule,
    MatTooltipModule,
    MoneyPipe,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './shell.component.html',
  styleUrl: './shell.component.scss',
})
export class ShellComponent implements OnInit {
  protected readonly store = inject(DataStore);
  protected readonly theme = inject(ThemeService);
  private readonly auth = inject(AuthService);
  private readonly dialog = inject(MatDialog);

  protected readonly navigation: NavItem[] = [
    { path: '/', label: 'Tableau de bord', icon: 'dashboard', exact: true },
    { path: '/accounts', label: 'Comptes', icon: 'account_balance' },
    { path: '/transactions', label: 'Opérations', icon: 'receipt_long' },
    { path: '/recurring', label: 'Récurrences', icon: 'event_repeat' },
    { path: '/import', label: 'Import', icon: 'upload_file' },
    { path: '/categories', label: 'Catégories', icon: 'sell' },
    { path: '/stats', label: 'Statistiques', icon: 'monitoring' },
    { path: '/settings', label: 'Paramètres', icon: 'settings' },
  ];

  ngOnInit(): void {
    this.store.loadAll();
  }

  protected newTransaction(): void {
    TransactionFormDialogComponent.open(this.dialog, {});
  }

  protected logout(): void {
    this.store.clear();
    this.auth.logout();
  }
}
