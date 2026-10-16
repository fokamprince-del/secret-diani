import type { Metadata } from 'next';
import Link from 'next/link';
import { PageHeader } from '@/components/content/PageHeader';
import { ContactForm } from '@/components/forms/ContactForm';
import { Icon } from '@/components/ui/Icon';
import { getSiteSettings } from '@/lib/api/content';
import { pageMetadata } from '@/lib/seo';
import { socialLinksFrom, whatsappLink } from '@/lib/social';
import styles from './page.module.css';
import { BUCHES } from '@/lib/vitrine';

export const metadata: Metadata = pageMetadata({
  title: 'Contact',
  description:
    'Une question sur le traiteur, les formations ou la boutique ? Écrivez à Diani par le formulaire, WhatsApp ou Instagram.',
  path: '/contact',
});

export default async function ContactPage() {
  const settings = await getSiteSettings();
  const whatsapp = whatsappLink(
    settings?.whatsappNumber,
    'Bonjour Diani, je vous contacte depuis le site.',
  );
  const socials = socialLinksFrom(settings);
  const email = settings?.contactEmail;

  return (
    <>
      <PageHeader
        title="Contact"
        intro={
          <p>
            Une question, une envie, un projet ? Écrivez-moi. Pour une commande traiteur, indiquez
            la date et le nombre d’invités : j’irai plus vite.
          </p>
        }
        accent="framboise"
        visual={{
          poster: BUCHES.fallback,
          focus: '50% 55%',
          caption: BUCHES.alt,
        }}
      />
      <div className={`conteneur ${styles.grille}`}>
        <section aria-labelledby="formulaire-titre">
          <h2 id="formulaire-titre" className={styles.titre}>
            Envoyer un message
          </h2>
          <ContactForm />
        </section>

        <aside aria-labelledby="autres-titre" className={styles.autres}>
          <h2 id="autres-titre" className={styles.titre}>
            Autres moyens de nous joindre
          </h2>
          <ul role="list" className={styles.moyens}>
            {whatsapp && (
              <li>
                <a
                  href={whatsapp}
                  className={`${styles.moyen} sans-filet`}
                  rel="noopener noreferrer"
                  target="_blank"
                >
                  <Icon name="whatsapp" />
                  <span>
                    Écrire sur WhatsApp
                    <span className="visually-hidden"> (nouvel onglet)</span>
                  </span>
                </a>
              </li>
            )}
            {email && (
              <li>
                <a href={`mailto:${email}`} className={`${styles.moyen} sans-filet`}>
                  <Icon name="mail" />
                  <span>{email}</span>
                </a>
              </li>
            )}
            {socials.map((social) => (
              <li key={social.network}>
                <a
                  href={social.href}
                  className={`${styles.moyen} sans-filet`}
                  rel="noopener noreferrer"
                  target="_blank"
                >
                  <Icon name={social.network} />
                  <span>
                    {social.handle}
                    <span className="visually-hidden"> sur {social.label} (nouvel onglet)</span>
                  </span>
                </a>
              </li>
            ))}
          </ul>
          <p className={styles.faq}>
            Une question fréquente ? <Link href="/faq">Consultez la FAQ</Link>, la réponse y est
            peut-être déjà.
          </p>
        </aside>
      </div>
    </>
  );
}
