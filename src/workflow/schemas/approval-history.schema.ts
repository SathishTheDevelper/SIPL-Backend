import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema, Types } from 'mongoose';

export type ApprovalHistoryDocument = HydratedDocument<ApprovalHistory>;

@Schema({ timestamps: true, collection: 'approval_histories' })
export class ApprovalHistory {
  _id!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, required: true, index: true })
  tenantId!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, required: true })
  instanceId!: Types.ObjectId;

  @Prop({ required: true, trim: true })
  entityType!: string;

  @Prop({ required: true, trim: true })
  entityId!: string;

  @Prop({ required: true, trim: true })
  action!: string;

  @Prop({ type: Types.ObjectId, required: true })
  actorUserId!: Types.ObjectId;

  @Prop({ trim: true })
  actorRole?: string;

  @Prop({ trim: true })
  fromStatus?: string;

  @Prop({ trim: true })
  toStatus?: string;

  @Prop({ trim: true })
  reason?: string;

  @Prop({ type: MongooseSchema.Types.Mixed })
  snapshot?: Record<string, unknown>;

  @Prop({ type: Date, default: Date.now })
  timestamp!: Date;
}

export const ApprovalHistorySchema =
  SchemaFactory.createForClass(ApprovalHistory);

ApprovalHistorySchema.index({ tenantId: 1, entityType: 1, entityId: 1 });
ApprovalHistorySchema.index({ tenantId: 1, instanceId: 1, createdAt: -1 });
