import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { ContentModule } from '../content/content.module';
import { ShopCoreModule } from '../shop/shop-core.module';
import { DOCUMENTS_QUEUE } from '../shop/shop.constants';
import { AccessService } from './access/access.service';
import { AdminCoursesController } from './admin-courses.controller';
import { AdminCoursesService } from './admin/admin-courses.service';
import { CoursesCatalogService } from './catalog/courses-catalog.service';
import { CertificatesService } from './certificates/certificates.service';
import {
  CertificatesController,
  CoursesController,
  MyLearningController,
} from './courses.controller';
import { LearningService } from './learning/learning.service';
import { PerksService } from './perks/perks.service';
import { PackCheckoutService } from './purchase/pack-checkout.service';
import { WatermarkService } from './resources/watermark.service';
import { VideoService } from './video/video.service';

/** Formations : catalogue, achat des packs, leçons, quiz, progression, certificats, administration. */
@Module({
  imports: [ContentModule, ShopCoreModule, BullModule.registerQueue({ name: DOCUMENTS_QUEUE })],
  controllers: [
    CoursesController,
    MyLearningController,
    CertificatesController,
    AdminCoursesController,
  ],
  providers: [
    AccessService,
    CoursesCatalogService,
    VideoService,
    WatermarkService,
    CertificatesService,
    LearningService,
    PackCheckoutService,
    PerksService,
    AdminCoursesService,
  ],
})
export class CoursesModule {}
