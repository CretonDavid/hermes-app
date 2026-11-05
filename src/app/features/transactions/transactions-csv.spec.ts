import { Transaction } from '../../core/models';
import { transactionsToCsv } from './transactions-csv';

const transaction = (values: Partial<Transaction>): Transaction => ({
  id: 1,
  accountId: 1,
  accountName: 'Courant',
  currencyCode: 'EUR',
  direction: 'DEBIT',
  amount: 850,
  label: 'Loyer',
  payee: null,
  notes: null,
  category: null,
  paymentMethod: 'TRANSFER',
  operationDate: '2026-11-01',
  valueDate: null,
  status: 'PENDING',
  transfer: null,
  recurringTransactionId: null,
  createdAt: '2026-11-01T00:00:00',
  ...values,
});

const dataRow = (t: Transaction) => transactionsToCsv([t]).split('\r\n')[1];

describe('transactionsToCsv', () => {
  it('commence par la marque BOM et les en-têtes', () => {
    expect(transactionsToCsv([]).startsWith('﻿Date;Libellé;')).toBe(true);
  });

  it('écrit une date française et un montant signé à virgule', () => {
    expect(dataRow(transaction({}))).toBe(
      '01/11/2026;Loyer;;;Courant;-850,00;EUR;Virement;Non pointée;',
    );
  });

  it('met entre guillemets les textes contenant un séparateur', () => {
    expect(dataRow(transaction({ label: 'Café; "chez Paul"' }))).toContain(
      '"Café; ""chez Paul"""',
    );
  });

  it('neutralise les textes interprétables comme une formule', () => {
    expect(dataRow(transaction({ label: '=SOMME(A1)' }))).toContain(";'=SOMME(A1);");
  });

  it('indique les virements internes à la place de la catégorie', () => {
    const transfer = { peerTransactionId: 2, accountId: 2, accountName: 'Livret' };

    expect(dataRow(transaction({ transfer }))).toContain(';Virement interne;');
  });
});
