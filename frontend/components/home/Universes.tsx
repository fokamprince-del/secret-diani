import type { ReactNode } from 'react';
import type { HomeContent } from '@/lib/api/types';
import { BUFFET_VIDEO, CREATIONS } from '@/lib/vitrine';
import { ButtonLink } from '../ui/Button';
import { CremeTrait } from '../ui/CremeTrait';
import { LoopVideo } from '../ui/LoopVideo';
import { ResponsiveImage } from '../ui/ResponsiveImage';
import styles from './Universes.module.css';

const FRAMBOISES = CREATIONS.find((creation) => creation.slug === 'framboises')!;

/** Illustration au trait de la boutique : poche à douille, rosace et pépites de couleur. */
function PocheIllustration() {
  return (
    <svg
      className={styles.illustration}
      viewBox="0 0 240 240"
      aria-hidden="true"
      data-apparition="dessin"
    >
      <path
        className="trace"
        style={{ ['--i' as string]: 0 }}
        pathLength={1}
        d="M62 34 L170 34 Q176 34 172 42 L128 128 L112 128 L58 42 Q54 34 62 34 Z"
      />
      <path
        className="trace"
        style={{ ['--i' as string]: 1 }}
        pathLength={1}
        d="M112 128 L128 128 L124 146 L116 146 Z M74 34 Q120 52 160 34"
      />
      <path
        className="trace"
        style={{ ['--i' as string]: 2 }}
        pathLength={1}
        d="M78 206 C 84 182, 156 182, 162 206 Z M92 188 C 100 170, 140 170, 148 188 M104 174 C 110 160, 130 160, 136 174 M120 160 L120 152"
      />
      {[
        [62, 170, 'var(--mangue)'],
        [178, 166, 'var(--framboise)'],
        [186, 206, 'var(--caramel)'],
        [52, 210, 'var(--framboise)'],
        [196, 128, 'var(--mangue)'],
      ].map(([x, y, fill], index) => (
        <circle
          key={index}
          className="pepite"
          style={{ ['--i' as string]: index, transformOrigin: `${x}px ${y}px` }}
          cx={x}
          cy={y}
          r={6}
          fill={fill as string}
        />
      ))}
    </svg>
  );
}

/** Libellés d'interface des trois univers ; le texte et l'image viennent de l'API. */
const UNIVERSES = [
  {
    key: 'catering',
    number: '01',
    title: 'Traiteur & commandes',
    href: '/traiteur',
    action: 'Je commande un plateau',
    ratio: '4 / 5',
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

type UniverseKey = (typeof UNIVERSES)[number]['key'];

/** Visuel par défaut, tant que Diani n'a pas choisi d'image dans l'administration. */
const FALLBACK: Record<UniverseKey, ReactNode> = {
  catering: (
    <LoopVideo src={BUFFET_VIDEO.video} poster={BUFFET_VIDEO.poster} focus={BUFFET_VIDEO.focus} />
  ),
  courses: (
    <LoopVideo src={FRAMBOISES.video!} poster={FRAMBOISES.poster} focus={FRAMBOISES.focus} />
  ),
  shop: <PocheIllustration />,
};

/**
 * Les trois univers en grands bandeaux : un visuel, un texte court, un bouton. Jamais de
 * produit ni de prix ici (« la home présente, les pages univers détaillent »).
 * Chaque bandeau a sa forme (arche de cloche à gâteau, carte inclinée sur fond framboise,
 * médaillon) et sa couleur de saveur : pas trois rangées identiques.
 */
export function Universes({ universes }: { universes: HomeContent['universes'] | null }) {
  return (
    <section id="univers" aria-labelledby="univers-titre" className={styles.univers}>
      <div className={`conteneur ${styles.entete}`}>
        <p className={styles.surtitre}>Trois façons de se régaler</p>
        <h2 id="univers-titre">Commandez, apprenez, équipez-vous</h2>
      </div>
      <div className="conteneur">
        <ol role="list" className={styles.liste}>
          {UNIVERSES.map((universe) => {
            const content = universes?.[universe.key];
            return (
              <li key={universe.key} className={styles.bandeau} data-univers={universe.key}>
                <div className={styles.scene}>
                  <span className={styles.fond} aria-hidden="true" />
                  <div
                    className={styles.visuel}
                    data-apparition="devoile"
                    style={{ aspectRatio: universe.ratio }}
                  >
                    {content?.image ? (
                      <ResponsiveImage
                        image={content.image}
                        sizes="(min-width: 64rem) 480px, calc(100vw - 2 * var(--gouttiere))"
                        aspectRatio={universe.ratio}
                        zoomOnHover
                      />
                    ) : (
                      FALLBACK[universe.key]
                    )}
                  </div>
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
