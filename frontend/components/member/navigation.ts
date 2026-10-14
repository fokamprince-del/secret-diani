import type { IconName } from '../ui/Icon';

/** Rubriques de l'espace membre, dans l'ordre d'affichage. */
export const memberNavigation: { href: string; label: string; icon: IconName }[] = [
  { href: '/espace-membre', label: 'Tableau de bord', icon: 'home' },
  { href: '/espace-membre/commandes', label: 'Mes commandes', icon: 'bag' },
  { href: '/espace-membre/profil', label: 'Mon profil', icon: 'user' },
  { href: '/espace-membre/adresses', label: 'Mes adresses', icon: 'pin' },
  { href: '/espace-membre/securite', label: 'Sécurité', icon: 'lock' },
  { href: '/espace-membre/donnees', label: 'Mes données', icon: 'shield' },
];
