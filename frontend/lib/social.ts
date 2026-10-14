import type { SiteSettings } from './api/types';

export type SocialNetwork = 'instagram' | 'tiktok' | 'facebook' | 'youtube';

export interface SocialLink {
  network: SocialNetwork;
  /** Nom du réseau (« Instagram »). */
  label: string;
  href: string;
  /** Nom du compte affiché (« @diani_cuisto »). */
  handle: string;
}

const LABELS: Record<SocialNetwork, string> = {
  instagram: 'Instagram',
  tiktok: 'TikTok',
  facebook: 'Facebook',
  youtube: 'YouTube',
};

/** Compte de référence du cahier des charges, affiché si l'API n'a pas répondu au build. */
const FALLBACK: SiteSettings['socialLinks'] = {
  instagram: 'https://www.instagram.com/diani_cuisto/',
  tiktok: '',
  facebook: '',
  youtube: '',
};

function handleOf(href: string): string {
  try {
    const segment = new URL(href).pathname.split('/').find(Boolean) ?? '';
    return segment ? `@${segment.replace(/^@/, '')}` : new URL(href).hostname;
  } catch {
    return href;
  }
}

/**
 * Réseaux renseignés dans l'administration, dans un ordre fixe. Un réseau vide est masqué ;
 * seules des adresses https sont acceptées (l'API les valide déjà).
 */
export function socialLinksFrom(settings: SiteSettings | null): SocialLink[] {
  const links = settings?.socialLinks ?? FALLBACK;
  return (Object.keys(LABELS) as SocialNetwork[])
    .filter((network) => links[network]?.startsWith('https://'))
    .map((network) => ({
      network,
      label: LABELS[network],
      href: links[network],
      handle: handleOf(links[network]),
    }));
}

/**
 * Lien WhatsApp (wa.me) avec message pré-rempli facultatif ; `null` si aucun numéro n'est
 * configuré (le bouton est alors masqué).
 */
export function whatsappLink(number: string | undefined, message?: string): string | null {
  const digits = (number ?? '').replace(/\D/g, '');
  if (digits.length < 8) return null;
  const url = new URL(`https://wa.me/${digits}`);
  if (message) url.searchParams.set('text', message);
  return url.toString();
}
