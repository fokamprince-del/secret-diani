import { PrismaClient } from '@prisma/client';

/**
 * Seed des données de référence (idempotent : relançable sans doublon).
 * Les données métier (traiteur, formations, boutique) sont ajoutées dans leurs phases.
 * Aucun compte administrateur n'est créé ici : utiliser `make create-admin`.
 */
const prisma = new PrismaClient();

async function main(): Promise<void> {
  await prisma.appSetting.upsert({
    where: { key: 'site.whatsapp_number' },
    update: {},
    create: {
      key: 'site.whatsapp_number',
      value: '',
      description: 'Numéro WhatsApp affiché sur le site (format international, ex. +33600000000).',
    },
  });
  console.log('Seed terminé.');
}

main()
  .catch((error: unknown) => {
    console.error('Échec du seed :', error);
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });
