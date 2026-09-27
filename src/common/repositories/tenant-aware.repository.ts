import { HttpStatus } from '@nestjs/common';
import {
  ClientSession,
  FilterQuery,
  Model,
  ProjectionType,
  QueryOptions,
  Types,
  UpdateQuery,
} from 'mongoose';
import { ErrorCodes } from '../constants/error-codes';
import { TenantContext } from '../context/tenant.context';
import { AppException } from '../exceptions/app.exception';

export abstract class TenantAwareRepository<T> {
  constructor(protected readonly model: Model<T>) {}

  protected getTenantObjectId(): Types.ObjectId {
    const tenantId = TenantContext.getTenantId();
    if (!tenantId) {
      throw new AppException(
        HttpStatus.FORBIDDEN,
        'Tenant context is required',
        ErrorCodes.TENANT_CONTEXT_REQUIRED,
      );
    }
    return new Types.ObjectId(tenantId);
  }

  protected scoped(filter: FilterQuery<T> = {}): FilterQuery<T> {
    return {
      ...filter,
      tenantId: this.getTenantObjectId(),
    };
  }

  async findById(
    id: string,
    projection?: ProjectionType<T>,
  ): Promise<T | null> {
    return this.model
      .findOne(this.scoped({ _id: id }), projection)
      .lean<T>()
      .exec();
  }

  async findByIdOrThrow(
    id: string,
    projection?: ProjectionType<T>,
  ): Promise<T> {
    const document = await this.findById(id, projection);
    if (!document) {
      throw new AppException(
        HttpStatus.NOT_FOUND,
        'Resource not found',
        ErrorCodes.NOT_FOUND,
      );
    }
    return document;
  }

  async findMany(
    filter: FilterQuery<T> = {},
    options: QueryOptions<T> = {},
    projection?: ProjectionType<T>,
  ): Promise<T[]> {
    return this.model
      .find(this.scoped(filter), projection, options)
      .lean<T[]>()
      .exec();
  }

  async count(filter: FilterQuery<T> = {}): Promise<number> {
    return this.model.countDocuments(this.scoped(filter)).exec();
  }

  async create(payload: Partial<T>, session?: ClientSession): Promise<T> {
    const [created] = await this.model.create(
      [
        {
          ...payload,
          tenantId: this.getTenantObjectId(),
        },
      ],
      session ? { session } : undefined,
    );
    return created.toObject() as T;
  }

  async updateById(id: string, update: UpdateQuery<T>): Promise<T> {
    const updated = await this.model
      .findOneAndUpdate(this.scoped({ _id: id }), update, { new: true })
      .lean<T>()
      .exec();
    if (!updated) {
      throw new AppException(
        HttpStatus.NOT_FOUND,
        'Resource not found',
        ErrorCodes.NOT_FOUND,
      );
    }
    return updated;
  }

  async updateMany(
    filter: FilterQuery<T>,
    update: UpdateQuery<T>,
  ): Promise<number> {
    const result = await this.model
      .updateMany(this.scoped(filter), update)
      .exec();
    return result.modifiedCount;
  }

  async softDeleteById(id: string): Promise<T> {
    return this.updateById(id, {
      $set: { status: 'INACTIVE', deletedAt: new Date() },
    });
  }
}
