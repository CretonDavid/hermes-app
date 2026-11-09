import { HttpErrorResponse } from '@angular/common/http';
import { errorMessage } from './notify.service';

describe('errorMessage', () => {
  const http = (status: number, error: unknown) => new HttpErrorResponse({ status, error });

  it('affiche les erreurs de validation champ par champ', () => {
    const message = errorMessage(
      http(400, { fieldErrors: { name: 'Le nom est obligatoire', amount: 'Montant invalide' } }),
    );
    expect(message).toBe('Le nom est obligatoire · Montant invalide');
  });

  it('reprend le message de l’API', () => {
    expect(errorMessage(http(409, { message: 'La devise BTC existe déjà' }))).toBe(
      'La devise BTC existe déjà',
    );
  });

  it('signale un serveur injoignable sans détail technique', () => {
    expect(errorMessage(http(0, null))).toContain('Impossible de joindre le serveur');
  });

  it('donne le code HTTP faute de message', () => {
    expect(errorMessage(http(502, null))).toBe('Erreur 502');
  });

  it('reste générique pour une erreur inconnue', () => {
    expect(errorMessage(new Error('boom'))).toBe('Une erreur inattendue est survenue');
  });
});
