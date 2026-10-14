import type { Metadata } from 'next';
import { connection } from 'next/server';
import type { ReactNode } from 'react';
import { privateMetadata } from '@/lib/seo';

export const metadata: Metadata = privateMetadata;

/**
 * Pages de compte (mots de passe, liens reçus par e-mail) : rendues à chaque requête pour
 * recevoir la CSP à nonce du proxy (DECISIONS D-F05), jamais indexées ni mises en cache.
 */
export default async function AuthLayout({ children }: { children: ReactNode }) {
  await connection();
  return children;
}
