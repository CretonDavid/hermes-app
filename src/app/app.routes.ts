import { Routes } from '@angular/router';
import { authGuard, guestGuard } from './core/auth/auth.guard';

export const routes: Routes = [
  {
    path: 'login',
    canActivate: [guestGuard],
    title: 'Connexion · Hermès',
    loadComponent: () => import('./features/auth/login.component').then((m) => m.LoginComponent),
  },
  {
    path: 'register',
    canActivate: [guestGuard],
    title: 'Créer un compte · Hermès',
    loadComponent: () =>
      import('./features/auth/register.component').then((m) => m.RegisterComponent),
  },
  {
    path: '',
    loadComponent: () => import('./layout/shell.component').then((m) => m.ShellComponent),
    canActivate: [authGuard],
    children: [
      {
        path: '',
        pathMatch: 'full',
        title: 'Tableau de bord · Hermès',
        loadComponent: () =>
          import('./features/dashboard/dashboard.component').then((m) => m.DashboardComponent),
      },
      {
        path: 'accounts',
        title: 'Comptes bancaires · Hermès',
        loadComponent: () =>
          import('./features/accounts/accounts.component').then((m) => m.AccountsComponent),
      },
      {
        path: 'accounts/:id',
        title: 'Compte bancaire · Hermès',
        loadComponent: () =>
          import('./features/accounts/account-detail.component').then(
            (m) => m.AccountDetailComponent,
          ),
      },
      {
        path: 'transactions',
        title: 'Opérations · Hermès',
        loadComponent: () =>
          import('./features/transactions/transactions.component').then(
            (m) => m.TransactionsComponent,
          ),
      },
      {
        path: 'recurring',
        title: 'Récurrences · Hermès',
        loadComponent: () =>
          import('./features/recurring/recurring.component').then((m) => m.RecurringComponent),
      },
      {
        path: 'import',
        title: 'Import · Hermès',
        loadComponent: () =>
          import('./features/import/import.component').then((m) => m.ImportComponent),
      },
      {
        path: 'categories',
        title: 'Catégories · Hermès',
        loadComponent: () =>
          import('./features/categories/categories.component').then((m) => m.CategoriesComponent),
      },
      {
        path: 'stats',
        title: 'Statistiques · Hermès',
        loadComponent: () =>
          import('./features/stats/stats.component').then((m) => m.StatsComponent),
      },
      {
        path: 'settings',
        title: 'Paramètres · Hermès',
        loadComponent: () =>
          import('./features/settings/settings.component').then((m) => m.SettingsComponent),
      },
    ],
  },
  { path: '**', redirectTo: '' },
];
