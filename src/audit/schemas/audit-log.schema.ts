import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema, Types } from 'mongoose';

export type AuditLogDocument = HydratedDocument<AuditLog>;

@Schema({
  timestamps: { createdAt: true, updatedAt: false },
  collection: 'audit_logs',
  versionKey: false,
})
export class AuditLog {
  _id!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, default: null, index: true })
  tenantId!: Types.ObjectId | null;

  @Prop({ type: Types.ObjectId, default: null })
  userId?: Types.ObjectId | null;

  @Prop({ required: true, trim: true })
  action!: string;

  @Prop({ required: true, trim: true })
  module!: string;

  @Prop({ required: true, trim: true })
  entityType!: string;

  @Prop({ trim: true })
  entityId?: string;

  @Prop({ type: MongooseSchema.Types.Mixed })
  before?: unknown;

  @Prop({ type: MongooseSchema.Types.Mixed })
  after?: unknown;

  @Prop({ trim: true })
  ip?: string;

  @Prop({ trim: true })
  userAgent?: string;

  @Prop({ type: Date, default: Date.now })
  timestamp!: Date;
}

export const AuditLogSchema = SchemaFactory.createForClass(AuditLog);

AuditLogSchema.index({ tenantId: 1, createdAt: -1 });
AuditLogSchema.index({ tenantId: 1, entityType: 1, entityId: 1 });
AuditLogSchema.index({ tenantId: 1, action: 1, createdAt: -1 });
AuditLogSchema.index({ tenantId: 1, module: 1, createdAt: -1 });

AuditLogSchema.pre(
  ['updateOne', 'updateMany', 'findOneAndUpdate', 'deleteOne', 'deleteMany'],
  function denyMutation() {
    throw new Error('Audit logs are immutable');
  },
);
