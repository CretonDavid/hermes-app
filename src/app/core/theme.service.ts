import { Injectable, signal } from '@angular/core';

const THEME_KEY = 'hermes.theme';
const DARK_CLASS = 'dark-theme';

/**
 * Thème clair ou sombre. Le thème initial est appliqué par le script de index.html :
 * le choix enregistré, sinon la préférence du système.
 */
@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly root = document.documentElement;

  readonly isDark = signal(this.root.classList.contains(DARK_CLASS));

  toggle(): void {
    const dark = !this.isDark();
    this.root.classList.toggle(DARK_CLASS, dark);
    localStorage.setItem(THEME_KEY, dark ? 'dark' : 'light');
    this.isDark.set(dark);
  }
}
