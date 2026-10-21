import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';

import { Public } from '../modules/identity/jwt-auth.guard';
import { PrismaService } from './prisma.service';

/**
 * Is the server up, and can it reach its database.
 *
 * For whatever watches it: the supervisor on this laptop today, an uptime
 * check that texts somebody once it lives on a server (docs/08-LAUNCH-PLAN.md
 * 2.6). Before this there was nothing to ask but a real endpoint, and the
 * only honest answer from those is "401" - which says the process is running
 * and nothing about whether a family could load their timeline.
 *
 * Public, and says nothing a stranger could use: no version, no host, no
 * counts. A 503 when the database does not answer, because "the API is up"
 * is not the same thing as "the app works".
 */
@Controller('v1/health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Public()
  @Get()
  async check(): Promise<{ status: 'ok'; database: 'ok'; databaseMs: number }> {
    const started = Date.now();
    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch {
      throw new ServiceUnavailableException({
        code: 'database_unreachable',
        message: 'The server is running but cannot reach its database.',
      });
    }
    return { status: 'ok', database: 'ok', databaseMs: Date.now() - started };
  }
}
