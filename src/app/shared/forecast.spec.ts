import { Transaction, UpcomingOccurrence } from '../core/models';
import { formatAxisMoney, formatMoney, formatPercent } from './money.pipe';
import { untilEndOfMonth, upcomingNet, withFutureTransactions } from './forecast';

const occurrence = (values: Partial<UpcomingOccurrence>): UpcomingOccurrence => ({
  recurringTransactionId: 1,
  date: '2026-12-01',
  label: 'Test',
  direction: 'DEBIT',
  amount: 100,
  accountId: 1,
  accountName: 'A',
  currencyCode: 'EUR',
  transfer: false,
  targetAccountId: null,
  targetAccountName: null,
  targetAmount: null,
  ...values,
});

describe('upcomingNet', () => {
  it('soustrait les débits et ajoute les crédits du compte', () => {
    const items = [occurrence({ amount: 850 }), occurrence({ direction: 'CREDIT', amount: 2500 })];

    expect(upcomingNet(items, 1, 'EUR')).toBe(1650);
  });

  it('ignore les échéances des autres comptes', () => {
    expect(upcomingNet([occurrence({ accountId: 2 })], 1, 'EUR')).toBe(0);
  });

  it('compte un virement en sortie sur la source et en entrée sur la cible', () => {
    const transfer = occurrence({ transfer: true, targetAccountId: 2 });

    expect(upcomingNet([transfer], 1, 'EUR')).toBe(-100);
    expect(upcomingNet([transfer], 2, 'EUR')).toBe(100);
  });

  it('utilise le montant reçu pour un virement entre devises', () => {
    const transfer = occurrence({ transfer: true, targetAccountId: 2, targetAmount: 110 });

    expect(upcomingNet([transfer], 2, 'USD')).toBe(110);
  });

  it('ne chiffre pas une entrée entre devises sans montant reçu', () => {
    const transfer = occurrence({ transfer: true, targetAccountId: 2 });

    expect(upcomingNet([transfer], 2, 'USD')).toBe(0);
  });
});

describe('withFutureTransactions', () => {
  const future = (values: Partial<Transaction>) =>
    ({ id: 7, label: 'Achat', direction: 'DEBIT', amount: 10, transfer: null, ...values }) as Transaction;

  it('classe les opérations futures et les échéances par date', () => {
    const result = withFutureTransactions(
      [occurrence({ date: '2026-12-05', label: 'Loyer' })],
      [future({ operationDate: '2026-12-01' })],
    );

    expect(result.map((o) => o.label)).toEqual(['Achat', 'Loyer']);
  });

  it('ne montre un virement qu’une fois, côté débit', () => {
    const transfer = { peerTransactionId: 8, accountId: 2, accountName: 'Livret' };
    const result = withFutureTransactions(
      [],
      [
        future({ operationDate: '2026-12-01', transfer }),
        future({ id: 8, operationDate: '2026-12-01', direction: 'CREDIT', transfer }),
      ],
    );

    expect(result).toHaveLength(1);
    expect(result[0].targetAccountName).toBe('Livret');
  });
});

describe('untilEndOfMonth', () => {
  const items = ['2026-11-06', '2026-11-30', '2026-12-01'].map((date) => occurrence({ date }));

  it('garde les échéances jusqu’au dernier jour du mois inclus', () => {
    const result = untilEndOfMonth(items, new Date(2026, 10, 6));

    expect(result.map((o) => o.date)).toEqual(['2026-11-06', '2026-11-30']);
  });

  it('n’inclut pas le mois suivant le dernier jour du mois', () => {
    const result = untilEndOfMonth(items, new Date(2026, 10, 30));

    expect(result.map((o) => o.date)).not.toContain('2026-12-01');
  });
});

describe('formatPercent', () => {
  it('utilise le vrai signe moins et une virgule', () => {
    expect(formatPercent(-0.054)).toMatch(/^\u22125,4\s%$/u);
  });

  it('respecte le nombre de décimales demandé', () => {
    expect(formatPercent(1.17, 0)).toMatch(/^117\s%$/u);
  });
});

describe('formatMoney', () => {
  it('utilise le vrai signe moins', () => {
    expect(formatMoney(-12.5, 'EUR')).toContain('−');
    expect(formatMoney(-12.5, 'EUR')).not.toContain('-');
  });

  it('garde les centimes dans les montants et les retire des axes', () => {
    expect(formatMoney(4000, 'EUR')).toContain(',00');
    expect(formatAxisMoney(4000, 'EUR')).not.toContain(',');
  });

  it('reste lisible avec un code devise inconnu du navigateur', () => {
    expect(formatMoney(-5, 'XXXX')).toContain('XXXX');
    expect(formatAxisMoney(-5, 'XXXX')).toContain('XXXX');
  });
});
