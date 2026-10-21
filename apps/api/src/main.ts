import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';

import { AppModule } from './app.module';
import { ApiExceptionFilter } from './common/api-exception.filter';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bufferLogs: true });

  /**
   * Every request on this deployment arrives through the static server on the
   * same machine (tools/lan-host), which forwards the caller's address in
   * X-Forwarded-For. Trusting that header from LOOPBACK ONLY is what makes
   * req.ip the real caller for the rate limiter and the audit log — and
   * trusting it from anywhere else would let a caller choose their own
   * identity, and with it a fresh allowance whenever the old one ran out.
   *
   * TRUST_PROXY changes where the proxy is, never whether one is trusted: on
   * a server (tools/deploy) Caddy is another container, which is a private
   * address, not loopback - "loopback,uniquelocal" there. Left at loopback,
   * every caller would be Caddy, and the rate limiter would count the whole
   * internet as one address.
   */
  const trusted = (process.env.TRUST_PROXY ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  app.set('trust proxy', trusted.length > 0 ? trusted : 'loopback');

  app.use(helmet());
  app.enableCors({
    origin: (process.env.CORS_ORIGINS ?? '').split(',').filter(Boolean),
    credentials: true,
  });

  // Every error in the shape docs/05-API.md promises — see the filter for what
  // went wrong for as long as there was none.
  app.useGlobalFilters(new ApiExceptionFilter());

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      // An unknown field in a request is an error, not something to ignore quietly.
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  const port = Number(process.env.PORT ?? 3000);
  await app.listen(port);

  Logger.log(`FamStory API on :${port}`, 'Bootstrap');
}

void bootstrap();
