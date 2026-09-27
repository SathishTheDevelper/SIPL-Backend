import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type RoleDocument = HydratedDocument<Role>;

@Schema({ timestamps: true, collection: 'roles' })
export class Role {
  _id!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, default: null, index: true })
  tenantId!: Types.ObjectId | null;

  @Prop({ required: true, uppercase: true, trim: true })
  code!: string;

  @Prop({ required: true, trim: true })
  name!: string;

  @Prop({ trim: true })
  description?: string;

  @Prop({ type: [String], default: [] })
  permissions!: string[];

  @Prop({ default: false })
  isSystem!: boolean;

  @Prop({ default: true })
  isActive!: boolean;
}

export const RoleSchema = SchemaFactory.createForClass(Role);

RoleSchema.index({ tenantId: 1, code: 1 }, { unique: true });
RoleSchema.index({ tenantId: 1, isActive: 1 });
