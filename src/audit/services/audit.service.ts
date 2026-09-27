import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { FilterQuery, Model, Types } from 'mongoose';
import { TenantContext } from '../../common/context/tenant.context';
import { paginated, skipTake } from '../../common/utils/pagination.util';
import { ListAuditLogsDto } from '../dto/list-audit-logs.dto';
import { AuditLog } from '../schemas/audit-log.schema';

export interface RecordAuditInput {
  action: string;
  module: string;
  entityType: string;
  entityId?: string;
  before?: unknown;
  after?: unknown;
  ip?: string;
  userAgent?: string;
  tenantId?: string | null;
  userId?: string | null;
}

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(
    @InjectModel(AuditLog.name) private readonly model: Model<AuditLog>,
  ) {}

  async record(input: RecordAuditInput): Promise<void> {
    const tenantId =
      input.tenantId === undefined
        ? TenantContext.getTenantId()
        : input.tenantId;
    const userId =
      input.userId === undefined ? TenantContext.getUserId() : input.userId;
    try {
      await this.model.create({
        tenantId: tenantId ? new Types.ObjectId(tenantId) : null,
        userId: userId ? new Types.ObjectId(userId) : null,
        action: input.action,
        module: input.module,
        entityType: input.entityType,
        entityId: input.entityId,
        before: input.before,
        after: input.after,
        ip: input.ip,
        userAgent: input.userAgent,
        timestamp: new Date(),
      });
    } catch (error) {
      this.logger.error(
        `Failed to write audit log for ${input.action} ${input.entityType}`,
        error instanceof Error ? error.stack : undefined,
      );
    }
  }

  async findAll(query: ListAuditLogsDto) {
    const tenantId = TenantContext.getTenantId();
    const filter: FilterQuery<AuditLog> = {
      tenantId: tenantId ? new Types.ObjectId(tenantId) : null,
    };
    if (query.module) filter.module = query.module;
    if (query.entityType) filter.entityType = query.entityType;
    if (query.entityId) filter.entityId = query.entityId;
    if (query.action) filter.action = query.action;
    if (query.q) {
      filter.$or = [
        { entityId: { $regex: query.q, $options: 'i' } },
        { module: { $regex: query.q, $options: 'i' } },
      ];
    }
    const { skip, limit } = skipTake(query.page, query.limit);
    const [items, total] = await Promise.all([
      this.model
        .find(filter)
        .sort({ timestamp: -1 })
        .skip(skip)
        .limit(limit)
        .lean<AuditLog[]>()
        .exec(),
      this.model.countDocuments(filter).exec(),
    ]);
    return paginated(items, total, query.page, query.limit);
  }

  async findById(id: string): Promise<AuditLog | null> {
    const tenantId = TenantContext.getTenantId();
    return this.model
      .findOne({
        _id: id,
        tenantId: tenantId ? new Types.ObjectId(tenantId) : null,
      })
      .lean<AuditLog>()
      .exec();
  }
}
