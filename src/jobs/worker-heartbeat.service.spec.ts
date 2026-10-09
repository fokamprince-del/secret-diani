import type Redis from 'ioredis';
import { hostname } from 'node:os';
import { WorkerHeartbeatService } from './worker-heartbeat.service';

describe('WorkerHeartbeatService', () => {
  afterEach(() => jest.useRealTimers());

  it('publie un battement immédiatement puis à intervalle régulier, avec expiration', async () => {
    jest.useFakeTimers();
    const set = jest.fn().mockResolvedValue('OK');
    const service = new WorkerHeartbeatService({ set } as unknown as Redis);

    service.onApplicationBootstrap();
    expect(set).toHaveBeenCalledWith(
      `worker:heartbeat:${hostname()}`,
      expect.any(String),
      'EX',
      60,
    );
    await jest.advanceTimersByTimeAsync(15_000);
    expect(set).toHaveBeenCalledTimes(2);

    service.onApplicationShutdown();
    await jest.advanceTimersByTimeAsync(60_000);
    expect(set).toHaveBeenCalledTimes(2);
  });

  it('ne plante pas si Redis est indisponible', async () => {
    const set = jest.fn().mockRejectedValue(new Error('connexion perdue'));
    const service = new WorkerHeartbeatService({ set } as unknown as Redis);
    const warn = jest.spyOn(service['logger'], 'warn').mockImplementation(() => undefined);

    service.onApplicationBootstrap();
    service.onApplicationShutdown();
    await new Promise((resolve) => setImmediate(resolve));
    expect(warn).toHaveBeenCalled();
  });
});
