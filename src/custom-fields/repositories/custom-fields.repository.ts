import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { TenantAwareRepository } from '../../common/repositories/tenant-aware.repository';
import { CustomFieldDefinition } from '../schemas/custom-field-definition.schema';

@Injectable()
export class CustomFieldsRepository extends TenantAwareRepository<CustomFieldDefinition> {
  constructor(
    @InjectModel(CustomFieldDefinition.name)
    model: Model<CustomFieldDefinition>,
  ) {
    super(model);
  }

  async findByModule(module: string, activeOnly = true) {
    return this.findMany(
      {
        module: module.toUpperCase(),
        ...(activeOnly ? { isActive: true } : {}),
      },
      { sort: { displayOrder: 1, createdAt: 1 } },
    );
  }

  async findByModuleAndKey(module: string, key: string) {
    return this.model
      .findOne(this.scoped({ module: module.toUpperCase(), key }))
      .lean<CustomFieldDefinition>()
      .exec();
  }
}
