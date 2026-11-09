import { describe, expect, it } from 'vitest';
import { categoryColors } from '../shared/charts';
import { formatMoney } from '../shared/money.pipe';
import { toParams } from './api';
import { frequencyLabel, reimbursementPeriodLabel, toIsoDate } from './format';
import { CategoryStat } from './models';

const stat = (color: string | null): CategoryStat => ({
  categoryId: 1,
  name: 'x',
  color,
  icon: null,
  amount: 1,
  share: 0.5,
  count: 1,
  hasChildren: false,
  direct: false,
});

describe('utilitaires', () => {
  it('formate les montants en français', () => {
    expect(formatMoney(1234.5, 'EUR').replace(/\s/g, ' ')).toBe('1 234,50 €');
    expect(formatMoney(12, 'EUR', true).startsWith('+')).toBe(true);
    expect(formatMoney(null)).toBe('—');
  });

  it('construit les paramètres de requête sans les valeurs vides', () => {
    const params = toParams({ accountIds: [1, 2], search: '', from: undefined, kind: 'EXPENSE' });
    expect(params.toString()).toBe('accountIds=1&accountIds=2&kind=EXPENSE');
  });

  it('convertit les dates au format de l’API', () => {
    expect(toIsoDate(new Date(2026, 0, 5))).toBe('2026-01-05');
    expect(toIsoDate(null)).toBeNull();
  });

  it('nomme les fréquences', () => {
    expect(frequencyLabel('MONTHLY', 1)).toBe('Mensuelle');
    expect(frequencyLabel('MONTHLY', 3)).toBe('Trimestrielle');
    expect(frequencyLabel('WEEKLY', 2)).toBe('Tous les 2 semaines');
  });

  it('décline une couleur héritée en nuances distinctes', () => {
    const colors = categoryColors([stat('#e57373'), stat('#e57373'), stat('#e57373')]);
    expect(new Set(colors).size).toBe(3);
    expect(categoryColors([stat('#111111'), stat('#222222')])).toEqual(['#111111', '#222222']);
  });
});

describe('reimbursementPeriodLabel', () => {
  it('nomme une année, un trimestre ou un mois', () => {
    expect(reimbursementPeriodLabel('YEARLY', '2025-01-01')).toBe('2025');
    expect(reimbursementPeriodLabel('QUARTERLY', '2025-07-01')).toBe('T3 2025');
    expect(reimbursementPeriodLabel('MONTHLY', '2025-11-01')).toBe('nov. 2025');
  });
});
