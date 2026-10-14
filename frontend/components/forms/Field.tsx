import {
  useId,
  type InputHTMLAttributes,
  type ReactNode,
  type Ref,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react';
import { Icon } from '../ui/Icon';
import styles from './Field.module.css';

interface FieldShellProps {
  id: string;
  label: string;
  hint?: ReactNode;
  error?: string;
  optional?: boolean;
  children: ReactNode;
}

/** Libellé lié, aide et message d'erreur reliés au champ par `aria-describedby`. */
function FieldShell({ id, label, hint, error, optional, children }: FieldShellProps) {
  return (
    <div className={styles.champ} data-invalid={error ? 'true' : undefined}>
      <label htmlFor={id} className={styles.libelle}>
        {label}
        {optional && <span className={styles.facultatif}> (facultatif)</span>}
      </label>
      {hint && (
        <p id={`${id}-aide`} className={styles.aide}>
          {hint}
        </p>
      )}
      {children}
      {error && (
        <p id={`${id}-erreur`} className={styles.erreur}>
          <Icon name="alert" size={18} />
          <span>{error}</span>
        </p>
      )}
    </div>
  );
}

function describedBy(id: string, hint: unknown, error: unknown) {
  return [hint && `${id}-aide`, error && `${id}-erreur`].filter(Boolean).join(' ') || undefined;
}

interface TextFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  hint?: ReactNode;
  error?: string;
  optional?: boolean;
  ref?: Ref<HTMLInputElement>;
}

export function TextField({ label, hint, error, optional, id, ref, ...rest }: TextFieldProps) {
  const generatedId = useId();
  const fieldId = id ?? generatedId;
  return (
    <FieldShell id={fieldId} label={label} hint={hint} error={error} optional={optional}>
      <input
        ref={ref}
        id={fieldId}
        className={styles.saisie}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(fieldId, hint, error)}
        required={!optional}
        {...rest}
      />
    </FieldShell>
  );
}

interface TextAreaFieldProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label: string;
  hint?: ReactNode;
  error?: string;
  optional?: boolean;
  ref?: Ref<HTMLTextAreaElement>;
}

export function TextAreaField({
  label,
  hint,
  error,
  optional,
  id,
  ref,
  rows = 5,
  ...rest
}: TextAreaFieldProps) {
  const generatedId = useId();
  const fieldId = id ?? generatedId;
  return (
    <FieldShell id={fieldId} label={label} hint={hint} error={error} optional={optional}>
      <textarea
        ref={ref}
        id={fieldId}
        rows={rows}
        className={styles.saisie}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(fieldId, hint, error)}
        required={!optional}
        {...rest}
      />
    </FieldShell>
  );
}

interface SelectFieldProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label: string;
  options: readonly { value: string; label: string }[];
  hint?: ReactNode;
  error?: string;
  optional?: boolean;
  ref?: Ref<HTMLSelectElement>;
}

/** Liste native : clavier, lecteurs d'écran et sélecteur du téléphone sans JavaScript. */
export function SelectField({
  label,
  options,
  hint,
  error,
  optional,
  id,
  ref,
  ...rest
}: SelectFieldProps) {
  const generatedId = useId();
  const fieldId = id ?? generatedId;
  return (
    <FieldShell id={fieldId} label={label} hint={hint} error={error} optional={optional}>
      <select
        ref={ref}
        id={fieldId}
        className={`${styles.saisie} ${styles.liste}`}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(fieldId, hint, error)}
        required={!optional}
        {...rest}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </FieldShell>
  );
}

interface CheckboxFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label: ReactNode;
  error?: string;
  ref?: Ref<HTMLInputElement>;
}

export function CheckboxField({ label, error, id, ref, ...rest }: CheckboxFieldProps) {
  const generatedId = useId();
  const fieldId = id ?? generatedId;
  return (
    <div className={styles.champ} data-invalid={error ? 'true' : undefined}>
      <div className={styles.case}>
        <input
          ref={ref}
          id={fieldId}
          type="checkbox"
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${fieldId}-erreur` : undefined}
          {...rest}
        />
        <label htmlFor={fieldId}>{label}</label>
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

/**
 * Champ piège (« honeypot ») : invisible et hors du parcours clavier pour un humain, il reste
 * vide ; un robot qui remplit tout se trahit et l'API ignore son envoi.
 */
export function HoneypotField({
  ref,
  ...rest
}: InputHTMLAttributes<HTMLInputElement> & { ref?: Ref<HTMLInputElement> }) {
  return (
    <div className={styles.piege} aria-hidden="true">
      <label>
        Ne pas remplir ce champ
        <input ref={ref} type="text" tabIndex={-1} autoComplete="off" {...rest} />
      </label>
    </div>
  );
}
