'use client';

import { useRef, useState } from 'react';
import { authedApi } from '@/lib/api/authed';
import { unwrap } from '@/lib/api/client';
import { userMessage } from '@/lib/api/errors';
import { dropSession } from '@/lib/auth/session';
import { PasswordField } from '../forms/PasswordField';
import { Button } from '../ui/Button';
import { Icon } from '../ui/Icon';
import { FormStatus } from '../ui/States';
import { MemberSection } from './Section';
import styles from './Forms.module.css';

/** Télécharge l'export JSON fourni par l'API (droit d'accès et de portabilité). */
function ExportButton() {
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  const download = async () => {
    setBusy(true);
    setFailure(null);
    try {
      const data = unwrap(
        await authedApi.GET('/api/v1/me/export', { parseAs: 'blob' }),
      ) as unknown as Blob;
      const url = URL.createObjectURL(data);
      const link = document.createElement('a');
      link.href = url;
      link.download = `mes-donnees-les-secrets-de-diani-${new Date().toISOString().slice(0, 10)}.json`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      setFailure(userMessage(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div>
        <Button variant="secondaire" onClick={download} loading={busy}>
          <Icon name="download" size={20} />
          Télécharger mes données
        </Button>
      </div>
      <FormStatus tone="erreur">{failure}</FormStatus>
    </>
  );
}

/**
 * Suppression du compte (droit à l'effacement) : confirmation par mot de passe dans une
 * fenêtre native (`<dialog>`) ; l'API anonymise le compte et garde seulement les factures
 * (obligation légale de 10 ans).
 */
function DeleteAccount() {
  const dialog = useRef<HTMLDialogElement>(null);
  const [password, setPassword] = useState('');
  const [failure, setFailure] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const confirm = async () => {
    if (!password) {
      setFailure('Indiquez votre mot de passe pour confirmer.');
      return;
    }
    setBusy(true);
    setFailure(null);
    try {
      unwrap(await authedApi.DELETE('/api/v1/me', { body: { password } }));
      dialog.current?.close();
      dropSession();
    } catch (error) {
      setFailure(userMessage(error));
      setBusy(false);
    }
  };

  return (
    <>
      <div>
        <Button
          variant="secondaire"
          className={styles.boutonDanger}
          onClick={() => dialog.current?.showModal()}
        >
          Supprimer mon compte
        </Button>
      </div>
      <dialog ref={dialog} className={styles.dialogue} aria-labelledby="suppression-titre">
        <h2 id="suppression-titre">Supprimer définitivement mon compte ?</h2>
        <div className={styles.formulaire}>
          <p>
            Vos accès aux formations, votre profil et vos adresses seront effacés. Cette action est
            irréversible.
          </p>
          <PasswordField
            label="Mot de passe"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
          <FormStatus tone="erreur">{failure}</FormStatus>
          <div className={styles.actions}>
            <Button
              className={styles.boutonDanger}
              variant="secondaire"
              onClick={confirm}
              loading={busy}
            >
              Oui, supprimer mon compte
            </Button>
            <Button variant="discret" onClick={() => dialog.current?.close()}>
              Annuler
            </Button>
          </div>
        </div>
      </dialog>
    </>
  );
}

export function DataPanel() {
  return (
    <>
      <MemberSection
        id="export-titre"
        title="Télécharger mes données"
        intro={
          <p>
            Un fichier rassemble toutes les informations liées à votre compte : profil, adresses,
            commandes, formations et consentements.
          </p>
        }
      >
        <ExportButton />
      </MemberSection>
      <MemberSection
        id="suppression-section"
        title="Supprimer mon compte"
        tone="danger"
        intro={
          <p>
            Vos données personnelles sont effacées. Les factures sont conservées 10 ans, comme la
            loi l’impose, sans autre information vous concernant.
          </p>
        }
      >
        <DeleteAccount />
      </MemberSection>
    </>
  );
}
