import { formatAmount, parseAmount } from './amount-input.directive';

describe('formatAmount', () => {
  it('affiche toujours deux décimales avec une virgule', () => {
    expect(formatAmount(850)).toBe('850,00');
    expect(formatAmount(12.5)).toBe('12,50');
  });

  it('garde le signe des montants négatifs', () => {
    expect(formatAmount(-1500)).toBe('-1500,00');
  });

  it('laisse le champ vide sans valeur', () => {
    expect(formatAmount(null)).toBe('');
  });
});

describe('parseAmount', () => {
  it('accepte la virgule, le point et les espaces', () => {
    expect(parseAmount('12,50')).toBe(12.5);
    expect(parseAmount('12.50')).toBe(12.5);
    expect(parseAmount('1 234,56')).toBe(1234.56);
    expect(parseAmount('1 234,56')).toBe(1234.56);
  });

  it('accepte les montants négatifs', () => {
    expect(parseAmount('-20')).toBe(-20);
    expect(parseAmount('−20,5')).toBe(-20.5);
  });

  it('accepte un nombre en cours de saisie', () => {
    expect(parseAmount('12,')).toBe(12);
  });

  it('refuse ce qui n’est pas un nombre', () => {
    expect(parseAmount('')).toBeNull();
    expect(parseAmount('abc')).toBeNull();
    expect(parseAmount('-')).toBeNull();
    expect(parseAmount('1,2,3')).toBeNull();
  });
});
