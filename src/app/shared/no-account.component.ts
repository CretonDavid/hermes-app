import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { AccountFormDialogComponent } from '../features/accounts/account-form-dialog.component';

/**
 * Affiché à la place d'un écran qui n'a pas de sens tant qu'aucun compte n'existe.
 */
@Component({
  selector: 'app-no-account',
  imports: [MatButtonModule, MatIconModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="card empty">
      <mat-icon>account_balance</mat-icon>
      <p>
        <strong>Commencez par créer un compte bancaire.</strong><br />
        {{ message() }}
      </p>
      <button matButton="filled" (click)="create()">
        <mat-icon>add</mat-icon> Créer mon premier compte
      </button>
    </div>
  `,
})
export class NoAccountComponent {
  readonly message = input('Toutes vos opérations sont rattachées à un compte.');

  private readonly dialog = inject(MatDialog);

  protected create(): void {
    AccountFormDialogComponent.open(this.dialog);
  }
}
