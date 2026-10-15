/**
 * Vitrine de l'accueil : de vraies créations de Diani, filmées sur le plateau tournant.
 * Fichiers statiques dans `public/media/vitrine` (vidéos 464 × 848, affiches WebP tirées des
 * vidéos), en attendant que la médiathèque de l'API accepte la vidéo (D-F48).
 *
 * Les légendes décrivent seulement ce que l'on voit à l'image : aucun parfum ni aucune
 * composition qui n'ait été confirmé par Diani. À relire avec elle.
 */
export interface Creation {
  slug: string;
  title: string;
  caption: string;
  /** Couleur de la saveur (jeton CSS) : teinte le fond de la vitrine quand la carte est active. */
  accent: 'mangue' | 'framboise' | 'caramel' | 'ganache' | 'or';
  poster: string;
  /** Absent : photo seule. */
  video?: string;
  /** Cadrage de l'affiche : le gâteau est dans le bas de l'image. */
  focus?: string;
}

const DOSSIER = '/media/vitrine';

export const CREATIONS: Creation[] = [
  {
    slug: 'mangue-passion',
    title: 'Mangue-passion',
    caption: 'Drip mangue, rosaces de crème et fruits de la passion ouverts sur le dessus.',
    accent: 'mangue',
    poster: `${DOSSIER}/mangue-passion.webp`,
    video: `${DOSSIER}/mangue-passion.mp4`,
    focus: '50% 70%',
  },
  {
    slug: 'framboises',
    title: 'Couronne de framboises',
    caption: 'Drip ivoire, rosaces de crème et framboises fraîches tout autour.',
    accent: 'framboise',
    poster: `${DOSSIER}/framboises.webp`,
    video: `${DOSSIER}/framboises.mp4`,
    focus: '50% 65%',
  },
  {
    slug: 'couronne',
    title: 'La couronne',
    caption: 'Rosaces ivoire, drip blanc et couronne dorée pour une reine de la fête.',
    accent: 'or',
    poster: `${DOSSIER}/couronne-720.webp`,
    focus: '50% 70%',
  },
  {
    slug: 'caramel-18',
    title: 'Caramel, 18 ans',
    caption: 'Drip caramel, rosaces pailletées et chiffre doré.',
    accent: 'caramel',
    poster: `${DOSSIER}/caramel-18.webp`,
    video: `${DOSSIER}/caramel-18.mp4`,
    focus: '50% 70%',
  },
  {
    slug: 'anniversaire-33',
    title: 'Anniversaire, 33 ans',
    caption: 'Drip ganache, décor de billets et éclats dorés.',
    accent: 'ganache',
    poster: `${DOSSIER}/anniversaire-33.webp`,
    video: `${DOSSIER}/anniversaire-33.mp4`,
    focus: '50% 70%',
  },
];

/** La création du haut de l'accueil : la plus colorée. */
export const HERO_CREATION = CREATIONS[0]!;

/** Photo de la couronne en plusieurs formats, pour un `<picture>` léger. */
export const COURONNE = {
  avif: `${DOSSIER}/couronne-480.avif 480w, ${DOSSIER}/couronne-720.avif 720w`,
  webp: `${DOSSIER}/couronne-480.webp 480w, ${DOSSIER}/couronne-720.webp 720w`,
  fallback: `${DOSSIER}/couronne-720.jpg`,
  width: 720,
  height: 1280,
  alt: 'Gâteau d’anniversaire ivoire coiffé d’une couronne dorée, rosaces de crème et drip blanc.',
};

/** Parfums et bouchées du bandeau défilant : seulement ceux du catalogue du traiteur. */
export const SAVEURS = [
  'Mangue-passion',
  'Mini samoussas',
  'Framboise',
  'Mini burgers',
  'Chocolat blanc',
  'Nems',
  'Vanille',
  'Pastels',
  'Fraise',
  'Mini wraps',
  'Beignets',
  'Mini hot-dogs',
];
