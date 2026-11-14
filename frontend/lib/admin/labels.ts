/** Libellés français des valeurs renvoyées par l'API d'administration. */

export type Tone = 'neutre' | 'info' | 'attente' | 'succes' | 'alerte' | 'eteint';

export const CATERING_STATUS: Record<string, { label: string; tone: Tone }> = {
  new: { label: 'Nouvelle', tone: 'info' },
  contacted: { label: 'Contactée', tone: 'attente' },
  deposit_received: { label: 'Acompte reçu', tone: 'attente' },
  confirmed: { label: 'Confirmée', tone: 'succes' },
  delivered: { label: 'Livrée', tone: 'eteint' },
  cancelled: { label: 'Annulée', tone: 'alerte' },
};

export const OCCASION: Record<string, string> = {
  wedding: 'Mariage',
  birthday: 'Anniversaire',
  baptism: 'Baptême',
  corporate: 'Entreprise',
  other: 'Autre',
};

export const FULFILMENT: Record<string, string> = {
  pickup: 'Retrait',
  delivery: 'Livraison',
};

export const SOURCE: Record<string, string> = {
  form: 'Formulaire du site',
  online: 'Commande en ligne',
  admin: 'Saisie manuelle',
};

export const ORDER_STATUS: Record<string, { label: string; tone: Tone }> = {
  pending_payment: { label: 'Paiement en attente', tone: 'eteint' },
  paid: { label: 'Payée', tone: 'info' },
  preparing: { label: 'En préparation', tone: 'attente' },
  shipped: { label: 'Expédiée', tone: 'succes' },
  delivered: { label: 'Livrée', tone: 'eteint' },
  cancelled: { label: 'Annulée', tone: 'alerte' },
  refunded: { label: 'Remboursée', tone: 'alerte' },
};

export const CONTACT_STATUS: Record<string, { label: string; tone: Tone }> = {
  new: { label: 'Nouveau', tone: 'info' },
  read: { label: 'Lu', tone: 'neutre' },
  answered: { label: 'Répondu', tone: 'succes' },
  archived: { label: 'Archivé', tone: 'eteint' },
};

export const CONTACT_SUBJECT: Record<string, string> = {
  general: 'Question générale',
  catering: 'Traiteur',
  courses: 'Formations',
  shop: 'Boutique',
  partnership: 'Partenariat',
  other: 'Autre',
};

export const REVIEW_STATUS: Record<string, { label: string; tone: Tone }> = {
  pending: { label: 'À modérer', tone: 'attente' },
  approved: { label: 'Publié', tone: 'succes' },
  rejected: { label: 'Refusé', tone: 'eteint' },
};

export const FAQ_CATEGORY: Record<string, string> = {
  general: 'Général',
  traiteur: 'Traiteur',
  formations: 'Formations',
  boutique: 'Boutique',
  livraison: 'Livraison',
  paiement: 'Paiement',
  retours: 'Retours',
};

export const CATERING_KIND: Record<string, string> = {
  platter: 'Plateaux',
  a_la_carte: 'À la carte',
  layer_cake: 'Layer cakes',
};

export const CALL_STATUS: Record<string, { label: string; tone: Tone }> = {
  requested: { label: 'À planifier', tone: 'info' },
  scheduled: { label: 'Planifié', tone: 'attente' },
  done: { label: 'Fait', tone: 'succes' },
  cancelled: { label: 'Annulé', tone: 'eteint' },
};

export const USER_STATUS: Record<string, { label: string; tone: Tone }> = {
  active: { label: 'Actif', tone: 'succes' },
  locked: { label: 'Bloqué', tone: 'alerte' },
  deleted: { label: 'Supprimé', tone: 'eteint' },
};

export const SUBSCRIBER_STATUS: Record<string, { label: string; tone: Tone }> = {
  pending: { label: 'À confirmer', tone: 'attente' },
  confirmed: { label: 'Inscrite', tone: 'succes' },
  unsubscribed: { label: 'Désinscrite', tone: 'eteint' },
};

export const MEDIA_STATUS: Record<string, { label: string; tone: Tone }> = {
  pending: { label: 'En attente', tone: 'attente' },
  processing: { label: 'Traitement…', tone: 'attente' },
  ready: { label: 'Prête', tone: 'succes' },
  rejected: { label: 'Refusée', tone: 'alerte' },
};

export const ALLERGENS: { value: string; label: string }[] = [
  { value: 'gluten', label: 'Gluten' },
  { value: 'crustaceans', label: 'Crustacés' },
  { value: 'eggs', label: 'Œufs' },
  { value: 'fish', label: 'Poisson' },
  { value: 'peanuts', label: 'Arachides' },
  { value: 'soy', label: 'Soja' },
  { value: 'milk', label: 'Lait' },
  { value: 'nuts', label: 'Fruits à coque' },
  { value: 'celery', label: 'Céleri' },
  { value: 'mustard', label: 'Moutarde' },
  { value: 'sesame', label: 'Sésame' },
  { value: 'sulphites', label: 'Sulfites' },
  { value: 'lupin', label: 'Lupin' },
  { value: 'molluscs', label: 'Mollusques' },
];

/** Euros saisis (« 12,50 ») → centimes ; null si la saisie n'est pas un montant. */
export function eurosToCents(value: string): number | null {
  const normalized = value.replace(/\s|€/g, '').replace(',', '.');
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) return null;
  return Math.round(Number(normalized) * 100);
}

/** Centimes → saisie en euros (« 12,50 »). */
export function centsToEuros(cents: number | null | undefined): string {
  if (cents === null || cents === undefined) return '';
  return (cents / 100).toFixed(2).replace('.', ',');
}

const dateTime = new Intl.DateTimeFormat('fr-FR', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});
const dateOnly = new Intl.DateTimeFormat('fr-FR', {
  weekday: 'short',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});

export function formatDateTime(value: string | null | undefined): string {
  return value ? dateTime.format(new Date(value)) : '—';
}

/** Date « AAAA-MM-JJ » (sans fuseau) affichée telle quelle, sans décalage d'un jour. */
export function formatDay(value: string | null | undefined): string {
  if (!value) return '—';
  const day = value.length === 10 ? new Date(`${value}T12:00:00`) : new Date(value);
  return dateOnly.format(day);
}

/** Jours restants avant une date « AAAA-MM-JJ » (négatif : passée). */
export function daysUntil(value: string): number {
  const today = new Date();
  today.setHours(12, 0, 0, 0);
  const target = new Date(`${value.slice(0, 10)}T12:00:00`);
  return Math.round((target.getTime() - today.getTime()) / 86_400_000);
}
