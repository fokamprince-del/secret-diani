import { z } from 'zod';
import type { PrismaService } from '../prisma/prisma.service';
import { defineSetting, SETTINGS_CACHE_MS, SettingsService } from './settings.service';

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
  return new SettingsService(prismaReturning(rows));
}

function prismaReturning(rows: { key: string; value: unknown }[]) {
  return {
    appSetting: { findMany: jest.fn().mockResolvedValue(rows) },
  } as unknown as PrismaService & { appSetting: { findMany: jest.Mock } };
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

  it('garde les valeurs 5 secondes en mémoire, puis les relit ; vidage à la demande', async () => {
    jest.useFakeTimers({ now: new Date('2026-10-13T10:00:00Z') });
    try {
      const prisma = prismaReturning([{ key: 'test.threshold', value: 8_000 }]);
      const settings = new SettingsService(prisma);
      await settings.get(THRESHOLD);
      await settings.getMany([THRESHOLD, LABEL] as const);
      // Seul le paramètre jamais lu est demandé à la base.
      expect(prisma.appSetting.findMany).toHaveBeenCalledTimes(2);
      expect(prisma.appSetting.findMany.mock.calls[1][0]).toMatchObject({
        where: { key: { in: ['test.label'] } },
      });
      await settings.get(THRESHOLD);
      expect(prisma.appSetting.findMany).toHaveBeenCalledTimes(2);

      jest.advanceTimersByTime(SETTINGS_CACHE_MS);
      await settings.get(THRESHOLD);
      expect(prisma.appSetting.findMany).toHaveBeenCalledTimes(3);

      settings.invalidate('test.threshold');
      await settings.get(THRESHOLD);
      settings.invalidate();
      await settings.get(LABEL);
      expect(prisma.appSetting.findMany).toHaveBeenCalledTimes(5);
    } finally {
      jest.useRealTimers();
    }
  });

  it('lit plusieurs paramètres en une requête, dans l’ordre demandé', async () => {
    const settings = service([{ key: 'test.label', value: 'Bonjour' }]);
    await expect(settings.getMany([THRESHOLD, LABEL] as const)).resolves.toEqual([
      5_000,
      'Bonjour',
    ]);
  });
});
