import type { ReactNode } from 'react';
import { Icon, type IconName } from './Icon';
import styles from './States.module.css';

/** Bloc de chargement : ratio réservé pour éviter tout décalage de mise en page. */
export function Skeleton({
  width = '100%',
  height = '1em',
  radius,
  className,
}: {
  width?: string;
  height?: string;
  radius?: string;
  className?: string;
}) {
  return (
    <span
      className={[styles.squelette, className].filter(Boolean).join(' ')}
      style={{ width, height, borderRadius: radius }}
      aria-hidden="true"
    />
  );
}

interface StateProps {
  title: string;
  children?: ReactNode;
  /** Action de rattrapage ou invitation à agir. */
  action?: ReactNode;
  icon?: IconName;
  /** Niveau du titre selon la page qui l'accueille. */
  headingLevel?: 1 | 2 | 3;
}

/** État vide : une invitation à agir, jamais une excuse. */
export function EmptyState({
  title,
  children,
  action,
  icon = 'leaf',
  headingLevel = 2,
}: StateProps) {
  const Heading = `h${headingLevel}` as const;
  return (
    <div className={styles.etat}>
      <Icon name={icon} size={28} className={styles.icone} />
      <Heading className={styles.titre}>{title}</Heading>
      {children && <div className={styles.texte}>{children}</div>}
      {action && <div className={styles.action}>{action}</div>}
    </div>
  );
}

/** État d'erreur : la cause en mots simples et une action de rattrapage. */
export function ErrorState({ title, children, action, headingLevel = 2 }: StateProps) {
  const Heading = `h${headingLevel}` as const;
  return (
    <div className={styles.etat} role="alert">
      <Icon name="alert" size={28} className={styles.icone} />
      <Heading className={styles.titre}>{title}</Heading>
      {children && <div className={styles.texte}>{children}</div>}
      {action && <div className={styles.action}>{action}</div>}
    </div>
  );
}

/**
 * Message de formulaire annoncé aux lecteurs d'écran (succès ou erreur globale).
 * La région reste montée pour que l'annonce soit fiable.
 */
export function FormStatus({
  tone,
  children,
}: {
  tone: 'succes' | 'erreur';
  children?: ReactNode;
}) {
  return (
    <div
      role={tone === 'erreur' ? 'alert' : 'status'}
      aria-live={tone === 'erreur' ? 'assertive' : 'polite'}
      className={children ? `${styles.statut} ${styles[tone]}` : undefined}
    >
      {children && (
        <>
          <Icon name={tone === 'erreur' ? 'alert' : 'check'} size={20} />
          <div>{children}</div>
        </>
      )}
    </div>
  );
}
