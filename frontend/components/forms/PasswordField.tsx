'use client';

import { type InputHTMLAttributes, type ReactNode, type Ref, useId, useState } from 'react';
import { Icon } from '../ui/Icon';
import styles from './Field.module.css';

interface PasswordFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label: string;
  hint?: ReactNode;
  error?: string;
  /** « current-password » (connexion) ou « new-password » (création, changement). */
  autoComplete: 'current-password' | 'new-password';
  ref?: Ref<HTMLInputElement>;
}

/**
 * Mot de passe avec bouton « Afficher » : utile sur mobile, sans jamais exposer la saisie par
 * défaut. Le gestionnaire de mots de passe du navigateur reste utilisable (`autocomplete`).
 */
export function PasswordField({ label, hint, error, id, ref, ...rest }: PasswordFieldProps) {
  const generatedId = useId();
  const fieldId = id ?? generatedId;
  const [visible, setVisible] = useState(false);
  const describedBy =
    [hint && `${fieldId}-aide`, error && `${fieldId}-erreur`].filter(Boolean).join(' ') ||
    undefined;

  return (
    <div className={styles.champ} data-invalid={error ? 'true' : undefined}>
      <label htmlFor={fieldId} className={styles.libelle}>
        {label}
      </label>
      {hint && (
        <p id={`${fieldId}-aide`} className={styles.aide}>
          {hint}
        </p>
      )}
      <div className={styles.motDePasse}>
        <input
          ref={ref}
          id={fieldId}
          type={visible ? 'text' : 'password'}
          className={styles.saisie}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          spellCheck={false}
          autoCapitalize="none"
          required
          {...rest}
        />
        <button
          type="button"
          className={styles.afficher}
          aria-controls={fieldId}
          aria-pressed={visible}
          onClick={() => setVisible((value) => !value)}
        >
          {visible ? 'Masquer' : 'Afficher'}
          <span className="visually-hidden"> le mot de passe</span>
        </button>
      </div>
      {error && (
        <p id={`${fieldId}-erreur`} className={styles.erreur}>
          <Icon name="alert" size={18} />
          <span>{error}</span>
        </p>
      )}
    </div>
  );
}
