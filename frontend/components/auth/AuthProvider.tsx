'use client';

import { createContext, type ReactNode, useContext, useEffect, useState } from 'react';
import {
  type AuthUser,
  ensureSession,
  getSession,
  hasSessionHint,
  subscribe,
} from '@/lib/auth/session';

export type AuthStatus = 'loading' | 'authenticated' | 'anonymous';

interface AuthState {
  status: AuthStatus;
  user: AuthUser | null;
}

const AuthContext = createContext<AuthState>({ status: 'loading', user: null });

/**
 * État de connexion pour l'interface (en-tête, espace membre). Au chargement, la session n'est
 * restaurée (renouvellement auprès de l'API) que si le témoin de session existe : un visiteur
 * jamais connecté ne déclenche aucun appel.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ status: 'loading', user: null });

  useEffect(() => {
    const update = () => {
      const session = getSession();
      setState(
        session
          ? { status: 'authenticated', user: session.user }
          : { status: 'anonymous', user: null },
      );
    };
    const unsubscribe = subscribe(update);
    if (getSession()) update();
    else if (hasSessionHint()) void ensureSession().then(update);
    else update();
    return unsubscribe;
  }, []);

  return <AuthContext.Provider value={state}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  return useContext(AuthContext);
}
