'use client';

import Link from 'next/link';
import {
  createContext,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
  useCallback,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
} from 'react';
import { ApiError, NetworkError, userMessage } from '@/lib/api/errors';
import type { Tone } from '@/lib/admin/labels';
import { Icon, type IconName } from '../ui/Icon';
import styles from './kit.module.css';

/* ------------------------------------------------------------------ Mise en page */

export function AdminPage({
  title,
  subtitle,
  back,
  actions,
  children,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  back?: { href: string; label: string };
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className={styles.page}>
      <header className={styles.entete}>
        <div className={styles.enteteTexte}>
          {back && (
            <Link href={back.href} className={`${styles.retour} sans-filet`}>
              <span aria-hidden="true">←</span> {back.label}
            </Link>
          )}
          <h1 className={styles.titre}>{title}</h1>
          {subtitle && <p className={styles.sousTitre}>{subtitle}</p>}
        </div>
        {actions && <div className={styles.enteteActions}>{actions}</div>}
      </header>
      {children}
    </div>
  );
}

export function Panel({
  title,
  actions,
  children,
  className,
}: {
  title?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  const id = useId();
  return (
    <section
      className={`${styles.panneau} ${className ?? ''}`}
      aria-labelledby={title ? id : undefined}
    >
      {(title || actions) && (
        <div className={styles.panneauEntete}>
          {title && (
            <h2 id={id} className={styles.panneauTitre}>
              {title}
            </h2>
          )}
          {actions && <div className={styles.panneauActions}>{actions}</div>}
        </div>
      )}
      {children}
    </section>
  );
}

export function Grid({ children, cols = 2 }: { children: ReactNode; cols?: 2 | 3 | 4 }) {
  return (
    <div className={styles.grille} data-cols={cols}>
      {children}
    </div>
  );
}

export function Toolbar({ children }: { children: ReactNode }) {
  return <div className={styles.barreOutils}>{children}</div>;
}

/* ------------------------------------------------------------------ Éléments */

export function Badge({ tone = 'neutre', children }: { tone?: Tone; children: ReactNode }) {
  return (
    <span className={styles.badge} data-ton={tone}>
      {children}
    </span>
  );
}

export function Stat({
  label,
  value,
  hint,
  href,
  icon,
  accent,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  href?: string;
  icon?: IconName;
  accent?: boolean;
}) {
  const body = (
    <>
      {icon && (
        <span className={styles.statIcone} aria-hidden="true">
          <Icon name={icon} size={20} />
        </span>
      )}
      <span className={styles.statLibelle}>{label}</span>
      <span className={styles.statValeur}>{value}</span>
      {hint && <span className={styles.statAide}>{hint}</span>}
    </>
  );
  return href ? (
    <Link href={href} className={`${styles.stat} sans-filet`} data-accent={accent || undefined}>
      {body}
    </Link>
  ) : (
    <div className={styles.stat} data-accent={accent || undefined}>
      {body}
    </div>
  );
}

type BtnVariant = 'primaire' | 'secondaire' | 'danger' | 'fantome';

export function Btn({
  variant = 'secondaire',
  icon,
  loading,
  children,
  type = 'button',
  ...rest
}: {
  variant?: BtnVariant;
  icon?: IconName;
  loading?: boolean;
  children?: ReactNode;
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type={type}
      className={styles.btn}
      data-variante={variant}
      disabled={rest.disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {icon && <Icon name={icon} size={18} />}
      {children}
    </button>
  );
}

export function BtnLink({
  href,
  variant = 'secondaire',
  icon,
  children,
  external,
}: {
  href: string;
  variant?: BtnVariant;
  icon?: IconName;
  children: ReactNode;
  external?: boolean;
}) {
  if (external) {
    return (
      <a
        href={href}
        className={`${styles.btn} sans-filet`}
        data-variante={variant}
        target="_blank"
        rel="noopener noreferrer"
      >
        {icon && <Icon name={icon} size={18} />}
        {children}
      </a>
    );
  }
  return (
    <Link href={href} className={`${styles.btn} sans-filet`} data-variante={variant}>
      {icon && <Icon name={icon} size={18} />}
      {children}
    </Link>
  );
}

/* ------------------------------------------------------------------ États */

export function Loading({ label = 'Chargement…' }: { label?: string }) {
  return (
    <div className={styles.chargement} role="status" aria-live="polite">
      <span className={styles.spinner} aria-hidden="true" />
      {label}
    </div>
  );
}

export function ErrorBox({ error, retry }: { error: unknown; retry?: () => void }) {
  return (
    <div className={styles.erreurBloc} role="alert">
      <Icon name="alert" size={20} />
      <p>{userMessage(error)}</p>
      {retry && (
        <Btn variant="fantome" onClick={retry}>
          Réessayer
        </Btn>
      )}
    </div>
  );
}

export function Empty({ children, icon = 'leaf' }: { children: ReactNode; icon?: IconName }) {
  return (
    <div className={styles.vide}>
      <Icon name={icon} size={28} />
      <p>{children}</p>
    </div>
  );
}

/* ------------------------------------------------------------------ Tableau */

export interface Column<T> {
  header: string;
  cell: (row: T) => ReactNode;
  /** Masquée sur téléphone (la ligne reste lisible). */
  secondary?: boolean;
  align?: 'end';
}

export function DataTable<T>({
  rows,
  columns,
  rowKey,
  rowHref,
  caption,
}: {
  rows: T[];
  columns: Column<T>[];
  rowKey: (row: T) => string;
  rowHref?: (row: T) => string;
  caption: string;
}) {
  return (
    <div className={styles.tableCadre}>
      <table className={styles.table}>
        <caption className="visually-hidden">{caption}</caption>
        <thead>
          <tr>
            {columns.map((column) => (
              <th
                key={column.header}
                scope="col"
                data-secondaire={column.secondary || undefined}
                data-align={column.align}
              >
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const href = rowHref?.(row);
            return (
              <tr key={rowKey(row)} data-lien={href ? true : undefined}>
                {columns.map((column, index) => (
                  <td
                    key={column.header}
                    data-secondaire={column.secondary || undefined}
                    data-align={column.align}
                    data-libelle={column.header}
                  >
                    {href && index === 0 ? (
                      <Link href={href} className={`${styles.lienLigne} sans-filet`}>
                        {column.cell(row)}
                      </Link>
                    ) : (
                      column.cell(row)
                    )}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function Chips<V extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: V;
  options: { value: V; label: string; count?: number }[];
  onChange: (value: V) => void;
}) {
  return (
    <div className={styles.puces} role="radiogroup" aria-label={label}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={option.value === value}
          className={styles.puce}
          onClick={() => onChange(option.value)}
        >
          {option.label}
          {option.count !== undefined && <span className={styles.puceCompte}>{option.count}</span>}
        </button>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ Champs */

interface FieldProps {
  label: string;
  hint?: ReactNode;
  error?: string;
  wide?: boolean;
}

function FieldShell({
  id,
  label,
  hint,
  error,
  wide,
  children,
}: FieldProps & { id: string; children: ReactNode }) {
  return (
    <div className={styles.champ} data-large={wide || undefined} data-invalide={error || undefined}>
      <label htmlFor={id} className={styles.libelle}>
        {label}
      </label>
      {children}
      {hint && !error && (
        <p id={`${id}-aide`} className={styles.aide}>
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-aide`} className={styles.erreurChamp}>
          {error}
        </p>
      )}
    </div>
  );
}

export function Input({
  label,
  hint,
  error,
  wide,
  ...rest
}: FieldProps & InputHTMLAttributes<HTMLInputElement>) {
  const id = useId();
  return (
    <FieldShell id={id} label={label} hint={hint} error={error} wide={wide}>
      <input
        id={id}
        className={styles.saisie}
        aria-invalid={error ? true : undefined}
        aria-describedby={hint || error ? `${id}-aide` : undefined}
        {...rest}
      />
    </FieldShell>
  );
}

export function Textarea({
  label,
  hint,
  error,
  wide = true,
  ...rest
}: FieldProps & TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const id = useId();
  return (
    <FieldShell id={id} label={label} hint={hint} error={error} wide={wide}>
      <textarea
        id={id}
        className={`${styles.saisie} ${styles.zone}`}
        aria-invalid={error ? true : undefined}
        aria-describedby={hint || error ? `${id}-aide` : undefined}
        {...rest}
      />
    </FieldShell>
  );
}

export function Select({
  label,
  hint,
  error,
  wide,
  options,
  ...rest
}: FieldProps &
  SelectHTMLAttributes<HTMLSelectElement> & { options: { value: string; label: string }[] }) {
  const id = useId();
  return (
    <FieldShell id={id} label={label} hint={hint} error={error} wide={wide}>
      <select
        id={id}
        className={`${styles.saisie} ${styles.liste}`}
        aria-describedby={hint || error ? `${id}-aide` : undefined}
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

export function Toggle({
  label,
  checked,
  onChange,
  hint,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  hint?: string;
}) {
  const id = useId();
  return (
    <div className={styles.bascule}>
      <input
        id={id}
        type="checkbox"
        role="switch"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
      <label htmlFor={id}>
        <span className={styles.basculeRail} aria-hidden="true" />
        <span>
          {label}
          {hint && <span className={styles.aide}>{hint}</span>}
        </span>
      </label>
    </div>
  );
}

export function FormGrid({ children }: { children: ReactNode }) {
  return <div className={styles.formulaire}>{children}</div>;
}

export function FormActions({ children }: { children: ReactNode }) {
  return <div className={styles.actionsFormulaire}>{children}</div>;
}

/* ------------------------------------------------------------------ Notifications */

interface Toast {
  id: number;
  tone: 'succes' | 'alerte';
  text: string;
}

const ToastContext = createContext<(text: string, tone?: Toast['tone']) => void>(() => {});

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const counter = useRef(0);
  const notify = useCallback((text: string, tone: Toast['tone'] = 'succes') => {
    const id = ++counter.current;
    setToasts((list) => [...list, { id, tone, text }]);
    window.setTimeout(() => setToasts((list) => list.filter((toast) => toast.id !== id)), 4_500);
  }, []);
  return (
    <ToastContext.Provider value={notify}>
      {children}
      <div className={styles.notifications} role="status" aria-live="polite">
        {toasts.map((toast) => (
          <p key={toast.id} className={styles.notification} data-ton={toast.tone}>
            <Icon name={toast.tone === 'succes' ? 'check' : 'alert'} size={18} />
            {toast.text}
          </p>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}

/** Notifie l'erreur d'une mutation (message de l'API, en français). */
export function useNotifyError() {
  const notify = useToast();
  return useCallback(
    (error: unknown) =>
      notify(
        // Erreur de saisie levée par l'écran lui-même : son message est déjà rédigé pour Diani.
        error instanceof Error && !(error instanceof ApiError) && !(error instanceof NetworkError)
          ? error.message
          : userMessage(error),
        'alerte',
      ),
    [notify],
  );
}

/* ------------------------------------------------------------------ Confirmation */

export function ConfirmDialog({
  open,
  title,
  children,
  confirmLabel,
  danger,
  loading,
  onConfirm,
  onClose,
}: {
  open: boolean;
  title: string;
  children?: ReactNode;
  confirmLabel: string;
  danger?: boolean;
  loading?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      className={styles.dialogue}
      onClose={onClose}
      aria-labelledby="dialogue-titre"
    >
      <h2 id="dialogue-titre" className={styles.panneauTitre}>
        {title}
      </h2>
      {children && <div className={styles.dialogueCorps}>{children}</div>}
      <div className={styles.actionsFormulaire}>
        <Btn variant="fantome" onClick={onClose}>
          Annuler
        </Btn>
        <Btn variant={danger ? 'danger' : 'primaire'} loading={loading} onClick={onConfirm}>
          {confirmLabel}
        </Btn>
      </div>
    </dialog>
  );
}

export function LoadMore({
  hasMore,
  loading,
  onClick,
}: {
  hasMore: boolean;
  loading: boolean;
  onClick: () => void;
}) {
  if (!hasMore) return null;
  return (
    <div className={styles.plus}>
      <Btn variant="fantome" loading={loading} onClick={onClick}>
        Afficher plus
      </Btn>
    </div>
  );
}

/** Définition clé / valeur (fiche d'une demande, d'une commande…). */
export function Facts({ items }: { items: [string, ReactNode][] }) {
  return (
    <dl className={styles.faits}>
      {items.map(([term, value]) => (
        <div key={term}>
          <dt>{term}</dt>
          <dd>{value ?? '—'}</dd>
        </div>
      ))}
    </dl>
  );
}
