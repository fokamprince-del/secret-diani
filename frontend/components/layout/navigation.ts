/** Navigation principale, dans l'ordre imposé : les trois univers d'abord. */
export const mainNavigation = [
  { href: '/traiteur', label: 'Traiteur' },
  { href: '/formations', label: 'Formations' },
  { href: '/boutique', label: 'Boutique' },
  { href: '/conseils', label: 'Conseils' },
  { href: '/a-propos', label: 'À propos' },
  { href: '/contact', label: 'Contact' },
] as const;

export const footerNavigation = {
  univers: [
    { href: '/traiteur', label: 'Traiteur & commandes' },
    { href: '/formations', label: 'Formations en ligne' },
    { href: '/boutique', label: 'Boutique & kits' },
  ],
  maison: [
    { href: '/conseils', label: 'Conseils & astuces' },
    { href: '/a-propos', label: 'À propos' },
    { href: '/faq', label: 'Questions fréquentes' },
    { href: '/contact', label: 'Contact' },
  ],
  legal: [
    { href: '/mentions-legales', label: 'Mentions légales' },
    { href: '/cgv', label: 'Conditions générales de vente' },
    { href: '/confidentialite', label: 'Confidentialité' },
  ],
} as const;

export const socialLinks = {
  instagram: { href: 'https://www.instagram.com/diani_cuisto/', handle: '@diani_cuisto' },
} as const;

/** Une page est « courante » si l'URL est la sienne ou une sous-page (`/boutique/kit-pro`). */
export function isCurrent(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}
