import { Global, Module } from '@nestjs/common';

import { AuditService } from './audit.service';
import { MailService } from './mail.service';
import { PrismaService } from './prisma.service';
import { RateLimitStore } from './rate-limit.store';
import { SigningService } from './signing.service';
import { StorageService } from './storage/storage.service';

/**
 * The global module: the database connection and the audit log are needed
 * almost everywhere, and importing them separately in every module is noise.
 *
 * No domain logic belongs here — infrastructure only.
 */
@Global()
@Module({
  providers: [PrismaService, AuditService, RateLimitStore, StorageService, SigningService, MailService],
  exports: [PrismaService, AuditService, RateLimitStore, StorageService, SigningService, MailService],
})
export class CoreModule {}
