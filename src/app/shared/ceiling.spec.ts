import { ceilingOverflow, ceilingProgress } from './ceiling';

describe('ceilingProgress', () => {
  it('donne la part atteinte et ce qui reste à verser', () => {
    expect(ceilingProgress(5737.5, 22950)).toEqual({
      percent: 25,
      remaining: 17212.5,
      exceeded: 0,
      reached: false,
    });
  });

  it('considère le plafond atteint quand le solde l’égale', () => {
    const p = ceilingProgress(22950, 22950);
    expect(p.reached).toBe(true);
    expect(p.remaining).toBe(0);
    expect(p.percent).toBe(100);
  });

  it('borne la barre et chiffre le dépassement dû aux intérêts', () => {
    const p = ceilingProgress(23311.42, 22950);
    expect(p.percent).toBe(100);
    expect(p.remaining).toBe(0);
    expect(p.exceeded).toBe(361.42);
  });

  it('ne descend pas sous zéro pour un solde négatif', () => {
    const p = ceilingProgress(-50, 1600);
    expect(p.percent).toBe(0);
    expect(p.remaining).toBe(1650);
  });
});

describe('ceilingOverflow', () => {
  it('vaut 0 sans plafond, pour un débit ou sous le plafond', () => {
    expect(ceilingOverflow(1000, null, 500)).toBe(0);
    expect(ceilingOverflow(22950, 22950, -100)).toBe(0);
    expect(ceilingOverflow(20000, 22950, 2950)).toBe(0);
  });

  it('donne la part du versement au-delà du plafond', () => {
    expect(ceilingOverflow(20000, 22950, 3000)).toBe(50);
  });

  it('ne compte que le nouveau versement quand le plafond est déjà dépassé', () => {
    expect(ceilingOverflow(23300, 22950, 100)).toBe(100);
  });
});
