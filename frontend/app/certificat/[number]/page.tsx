import type { Metadata } from 'next';
import { PageHeader } from '@/components/content/PageHeader';
import { ButtonLink } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { ErrorState } from '@/components/ui/States';
import { getCertificateVerification } from '@/lib/api/content';
import { formatDate } from '@/lib/format';
import { privateMetadata } from '@/lib/seo';
import styles from './page.module.css';

type Params = Promise<{ number: string }>;

export const metadata: Metadata = { ...privateMetadata, title: 'Vérification de certificat' };

/**
 * Vérification publique d'un certificat (numéro imprimé sur le PDF) : seuls le nom, la
 * formation et la date sont affichés. Non indexée.
 */
export default async function CertificatePage({ params }: { params: Params }) {
  const { number } = await params;
  const certificate = await getCertificateVerification(number);

  return (
    <>
      <PageHeader title="Vérification de certificat" intro={<p>Certificat n° {number}</p>} />
      <div className="conteneur">
        {!certificate ? (
          <ErrorState title="La vérification est momentanément indisponible">
            <p>Réessayez dans quelques minutes.</p>
          </ErrorState>
        ) : certificate.valid ? (
          <div className={styles.valide}>
            <Icon name="check" size={28} />
            <p>
              Ce certificat est <strong>authentique</strong>. Il a été délivré à{' '}
              <strong>{certificate.holderName}</strong> pour la formation «{' '}
              {certificate.courseTitle} »
              {certificate.issuedAt && <> le {formatDate(certificate.issuedAt)}</>}.
            </p>
          </div>
        ) : (
          <ErrorState
            title="Ce certificat n’est pas valide"
            action={<ButtonLink href="/contact">Nous contacter</ButtonLink>}
          >
            <p>Vérifiez le numéro, ou écrivez-nous en cas de doute.</p>
          </ErrorState>
        )}
      </div>
    </>
  );
}
