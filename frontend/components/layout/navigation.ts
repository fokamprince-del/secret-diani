/** Navigation principale, dans l'ordre imposé : les trois univers d'abord. */
export const mainNavigation = [
  { href: '/', label: 'Accueil' },
  { href: '/traiteur', label: 'Traiteur & Commandes' },
  { href: '/formations', label: 'Formations' },
  { href: '/boutique', label: 'Boutique' },
  { href: '/conseils', label: 'Conseils & Astuces' },
  { href: '/a-propos', label: 'À propos' },
  { href: '/contact', label: 'Contact' },
] as const;

export const footerNavigation = {
  liens: [
    { href: '/', label: 'Accueil' },
    { href: '/traiteur', label: 'Traiteur & Commandes' },
    { href: '/formations', label: 'Formations' },
    { href: '/boutique', label: 'Boutique & kits' },
    { href: '/conseils', label: 'Conseils & Astuces' },
    { href: '/a-propos', label: 'À propos' },
    { href: '/contact', label: 'Contact' },
  ],
  aide: [
    { href: '/faq', label: 'Questions fréquentes' },
    { href: '/commande/suivi', label: 'Suivi de commande' },
    { href: '/cgv', label: 'Conditions générales de vente' },
    { href: '/confidentialite', label: 'Politique de confidentialité' },
    { href: '/mentions-legales', label: 'Mentions légales' },
  ],
} as const;

/** Une page est « courante » si l'URL est la sienne ou une sous-page (`/boutique/kit-pro`). */
export function isCurrent(pathname: string, href: string): boolean {
  if (href === '/') return pathname === '/';
  return pathname === href || pathname.startsWith(`${href}/`);
}
