import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  OnInit,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatListModule } from '@angular/material/list';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSidenav, MatSidenavContent, MatSidenavModule } from '@angular/material/sidenav';
import { MatTooltipModule } from '@angular/material/tooltip';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { filter } from 'rxjs';
import { AuthService } from '../core/auth/auth.service';
import { DataStore } from '../core/data.store';
import { LoadingService } from '../core/loading.service';
import { ThemeService } from '../core/theme.service';
import { TransactionFormDialogComponent } from '../features/transactions/transaction-form-dialog.component';
import { MoneyPipe } from '../shared/money.pipe';

// En dessous, le menu ne reste plus affiché : il laisserait trop peu de place au contenu
const COMPACT_QUERY = '(max-width: 1100px)';

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
    MatProgressBarModule,
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
  private readonly router = inject(Router);
  private readonly content = viewChild(MatSidenavContent);
  private readonly sidenav = viewChild(MatSidenav);
  protected readonly loading = inject(LoadingService);
  protected readonly compact = signal(window.matchMedia(COMPACT_QUERY).matches);

  protected readonly navigation: NavItem[] = [
    { path: '/', label: 'Tableau de bord', icon: 'dashboard', exact: true },
    { path: '/accounts', label: 'Comptes bancaires', icon: 'account_balance' },
    { path: '/transactions', label: 'Opérations', icon: 'receipt_long' },
    { path: '/recurring', label: 'Récurrences', icon: 'event_repeat' },
    { path: '/import', label: 'Import', icon: 'upload_file' },
    { path: '/categories', label: 'Catégories', icon: 'sell' },
    { path: '/stats', label: 'Statistiques', icon: 'monitoring' },
    { path: '/settings', label: 'Paramètres', icon: 'settings' },
  ];

  constructor() {
    const media = window.matchMedia(COMPACT_QUERY);
    const onChange = (event: MediaQueryListEvent) => this.compact.set(event.matches);
    media.addEventListener('change', onChange);
    inject(DestroyRef).onDestroy(() => media.removeEventListener('change', onChange));

    // Chaque nouvelle page s'ouvre en haut ; un simple changement de filtre garde la position
    const path = () => this.router.url.split(/[?#]/)[0];
    let previous = path();
    this.router.events
      .pipe(
        filter((event) => event instanceof NavigationEnd),
        takeUntilDestroyed(),
      )
      .subscribe(() => {
        if (this.compact()) {
          this.sidenav()?.close();
        }
        if (path() !== previous) {
          previous = path();
          this.content()?.scrollTo({ top: 0 });
        }
      });
  }

  ngOnInit(): void {
    this.store.loadAll();
  }

  protected skipToContent(event: Event): void {
    event.preventDefault();
    document.getElementById('main-content')?.focus();
  }

  protected newTransaction(): void {
    TransactionFormDialogComponent.open(this.dialog, {});
  }

  protected logout(): void {
    this.store.clear();
    this.auth.logout();
  }
}
