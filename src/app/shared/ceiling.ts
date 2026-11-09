// Plafond de versements d'un compte bancaire (Livret A, LDDS...) : ce qui reste à épargner se
// calcule sur le solde, intérêts compris. Il est donc un peu prudent : les intérêts peuvent faire
// dépasser le plafond sans que ce soit une erreur.

export interface CeilingProgress {
  /** Part du plafond atteinte, entre 0 et 100 */
  percent: number;
  /** Ce qu'il est encore possible de verser, jamais négatif */
  remaining: number;
  /** Dépassement du plafond (intérêts), 0 sinon */
  exceeded: number;
  reached: boolean;
}

const round2 = (value: number) => Math.round(value * 100) / 100;

export function ceilingProgress(balance: number, ceiling: number): CeilingProgress {
  const gap = round2(ceiling - balance);
  return {
    percent: Math.min(100, Math.max(0, (balance / ceiling) * 100)),
    remaining: Math.max(0, gap),
    exceeded: Math.max(0, -gap),
    reached: gap <= 0,
  };
}

/** Montant dont une opération ferait dépasser le plafond, 0 si elle reste en dessous */
export function ceilingOverflow(balance: number, ceiling: number | null, credit: number): number {
  if (ceiling === null || credit <= 0) {
    return 0;
  }
  // Seule la part de l'opération au-delà du plafond compte : un compte déjà au-dessus
  // (intérêts) n'affiche que le nouveau versement
  return round2(Math.min(credit, Math.max(0, balance + credit - ceiling)));
}

// Plafonds réglementaires proposés à la saisie (en euros)
export const CEILING_PRESETS: { label: string; amount: number }[] = [
  { label: 'Livret A', amount: 22950 },
  { label: 'LDDS', amount: 12000 },
  { label: 'LEP', amount: 10000 },
  { label: 'Livret jeune', amount: 1600 },
  { label: 'PEL', amount: 61200 },
];
