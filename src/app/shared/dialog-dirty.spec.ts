import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { Type } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { MatNativeDateModule } from '@angular/material/core';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { NEVER } from 'rxjs';
import { RecurringDialogComponent } from '../features/recurring/recurring-dialog.component';
import { TransactionFormDialogComponent } from '../features/transactions/transaction-form-dialog.component';

// Accès aux membres protégés nécessaires au test
interface ModeDialog {
  form: { dirty: boolean };
  setMode(mode: string): void;
}

function create(component: Type<unknown>, data: unknown): ModeDialog {
  TestBed.configureTestingModule({
    imports: [MatNativeDateModule],
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      { provide: MAT_DIALOG_DATA, useValue: data },
      {
        provide: MatDialogRef,
        useValue: { backdropClick: () => NEVER, keydownEvents: () => NEVER, close: () => {} },
      },
    ],
  });
  const fixture = TestBed.createComponent(component);
  fixture.detectChanges();
  return fixture.componentInstance as ModeDialog;
}

describe('fenêtres avec un choix Dépense, Revenu ou Virement', () => {
  it("changer de type sans rien saisir ne compte pas comme une saisie (opération)", () => {
    const dialog = create(TransactionFormDialogComponent, {});

    dialog.setMode('CREDIT');
    dialog.setMode('TRANSFER');

    expect(dialog.form.dirty).toBe(false);
  });

  it('changer de type sans rien saisir ne compte pas comme une saisie (récurrence)', () => {
    const dialog = create(RecurringDialogComponent, null);

    dialog.setMode('CREDIT');
    dialog.setMode('TRANSFER');

    expect(dialog.form.dirty).toBe(false);
  });
});
