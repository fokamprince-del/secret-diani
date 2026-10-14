import type { HomeContent } from '@/lib/api/types';
import { ButtonLink } from '../ui/Button';
import { CremeTrait } from '../ui/CremeTrait';
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
    ratio: '4 / 3',
  },
  {
    key: 'courses',
    number: '02',
    title: 'Formations en ligne',
    href: '/formations',
    action: 'Je veux apprendre',
    ratio: '4 / 5',
  },
  {
    key: 'shop',
    number: '03',
    title: 'Boutique & kits',
    href: '/boutique',
    action: 'Je choisis mon kit',
    ratio: '1 / 1',
  },
] as const;

/**
 * Les trois univers en grands bandeaux : un visuel, un texte court, un bouton. Jamais de
 * produit ni de prix ici (« la home présente, les pages univers détaillent »).
 * Chaque bandeau a son format, celui des photos prévues (LISTE_PRISES_DE_VUE.md : plateau
 * horizontal, mains à la spatule en vertical, kit carré) : pas trois rangées identiques.
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
                <div className={styles.visuel} data-apparition="devoile">
                  {content?.image ? (
                    <ResponsiveImage
                      image={content.image}
                      sizes="(min-width: 64rem) 560px, calc(100vw - 2 * var(--gouttiere))"
                      aspectRatio={universe.ratio}
                      zoomOnHover
                    />
                  ) : (
                    <div
                      className={styles.aplat}
                      style={{ aspectRatio: universe.ratio }}
                      data-numero={universe.number}
                      aria-hidden="true"
                    />
                  )}
                </div>
                <div className={styles.texte} data-apparition="monte">
                  <p className={styles.numero} aria-hidden="true">
                    <CremeTrait variant="puce" />
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
