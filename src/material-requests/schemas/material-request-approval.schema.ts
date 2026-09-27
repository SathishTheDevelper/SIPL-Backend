import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type MaterialRequestApprovalDocument =
  HydratedDocument<MaterialRequestApproval>;

@Schema({
  timestamps: { createdAt: true, updatedAt: false },
  collection: 'material_request_approvals',
})
export class MaterialRequestApproval {
  _id!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, required: true })
  tenantId!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, required: true })
  materialRequestId!: Types.ObjectId;

  @Prop({ required: true })
  action!: string;

  @Prop({ type: Types.ObjectId, required: true })
  actorUserId!: Types.ObjectId;

  @Prop({ trim: true })
  reason?: string;

  @Prop({ required: true })
  instanceStatus!: string;
}

export const MaterialRequestApprovalSchema = SchemaFactory.createForClass(
  MaterialRequestApproval,
);
MaterialRequestApprovalSchema.index({
  tenantId: 1,
  materialRequestId: 1,
  createdAt: -1,
});
