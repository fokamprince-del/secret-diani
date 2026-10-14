import type { Metadata } from 'next';
import { PageHeader } from '@/components/content/PageHeader';
import { NewsletterTokenAction } from '@/components/forms/NewsletterTokenAction';
import { privateMetadata } from '@/lib/seo';

export const metadata: Metadata = {
  ...privateMetadata,
  title: 'Confirmer mon inscription',
};

/** Arrivée depuis l'e-mail de confirmation (double opt-in). */
export default function ConfirmNewsletterPage() {
  return (
    <>
      <PageHeader
        title="Confirmer mon inscription"
        intro={
          <p>Un dernier clic pour recevoir la lettre de Diani : recettes, astuces et nouveautés.</p>
        }
      />
      <div className="conteneur">
        <NewsletterTokenAction action="confirm" />
      </div>
    </>
  );
}
