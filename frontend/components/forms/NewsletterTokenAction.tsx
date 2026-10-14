'use client';

import { useEffect, useState } from 'react';
import { browserApi, unwrap } from '@/lib/api/client';
import { userMessage } from '@/lib/api/errors';
import { Button, ButtonLink } from '../ui/Button';
import { FormStatus } from '../ui/States';
import styles from './Form.module.css';

type Action = 'confirm' | 'unsubscribe';

const LABELS: Record<Action, { button: string; missing: string }> = {
  confirm: {
    button: 'Confirmer mon inscription',
    missing:
      'Ce lien est incomplet. Ouvrez le lien reçu par e-mail tel quel, ou inscrivez-vous de nouveau en bas de page.',
  },
  unsubscribe: {
    button: 'Me désinscrire',
    missing: 'Ce lien est incomplet. Ouvrez le lien présent en bas de nos e-mails tel quel.',
  },
};

/**
 * Action d'un lien reçu par e-mail (confirmation ou désinscription). Elle n'est faite qu'au clic :
 * les robots qui ouvrent les liens des e-mails pour les analyser ne déclenchent rien.
 * Le jeton est retiré de la barre d'adresse dès la lecture (historique, mesure d'audience).
 */
export function NewsletterTokenAction({ action }: { action: Action }) {
  // undefined : adresse pas encore lue (avant l'hydratation) ; null : lien sans jeton.
  const [token, setToken] = useState<string | null | undefined>(undefined);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);

  useEffect(() => {
    const url = new URL(window.location.href);
    const value = url.searchParams.get('token');
    if (value) {
      url.searchParams.delete('token');
      window.history.replaceState(null, '', url.pathname + url.search + url.hash);
    }
    // Lecture de l'adresse : possible seulement après l'hydratation.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setToken(value);
  }, []);

  const submit = async () => {
    if (!token) return;
    setLoading(true);
    setFailure(null);
    try {
      const body = { token };
      const result = unwrap(
        action === 'confirm'
          ? await browserApi.POST('/api/v1/newsletter/confirm', { body })
          : await browserApi.POST('/api/v1/newsletter/unsubscribe', { body }),
      );
      setDone(result.message);
    } catch (error) {
      setFailure(userMessage(error));
    } finally {
      setLoading(false);
    }
  };

  if (token === undefined) return null;
  if (done) {
    return (
      <div className={styles.formulaire}>
        <FormStatus tone="succes">{done}</FormStatus>
        <div>
          <ButtonLink href="/" variant="secondaire">
            Revenir à l’accueil
          </ButtonLink>
        </div>
      </div>
    );
  }
  if (!token) {
    return <FormStatus tone="erreur">{LABELS[action].missing}</FormStatus>;
  }
  return (
    <div className={styles.formulaire}>
      <FormStatus tone="erreur">{failure}</FormStatus>
      <div>
        <Button onClick={submit} loading={loading}>
          {LABELS[action].button}
        </Button>
      </div>
    </div>
  );
}
