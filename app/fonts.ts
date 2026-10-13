import { Allura, DM_Sans, Playfair_Display } from 'next/font/google';

/**
 * Polices auto-hébergées par next/font (aucune requête vers Google côté visiteur),
 * sous-ensemble latin, `swap`. Seules les deux familles du premier écran sont préchargées ;
 * l'italique (citations) et Allura (logo) ne le sont pas (voir DECISIONS D-F06).
 */
export const playfair = Playfair_Display({
  subsets: ['latin'],
  display: 'swap',
  weight: ['400', '500'],
  variable: '--font-playfair',
});

export const playfairItalic = Playfair_Display({
  subsets: ['latin'],
  display: 'swap',
  weight: ['400'],
  style: 'italic',
  preload: false,
  variable: '--font-playfair-italique',
});

export const dmSans = DM_Sans({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-dm-sans',
});

export const allura = Allura({
  subsets: ['latin'],
  display: 'swap',
  weight: '400',
  preload: false,
  variable: '--font-allura',
});
