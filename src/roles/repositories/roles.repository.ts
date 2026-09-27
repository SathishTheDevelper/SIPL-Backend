import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { FilterQuery, Model, Types } from 'mongoose';
import { TenantAwareRepository } from '../../common/repositories/tenant-aware.repository';
import { Role } from '../schemas/role.schema';

@Injectable()
export class RolesRepository extends TenantAwareRepository<Role> {
  constructor(@InjectModel(Role.name) model: Model<Role>) {
    super(model);
  }

  async findByCode(code: string): Promise<Role | null> {
    return this.model
      .findOne(this.scoped({ code: code.toUpperCase() }))
      .lean<Role>()
      .exec();
  }

  async findPlatformByCode(code: string): Promise<Role | null> {
    return this.model
      .findOne({ tenantId: null, code: code.toUpperCase() })
      .lean<Role>()
      .exec();
  }

  async search(
    filter: FilterQuery<Role>,
    skip: number,
    limit: number,
  ): Promise<Role[]> {
    return this.model
      .find(this.scoped(filter))
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean<Role[]>()
      .exec();
  }

  async createForTenant(
    tenantId: Types.ObjectId | null,
    payload: Partial<Role>,
  ): Promise<Role> {
    const created = await this.model.create({ ...payload, tenantId });
    return created.toObject();
  }
}
