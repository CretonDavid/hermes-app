import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { Type } from '@angular/core';
import { FormGroup } from '@angular/forms';
import { TestBed } from '@angular/core/testing';
import { MatNativeDateModule } from '@angular/material/core';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { NEVER } from 'rxjs';
import { RecurringDialogComponent } from '../features/recurring/recurring-dialog.component';
import { TransactionFormDialogComponent } from '../features/transactions/transaction-form-dialog.component';

// Accès aux membres protégés nécessaires au test
interface ModeDialog {
  form: FormGroup;
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
        useValue: {
          backdropClick: () => NEVER,
          keydownEvents: () => NEVER,
          close: () => undefined,
        },
      },
    ],
  });
  const fixture = TestBed.createComponent(component);
  fixture.detectChanges();
  return fixture.componentInstance as ModeDialog;
}

describe('fenêtres avec un choix Dépense, Revenu ou Virement', () => {
  it('changer de type sans rien saisir ne compte pas comme une saisie (opération)', () => {
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

describe('fenêtre Opération', () => {
  function setup(): ModeDialog {
    const dialog = create(TransactionFormDialogComponent, {});
    dialog.form.patchValue({ accountId: 1, amount: 100 });
    TestBed.tick();
    return dialog;
  }

  it('exige un bénéficiaire pour une dépense sans libellé', () => {
    expect(setup().form.controls['payee'].invalid).toBe(true);
  });

  it('accepte un libellé à la place du bénéficiaire', () => {
    const dialog = setup();

    dialog.form.patchValue({ label: 'Loyer' });
    TestBed.tick();

    expect(dialog.form.controls['payee'].valid).toBe(true);
  });

  it('ne bloque pas un virement à cause du bénéficiaire masqué', () => {
    const dialog = setup();

    dialog.setMode('TRANSFER');
    dialog.form.patchValue({ toAccountId: 2 });
    TestBed.tick();

    expect(dialog.form.valid).toBe(true);
  });

  it("exige le compte bancaire cible d'un virement, puis plus après être revenu à une dépense", () => {
    const dialog = setup();

    dialog.setMode('TRANSFER');
    TestBed.tick();
    expect(dialog.form.controls['toAccountId'].invalid).toBe(true);

    dialog.setMode('DEBIT');
    TestBed.tick();
    expect(dialog.form.controls['toAccountId'].valid).toBe(true);
  });
});
