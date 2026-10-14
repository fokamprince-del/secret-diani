import { redirect } from 'next/navigation';

/** Adresse citée dans l'e-mail de fin de formation : les certificats sont avec les formations. */
export default function CertificatesPage() {
  redirect('/espace-membre/formations#certificats-titre');
}
