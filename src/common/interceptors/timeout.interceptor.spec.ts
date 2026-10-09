import type { CallHandler, ExecutionContext } from '@nestjs/common';
import { NEVER, firstValueFrom, of, throwError } from 'rxjs';
import type { AppConfigService } from '../../config/app-config.service';
import { AppException } from '../errors/app.exception';
import { TimeoutInterceptor } from './timeout.interceptor';

const config = { get: () => 50 } as unknown as AppConfigService;
const context = {} as ExecutionContext;
const handler = (source: CallHandler['handle']): CallHandler => ({ handle: source });

describe('TimeoutInterceptor', () => {
  const interceptor = new TimeoutInterceptor(config);

  it('laisse passer une réponse rapide', async () => {
    await expect(
      firstValueFrom(
        interceptor.intercept(
          context,
          handler(() => of('ok')),
        ),
      ),
    ).resolves.toBe('ok');
  });

  it('convertit un dépassement de délai en 503 français', async () => {
    const error = await firstValueFrom(
      interceptor.intercept(
        context,
        handler(() => NEVER),
      ),
    ).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(AppException);
    expect((error as AppException).getStatus()).toBe(503);
    expect((error as AppException).code).toBe('TIMEOUT');
  });

  it('propage les autres erreurs telles quelles', async () => {
    const original = new Error('autre');
    await expect(
      firstValueFrom(
        interceptor.intercept(
          context,
          handler(() => throwError(() => original)),
        ),
      ),
    ).rejects.toBe(original);
  });
});
