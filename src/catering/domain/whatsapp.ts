/**
 * Numéro WhatsApp au format attendu par wa.me : chiffres seuls, indicatif pays inclus.
 * « +33 6 12 34 56 78 » → « 33612345678 » ; « 0612345678 » (sans indicatif) → null.
 */
export function normalizeWhatsappNumber(raw: string): string | null {
  const trimmed = raw.trim();
  const international = trimmed.startsWith('+') || trimmed.startsWith('00');
  const digits = trimmed.replace(/\D/g, '').replace(/^00/, '');
  if (!international || digits.length < 8 || digits.length > 15) return null;
  return digits;
}

/** Lien « Contacter » ouvrant WhatsApp avec un message pré-rempli ; null sans numéro valide. */
export function whatsappUrl(rawNumber: string, message: string): string | null {
  const number = normalizeWhatsappNumber(rawNumber);
  if (!number) return null;
  return `https://wa.me/${number}?text=${encodeURIComponent(message)}`;
}

export function productMessage(productName: string, variantLabel?: string): string {
  const what = variantLabel ? `${productName} (${variantLabel})` : productName;
  return `Bonjour Diani, je souhaite commander : ${what}. Pouvez-vous me donner vos disponibilités ?`;
}

export function requestMessage(reference: string, eventDate: string): string {
  return `Bonjour Diani, je viens d’envoyer la demande ${reference} pour le ${eventDate}. Je reste disponible pour en parler.`;
}
