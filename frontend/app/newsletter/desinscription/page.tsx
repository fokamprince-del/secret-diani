import type { Metadata } from 'next';
import { PageHeader } from '@/components/content/PageHeader';
import { NewsletterTokenAction } from '@/components/forms/NewsletterTokenAction';
import { privateMetadata } from '@/lib/seo';

export const metadata: Metadata = {
  ...privateMetadata,
  title: 'Me désinscrire',
};

/** Arrivée depuis le lien de désinscription présent dans chaque e-mail. */
export default function UnsubscribeNewsletterPage() {
  return (
    <>
      <PageHeader
        title="Me désinscrire de la lettre"
        intro={
          <p>Vous ne recevrez plus nos e-mails. Vous pourrez vous réinscrire à tout moment.</p>
        }
      />
      <div className="conteneur">
        <NewsletterTokenAction action="unsubscribe" />
      </div>
    </>
  );
}
