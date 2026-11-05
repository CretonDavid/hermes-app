import { layoutHint } from './charts';

// Chaque caractère mesure 10 px : « un deux trois » fait donc 130 px
const measure = (text: string) => text.length * 10;
const TEXT = 'un deux trois';

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
