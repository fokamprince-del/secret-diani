import type { IconName } from '@/components/ui/Icon';

export interface AdminLink {
  href: string;
  label: string;
  icon: IconName;
}

export interface AdminSection {
  title: string;
  links: AdminLink[];
}

/** Navigation du back-office, dans l'ordre du quotidien de Diani : traiteur d'abord. */
export const adminNavigation: AdminSection[] = [
  {
    title: 'Pilotage',
    links: [{ href: '/admin', label: 'Tableau de bord', icon: 'grille' }],
  },
  {
    title: 'Traiteur',
    links: [
      { href: '/admin/traiteur/demandes', label: 'Demandes & devis', icon: 'couverts' },
      { href: '/admin/traiteur/produits', label: 'Carte & prix', icon: 'carte' },
      { href: '/admin/traiteur/categories', label: 'Catégories & parfums', icon: 'leaf' },
    ],
  },
  {
    title: 'Boutique',
    links: [
      { href: '/admin/boutique/commandes', label: 'Commandes', icon: 'bag' },
      { href: '/admin/boutique/produits', label: 'Produits & stock', icon: 'boutique' },
      { href: '/admin/boutique/livraison', label: 'Livraison', icon: 'camion' },
    ],
  },
  {
    title: 'Formations',
    links: [
      { href: '/admin/formations', label: 'Formations', icon: 'ecran' },
      { href: '/admin/formations/packs', label: 'Packs & accès', icon: 'star' },
      { href: '/admin/formations/appels', label: 'Appels', icon: 'accompagnement' },
    ],
  },
  {
    title: 'Contenus',
    links: [
      { href: '/admin/contenus/pages', label: 'Pages', icon: 'document' },
      { href: '/admin/contenus/articles', label: 'Conseils & astuces', icon: 'livre' },
      { href: '/admin/contenus/faq', label: 'FAQ', icon: 'question' },
      { href: '/admin/contenus/avis', label: 'Avis clientes', icon: 'heart' },
      { href: '/admin/medias', label: 'Médiathèque', icon: 'image' },
    ],
  },
  {
    title: 'Relation clientes',
    links: [
      { href: '/admin/messages', label: 'Messages', icon: 'chat' },
      { href: '/admin/newsletter', label: 'Newsletter', icon: 'mail' },
      { href: '/admin/utilisateurs', label: 'Comptes', icon: 'utilisateurs' },
    ],
  },
  {
    title: 'Réglages',
    links: [
      { href: '/admin/parametres', label: 'Paramètres du site', icon: 'reglages' },
      { href: '/admin/journal', label: 'Journal d’audit', icon: 'journal' },
    ],
  },
];
