import { Pipe, PipeTransform } from '@angular/core';

const formatters = new Map<string, Intl.NumberFormat>();

export function formatMoney(amount: number | null | undefined, currency = 'EUR', signed = false): string {
  if (amount === null || amount === undefined) {
    return '—';
  }
  const key = `${currency}|${signed}`;
  let formatter = formatters.get(key);
  if (!formatter) {
    try {
      formatter = new Intl.NumberFormat('fr-FR', {
        style: 'currency',
        currency,
        signDisplay: signed ? 'exceptZero' : 'auto',
      });
    } catch {
      // Code devise non reconnu par le navigateur : affichage numérique suivi du code
      const number = new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      return `${signed && amount > 0 ? '+' : ''}${number.format(amount)} ${currency}`;
    }
    formatters.set(key, formatter);
  }
  return formatter.format(amount);
}

/**
 * Affiche un montant dans une devise : {{ 12.5 | money: 'EUR' }} → 12,50 €.
 * Avec signed = true, le signe est toujours affiché (+12,50 €).
 */
@Pipe({ name: 'money' })
export class MoneyPipe implements PipeTransform {
  transform(amount: number | null | undefined, currency = 'EUR', signed = false): string {
    return formatMoney(amount, currency, signed);
  }
}
