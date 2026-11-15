import { ChangeDetectionStrategy, Component } from '@angular/core';

/** Logo d'Hermès : une aile aubergine sur une tuile safran, comme le favicon. */
@Component({
  selector: 'app-logo',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <svg viewBox="0 0 64 64" aria-hidden="true">
      <path
        fill="currentColor"
        d="M12 47C12 29 28 15 53 12C51 19 47 22 42 24C47 25 50 27 51 30C45 32 40 33 36 33C40 35 42 37 42 40C35 42 27 44 19 45C22 46 23 47 23 49C19 49 15 48 12 47Z"
      />
    </svg>
  `,
  styles: `
    :host {
      display: block;
      flex: none;
      width: 36px;
      height: 36px;
      border-radius: 11px;
      background: var(--hermes-saffron);
      color: #2a1846;
    }

    svg {
      display: block;
      width: 100%;
      height: 100%;
    }
  `,
})
export class LogoComponent {}
