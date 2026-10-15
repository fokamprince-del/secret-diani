/**
 * Vraies créations de Diani (photos et vidéos), en fichiers statiques dans `public/media/vitrine`
 * en attendant que la médiathèque de l'API accepte la vidéo (D-F48). Vidéos 464 × 848 en H.264
 * sans son, index en tête de fichier (lecture immédiate) ; affiches WebP tirées des vidéos ;
 * photos déclinées en AVIF, WebP et JPEG.
 *
 * Les légendes décrivent seulement ce que l'on voit à l'image : aucun parfum ni aucune
 * composition qui n'ait été confirmé par Diani. À relire avec elle.
 */
const DOSSIER = '/media/vitrine';

/** Photo statique en plusieurs formats, pour un `<picture>` léger (voir StaticPhoto). */
export interface Photo {
  avif: string;
  webp: string;
  fallback: string;
  width: number;
  height: number;
  alt: string;
}

function photo(name: string, widths: number[], height: (w: number) => number, alt: string): Photo {
  const largest = widths[widths.length - 1]!;
  const set = (ext: string) => widths.map((w) => `${DOSSIER}/${name}-${w}.${ext} ${w}w`).join(', ');
  return {
    avif: set('avif'),
    webp: set('webp'),
    fallback: `${DOSSIER}/${name}-${largest}.jpg`,
    width: largest,
    height: height(largest),
    alt,
  };
}

export const COURONNE = photo(
  'couronne',
  [480, 720],
  (w) => Math.round((w * 16) / 9),
  'Gâteau d’anniversaire ivoire coiffé d’une couronne dorée, rosaces de crème et drip blanc.',
);

export const BUFFET_PHOTO = photo(
  'buffet-photo',
  [400, 590],
  () => 1046,
  'Buffet salé dressé sur des présentoirs blancs : mini burgers, samoussas, wraps et verrines, entre deux bouquets de fleurs.',
);

export const BUCHES = photo(
  'buches',
  [480, 720],
  (w) => Math.round((w * 16) / 9),
  'Trois bûches roulées dans leurs boîtes : deux à la noix de coco et à la fraise, une à la mangue et aux fruits de la passion.',
);

/** Vidéo d'ambiance : tour du buffet salé (mini burgers, samoussas, wraps, verrines). */
export const BUFFET_VIDEO = {
  video: `${DOSSIER}/buffet.mp4`,
  poster: `${DOSSIER}/buffet.webp`,
  focus: '50% 50%',
  caption: 'Un buffet salé dressé pour une fête : mini burgers, samoussas, wraps et verrines.',
};

export interface Creation {
  slug: string;
  title: string;
  caption: string;
  /** Couleur de la saveur (jeton CSS) : teinte le fond de la vitrine quand la carte est active. */
  accent: 'mangue' | 'framboise' | 'caramel' | 'ganache' | 'or';
  poster: string;
  /** Vidéo en boucle ; absente : `photo`. */
  video?: string;
  photo?: Photo;
  /** Cadrage de l'affiche : le gâteau est dans le bas de l'image. */
  focus?: string;
}

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
    photo: COURONNE,
    focus: '50% 70%',
  },
  {
    slug: 'buches',
    title: 'Les bûches roulées',
    caption: 'Coco et fraise, ou mangue et passion : des roulés à partager pour les fêtes.',
    accent: 'mangue',
    poster: `${DOSSIER}/buches-720.webp`,
    photo: BUCHES,
    focus: '50% 55%',
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

/** Le gâteau mis en avant dans le haut de l'accueil, à côté du buffet. */
export const HERO_CREATION = CREATIONS[0]!;

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
