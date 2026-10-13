import type { CateringKind, PrismaClient } from '@prisma/client';
import {
  CONDITIONS,
  DEPOSIT_BELOW,
  DEPOSIT_FROM,
  DEPOSIT_THRESHOLD,
  MIN_NOTICE_DAYS,
} from '../../src/catering/catering.settings';

/**
 * Données de référence du traiteur (cahier des charges §1). Idempotent : un élément déjà
 * présent (même slug) n'est jamais écrasé, les modifications de l'administration sont conservées.
 * Les prix sont ceux communiqués par Diani : le catalogue est créé visible, sans photo
 * (à ajouter depuis l'administration).
 */
interface ProductSeed {
  slug: string;
  name: string;
  description?: string;
  composition?: { label: string; quantity: number }[];
  maxFlavours?: number;
  withAllFlavours?: boolean;
  variants: { label: string; priceCents: number; servingsMin?: number; servingsMax?: number }[];
}

const CATEGORIES: {
  slug: string;
  name: string;
  kind: CateringKind;
  description: string;
  products: ProductSeed[];
}[] = [
  {
    slug: 'plateaux',
    name: 'Plateaux',
    kind: 'platter',
    description: 'Des plateaux de mini bouchées à partager, prêts à servir.',
    products: [
      {
        slug: 'plateau-decouverte',
        name: 'Plateau découverte',
        composition: [
          { label: 'mini burgers', quantity: 5 },
          { label: 'mini hot-dogs', quantity: 5 },
          { label: 'mini wraps', quantity: 5 },
          { label: 'mini pizzas', quantity: 5 },
        ],
        variants: [{ label: 'Plateau de 20 pièces', priceCents: 4_000 }],
      },
      {
        slug: 'plateau-mix-gourmand',
        name: 'Plateau mix gourmand',
        composition: [
          { label: 'mini pizzas', quantity: 5 },
          { label: 'nems', quantity: 5 },
          { label: 'mini samoussas', quantity: 5 },
          { label: 'beignets africains', quantity: 5 },
          { label: 'mini bricks', quantity: 5 },
        ],
        variants: [{ label: 'Plateau de 25 pièces', priceCents: 4_200 }],
      },
    ],
  },
  {
    slug: 'a-la-carte',
    name: 'À la carte',
    kind: 'a_la_carte',
    description: 'Les mini bouchées à l’unité de commande, pour composer votre buffet.',
    products: [
      {
        slug: 'mini-burgers',
        name: 'Mini burgers',
        variants: [{ label: 'Lot de 10', priceCents: 1_800 }],
      },
      {
        slug: 'mini-hot-dogs',
        name: 'Mini hot-dogs',
        variants: [{ label: 'Lot de 10', priceCents: 1_600 }],
      },
      {
        slug: 'mini-wraps',
        name: 'Mini wraps',
        variants: [{ label: 'Lot de 10', priceCents: 2_100 }],
      },
      {
        slug: 'mini-samoussas',
        name: 'Mini samoussas',
        variants: [{ label: 'Lot de 10', priceCents: 1_400 }],
      },
      { slug: 'pastels', name: 'Pastels', variants: [{ label: 'Lot de 12', priceCents: 1_500 }] },
    ],
  },
  {
    slug: 'layer-cakes',
    name: 'Layer cakes',
    kind: 'layer_cake',
    description: 'Des layer cakes sur mesure, à composer avec vos parfums préférés.',
    products: [
      {
        slug: 'layer-cake',
        name: 'Layer cake',
        maxFlavours: 3,
        withAllFlavours: true,
        variants: [
          { label: 'Bento', priceCents: 1_500 },
          { label: '4–6 parts', priceCents: 3_500, servingsMin: 4, servingsMax: 6 },
          { label: '6–8 parts', priceCents: 5_000, servingsMin: 6, servingsMax: 8 },
          { label: '8–10 parts', priceCents: 6_000, servingsMin: 8, servingsMax: 10 },
          { label: '10–15 parts', priceCents: 7_000, servingsMin: 10, servingsMax: 15 },
          { label: '15–20 parts', priceCents: 8_000, servingsMin: 15, servingsMax: 20 },
          { label: '20–25 parts', priceCents: 9_000, servingsMin: 20, servingsMax: 25 },
        ],
      },
    ],
  },
];

const FLAVOURS = [
  { slug: 'mangue-passion', name: 'Mangue-passion' },
  { slug: 'chocolat-blanc', name: 'Chocolat blanc' },
  { slug: 'vanille', name: 'Vanille' },
  { slug: 'fraise', name: 'Fraise' },
  { slug: 'framboise', name: 'Framboise' },
  { slug: 'kinder-bueno-white', name: 'Kinder Bueno white' },
  { slug: 'kinder-bueno', name: 'Kinder Bueno' },
];

const SETTINGS = [DEPOSIT_THRESHOLD, DEPOSIT_BELOW, DEPOSIT_FROM, MIN_NOTICE_DAYS, CONDITIONS];

export async function seedCatering(prisma: PrismaClient): Promise<void> {
  for (const setting of SETTINGS) {
    await prisma.appSetting.upsert({
      where: { key: setting.key },
      update: {},
      create: {
        key: setting.key,
        value: setting.defaultValue,
        description: setting.description,
      },
    });
  }

  const flavourIds: string[] = [];
  for (const [position, flavour] of FLAVOURS.entries()) {
    const row = await prisma.cateringFlavour.upsert({
      where: { slug: flavour.slug },
      update: {},
      create: { ...flavour, position },
      select: { id: true },
    });
    flavourIds.push(row.id);
  }

  for (const [categoryPosition, category] of CATEGORIES.entries()) {
    const { products, ...data } = category;
    const { id: categoryId } = await prisma.cateringCategory.upsert({
      where: { slug: category.slug },
      update: {},
      create: { ...data, position: categoryPosition },
      select: { id: true },
    });
    for (const [position, product] of products.entries()) {
      const exists = await prisma.cateringProduct.findUnique({
        where: { slug: product.slug },
        select: { id: true },
      });
      if (exists) continue;
      await prisma.cateringProduct.create({
        data: {
          categoryId,
          slug: product.slug,
          name: product.name,
          description: product.description ?? null,
          composition: product.composition ?? [],
          maxFlavours: product.maxFlavours ?? 0,
          position,
          variants: {
            create: product.variants.map((variant, index) => ({ ...variant, position: index })),
          },
          flavours: product.withAllFlavours
            ? { create: flavourIds.map((flavourId) => ({ flavourId })) }
            : undefined,
        },
      });
    }
  }
}
