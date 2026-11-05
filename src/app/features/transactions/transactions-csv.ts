import { STATUS_LABELS, paymentMethodLabel } from '../../core/format';
import { Transaction } from '../../core/models';
import { formatAmount } from '../../shared/amount-input.directive';

const HEADERS = [
  'Date',
  'Libellé',
  'Bénéficiaire',
  'Catégorie',
  'Compte',
  'Montant',
  'Devise',
  'Moyen de paiement',
  'Pointage',
  'Notes',
];

// Un texte commençant par ces caractères serait exécuté comme une formule par un tableur
function safeText(value: string | null | undefined): string {
  const text = value ?? '';
  return /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
}

function cell(value: string): string {
  return /[";\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

// Séparateur « ; » et marque BOM : le fichier s'ouvre directement dans un tableur français
export function transactionsToCsv(transactions: Transaction[]): string {
  const rows = transactions.map((t) =>
    [
      t.operationDate.split('-').reverse().join('/'),
      safeText(t.label),
      safeText(t.payee),
      t.transfer ? 'Virement interne' : safeText(t.category?.name),
      safeText(t.accountName),
      formatAmount(t.direction === 'DEBIT' ? -t.amount : t.amount),
      t.currencyCode,
      paymentMethodLabel(t.paymentMethod),
      STATUS_LABELS[t.status],
      safeText(t.notes),
    ]
      .map(cell)
      .join(';'),
  );
  return `﻿${[HEADERS.join(';'), ...rows].join('\r\n')}\r\n`;
}
