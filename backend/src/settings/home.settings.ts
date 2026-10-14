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
      text: 'Des plateaux qui disparaissent avant le dessert et des layer cakes à vos parfums, faits maison pour vos anniversaires, baptêmes et fêtes de famille.',
      imageId: '',
    },
    courses: {
      text: 'Je vous montre le geste en vidéo, vous le refaites chez vous : de la crème au beurre lisse jusqu’à votre première commande.',
      imageId: '',
    },
    shop: {
      text: 'Les accessoires que j’utilise vraiment, réunis en kits : de quoi bien démarrer, puis travailler comme à l’atelier.',
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
