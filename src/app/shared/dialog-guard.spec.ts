import { Injector, runInInjectionContext } from '@angular/core';
import { FormControl } from '@angular/forms';
import { MatDialog, MatDialogRef } from '@angular/material/dialog';
import { Subject, of } from 'rxjs';
import { vi } from 'vitest';
import { protectDirtyForm } from './dialog-guard';

function setup(answer: boolean | undefined = undefined) {
  const backdrop = new Subject<MouseEvent>();
  const keys = new Subject<KeyboardEvent>();
  const dialogRef = {
    disableClose: false,
    close: vi.fn(),
    backdropClick: () => backdrop,
    keydownEvents: () => keys,
  };
  const dialog = { open: vi.fn(() => ({ afterClosed: () => of(answer) })) };
  const form = new FormControl('');
  const injector = Injector.create({
    providers: [
      { provide: MatDialogRef, useValue: dialogRef },
      { provide: MatDialog, useValue: dialog },
    ],
  });
  runInInjectionContext(injector, () => protectDirtyForm(form));
  return { backdrop, keys, dialogRef, dialog, form };
}

describe('protectDirtyForm', () => {
  it('bloque la fermeture automatique de la fenêtre', () => {
    expect(setup().dialogRef.disableClose).toBe(true);
  });

  it('ferme directement un formulaire intact, au clic extérieur comme avec Échap', () => {
    const { backdrop, keys, dialogRef, dialog } = setup();

    backdrop.next(new MouseEvent('click'));
    keys.next(new KeyboardEvent('keydown', { key: 'Escape' }));

    expect(dialogRef.close).toHaveBeenCalledTimes(2);
    expect(dialog.open).not.toHaveBeenCalled();
  });

  it('demande confirmation au clic extérieur quand la saisie est modifiée', () => {
    const { backdrop, dialogRef, dialog, form } = setup(undefined);
    form.markAsDirty();

    backdrop.next(new MouseEvent('click'));

    expect(dialog.open).toHaveBeenCalledTimes(1);
    expect(dialogRef.close).not.toHaveBeenCalled();
  });

  it('demande confirmation avec Échap et ferme si la saisie est abandonnée', () => {
    const { keys, dialogRef, dialog, form } = setup(true);
    form.markAsDirty();

    keys.next(new KeyboardEvent('keydown', { key: 'Escape' }));

    expect(dialog.open).toHaveBeenCalledTimes(1);
    expect(dialogRef.close).toHaveBeenCalledTimes(1);
  });

  it('ignore les autres touches', () => {
    const { keys, dialogRef, dialog, form } = setup();
    form.markAsDirty();

    keys.next(new KeyboardEvent('keydown', { key: 'a' }));

    expect(dialog.open).not.toHaveBeenCalled();
    expect(dialogRef.close).not.toHaveBeenCalled();
  });
});
