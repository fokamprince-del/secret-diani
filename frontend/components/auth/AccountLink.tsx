'use client';

import Link from 'next/link';
import { Icon } from '../ui/Icon';
import { useAuth } from './AuthProvider';

/** Icône compte de l'en-tête : « Mon espace » une fois connecté, sinon « Se connecter ». */
export function AccountLink({ className }: { className?: string }) {
  const { status, user } = useAuth();
  const connected = status === 'authenticated';
  return (
    <Link
      href={connected ? '/espace-membre' : '/connexion'}
      className={className}
      data-connecte={connected || undefined}
    >
      <Icon name="user" />
      <span className="visually-hidden">
        {connected ? `Mon espace${user?.firstName ? ` (${user.firstName})` : ''}` : 'Se connecter'}
      </span>
    </Link>
  );
}
