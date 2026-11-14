import type { IconName } from '../ui/Icon';

/** Navigation principale, dans l'ordre de la maquette, chaque rubrique avec son pictogramme. */
export const mainNavigation: readonly { href: string; label: string; icon: IconName }[] = [
  { href: '/', label: 'Accueil', icon: 'home' },
  { href: '/traiteur', label: 'Traiteur & Commandes', icon: 'couverts' },
  { href: '/formations', label: 'Formations', icon: 'ecran' },
  { href: '/boutique', label: 'Boutique', icon: 'boutique' },
  { href: '/conseils', label: 'Conseils & Astuces', icon: 'livre' },
  { href: '/a-propos', label: 'À propos', icon: 'heart' },
  { href: '/contact', label: 'Contact', icon: 'chat' },
];

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
    { href: '/faq', label: 'Questions fréquentes', icon: 'question' },
    { href: '/commande/suivi', label: 'Suivi de commande', icon: 'camion' },
    { href: '/cgv', label: 'Conditions générales de vente', icon: 'carte' },
    { href: '/confidentialite', label: 'Politique de confidentialité', icon: 'shield' },
    { href: '/mentions-legales', label: 'Mentions légales', icon: 'livre' },
  ],
} as const satisfies {
  liens: readonly { href: string; label: string }[];
  aide: readonly { href: string; label: string; icon: IconName }[];
};

/** Une page est « courante » si l'URL est la sienne ou une sous-page (`/boutique/kit-pro`). */
export function isCurrent(pathname: string, href: string): boolean {
  if (href === '/') return pathname === '/';
  return pathname === href || pathname.startsWith(`${href}/`);
}
