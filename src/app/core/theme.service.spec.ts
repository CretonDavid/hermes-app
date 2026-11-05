import { ThemeService } from './theme.service';

describe('ThemeService', () => {
  beforeEach(() => {
    localStorage.removeItem('hermes.theme');
    document.documentElement.classList.remove('dark-theme');
  });

  it('reprend le thème déjà appliqué à la page', () => {
    document.documentElement.classList.add('dark-theme');
    expect(new ThemeService().isDark()).toBe(true);
  });

  it('bascule le thème et mémorise le choix', () => {
    const theme = new ThemeService();

    theme.toggle();
    expect(theme.isDark()).toBe(true);
    expect(document.documentElement.classList.contains('dark-theme')).toBe(true);
    expect(localStorage.getItem('hermes.theme')).toBe('dark');

    theme.toggle();
    expect(theme.isDark()).toBe(false);
    expect(document.documentElement.classList.contains('dark-theme')).toBe(false);
    expect(localStorage.getItem('hermes.theme')).toBe('light');
  });
});
