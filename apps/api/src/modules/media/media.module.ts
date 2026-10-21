import { Module } from '@nestjs/common';

import { VisibilityModule } from '../visibility/visibility.module';
import { MediaController } from './media.controller';
import { MediaService } from './media.service';
import { MediaSweeper } from './media.sweeper';
import { MediaBytesController, UploadsController } from './uploads.controller';
import { UploadsService } from './uploads.service';

@Module({
  imports: [VisibilityModule],
  controllers: [MediaController, UploadsController, MediaBytesController],
  providers: [MediaService, UploadsService, MediaSweeper],
  exports: [MediaService, UploadsService],
})
export class MediaModule {}
