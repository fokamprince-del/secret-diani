'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { browserApi, unwrap } from '@/lib/api/client';
import { userMessage } from '@/lib/api/errors';
import { useUrlToken } from '../forms/useUrlToken';
import { Button, ButtonLink } from '../ui/Button';
import { FormStatus } from '../ui/States';
import styles from './AuthForms.module.css';

type Action = 'verify-email' | 'confirm-email-change';

const LABELS: Record<Action, { button: string; next: { href: string; label: string } }> = {
  'verify-email': {
    button: 'Activer mon compte',
    next: { href: '/connexion', label: 'Se connecter' },
  },
  'confirm-email-change': {
    button: 'Confirmer ma nouvelle adresse',
    next: { href: '/espace-membre/profil', label: 'Revenir à mon profil' },
  },
};

/**
 * Lien reçu par e-mail. L'activation du compte est faite dès l'ouverture (elle prouve seulement
 * l'accès à la boîte mail) ; le changement d'adresse attend un clic, pour qu'un robot qui ouvre
 * les liens ne puisse pas le valider à la place de la personne.
 */
export function EmailLinkAction({ action }: { action: Action }) {
  const token = useUrlToken();
  const [done, setDone] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const started = useRef(false);

  const submit = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setFailure(null);
    try {
      const body = { token };
      const result = unwrap(
        action === 'verify-email'
          ? await browserApi.POST('/api/v1/auth/email/verify', { body })
          : await browserApi.POST('/api/v1/auth/email/change/confirm', { body }),
      );
      setDone(result.message);
    } catch (error) {
      setFailure(userMessage(error));
    } finally {
      setLoading(false);
    }
  }, [action, token]);

  useEffect(() => {
    if (action !== 'verify-email' || !token || started.current) return;
    started.current = true;
    // Activation à l'ouverture du lien (une seule fois, même en double rendu de développement).
    void submit();
  }, [action, token, submit]);

  if (token === undefined) return null;
  if (!token) {
    return (
      <FormStatus tone="erreur">
        Ce lien est incomplet. Ouvrez le lien reçu par e-mail tel quel.
      </FormStatus>
    );
  }
  const next = LABELS[action].next;
  if (done) {
    return (
      <div className={styles.formulaire}>
        <FormStatus tone="succes">{done}</FormStatus>
        <div>
          <ButtonLink href={next.href} withArrow>
            {next.label}
          </ButtonLink>
        </div>
      </div>
    );
  }
  return (
    <div className={styles.formulaire}>
      <FormStatus tone="erreur">{failure}</FormStatus>
      {(action === 'confirm-email-change' || failure) && (
        <div>
          <Button onClick={submit} loading={loading}>
            {failure ? 'Réessayer' : LABELS[action].button}
          </Button>
        </div>
      )}
      {action === 'verify-email' && loading && <p role="status">Activation en cours…</p>}
    </div>
  );
}
