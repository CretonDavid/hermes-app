import { format, parseISO } from 'date-fns';
import { fr } from 'date-fns/locale';
import { PaymentMethod, RecurrenceFrequency, TransactionStatus } from './models';

// Conversion entre les dates du datepicker (Date) et le format de l'API (yyyy-MM-dd)
export function toIsoDate(date: Date | string | null | undefined): string | null {
  if (!date) {
    return null;
  }
  return typeof date === 'string' ? date : format(date, 'yyyy-MM-dd');
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
  return format(parseISO(`${month}-01`), 'MMM yy', { locale: fr });
}
