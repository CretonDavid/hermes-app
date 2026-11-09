import { ChangeDetectionStrategy, Component } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDialogModule } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';

/**
 * Croix de fermeture d'une fenêtre, équivalente au bouton « Annuler ».
 * À placer en fin de template : le focus initial reste ainsi sur le premier champ.
 */
@Component({
  selector: 'app-dialog-close',
  imports: [MatButtonModule, MatDialogModule, MatIconModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <button matIconButton type="button" mat-dialog-close aria-label="Fermer">
      <mat-icon>close</mat-icon>
    </button>
  `,
  styles: `
    :host {
      position: absolute;
      top: 8px;
      right: 8px;
    }
  `,
})
export class DialogCloseComponent {}
