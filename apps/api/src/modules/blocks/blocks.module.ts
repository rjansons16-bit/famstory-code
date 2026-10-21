import { Module } from '@nestjs/common';

import { VisibilityModule } from '../visibility/visibility.module';
import { BlocksController } from './blocks.controller';
import { BlocksService } from './blocks.service';

@Module({
  imports: [VisibilityModule],
  controllers: [BlocksController],
  providers: [BlocksService],
})
export class BlocksModule {}
