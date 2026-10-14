import type { Metadata } from 'next';
import { connection } from 'next/server';
import type { ReactNode } from 'react';
import { privateMetadata } from '@/lib/seo';

export const metadata: Metadata = privateMetadata;

/** Tunnel de commande : rendu à la demande (CSP à nonce), jamais indexé ni mis en cache. */
export default async function OrderLayout({ children }: { children: ReactNode }) {
  await connection();
  return children;
}
