import { Module } from '@nestjs/common';

import { AccountController } from './account.controller';
import { AccountPurge } from './account.purge';
import { AccountService } from './account.service';

@Module({
  controllers: [AccountController],
  providers: [AccountService, AccountPurge],
  exports: [AccountService],
})
export class AccountModule {}
