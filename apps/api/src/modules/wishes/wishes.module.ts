import { Module } from '@nestjs/common';

import { VisibilityModule } from '../visibility/visibility.module';
import { WishesController } from './wishes.controller';
import { WishesService } from './wishes.service';

@Module({
  imports: [VisibilityModule],
  controllers: [WishesController],
  providers: [WishesService],
})
export class WishesModule {}
