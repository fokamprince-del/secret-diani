'use client';

import { useEffect } from 'react';
import { Button, ButtonLink } from '@/components/ui/Button';
import styles from './status-page.module.css';

/** Erreur inattendue dans une page : cause en mots simples et action de rattrapage. */
export default function ErrorPage({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className={`conteneur ${styles.page}`} role="alert">
      <h1 className={styles.titre}>Cette page n’a pas pu s’afficher.</h1>
      <p className={styles.texte}>
        Un incident passager nous empêche de la charger. Réessayez dans un instant : si le problème
        persiste, écrivez-nous depuis la page contact.
      </p>
      {error.digest && <p className={styles.reference}>Référence de l’incident : {error.digest}</p>}
      <ul role="list" className={styles.actions}>
        <li>
          <Button onClick={() => retry()}>Réessayer</Button>
        </li>
        <li>
          <ButtonLink href="/" variant="secondaire">
            Revenir à l’accueil
          </ButtonLink>
        </li>
      </ul>
    </div>
  );
}
