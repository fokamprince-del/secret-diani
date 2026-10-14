import type { Metadata } from 'next';
import { connection } from 'next/server';
import type { ReactNode } from 'react';
import { MemberShell } from '@/components/member/MemberShell';
import { privateMetadata } from '@/lib/seo';

export const metadata: Metadata = privateMetadata;

/**
 * Espace membre : rendu à chaque requête (CSP à nonce du proxy, D-F05), jamais indexé. Les
 * données sont demandées par le navigateur avec le jeton d'accès : le serveur Next n'en voit
 * aucune (D-F24).
 */
export default async function MemberLayout({ children }: { children: ReactNode }) {
  await connection();
  return <MemberShell>{children}</MemberShell>;
}
