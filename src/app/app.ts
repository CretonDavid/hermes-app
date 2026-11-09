import { Component, inject } from '@angular/core';
import { MatIconRegistry } from '@angular/material/icon';
import { RouterOutlet } from '@angular/router';

@Component({
  imports: [RouterOutlet],
  selector: 'app-root',
  template: `<router-outlet />`,
})
export class App {
  constructor() {
    // Icônes Material Symbols (police auto-hébergée, déclarée dans angular.json)
    inject(MatIconRegistry).setDefaultFontSetClass('material-symbols-outlined');
  }
}
