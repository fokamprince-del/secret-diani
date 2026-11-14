'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { mergeGuestCart } from '@/lib/api/shop';
import { safeReturnPath } from '@/lib/auth/navigation';
import { ensureSession } from '@/lib/auth/session';
import { readCartCount, writeCartCount } from '@/lib/cart-hint';
import { FormStatus } from '../ui/States';

/**
 * Ouvre la session posée par l'API au retour de Google (renouvellement par le cookie), fusionne
 * le panier invité comme une connexion classique, puis rejoint la page demandée.
 */
export function GoogleReturn({ returnTo }: { returnTo?: string }) {
  const router = useRouter();
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const session = await ensureSession({ force: true });
      if (cancelled) return;
      if (!session) {
        setFailed(true);
        return;
      }
      if (readCartCount() > 0) {
        const cart = await mergeGuestCart();
        if (cart) writeCartCount(cart.itemCount);
      }
      router.replace(safeReturnPath(returnTo));
      router.refresh();
    })();
    return () => {
      cancelled = true;
    };
  }, [returnTo, router]);

  if (failed) {
    return (
      <FormStatus tone="erreur">
        La connexion n’a pas pu aboutir. <Link href="/connexion">Réessayer</Link>
      </FormStatus>
    );
  }
  return <p role="status">Connexion en cours…</p>;
}
