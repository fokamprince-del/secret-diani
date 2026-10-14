import Link from 'next/link';
import type { SiteSettings } from '@/lib/api/types';
import { Icon } from '../ui/Icon';
import styles from './AnnouncementBar.module.css';

/**
 * Bandeau d'annonce (promotion, fermeture exceptionnelle), réglé dans l'administration.
 * Lien facultatif : chemin du site ou adresse https (validés par l'API).
 */
export function AnnouncementBar({ announcement }: { announcement: SiteSettings['announcement'] }) {
  if (!announcement?.enabled || !announcement.text) return null;
  const { text, link } = announcement;
  const external = link.startsWith('https://');
  return (
    <aside className={styles.bandeau} aria-label="Annonce">
      <p className={`conteneur ${styles.texte}`}>
        {link ? (
          external ? (
            <a href={link} className={styles.lien} rel="noopener noreferrer" target="_blank">
              {text}
              <span className="visually-hidden"> (nouvel onglet)</span>
              <Icon name="arrowRight" size={16} />
            </a>
          ) : (
            <Link href={link} className={styles.lien}>
              {text}
              <Icon name="arrowRight" size={16} />
            </Link>
          )
        ) : (
          text
        )}
      </p>
    </aside>
  );
}
