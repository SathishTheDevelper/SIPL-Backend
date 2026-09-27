import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Permission } from '../schemas/permission.schema';

@Injectable()
export class PermissionsRepository {
  constructor(
    @InjectModel(Permission.name) private readonly model: Model<Permission>,
  ) {}

  async findAll(): Promise<Permission[]> {
    return this.model
      .find()
      .sort({ module: 1, code: 1 })
      .lean<Permission[]>()
      .exec();
  }

  async findByCodes(codes: string[]): Promise<Permission[]> {
    return this.model
      .find({ code: { $in: codes } })
      .lean<Permission[]>()
      .exec();
  }

  async upsertMany(items: Partial<Permission>[]): Promise<void> {
    await Promise.all(
      items.map((item) =>
        this.model.updateOne(
          { code: item.code },
          { $set: item },
          { upsert: true },
        ),
      ),
    );
  }
}
