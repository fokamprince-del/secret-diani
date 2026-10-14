import type { HomeContent } from '@/lib/api/types';
import { ButtonLink } from '../ui/Button';
import { ResponsiveImage } from '../ui/ResponsiveImage';
import styles from './Universes.module.css';

/** Libellés d'interface des trois univers ; le texte et l'image viennent de l'API. */
const UNIVERSES = [
  {
    key: 'catering',
    number: '01',
    title: 'Traiteur & commandes',
    href: '/traiteur',
    action: 'Je commande un plateau',
  },
  {
    key: 'courses',
    number: '02',
    title: 'Formations en ligne',
    href: '/formations',
    action: 'Je veux apprendre',
  },
  {
    key: 'shop',
    number: '03',
    title: 'Boutique & kits',
    href: '/boutique',
    action: 'Je choisis mon kit',
  },
] as const;

/**
 * Les trois univers en grands bandeaux : un visuel, un texte court, un bouton. Jamais de
 * produit ni de prix ici (« la home présente, les pages univers détaillent »).
 */
export function Universes({ universes }: { universes: HomeContent['universes'] | null }) {
  return (
    <section id="univers" aria-labelledby="univers-titre" className={styles.univers}>
      <h2 id="univers-titre" className="visually-hidden">
        Nos univers
      </h2>
      <div className="conteneur">
        <ol role="list" className={styles.liste}>
          {UNIVERSES.map((universe) => {
            const content = universes?.[universe.key];
            return (
              <li key={universe.key} className={styles.bandeau} data-univers={universe.key}>
                <div className={styles.visuel}>
                  {content?.image ? (
                    <ResponsiveImage
                      image={content.image}
                      sizes="(min-width: 64rem) 560px, calc(100vw - 2 * var(--gouttiere))"
                      aspectRatio="4 / 3"
                      zoomOnHover
                    />
                  ) : (
                    <div
                      className={styles.aplat}
                      data-numero={universe.number}
                      aria-hidden="true"
                    />
                  )}
                </div>
                <div className={styles.texte}>
                  <p className={styles.numero} aria-hidden="true">
                    {universe.number}
                  </p>
                  <h3 className={styles.titre}>{universe.title}</h3>
                  {content?.text && <p className={styles.description}>{content.text}</p>}
                  <div>
                    <ButtonLink href={universe.href} variant="secondaire" withArrow>
                      {universe.action}
                    </ButtonLink>
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      </div>
    </section>
  );
}
