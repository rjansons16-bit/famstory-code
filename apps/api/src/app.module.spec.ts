import { Test } from '@nestjs/testing';

import { AppModule } from './app.module';
import { PrismaService } from './common/prisma.service';
import { EventsService } from './modules/events/events.service';
import { FamiliesService } from './modules/families/families.service';
import { AuthService } from './modules/identity/auth.service';
import { JwtAuthGuard } from './modules/identity/jwt-auth.guard';
import { VisibilityService } from './modules/visibility/visibility.service';

/**
 * The module graph test.
 *
 * It checks no business logic — it checks that the dependency tree assembles at
 * all. NestJS DI errors only surface at startup, and without this test they
 * would surface on the first run against a live database, which is too late.
 *
 * PrismaService is replaced: this test needs no database.
 */
describe('AppModule', () => {
  const prismaStub = {
    $connect: jest.fn(),
    $disconnect: jest.fn(),
  } as unknown as PrismaService;

  it('the dependency graph assembles', async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue(prismaStub)
      .compile();

    expect(moduleRef.get(VisibilityService)).toBeInstanceOf(VisibilityService);
    expect(moduleRef.get(EventsService)).toBeInstanceOf(EventsService);
    expect(moduleRef.get(FamiliesService)).toBeInstanceOf(FamiliesService);
    expect(moduleRef.get(AuthService)).toBeInstanceOf(AuthService);

    await moduleRef.close();
  });

  it('JwtAuthGuard is registered globally — authentication is the default', async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue(prismaStub)
      .compile();

    expect(moduleRef.get(JwtAuthGuard, { strict: false })).toBeInstanceOf(JwtAuthGuard);

    await moduleRef.close();
  });
});
