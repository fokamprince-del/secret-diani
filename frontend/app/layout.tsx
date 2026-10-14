import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { AuthProvider } from '@/components/auth/AuthProvider';
import { AnnouncementBar } from '@/components/layout/AnnouncementBar';
import { Analytics } from '@/components/layout/Analytics';
import { CookieConsent } from '@/components/layout/CookieConsent';
import { Footer } from '@/components/layout/Footer';
import { Header } from '@/components/layout/Header';
import { OfflineNotice } from '@/components/layout/OfflineNotice';
import { Apparitions } from '@/components/ui/Apparitions';
import { getSiteSettings } from '@/lib/api/content';
import { publicEnv } from '@/lib/env';
import { SITE_NAME } from '@/lib/seo';
import { socialLinksFrom } from '@/lib/social';
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

export default async function RootLayout({ children }: { children: ReactNode }) {
  const settings = await getSiteSettings();
  const socials = socialLinksFrom(settings);
  return (
    <html
      lang="fr"
      className={[playfair, playfairItalic, dmSans, allura].map((font) => font.variable).join(' ')}
    >
      <body>
        <AuthProvider>
          <a href="#contenu" className="lien-evitement">
            Aller au contenu
          </a>
          <AnnouncementBar announcement={settings?.announcement ?? null} />
          <Header social={socials[0] ?? null} />
          <main id="contenu" tabIndex={-1}>
            {children}
          </main>
          <Footer settings={settings} socials={socials} />
          <CookieConsent />
          <OfflineNotice />
          <Apparitions />
          <Analytics />
        </AuthProvider>
      </body>
    </html>
  );
}
