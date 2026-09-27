import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { FilterQuery, Model } from 'mongoose';
import { Tenant } from '../schemas/tenant.schema';

@Injectable()
export class TenantsRepository {
  constructor(
    @InjectModel(Tenant.name) private readonly model: Model<Tenant>,
  ) {}

  async create(payload: Partial<Tenant>): Promise<Tenant> {
    const created = await this.model.create(payload);
    return created.toObject();
  }

  async findById(id: string): Promise<Tenant | null> {
    return this.model.findById(id).lean<Tenant>().exec();
  }

  async findByCode(code: string): Promise<Tenant | null> {
    return this.model
      .findOne({ code: code.toUpperCase() })
      .lean<Tenant>()
      .exec();
  }

  async findMany(
    filter: FilterQuery<Tenant>,
    skip: number,
    limit: number,
  ): Promise<Tenant[]> {
    return this.model
      .find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean<Tenant[]>()
      .exec();
  }

  async count(filter: FilterQuery<Tenant>): Promise<number> {
    return this.model.countDocuments(filter).exec();
  }

  async updateById(
    id: string,
    update: Partial<Tenant>,
  ): Promise<Tenant | null> {
    return this.model
      .findByIdAndUpdate(id, { $set: update }, { new: true })
      .lean<Tenant>()
      .exec();
  }
}
