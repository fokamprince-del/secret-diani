import type { Metadata } from 'next';
import { connection } from 'next/server';
import type { ReactNode } from 'react';
import { AdminShell } from '@/components/admin/AdminShell';
import { privateMetadata } from '@/lib/seo';

export const metadata: Metadata = { ...privateMetadata, title: 'Administration' };

/**
 * Back-office : rendu à chaque requête (CSP à nonce du proxy), jamais indexé. Toutes les données
 * sont lues et écrites par le navigateur avec le jeton d'accès de l'administratrice (rôle admin
 * et double authentification vérifiés par l'API à chaque appel).
 */
export default async function AdminLayout({ children }: { children: ReactNode }) {
  await connection();
  return <AdminShell>{children}</AdminShell>;
}
