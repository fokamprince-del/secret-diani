import type { Metadata } from 'next';
import { AddressBook } from '@/components/member/AddressBook';

export const metadata: Metadata = { title: 'Mes adresses' };

export default function AddressesPage() {
  return (
    <>
      <h1>Mes adresses</h1>
      <AddressBook />
    </>
  );
}
