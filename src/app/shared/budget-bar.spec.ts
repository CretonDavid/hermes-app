import { budgetLevel } from './budget-bar.component';

describe('budgetLevel', () => {
  it('reste normal sous 90 % du budget', () => {
    expect(budgetLevel(0, 400)).toBe('ok');
    expect(budgetLevel(359.99, 400)).toBe('ok');
  });

  it('prévient à partir de 90 % et jusqu’au budget compris', () => {
    expect(budgetLevel(360, 400)).toBe('near');
    expect(budgetLevel(400, 400)).toBe('near');
  });

  it('signale un dépassement au-delà du budget', () => {
    expect(budgetLevel(400.01, 400)).toBe('over');
  });

  it('reste normal quand les remboursements dépassent les dépenses', () => {
    expect(budgetLevel(-20, 400)).toBe('ok');
  });
});
