import type { Metadata } from 'next';
import Link from 'next/link';
import { Icon } from '@/components/ui/Icon';
import { memberNavigation } from '@/components/member/navigation';
import styles from './page.module.css';

export const metadata: Metadata = { title: 'Mon espace' };

const DESCRIPTIONS: Record<string, string> = {
  '/espace-membre/commandes': 'Suivi de vos commandes et factures.',
  '/espace-membre/profil': 'Nom, téléphone, adresse e-mail et préférences.',
  '/espace-membre/adresses': 'Vos adresses de livraison et de facturation.',
  '/espace-membre/securite': 'Mot de passe et appareils connectés.',
  '/espace-membre/donnees': 'Télécharger vos données ou supprimer votre compte.',
};

export default function MemberHomePage() {
  const shortcuts = memberNavigation.filter((item) => item.href !== '/espace-membre');
  return (
    <>
      <h1 className={styles.titre}>Mon espace</h1>
      <ul role="list" className={styles.raccourcis}>
        {shortcuts.map((item) => (
          <li key={item.href}>
            <Link href={item.href} className={`${styles.raccourci} sans-filet`}>
              <Icon name={item.icon} size={26} className={styles.icone} />
              <span className={styles.libelle}>{item.label}</span>
              {DESCRIPTIONS[item.href] && (
                <span className={styles.description}>{DESCRIPTIONS[item.href]}</span>
              )}
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}
