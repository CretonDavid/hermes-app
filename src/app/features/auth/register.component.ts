import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { NotifyService, errorMessage } from '../../core/notify.service';

@Component({
  selector: 'app-register',
  imports: [
    FormsModule,
    RouterLink,
    MatButtonModule,
    MatIconModule,
    MatCheckboxModule,
    MatProgressBarModule,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './auth-layout.scss',
  template: `
    <div class="auth-card">
      <div class="brand"><mat-icon>account_balance_wallet</mat-icon> Hermès</div>

      @if (!accountNumber()) {
        <h1>Créer un compte</h1>
        <p class="intro">
          Pas d'e-mail ni de mot de passe : un numéro de compte unique de 30 chiffres vous est
          attribué. C'est votre seul identifiant.
        </p>
        @if (error()) {
          <div class="error">{{ error() }}</div>
        }
        <div class="actions">
          <button matButton="filled" (click)="register()" [disabled]="loading()">
            Générer mon numéro de compte
          </button>
        </div>
        @if (loading()) {
          <mat-progress-bar mode="indeterminate" />
        }
        <div class="switch">Déjà un compte ? <a routerLink="/login">Se connecter</a></div>
      } @else {
        <h1>Votre numéro de compte</h1>
        <div class="account-number">{{ formatted() }}</div>

        <div class="row" style="justify-content: center">
          <button matButton="tonal" (click)="copy()">
            <mat-icon>content_copy</mat-icon> Copier
          </button>
          <button matButton="tonal" (click)="download()">
            <mat-icon>download</mat-icon> Télécharger
          </button>
        </div>

        <div class="warning" style="margin-top: 20px">
          <mat-icon>warning</mat-icon>
          <div>
            Conservez ce numéro en lieu sûr (gestionnaire de mots de passe par exemple).
            <strong>Il ne pourra jamais être récupéré</strong> : sans lui, l'accès à vos données est
            définitivement perdu.
          </div>
        </div>

        <mat-checkbox [(ngModel)]="saved" style="margin-top: 16px; display: block">
          J'ai conservé mon numéro de compte
        </mat-checkbox>

        <div class="actions">
          <button matButton="filled" [disabled]="!saved || loading()" (click)="continue()">
            Accéder à mon espace
          </button>
        </div>
      }
    </div>
  `,
})
export class RegisterComponent {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly notify = inject(NotifyService);

  protected readonly accountNumber = signal<string | null>(null);
  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);
  protected saved = false;

  // Groupes de 6 chiffres pour la lisibilité
  protected readonly formatted = computed(
    () =>
      this.accountNumber()
        ?.match(/.{1,6}/g)
        ?.join(' ') ?? '',
  );

  protected register(): void {
    this.loading.set(true);
    this.auth.register().subscribe({
      next: ({ accountNumber }) => {
        this.loading.set(false);
        this.accountNumber.set(accountNumber);
      },
      error: (error) => {
        this.loading.set(false);
        this.error.set(errorMessage(error));
      },
    });
  }

  protected copy(): void {
    navigator.clipboard
      .writeText(this.accountNumber()!)
      .then(() => this.notify.success('Numéro copié'));
  }

  protected download(): void {
    const content = `Hermès - numéro de compte\n\n${this.accountNumber()}\n\nCe numéro est votre unique identifiant. Il ne peut pas être récupéré.\n`;
    const url = URL.createObjectURL(new Blob([content], { type: 'text/plain' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'hermes-numero-de-compte.txt';
    link.click();
    URL.revokeObjectURL(url);
  }

  protected continue(): void {
    this.loading.set(true);
    this.auth.login(this.accountNumber()!).subscribe({
      next: () => this.router.navigate(['/']),
      error: (error) => {
        this.loading.set(false);
        this.notify.error(error);
      },
    });
  }
}
