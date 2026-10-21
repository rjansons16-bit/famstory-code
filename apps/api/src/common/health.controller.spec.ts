import { ServiceUnavailableException } from '@nestjs/common';

import { HealthController } from './health.controller';
import type { PrismaService } from './prisma.service';

function controllerWith(queryRaw: jest.Mock) {
  return new HealthController({ $queryRaw: queryRaw } as unknown as PrismaService);
}

describe('The health check', () => {
  it('says ok when the database answers', async () => {
    const controller = controllerWith(jest.fn().mockResolvedValue([{ '?column?': 1 }]));
    await expect(controller.check()).resolves.toMatchObject({ status: 'ok', database: 'ok' });
  });

  it('is a 503 when it does not - a running process is not a working app', async () => {
    const controller = controllerWith(jest.fn().mockRejectedValue(new Error('ECONNREFUSED')));
    await expect(controller.check()).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('says nothing a stranger could use', async () => {
    const controller = controllerWith(jest.fn().mockResolvedValue([]));
    const answer = await controller.check();
    expect(Object.keys(answer).sort()).toEqual(['database', 'databaseMs', 'status']);
  });
});
