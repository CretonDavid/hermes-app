import { inject } from '@angular/core';
import { AbstractControl } from '@angular/forms';
import { MatDialog, MatDialogRef } from '@angular/material/dialog';
import { filter } from 'rxjs';
import { confirm } from './confirm-dialog.component';

/**
 * Empêche de perdre une saisie : si le formulaire a été modifié, la touche Échap et le clic hors
 * de la fenêtre demandent une confirmation. Les boutons « Annuler » et la croix restent directs.
 * À appeler pendant la construction du composant de la fenêtre.
 */
export function protectDirtyForm(form: AbstractControl): void {
  const dialogRef = inject(MatDialogRef);
  const dialog = inject(MatDialog);
  let asking = false;

  const dismiss = () => {
    if (!form.dirty) {
      dialogRef.close();
      return;
    }
    if (asking) {
      return;
    }
    asking = true;
    confirm(dialog, {
      title: 'Abandonner la saisie ?',
      message: 'Les informations saisies dans cette fenêtre ne seront pas enregistrées.',
      cancelLabel: 'Continuer la saisie',
      confirmLabel: 'Abandonner',
      danger: true,
    }).subscribe((discard) => {
      asking = false;
      if (discard) {
        dialogRef.close();
      }
    });
  };

  dialogRef.disableClose = true;
  dialogRef.backdropClick().subscribe(dismiss);
  dialogRef
    .keydownEvents()
    .pipe(filter((event) => event.key === 'Escape'))
    .subscribe((event) => {
      event.preventDefault();
      dismiss();
    });
}
