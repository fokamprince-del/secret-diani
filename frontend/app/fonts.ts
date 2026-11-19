import { EB_Garamond, Montserrat } from 'next/font/google';

/**
 * Polices auto-hébergées par next/font (aucune requête vers Google côté visiteur),
 * sous-ensemble latin, `swap`. Direction « Maison » : EB Garamond pour les titres, Montserrat
 * pour le texte. Pas Cormorant ni Cormorant Garamond : leurs fichiers latins de Google placent
 * mal les accents (« Pâtisserie », « Baptême »). Seules les deux familles du premier écran sont
 * préchargées ; l'italique (citations, accroches) ne l'est pas (voir DECISIONS D-F06).
 */
export const garamond = EB_Garamond({
  subsets: ['latin'],
  display: 'swap',
  weight: ['400', '500'],
  variable: '--font-garamond',
});

export const garamondItalic = EB_Garamond({
  subsets: ['latin'],
  display: 'swap',
  weight: ['400'],
  style: 'italic',
  preload: false,
  variable: '--font-garamond-italique',
});

export const montserrat = Montserrat({
  subsets: ['latin'],
  display: 'swap',
  weight: ['300', '400', '500', '600'],
  variable: '--font-montserrat',
});
