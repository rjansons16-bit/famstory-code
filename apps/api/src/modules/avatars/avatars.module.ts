import { Module } from '@nestjs/common';

import { VisibilityModule } from '../visibility/visibility.module';
import { AvatarsController } from './avatars.controller';
import { AvatarsService } from './avatars.service';

@Module({
  imports: [VisibilityModule],
  controllers: [AvatarsController],
  providers: [AvatarsService],
})
export class AvatarsModule {}
