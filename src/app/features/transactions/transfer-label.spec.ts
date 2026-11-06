import { Transaction, Transfer } from '../../core/models';
import { customTransferLabel } from './transfer-label';

const transfer = (debitLabel: string): Transfer => ({
  debit: { label: debitLabel, accountName: 'Courant' } as Transaction,
  credit: { label: 'Virement depuis Courant', accountName: 'Livret' } as Transaction,
});

describe('customTransferLabel', () => {
  it('ne renvoie rien pour un libellé automatique', () => {
    expect(customTransferLabel(transfer('Virement vers Livret'))).toBeNull();
  });

  it('garde un libellé choisi par l’utilisateur', () => {
    expect(customTransferLabel(transfer('Épargne de novembre'))).toBe('Épargne de novembre');
  });
});
