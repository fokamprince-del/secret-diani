import Link from 'next/link';
import type { ButtonHTMLAttributes, ComponentProps, ReactNode } from 'react';
import { Icon } from './Icon';
import styles from './Button.module.css';

type Variant = 'principal' | 'secondaire' | 'discret';

interface CommonProps {
  variant?: Variant;
  fullWidth?: boolean;
  /** Affiche une flèche qui glisse légèrement au survol. */
  withArrow?: boolean;
  children: ReactNode;
}

function classes(variant: Variant, fullWidth: boolean, extra?: string, loading?: boolean) {
  return [
    styles.bouton,
    styles[variant],
    fullWidth && styles.pleineLargeur,
    loading && styles.chargement,
    extra,
  ]
    .filter(Boolean)
    .join(' ');
}

type ButtonProps = CommonProps &
  Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> & {
    /** Action en cours : le bouton reste lisible par les lecteurs d'écran et ne se double pas. */
    loading?: boolean;
  };

export function Button({
  variant = 'principal',
  fullWidth = false,
  withArrow = false,
  loading = false,
  type = 'button',
  className,
  children,
  disabled,
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      className={classes(variant, fullWidth, className, loading)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {children}
      {withArrow && <Icon name="arrowRight" size={18} className={styles.icone} />}
    </button>
  );
}

type ButtonLinkProps = CommonProps & Omit<ComponentProps<typeof Link>, 'children'>;

export function ButtonLink({
  variant = 'principal',
  fullWidth = false,
  withArrow = false,
  className,
  children,
  ...rest
}: ButtonLinkProps) {
  return (
    <Link className={classes(variant, fullWidth, className)} {...rest}>
      {children}
      {withArrow && <Icon name="arrowRight" size={18} className={styles.icone} />}
    </Link>
  );
}
