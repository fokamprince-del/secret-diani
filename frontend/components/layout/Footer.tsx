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

/**
 * Pied de page clair, d'après la maquette : logo, liens utiles, aide, lettre d'information et
 * réseaux, puis les mentions et la devise de la marque.
 */
export function Footer({ settings, socials }: FooterProps) {
  const year = new Date().getFullYear();
  const email = settings?.contactEmail;
  return (
    <footer className={styles.pied}>
      <div className={`conteneur ${styles.grille}`}>
        <div className={styles.marque}>
          <Logo size="grand" />
        </div>

        <nav aria-labelledby="pied-liens" className={styles.colonne}>
          <h2 id="pied-liens" className={styles.titre}>
            Liens utiles
          </h2>
          <ul role="list">
            {footerNavigation.liens.map((item) => (
              <li key={item.href}>
                <Link href={item.href} className={styles.lien}>
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <nav aria-labelledby="pied-aide" className={styles.colonne}>
          <h2 id="pied-aide" className={styles.titre}>
            Besoin d’aide ?
          </h2>
          <ul role="list">
            {footerNavigation.aide.map((item) => (
              <li key={item.href}>
                <Link href={item.href} className={styles.lien}>
                  {item.label}
                </Link>
              </li>
            ))}
            {email && (
              <li>
                <a href={`mailto:${email}`} className={styles.lien}>
                  {email}
                </a>
              </li>
            )}
          </ul>
        </nav>

        <div className={styles.communaute}>
          <NewsletterForm />
          {socials.length > 0 && (
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
                    <span className="visually-hidden">
                      {social.label} : {social.handle} (nouvel onglet)
                    </span>
                  </a>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className={`conteneur ${styles.legal}`}>
        <p>
          © {year} {SITE_NAME}. Tous droits réservés.
        </p>
        <ManageCookiesButton />
        <p className={styles.devise} aria-hidden="true">
          Cuisiner • Apprendre • Partager • Grandir
        </p>
      </div>
    </footer>
  );
}
