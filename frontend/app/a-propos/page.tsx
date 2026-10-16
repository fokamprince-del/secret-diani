import type { Metadata } from 'next';
import Link from 'next/link';
import { PageHeader } from '@/components/content/PageHeader';
import { RichText } from '@/components/content/RichText';
import { Invitation } from '@/components/home/Invitation';
import { CremeTrait } from '@/components/ui/CremeTrait';
import { Drip } from '@/components/ui/Drip';
import { Icon, type IconName } from '@/components/ui/Icon';
import { LoopVideo } from '@/components/ui/LoopVideo';
import { StaticPhoto } from '@/components/ui/StaticPhoto';
import { getPageIfPublished, getSiteSettings } from '@/lib/api/content';
import { pageMetadata } from '@/lib/seo';
import { socialLinksFrom } from '@/lib/social';
import {
  BUCHES,
  BUFFET_PHOTO,
  BUFFET_VIDEO,
  COURONNE,
  CREATIONS,
  HERO_CREATION,
} from '@/lib/vitrine';
import styles from './page.module.css';

export const metadata: Metadata = pageMetadata({
  title: 'À propos',
  description:
    'Les Secrets de Diani : une cuisine faite maison et partagée, du buffet de fête au layer cake, des formations pour apprendre les gestes et une boutique pour s’équiper.',
  path: '/a-propos',
});

/** Ce qui guide le travail (mêmes engagements que l'accueil, dans la voix de Diani). */
const VALEURS: { icon: IconName; titre: string; texte: string }[] = [
  {
    icon: 'heart',
    titre: 'Tout est fait maison',
    texte: 'Chaque plateau, chaque gâteau sort de ma cuisine, préparé à la main.',
  },
  {
    icon: 'leaf',
    titre: 'Des produits choisis',
    texte: 'Je choisis mes produits un par un, et je prépare pour votre date, pas avant.',
  },
  {
    icon: 'star',
    titre: 'Les vrais prix, les vraies quantités',
    texte: 'Des pièces comptées, des parts annoncées, un acompte clair : aucune surprise.',
  },
  {
    icon: 'chat',
    titre: 'À votre écoute',
    texte: 'Une question, une allergie, une envie particulière ? On en parle avant.',
  },
];

const METIERS = [
  {
    titre: 'Le traiteur',
    texte:
      'Plateaux de mini bouchées, buffets salés, layer cakes à vos parfums : pour les anniversaires, baptêmes et fêtes de famille.',
    href: '/traiteur',
    lien: 'Voir la carte',
    accent: 'mangue',
  },
  {
    titre: 'Les formations',
    texte:
      'Je vous montre mes gestes en vidéo, pas à pas : la crème qui tient, le lissage net, le décor qui fait de l’effet.',
    href: '/formations',
    lien: 'Découvrir les formations',
    accent: 'framboise',
  },
  {
    titre: 'La boutique',
    texte:
      'Les accessoires que j’utilise vraiment, réunis en kits selon votre niveau, pour réussir chez vous.',
    href: '/boutique',
    lien: 'Voir les kits',
    accent: 'caramel',
  },
] as const;

/**
 * À propos : une page composée (vidéo du buffet, métiers, valeurs, galerie) plutôt qu'un simple
 * texte. Aucune biographie inventée : le récit personnel de Diani vient de l'administration
 * (page « a-propos ») et s'affiche ici dès qu'il est publié.
 */
