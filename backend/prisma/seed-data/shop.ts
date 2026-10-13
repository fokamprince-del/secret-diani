import type { PrismaClient } from '@prisma/client';
import {
  LOW_STOCK_DISPLAY,
  MAX_QUANTITY_PER_ITEM,
  PICKUP_DETAILS,
  RESERVATION_MINUTES,
  SELLER,
} from '../../src/shop/shop.settings';

/**
 * Données de référence de la boutique (cahier des charges §1 : prix indicatifs des kits).
 * Composition, poids, photos, stock et tarifs de livraison ne sont pas connus : les kits sont
 * créés MASQUÉS, sans stock, et aucun tarif de livraison n'est inventé. Diani les complète
 * depuis l'administration. Idempotent : un élément existant n'est jamais modifié.
 */
const KITS = [
  { slug: 'kit-debutant', name: 'Kit Débutant', sku: 'KIT-DEBUTANT', priceCents: 3_799 },
  { slug: 'kit-expert', name: 'Kit Expert', sku: 'KIT-EXPERT', priceCents: 5_999 },
  { slug: 'kit-pro-atelier', name: 'Kit Pro Atelier', sku: 'KIT-PRO-ATELIER', priceCents: 8_999 },
];

const SETTINGS = [
  RESERVATION_MINUTES,
  MAX_QUANTITY_PER_ITEM,
  LOW_STOCK_DISPLAY,
  PICKUP_DETAILS,
  SELLER,
];

export async function seedShop(prisma: PrismaClient): Promise<void> {
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

  for (const [position, kit] of KITS.entries()) {
    const exists = await prisma.shopProduct.findUnique({
      where: { slug: kit.slug },
      select: { id: true },
    });
    if (exists) continue;
    await prisma.shopProduct.create({
      data: {
        slug: kit.slug,
        name: kit.name,
        kind: 'kit',
        visible: false,
        position,
        variants: {
          create: {
            sku: kit.sku,
            label: 'Standard',
            priceCents: kit.priceCents,
            weightGrams: 0,
            stock: { create: {} },
          },
        },
      },
    });
  }
}
