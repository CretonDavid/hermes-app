import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { Router, RouterLink } from '@angular/router';
import { Observable } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';
import { Tokens } from '../../core/models';
import { errorMessage } from '../../core/notify.service';
import { AuthVisualComponent } from './auth-visual.component';

@Component({
  selector: 'app-login',
  imports: [
    ReactiveFormsModule,
    RouterLink,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatIconModule,
    MatProgressBarModule,
    AuthVisualComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './auth-layout.scss',
  template: `
    <main class="auth-side">
      <div class="auth-card">
        <div class="brand">
          <span class="logo"><mat-icon>account_balance_wallet</mat-icon></span> Hermès
        </div>
        <h1>Connexion</h1>
        <p class="intro">Saisissez votre numéro de compte à 30 chiffres.</p>

        <form [formGroup]="form" (ngSubmit)="submit()">
          <mat-form-field class="number-input">
            <mat-label>Numéro de compte</mat-label>
            <input
              matInput
              formControlName="number"
              name="username"
              autocomplete="username"
              inputmode="numeric"
              autofocus
            />
            <mat-hint align="end">{{ digits().length }} / 30</mat-hint>
            @if (number.hasError('pattern')) {
              <mat-error>Le numéro doit contenir exactement 30 chiffres</mat-error>
            }
          </mat-form-field>

          @if (error()) {
            <div class="error">{{ error() }}</div>
          }

          <div class="actions">
            @if (disabled()) {
              <button
                matButton="filled"
                type="button"
                (click)="reactivate()"
                [disabled]="loading()"
              >
                Réactiver mon compte
              </button>
            } @else {
              <button matButton="filled" type="submit" [disabled]="loading()">Se connecter</button>
            }
          </div>
          @if (loading()) {
            <mat-progress-bar mode="indeterminate" />
          }
        </form>

        <div class="switch">
          Pas encore de compte ? <a routerLink="/register">Créer un compte</a>
        </div>
      </div>
    </main>
    <app-auth-visual />
  `,
})
export class LoginComponent {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  protected readonly number = new FormControl('', {
    nonNullable: true,
    validators: [Validators.required],
  });
  // Le formGroup rattache le <form> à Angular : sans lui, la soumission recharge la page
  protected readonly form = new FormGroup({ number: this.number });
  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly disabled = signal(false);
  protected readonly digits = signal('');

  constructor() {
    // Les espaces et tirets collés avec le numéro sont ignorés, l'affichage est regroupé par 6 chiffres
    this.number.valueChanges.subscribe((value) => {
      const digits = value.replace(/\D/g, '').slice(0, 30);
      this.digits.set(digits);
      this.error.set(null);
      const formatted = digits.match(/.{1,6}/g)?.join(' ') ?? '';
      if (formatted !== value) {
        this.number.setValue(formatted, { emitEvent: false });
      }
    });
  }

  protected submit(): void {
    this.run(this.auth.login(this.digits()));
  }

  protected reactivate(): void {
    this.run(this.auth.reactivate(this.digits()));
  }

  private run(request$: Observable<Tokens>): void {
    if (this.digits().length !== 30) {
      this.error.set('Le numéro doit contenir exactement 30 chiffres');
      return;
    }
    this.loading.set(true);
    this.error.set(null);
    request$.subscribe({
      next: () => this.router.navigate(['/']),
      error: (error: unknown) => {
        this.loading.set(false);
        if (error instanceof HttpErrorResponse && error.error?.code === 'ACCOUNT_DISABLED') {
          this.disabled.set(true);
          this.error.set('Ce compte est désactivé. Vous pouvez le réactiver avec ce même numéro.');
        } else if (error instanceof HttpErrorResponse && error.status === 401) {
          this.error.set('Numéro de compte inconnu');
        } else {
          this.error.set(errorMessage(error));
        }
      },
    });
  }
}
