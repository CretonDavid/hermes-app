import { fitLegendLabel, layoutHint, selectAccountSeries, shortLabel } from './charts';

// Chaque caractère mesure 10 px : « un deux trois » fait donc 130 px
const measure = (text: string) => text.length * 10;
const TEXT = 'un deux trois';

describe('selectAccountSeries', () => {
  const series = (name: string, currencyCode: string, value: number) =>
    ({ name, currencyCode, points: [{ date: '2026-11-01', value }] }) as never;

  it('ne garde que la devise demandée, les plus gros soldes d’abord', () => {
    const result = selectAccountSeries(
      [series('A', 'EUR', 10), series('B', 'USD', 99), series('C', 'EUR', -50)],
      'EUR',
    );

    expect(result.map((s) => s.name)).toEqual(['C', 'A']);
  });

  it('retire les comptes bancaires restés à zéro', () => {
    expect(selectAccountSeries([series('A', 'EUR', 0)], 'EUR')).toEqual([]);
  });

  it('masque les courbes au-delà du maximum', () => {
    const result = selectAccountSeries(
      [series('A', 'EUR', 3), series('B', 'EUR', 2), series('C', 'EUR', 1)],
      'EUR',
      2,
    );

    expect(result.map((s) => s.hidden)).toEqual([false, false, true]);
  });
});

describe('shortLabel', () => {
  it('garde un texte court et raccourcit un texte long', () => {
    expect(shortLabel('Livret A')).toBe('Livret A');
    expect(shortLabel('x'.repeat(50), 10)).toBe(`${'x'.repeat(9)}…`);
  });
});

describe('fitLegendLabel', () => {
  it('garde le texte complet quand il tient', () => {
    expect(fitLegendLabel('Loyer', '10 €', 200, measure)).toBe('Loyer · 10 €');
  });

  it('raccourcit le nom sans jamais couper le montant', () => {
    const label = fitLegendLabel('Abonnements et télécoms', '3 616,70 €', 200, measure);

    expect(label.endsWith('… · 3 616,70 €')).toBe(true);
    expect(measure(label)).toBeLessThanOrEqual(200);
  });

  it('garde le montant même si la place manque', () => {
    expect(fitLegendLabel('Abonnements', '3 616,70 €', 10, measure)).toContain('3 616,70 €');
  });
});

describe('layoutHint', () => {
  it("centre le texte sur l'anneau quand il a la place", () => {
    expect(layoutHint(TEXT, 200, 500, measure)).toEqual({ lines: [TEXT], x: 200 });
  });

  it('décale le texte pour rester dans le cadre si l’anneau est trop à gauche', () => {
    expect(layoutHint(TEXT, 40, 500, measure)).toEqual({ lines: [TEXT], x: 65 });
  });

  it('décale le texte pour rester dans le cadre si l’anneau est trop à droite', () => {
    expect(layoutHint(TEXT, 480, 500, measure)).toEqual({ lines: [TEXT], x: 435 });
  });

  it('occupe toute la largeur du cadre sans aller à la ligne quand le texte y tient juste', () => {
    expect(layoutHint(TEXT, 40, 130, measure)).toEqual({ lines: [TEXT], x: 65 });
  });

  it('va à la ligne et se centre sur le cadre quand le texte dépasse sa largeur', () => {
    expect(layoutHint(TEXT, 30, 100, measure)).toEqual({ lines: ['un deux', 'trois'], x: 50 });
  });

  it('garde chaque ligne dans le cadre quand il faut plusieurs retours à la ligne', () => {
    const { lines } = layoutHint(TEXT, 30, 60, measure);

    expect(lines).toEqual(['un', 'deux', 'trois']);
    expect(lines.every((line) => measure(line) <= 60)).toBe(true);
  });
});
