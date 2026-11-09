import { addMonths, format, parseISO } from 'date-fns';
import { fr } from 'date-fns/locale';
import {
  PaymentMethod,
  RecurrenceFrequency,
  ReimbursementPeriod,
  TransactionStatus,
} from './models';

// Conversion entre les dates du datepicker (Date) et le format de l'API (yyyy-MM-dd)
export function toIsoDate(date: Date | string | null | undefined): string | null {
  if (!date) {
    return null;
  }
  return typeof date === 'string' ? date : format(date, 'yyyy-MM-dd');
}

/**
 * Nombre suivi du mot, au pluriel à partir de 2 : « 1 opération », « 3 opérations ».
 */
export function countLabel(count: number, word: string): string {
  return `${count} ${pluralize(count, word)}`;
}

export function pluralize(count: number, word: string): string {
  return count > 1 ? `${word}s` : word;
}

export function fromIsoDate(date: string | null | undefined): Date | null {
  return date ? parseISO(date) : null;
}

export function today(): string {
  return format(new Date(), 'yyyy-MM-dd');
}

export const PAYMENT_METHODS: { value: PaymentMethod; label: string; icon: string }[] = [
  { value: 'CARD', label: 'Carte bancaire', icon: 'credit_card' },
  { value: 'TRANSFER', label: 'Virement', icon: 'swap_horiz' },
  { value: 'DIRECT_DEBIT', label: 'Prélèvement', icon: 'event_repeat' },
  { value: 'CHECK', label: 'Chèque', icon: 'edit_note' },
  { value: 'CASH', label: 'Espèces', icon: 'payments' },
  { value: 'OTHER', label: 'Autre', icon: 'more_horiz' },
];

export function paymentMethodLabel(method: PaymentMethod | null | undefined): string {
  return PAYMENT_METHODS.find((m) => m.value === method)?.label ?? '';
}

export const STATUS_LABELS: Record<TransactionStatus, string> = {
  PENDING: 'Non pointée',
  CLEARED: 'Pointée',
  RECONCILED: 'Rapprochée',
};

export const FREQUENCIES: {
  value: RecurrenceFrequency;
  label: string;
  unit: string;
  units: string;
}[] = [
  { value: 'DAILY', label: 'Quotidienne', unit: 'jour', units: 'jours' },
  { value: 'WEEKLY', label: 'Hebdomadaire', unit: 'semaine', units: 'semaines' },
  { value: 'MONTHLY', label: 'Mensuelle', unit: 'mois', units: 'mois' },
  { value: 'YEARLY', label: 'Annuelle', unit: 'an', units: 'ans' },
];

export function frequencyLabel(frequency: RecurrenceFrequency, interval: number): string {
  const definition = FREQUENCIES.find((f) => f.value === frequency)!;
  if (interval === 1) {
    return definition.label;
  }
  if (frequency === 'MONTHLY' && interval === 3) {
    return 'Trimestrielle';
  }
  if (frequency === 'MONTHLY' && interval === 6) {
    return 'Semestrielle';
  }
  return `Tous les ${interval} ${definition.units}`;
}

export function formatMonth(month: string): string {
  return format(parseISO(`${month}-01`), 'MMM yyyy', { locale: fr });
}

// Format unique des dates dans l'application, y compris sur les axes des graphiques
export function formatDay(date: string): string {
  return format(parseISO(date), 'dd/MM/yyyy');
}

// Retire les mois vides situés avant les premières données : ce ne sont pas de vrais zéros
export function trimLeadingEmpty<T>(items: T[], hasData: (item: T) => boolean): T[] {
  const first = items.findIndex(hasData);
  return first === -1 ? items : items.slice(first);
}

export const REIMBURSEMENT_PERIODS: { value: ReimbursementPeriod; label: string }[] = [
  { value: 'YEARLY', label: 'Une fois par an' },
  { value: 'QUARTERLY', label: 'Chaque trimestre' },
  { value: 'MONTHLY', label: 'Chaque mois' },
];

const PERIOD_MONTHS: Record<ReimbursementPeriod, number> = { MONTHLY: 1, QUARTERLY: 3, YEARLY: 12 };

// Premier jour de la période de remboursement contenant la date (yyyy-MM-dd)
export function reimbursementPeriodStart(period: ReimbursementPeriod, date: Date | string): string {
  const d = typeof date === 'string' ? parseISO(date) : date;
  const months = PERIOD_MONTHS[period];
  return toIsoDate(new Date(d.getFullYear(), Math.floor(d.getMonth() / months) * months, 1))!;
}

// Périodes de remboursement de la première à la dernière date incluses, la plus récente d'abord
export function reimbursementPeriodStarts(
  period: ReimbursementPeriod,
  from: Date | string,
  to: Date | string,
): string[] {
  const last = reimbursementPeriodStart(period, to);
  const starts: string[] = [];
  for (
    let start = reimbursementPeriodStart(period, from);
    start <= last;
    start = toIsoDate(addMonths(parseISO(start), PERIOD_MONTHS[period]))!
  ) {
    starts.unshift(start);
  }
  return starts;
}

// Nom d'une période de remboursement : « 2026 », « T1 2026 » ou « nov. 2026 »
export function reimbursementPeriodLabel(period: ReimbursementPeriod, start: string): string {
  const date = parseISO(start);
  switch (period) {
    case 'YEARLY':
      return format(date, 'yyyy');
    case 'QUARTERLY':
      return `T${Math.floor(date.getMonth() / 3) + 1} ${format(date, 'yyyy')}`;
    default:
      return format(date, 'MMM yyyy', { locale: fr });
  }
}
