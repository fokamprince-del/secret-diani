import { formatEuros } from '../../common/utils/money';

export interface DepositRule {
  thresholdCents: number;
  belowCents: number;
  fromCents: number;
}

/**
 * Acompte d'une commande traiteur : petit acompte si le total est strictement inférieur au
 * seuil, grand acompte à partir du seuil (50 € pile → 20 €, décision D-041).
 * L'acompte ne dépasse jamais le total (une commande de 8 € demande 8 €).
 */
export function computeDeposit(totalCents: number, rule: DepositRule): number {
  if (!Number.isInteger(totalCents) || totalCents < 0) {
    throw new RangeError('Le total doit être un entier positif (centimes).');
  }
  const deposit = totalCents < rule.thresholdCents ? rule.belowCents : rule.fromCents;
  return Math.min(deposit, totalCents);
}

/** « Un acompte de 10,00 € est demandé pour une commande de moins de 50,00 €, … ». */
export function depositSentence(rule: DepositRule): string {
  return `Un acompte de ${formatEuros(rule.belowCents)} est demandé pour une commande de moins de ${formatEuros(rule.thresholdCents)}, de ${formatEuros(rule.fromCents)} à partir de ${formatEuros(rule.thresholdCents)}.`;
}
