import type { HomeContent } from '@/lib/api/types';
import { BUFFET_PHOTO, CREATIONS } from '@/lib/vitrine';
import { ButtonLink } from '../ui/Button';
import { Icon } from '../ui/Icon';
import { Inclinaison } from '../ui/Inclinaison';
import { LoopVideo } from '../ui/LoopVideo';
import { Magnetique } from '../ui/Magnetique';
import { ResponsiveImage } from '../ui/ResponsiveImage';
import { StaticPhoto } from '../ui/StaticPhoto';
import styles from './Universes.module.css';

const FRAMBOISES = CREATIONS.find((creation) => creation.slug === 'framboises')!;

/** Ce que contient chaque formation (vrai pour toutes, cf. cahier des charges). */
const INCLUS = [
  'Vidéos pas à pas',
  'Fiches recettes à télécharger (PDF)',
  'Conseils & astuces de Diani',
  'Quiz à la fin de chaque leçon',
  'Certificat de fin de formation',
];

/** Illustration au trait de la boutique : poche à douille, rosace et pépites de couleur. */
export function PocheIllustration({ className }: { className?: string }) {
  return (
    <svg className={className ?? styles.illustration} viewBox="0 0 240 240" aria-hidden="true">
      <path
        className="trace"
        pathLength={1}
        d="M62 34 L170 34 Q176 34 172 42 L128 128 L112 128 L58 42 Q54 34 62 34 Z"
      />
      <path
        className="trace"
        pathLength={1}
        d="M112 128 L128 128 L124 146 L116 146 Z M74 34 Q120 52 160 34"
      />
      <path
        className="trace"
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
        <circle key={index} className="pepite" cx={x} cy={y} r={6} fill={fill as string} />
      ))}
    </svg>
  );
}

/**
 * Les univers, d'après la maquette : deux grandes cartes côte à côte (Traiteur sur photo,
 * Formations sur fond crème avec ce que contient chaque leçon), puis la Boutique en bandeau.
 * Les textes et les images viennent de l'administration ; jamais de prix ici.
 */
export function Universes({ universes }: { universes: HomeContent['universes'] | null }) {
  const catering = universes?.catering;
  const courses = universes?.courses;
  const shop = universes?.shop;

  return (
    <section id="univers" aria-labelledby="univers-titre" className={styles.univers}>
      <h2 id="univers-titre" className="visually-hidden">
        Nos univers
      </h2>
      <div className={`conteneur ${styles.cartes}`}>
        <Inclinaison className={styles.inclinee}>
          <article className={styles.traiteur} data-apparition="monte">
            <div className={styles.photo} data-profondeur="-1" data-revele>
              {catering?.image ? (
                <ResponsiveImage
                  image={catering.image}
                  sizes="(min-width: 64rem) 580px, 100vw"
                  aspectRatio="auto"
                />
              ) : (
                <StaticPhoto
                  photo={BUFFET_PHOTO}
                  sizes="(min-width: 64rem) 580px, 100vw"
                  focus="50% 45%"
                  decorative
                />
              )}
            </div>
            <div className={styles.traiteurTexte} data-profondeur="0.5">
              <p className={styles.etiquette}>Traiteur & commandes</p>
              <h3 className={styles.titre}>Des saveurs qui marquent vos moments</h3>
              <p>
                {catering?.text ??
                  'Plateaux, mini bouchées et layer cakes pour vos événements : frais, savoureux et faits avec passion.'}
              </p>
              <div>
                <Magnetique>
                  <ButtonLink
                    href="/traiteur"
                    variant="secondaire"
                    withArrow
                    className={styles.clair}
                  >
                    Passer commande
                  </ButtonLink>
                </Magnetique>
              </div>
            </div>
          </article>
        </Inclinaison>

        <Inclinaison className={styles.inclinee}>
          <article className={styles.formations} data-apparition="monte">
            <div className={styles.formationsTexte}>
              <p className={styles.etiquette}>Plateforme de formation</p>
              <h3 className={styles.titre}>Apprenez, cuisinez, réalisez vos rêves</h3>
              {courses?.text && <p>{courses.text}</p>}
              <ul role="list" className={styles.inclus}>
                {INCLUS.map((item) => (
                  <li key={item}>
                    <Icon name="check" size={16} />
                    {item}
                  </li>
                ))}
              </ul>
              <div>
                <Magnetique>
                  <ButtonLink href="/formations" withArrow>
                    Commencer une formation
                  </ButtonLink>
                </Magnetique>
              </div>
            </div>
            <div className={styles.telephoneCouche} data-profondeur="1">
              <div className={styles.telephone} aria-hidden="true">
                {courses?.image ? (
                  <ResponsiveImage image={courses.image} sizes="14rem" aspectRatio="9 / 16" />
                ) : (
                  <LoopVideo
                    src={FRAMBOISES.video!}
                    poster={FRAMBOISES.poster}
                    focus={FRAMBOISES.focus}
                  />
                )}
                <span className={styles.lecture}>
                  <Icon name="play" size={18} />
                </span>
              </div>
            </div>
          </article>
        </Inclinaison>
      </div>

      <div className="conteneur">
        <article className={styles.boutique} data-apparition="monte">
          <div className={styles.boutiqueVisuel} data-revele>
            {shop?.image ? (
              <ResponsiveImage image={shop.image} sizes="10rem" aspectRatio="1 / 1" />
            ) : (
              <PocheIllustration />
            )}
          </div>
          <div className={styles.boutiqueTexte}>
            <p className={styles.etiquette}>Boutique & kits</p>
            <h3 className={styles.titreBoutique}>Équipez-vous comme à l’atelier</h3>
            {shop?.text && <p>{shop.text}</p>}
          </div>
          <ButtonLink href="/boutique" variant="secondaire" withArrow>
            Découvrir la boutique
          </ButtonLink>
        </article>
      </div>
    </section>
  );
}
