import { Transfer } from '../../core/models';

/**
 * Libellé choisi par l'utilisateur, ou null si le virement porte les libellés automatiques
 * (« Virement vers … » et « Virement depuis … ») : renvoyé à l'API, un libellé automatique
 * s'appliquerait aux deux côtés du virement.
 */
export function customTransferLabel(transfer: Transfer): string | null {
  const automatic = `Virement vers ${transfer.credit.accountName}`;
  return transfer.debit.label === automatic ? null : transfer.debit.label;
}
