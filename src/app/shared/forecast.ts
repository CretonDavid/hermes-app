import { Transaction, UpcomingOccurrence } from '../core/models';

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

// Ajoute aux échéances les opérations déjà saisies avec une date future. Un virement n'apparaît
// qu'une fois, par son côté débit.
export function withFutureTransactions(
  occurrences: UpcomingOccurrence[],
  transactions: Transaction[],
): UpcomingOccurrence[] {
  const future = transactions
    .filter((t) => !(t.transfer && t.direction === 'CREDIT'))
    .map(
      (t): UpcomingOccurrence => ({
        recurringTransactionId: -t.id,
        date: t.operationDate,
        label: t.label,
        direction: t.direction,
        amount: t.amount,
        accountId: t.accountId,
        accountName: t.accountName,
        currencyCode: t.currencyCode,
        transfer: !!t.transfer,
        targetAccountId: t.transfer?.accountId ?? null,
        targetAccountName: t.transfer?.accountName ?? null,
        targetAmount: null,
      }),
    );
  return [...occurrences, ...future].sort(
    (a, b) => a.date.localeCompare(b.date) || a.label.localeCompare(b.label),
  );
}
