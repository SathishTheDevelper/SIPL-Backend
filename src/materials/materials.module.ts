import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuditModule } from '../audit/audit.module';
import { CustomFieldsModule } from '../custom-fields/custom-fields.module';
import { MaterialCategoriesController } from './controllers/material-categories.controller';
import { MaterialsController } from './controllers/materials.controller';
import { UnitsController } from './controllers/units.controller';
import {
  MaterialCategory,
  MaterialCategorySchema,
} from './schemas/material-category.schema';
import { Material, MaterialSchema } from './schemas/material.schema';
import {
  UnitOfMeasure,
  UnitOfMeasureSchema,
} from './schemas/unit-of-measure.schema';
import { MaterialsService } from './services/materials.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Material.name, schema: MaterialSchema },
      { name: MaterialCategory.name, schema: MaterialCategorySchema },
      { name: UnitOfMeasure.name, schema: UnitOfMeasureSchema },
    ]),
    CustomFieldsModule,
    AuditModule,
  ],
  controllers: [
    MaterialsController,
    MaterialCategoriesController,
    UnitsController,
  ],
  providers: [MaterialsService],
  exports: [MaterialsService, MongooseModule],
})
export class MaterialsModule {}