export default async function AboutPage() {
  const [story, settings] = await Promise.all([getPageIfPublished('a-propos'), getSiteSettings()]);
  const galerie = CREATIONS.filter((creation) => !['couronne', 'buches'].includes(creation.slug));

  return (
    <>
      <PageHeader
        eyebrow="Les Secrets de Diani"
        title="À propos"
        intro={
          <p>
            Je cuisine pour vos fêtes, je transmets mes gestes et je vous équipe pour réussir chez
            vous. Une seule idée derrière tout ça : une cuisine faite maison, qui se partage.
          </p>
        }
        visual={{
          video: HERO_CREATION.video,
          poster: HERO_CREATION.poster,
          focus: HERO_CREATION.focus,
          caption: `Layer cake ${HERO_CREATION.title.toLowerCase()} : ${HERO_CREATION.caption}`,
          medaillon: { src: BUFFET_PHOTO.fallback, alt: BUFFET_PHOTO.alt, focus: '50% 40%' },
          note: 'avec amour',
        }}
      />

      <section aria-labelledby="partage-titre" className={styles.partage}>
        <div className={`conteneur ${styles.partageGrille}`}>
          <div className={styles.partageVisuel} data-apparition="devoile">
            <LoopVideo
              src={BUFFET_VIDEO.video}
              poster={BUFFET_VIDEO.poster}
              focus={BUFFET_VIDEO.focus}
            />
          </div>
          <div className={styles.partageTexte} data-apparition="monte">
            <p className={styles.surtitre}>Bien plus qu’une cuisine</p>
            <h2 id="partage-titre">Une histoire de partage</h2>
            <CremeTrait mouvement="apparition" />
            {story ? (
              <RichText html={story.bodyHtml} className={styles.recit} />
            ) : (
              <>
                <p>
                  Un buffet qui disparaît avant l’arrivée du dessert, un layer cake qu’on découpe
                  devant les invités, une bûche qui finit le repas de fête : c’est ce que je
                  prépare, à la main, pour vos moments en famille.
                </p>
                <p>
                  Et parce que les secrets sont faits pour être partagés, je vous montre aussi
                  comment faire chez vous : mes gestes en formation, et le matériel que j’utilise
                  vraiment.
                </p>
              </>
            )}
          </div>
        </div>
      </section>

      <section aria-labelledby="metiers-titre" className={styles.metiers}>
        <div className="conteneur">
          <h2 id="metiers-titre" className={styles.centre}>
            Trois façons de travailler ensemble
          </h2>
          <ul role="list" className={styles.metiersListe}>
            {METIERS.map((metier) => (
              <li
                key={metier.titre}
                className={styles.metier}
                data-accent={metier.accent}
                data-apparition="monte"
              >
                <h3>{metier.titre}</h3>
                <p>{metier.texte}</p>
                <Link href={metier.href} className={styles.metierLien}>
                  {metier.lien}
                  <Icon name="arrowRight" size={18} />
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section aria-labelledby="valeurs-titre" className={styles.valeurs}>
        <div className={`conteneur ${styles.valeursGrille}`}>
          <div className={styles.valeursPhoto} data-apparition="devoile">
            <StaticPhoto
              photo={BUFFET_PHOTO}
              sizes="(min-width: 64rem) 420px, 90vw"
              focus="50% 65%"
            />
          </div>
          <div>
            <p className={styles.surtitre}>Ce qui compte pour moi</p>
            <h2 id="valeurs-titre">Ma façon de travailler</h2>
            <ul role="list" className={styles.valeursListe}>
              {VALEURS.map((valeur) => (
                <li key={valeur.titre} data-apparition="monte">
                  <span className={styles.valeurIcone}>
                    <Icon name={valeur.icon} size={22} />
                  </span>
                  <div>
                    <h3>{valeur.titre}</h3>
                    <p>{valeur.texte}</p>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>
        <Drip color="var(--sable)" />
      </section>

      <section aria-labelledby="galerie-titre" className={styles.galerie}>
        <div className="conteneur">
          <h2 id="galerie-titre" className={styles.centre}>
            Sortis de ma cuisine
          </h2>
          <ul role="list" className={styles.mosaique}>
            <li className={styles.grand} data-apparition="devoile">
              <StaticPhoto
                photo={COURONNE}
                sizes="(min-width: 64rem) 380px, 50vw"
                focus="50% 70%"
              />
            </li>
            {galerie.map((creation) => (
              <li key={creation.slug} data-apparition="devoile">
                {creation.video ? (
                  <LoopVideo src={creation.video} poster={creation.poster} focus={creation.focus} />
                ) : creation.photo ? (
                  <StaticPhoto photo={creation.photo} sizes="(min-width: 64rem) 280px, 50vw" />
                ) : null}
                <span className={styles.legende}>{creation.title}</span>
              </li>
            ))}
            <li className={styles.large} data-apparition="devoile">
              <StaticPhoto photo={BUCHES} sizes="(min-width: 64rem) 560px, 100vw" focus="50% 55%" />
              <span className={styles.legende}>Les bûches roulées</span>
            </li>
            <li className={styles.large} data-apparition="devoile">
              <StaticPhoto
                photo={BUFFET_PHOTO}
                sizes="(min-width: 64rem) 560px, 100vw"
                focus="50% 70%"
              />
              <span className={styles.legende}>Un buffet de fête</span>
            </li>
          </ul>
        </div>
      </section>

      <Invitation social={socialLinksFrom(settings)[0] ?? null} />
    </>
  );
}
