import { UpcomingOccurrence } from '../core/models';

/**
 * Effet net des échéances à venir sur un compte. Un virement sort du compte source et entre sur
 * le compte cible ; entre deux devises sans montant reçu connu, l'entrée ne peut pas être chiffrée.
 */
export function upcomingNet(
  occurrences: UpcomingOccurrence[],
  accountId: number,
  accountCurrency: string,
): number {
  let net = 0;
  for (const o of occurrences) {
    if (o.accountId === accountId) {
      net += o.direction === 'DEBIT' ? -o.amount : o.amount;
    } else if (o.transfer && o.targetAccountId === accountId) {
      net += o.targetAmount ?? (o.currencyCode === accountCurrency ? o.amount : 0);
    }
  }
  return Math.round(net * 100) / 100;
}
