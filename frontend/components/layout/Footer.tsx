import Link from 'next/link';
import type { SiteSettings } from '@/lib/api/types';
import { SITE_NAME } from '@/lib/seo';
import type { SocialLink } from '@/lib/social';
import { NewsletterForm } from '../forms/NewsletterForm';
import { Icon } from '../ui/Icon';
import { Logo } from './Logo';
import { ManageCookiesButton } from './ManageCookiesButton';
import { footerNavigation } from './navigation';
import styles from './Footer.module.css';

interface FooterProps {
  /** Réglages publics de l'API ; `null` si elle n'a pas répondu au build. */
  settings: SiteSettings | null;
  socials: SocialLink[];
}

export function Footer({ settings, socials }: FooterProps) {
  const year = new Date().getFullYear();
  const email = settings?.contactEmail;
  return (
    <footer className={styles.pied}>
      <svg
        className={styles.vague}
        viewBox="0 0 1440 60"
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        <path d="M0 60 V34 C 160 6, 320 6, 480 26 S 800 58, 960 34 S 1280 0, 1440 22 V60 Z" />
      </svg>
      <p className={styles.filigrane} aria-hidden="true">
        Diani
      </p>
      <div className={`conteneur ${styles.grille}`}>
        <div className={styles.marque}>
          <Logo />
          <p className={styles.accroche}>
            Traiteur, formations et boutique d’accessoires pour créer, apprendre et se faire
            plaisir.
          </p>
          {(socials.length > 0 || email) && (
            <ul role="list" className={styles.reseaux}>
              {socials.map((social) => (
                <li key={social.network}>
                  <a
                    href={social.href}
                    className={`${styles.reseau} sans-filet`}
                    rel="noopener noreferrer"
                    target="_blank"
                  >
                    <Icon name={social.network} size={20} />
                    {social.handle}
                    <span className="visually-hidden"> sur {social.label} (nouvel onglet)</span>
                  </a>
                </li>
              ))}
              {email && (
                <li>
                  <a href={`mailto:${email}`} className={`${styles.reseau} sans-filet`}>
                    <Icon name="mail" size={20} />
                    {email}
                  </a>
                </li>
              )}
            </ul>
          )}
        </div>

        <nav aria-labelledby="pied-univers" className={styles.colonne}>
          <h2 id="pied-univers" className={styles.titre}>
            Nos univers
          </h2>
          <ul role="list">
            {footerNavigation.univers.map((item) => (
              <li key={item.href}>
                <Link href={item.href} className={styles.lien}>
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <nav aria-labelledby="pied-maison" className={styles.colonne}>
          <h2 id="pied-maison" className={styles.titre}>
            La maison
          </h2>
          <ul role="list">
            {footerNavigation.maison.map((item) => (
              <li key={item.href}>
                <Link href={item.href} className={styles.lien}>
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>

      <div className={`conteneur ${styles.lettre}`}>
        <NewsletterForm />
      </div>

      <div className={`conteneur ${styles.legal}`}>
        <p>
          © {year} {SITE_NAME}
        </p>
        <nav aria-label="Informations légales">
          <ul role="list" className={styles.liensLegaux}>
            {footerNavigation.legal.map((item) => (
              <li key={item.href}>
                <Link href={item.href} className={styles.lien}>
                  {item.label}
                </Link>
              </li>
            ))}
            <li>
              <ManageCookiesButton />
            </li>
          </ul>
        </nav>
      </div>
    </footer>
  );
}
