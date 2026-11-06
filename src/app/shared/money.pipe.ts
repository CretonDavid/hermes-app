import { Pipe, PipeTransform } from '@angular/core';

const formatters = new Map<string, Intl.NumberFormat>();

function formatter(key: string, options: Intl.NumberFormatOptions): Intl.NumberFormat {
  let result = formatters.get(key);
  if (!result) {
    result = new Intl.NumberFormat('fr-FR', options);
    formatters.set(key, result);
  }
  return result;
}

// Le vrai signe moins, aligné avec le « + » et plus lisible qu'un tiret
const trueMinus = (text: string) => text.replace('-', '−');

export function formatMoney(
  amount: number | null | undefined,
  currency = 'EUR',
  signed = false,
): string {
  if (amount === null || amount === undefined) {
    return '—';
  }
  try {
    return trueMinus(
      formatter(`${currency}|${signed}`, {
        style: 'currency',
        currency,
        signDisplay: signed ? 'exceptZero' : 'auto',
      }).format(amount),
    );
  } catch {
    // Code devise non reconnu par le navigateur : affichage numérique suivi du code
    const number = formatter('number', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return trueMinus(`${signed && amount > 0 ? '+' : ''}${number.format(amount)} ${currency}`);
  }
}

// Graduation d'un axe de graphique : les centimes n'y apportent rien
export function formatAxisMoney(amount: number, currency = 'EUR'): string {
  try {
    return trueMinus(
      formatter(`axis|${currency}`, {
        style: 'currency',
        currency,
        maximumFractionDigits: 0,
      }).format(amount),
    );
  } catch {
    return trueMinus(`${formatter('axis', { maximumFractionDigits: 0 }).format(amount)} ${currency}`);
  }
}

// Part exprimée entre 0 et 1 : -0.054 → −5,4 %
export function formatPercent(value: number, maxDecimals = 1): string {
  return trueMinus(
    formatter(`percent|${maxDecimals}`, {
      style: 'percent',
      maximumFractionDigits: maxDecimals,
    }).format(value),
  );
}

@Pipe({ name: 'percentage' })
export class PercentagePipe implements PipeTransform {
  transform(value: number, maxDecimals = 1): string {
    return formatPercent(value, maxDecimals);
  }
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
