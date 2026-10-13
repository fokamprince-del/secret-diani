'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import { ApiError } from '@/lib/api/errors';

/**
 * TanStack Query pour les interactions client (panier, progression, quiz).
 * Monté uniquement dans les zones interactives, pas dans le gabarit racine,
 * pour ne pas alourdir le JavaScript des pages publiques.
 */
export function QueryProvider({ children }: { children: ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            refetchOnWindowFocus: false,
            // Pas de nouvel essai sur une erreur « métier » (4xx) : seulement réseau ou 5xx.
            retry: (failureCount, error) =>
              failureCount < 2 && !(error instanceof ApiError && error.status < 500),
          },
          mutations: { retry: false },
        },
      }),
  );
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
