import type { Metadata } from 'next';
import { ButtonLink } from '@/components/ui/Button';
import styles from './status-page.module.css';

// Next ajoute lui-même `<meta name="robots" content="noindex">` aux réponses 404.
export const metadata: Metadata = {
  title: 'Page introuvable',
};

export default function NotFound() {
  return (
    <div className={`conteneur ${styles.page}`}>
      <p className={styles.code} aria-hidden="true">
        404
      </p>
      <h1 className={styles.titre}>Cette page n’est pas (ou plus) à la carte.</h1>
      <p className={styles.texte}>
        Le lien est peut-être ancien, ou l’adresse contient une faute de frappe. Voici de quoi
        reprendre le fil.
      </p>
      <ul role="list" className={styles.actions}>
        <li>
          <ButtonLink href="/" withArrow>
            Revenir à l’accueil
          </ButtonLink>
        </li>
        <li>
          <ButtonLink href="/traiteur" variant="secondaire">
            Voir le traiteur
          </ButtonLink>
        </li>
        <li>
          <ButtonLink href="/formations" variant="secondaire">
            Voir les formations
          </ButtonLink>
        </li>
        <li>
          <ButtonLink href="/boutique" variant="secondaire">
            Voir la boutique
          </ButtonLink>
        </li>
      </ul>
    </div>
  );
}
