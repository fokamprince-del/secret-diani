import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { Analytics } from '@/components/layout/Analytics';
import { CookieConsent } from '@/components/layout/CookieConsent';
import { Footer } from '@/components/layout/Footer';
import { Header } from '@/components/layout/Header';
import { publicEnv } from '@/lib/env';
import { SITE_NAME } from '@/lib/seo';
import { allura, dmSans, playfair, playfairItalic } from './fonts';
import './globals.css';

export const metadata: Metadata = {
  metadataBase: new URL(publicEnv.siteUrl),
  title: {
    default: `${SITE_NAME} · Traiteur, formations et boutique`,
    template: `%s · ${SITE_NAME}`,
  },
  description:
    'Traiteur, formations et boutique d’accessoires pour créer, apprendre et se faire plaisir.',
  applicationName: SITE_NAME,
  formatDetection: { telephone: false, email: false, address: false },
};

export const viewport: Viewport = {
  themeColor: '#F9EEE8',
  colorScheme: 'light',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html
      lang="fr"
      className={[playfair, playfairItalic, dmSans, allura].map((font) => font.variable).join(' ')}
    >
      <body>
        <a href="#contenu" className="lien-evitement">
          Aller au contenu
        </a>
        <Header />
        <main id="contenu" tabIndex={-1}>
          {children}
        </main>
        <Footer />
        <CookieConsent />
        <Analytics />
      </body>
    </html>
  );
}
