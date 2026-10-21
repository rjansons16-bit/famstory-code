import { Module } from '@nestjs/common';

import { VisibilityModule } from '../visibility/visibility.module';
import { RevenueCatClient } from './revenuecat';
import { SubscriptionsController } from './subscriptions.controller';
import { SubscriptionsService } from './subscriptions.service';

@Module({
  imports: [VisibilityModule],
  controllers: [SubscriptionsController],
  providers: [SubscriptionsService, RevenueCatClient],
})
export class SubscriptionsModule {}
