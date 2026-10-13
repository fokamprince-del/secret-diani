import { z } from 'zod';
import { defineSetting } from './settings.service';

/** Identifiant d'une image de la médiathèque ; vide : pas d'image (fond uni sur le site). */
const mediaId = z.union([z.literal(''), z.uuid()]);

export const HERO_IMAGE = defineSetting({
  key: 'home.hero_image_id',
  schema: mediaId,
  defaultValue: '',
  description:
    'Image d’ambiance du haut de l’accueil (identifiant de la médiathèque). Jamais un portrait.',
});

const universeSchema = z.object({
  text: z.string().trim().min(1).max(280),
  imageId: mediaId,
});

const universesSchema = z.object({
  catering: universeSchema,
  courses: universeSchema,
  shop: universeSchema,
});

export const UNIVERSES = defineSetting({
  key: 'home.universes',
  schema: universesSchema,
  defaultValue: {
    catering: {
      text: 'Plateaux, bouchées et layer cakes faits maison pour vos anniversaires, baptêmes et fêtes de famille.',
      imageId: '',
    },
    courses: {
      text: 'Des formations vidéo pas à pas pour maîtriser la pâtisserie et lancer votre activité.',
      imageId: '',
    },
    shop: {
      text: 'Les kits d’accessoires choisis par Diani pour bien démarrer et travailler comme une pro.',
      imageId: '',
    },
  },
  description:
    'Les trois univers de l’accueil : texte court (280 caractères au plus) et image de chacun.',
});

export const DIANI_WORD = defineSetting({
  key: 'home.diani_word',
  schema: z.object({
    text: z.string().trim().max(1200),
    signature: z.string().trim().max(80),
  }),
  defaultValue: { text: '', signature: 'Diani' },
  description: 'Le mot de Diani sur l’accueil. Texte vide : la section est masquée.',
});
