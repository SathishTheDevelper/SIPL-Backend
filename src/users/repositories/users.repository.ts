import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { FilterQuery, Model, Types, UpdateQuery } from 'mongoose';
import { TenantAwareRepository } from '../../common/repositories/tenant-aware.repository';
import { User } from '../schemas/user.schema';

@Injectable()
export class UsersRepository extends TenantAwareRepository<User> {
  constructor(@InjectModel(User.name) model: Model<User>) {
    super(model);
  }

  async findAuthByEmailAndTenant(
    email: string,
    tenantId: Types.ObjectId | null,
  ): Promise<User | null> {
    return this.model
      .findOne({ email, tenantId })
      .select('+passwordHash')
      .lean<User>()
      .exec();
  }

  async findAuthById(id: string): Promise<User | null> {
    return this.model.findById(id).select('+passwordHash').lean<User>().exec();
  }

  async updateRaw(id: string, update: UpdateQuery<User>): Promise<User | null> {
    return this.model
      .findByIdAndUpdate(id, update, { new: true })
      .lean<User>()
      .exec();
  }

  async countByTenant(tenantId: Types.ObjectId): Promise<number> {
    return this.model
      .countDocuments({ tenantId, deletedAt: { $exists: false } })
      .exec();
  }

  async countByRole(roleId: string): Promise<number> {
    return this.count({ roleId: new Types.ObjectId(roleId) });
  }

  async search(
    filter: FilterQuery<User>,
    skip: number,
    limit: number,
  ): Promise<User[]> {
    return this.model
      .find(this.scoped({ deletedAt: { $exists: false }, ...filter }))
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .select('-passwordHash')
      .lean<User[]>()
      .exec();
  }

  async countSearch(filter: FilterQuery<User>): Promise<number> {
    return this.count({ deletedAt: { $exists: false }, ...filter });
  }
}
