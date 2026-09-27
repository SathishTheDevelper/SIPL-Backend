import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { CustomFieldsController } from './controllers/custom-fields.controller';
import { CustomFieldsRepository } from './repositories/custom-fields.repository';
import {
  CustomFieldDefinition,
  CustomFieldDefinitionSchema,
} from './schemas/custom-field-definition.schema';
import { CustomFieldValidationService } from './services/custom-field-validation.service';
import { CustomFieldsService } from './services/custom-fields.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      {
        name: CustomFieldDefinition.name,
        schema: CustomFieldDefinitionSchema,
      },
    ]),
  ],
  controllers: [CustomFieldsController],
  providers: [
    CustomFieldsService,
    CustomFieldValidationService,
    CustomFieldsRepository,
  ],
  exports: [CustomFieldsService, CustomFieldValidationService],
})
export class CustomFieldsModule {}
