import { Module } from '@nestjs/common';
import { ContentModule } from '../content/content.module';
import {
  AdminCateringCatalogController,
  AdminCateringRequestsController,
} from './admin-catering.controller';
import { AdminCateringCatalogService } from './catalog/admin-catalog.service';
import { CateringCatalogService } from './catalog/catalog.service';
import { CateringController, CateringRequestsController } from './catering.controller';
import { CateringRequestsService } from './requests/requests.service';
import { CateringSlotsService } from './slots/slots.service';

/** Traiteur : catalogue public, demandes personnalisées, suivi et acompte (administration). */
@Module({
  imports: [ContentModule],
  controllers: [
    CateringController,
    CateringRequestsController,
    AdminCateringCatalogController,
    AdminCateringRequestsController,
  ],
  providers: [
    CateringCatalogService,
    AdminCateringCatalogService,
    CateringRequestsService,
    CateringSlotsService,
  ],
})
export class CateringModule {}
