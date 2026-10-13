import { z } from 'zod';
import type { PrismaService } from '../prisma/prisma.service';
import { defineSetting, SettingsService } from './settings.service';

const THRESHOLD = defineSetting({
  key: 'test.threshold',
  schema: z.number().int().min(0),
  defaultValue: 5_000,
  description: 'Seuil',
});

const LABEL = defineSetting({
  key: 'test.label',
  schema: z.string().min(1),
  defaultValue: 'par défaut',
  description: 'Libellé',
});

function service(rows: { key: string; value: unknown }[]): SettingsService {
  const prisma = {
    appSetting: { findMany: jest.fn().mockResolvedValue(rows) },
  } as unknown as PrismaService;
  return new SettingsService(prisma);
}

describe('SettingsService', () => {
  it('renvoie la valeur enregistrée quand elle est valide', async () => {
    await expect(service([{ key: 'test.threshold', value: 8_000 }]).get(THRESHOLD)).resolves.toBe(
      8_000,
    );
  });

  it('retombe sur la valeur par défaut si le paramètre est absent', async () => {
    await expect(service([]).get(THRESHOLD)).resolves.toBe(5_000);
  });

  it('retombe sur la valeur par défaut si la valeur saisie est invalide (page publique intacte)', async () => {
    await expect(service([{ key: 'test.threshold', value: '50 €' }]).get(THRESHOLD)).resolves.toBe(
      5_000,
    );
  });

  it('lit plusieurs paramètres en une requête, dans l’ordre demandé', async () => {
    const settings = service([{ key: 'test.label', value: 'Bonjour' }]);
    await expect(settings.getMany([THRESHOLD, LABEL] as const)).resolves.toEqual([
      5_000,
      'Bonjour',
    ]);
  });
});
