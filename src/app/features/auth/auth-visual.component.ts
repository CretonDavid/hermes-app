import { ChangeDetectionStrategy, Component } from '@angular/core';

/**
 * Panneau décoratif des pages de connexion : une composition de formes aux couleurs d'Hermès.
 */
@Component({
  selector: 'app-auth-visual',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <svg viewBox="0 0 400 300" aria-hidden="true" preserveAspectRatio="xMidYMid slice">
      <rect width="400" height="300" fill="#2a1846" />
      <path d="M0 0h100v100A100 100 0 0 1 0 0z" fill="#4b2a78" />
      <circle cx="150" cy="50" r="50" fill="#f4b942" />
      <path d="M200 100V0h100a100 100 0 0 1-100 100z" fill="#0f9d82" />
      <rect x="300" width="100" height="100" fill="#3a2160" />
      <circle cx="350" cy="50" r="22" fill="#eadffb" />
      <path d="M0 100h100v100H0a100 100 0 0 1 0-100z" fill="#3a2160" />
      <path d="M100 200V100a100 100 0 0 1 100 100z" fill="#e5486d" />
      <rect x="200" y="100" width="100" height="100" fill="#4b2a78" />
      <circle cx="250" cy="150" r="50" fill="#2a1846" />
      <path d="M300 100h100a100 100 0 0 1-100 100z" fill="#f4b942" />
      <path d="M0 300V200h100A100 100 0 0 1 0 300z" fill="#f4b942" />
      <rect x="100" y="200" width="100" height="100" fill="#3a2160" />
      <path d="M200 200v100h100a100 100 0 0 0-100-100z" fill="#8a63d2" />
      <path d="M400 300H300V200a100 100 0 0 1 100 100z" fill="#4b2a78" />
    </svg>
    <div class="caption">
      <h2>Vos comptes, en toute clarté.</h2>
      <p>Aucun e-mail, aucun mot de passe : un simple numéro de compte.</p>
    </div>
  `,
  styles: `
    :host {
      position: relative;
      display: block;
      overflow: hidden;
      background: #2a1846;
      color: #ffffff;
    }
    svg {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
    }
    .caption {
      position: absolute;
      left: 0;
      right: 0;
      bottom: 0;
      padding: 96px 48px 40px;
      background: linear-gradient(transparent, #1a0e2e 70%);
    }
    h2 {
      font:
        700 32px/40px Nunito,
        sans-serif;
      letter-spacing: -0.01em;
      margin: 0 0 8px;
    }
    p {
      margin: 0;
      color: #d9ccee;
    }
    @media (max-width: 900px) {
      :host {
        display: none;
      }
    }
  `,
})
export class AuthVisualComponent {}
