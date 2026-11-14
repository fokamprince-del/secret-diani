import { BullModule } from '@nestjs/bullmq';
import type { DynamicModule } from '@nestjs/common';
import { loadEnvironment } from '../config/env-file';
import { InlineQueueModule } from './inline/inline-queue.module';

/**
 * Mode des files de tâches, fixé au démarrage :
 * - « redis » (REDIS_URL défini) : BullMQ, consommées par le processus `worker` à part ;
 * - « inline » (sans Redis) : exécutées dans l'API elle-même, avec les mêmes relances
 *   (5 essais, attente exponentielle). Un seul service à héberger, mais une seule instance.
 * L'environnement est déjà chargé (config/env-file est le premier import de chaque point d'entrée).
 */
export const USE_REDIS = Boolean(loadEnvironment().REDIS_URL);

/** À la place de `BullModule.registerQueue({ name })` dans les modules qui produisent ou consomment. */
export function registerQueue(name: string): DynamicModule {
  return USE_REDIS ? BullModule.registerQueue({ name }) : InlineQueueModule.register(name);
}
