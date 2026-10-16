'use client';

import Link from 'next/link';
import { Icon } from '../ui/Icon';
import { useAuth } from './AuthProvider';

/**
 * Accès au compte : « Mon espace » une fois connecté, sinon « Se connecter ». En icône seule
 * (mobile) ou en bouton avec son libellé (`withLabel`, en-tête sur grand écran).
 */
export function AccountLink({
  className,
  withLabel = false,
}: {
  className?: string;
  withLabel?: boolean;
}) {
  const { status, user } = useAuth();
  const connected = status === 'authenticated';
  return (
    <Link
      href={connected ? '/espace-membre' : '/connexion'}
      className={className}
      data-connecte={connected || undefined}
    >
      {!withLabel && <Icon name="user" />}
      <span className={withLabel ? undefined : 'visually-hidden'}>
        {connected ? `Mon espace${user?.firstName ? ` (${user.firstName})` : ''}` : 'Se connecter'}
      </span>
    </Link>
  );
}
