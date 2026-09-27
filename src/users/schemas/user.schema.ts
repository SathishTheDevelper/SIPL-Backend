import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema, Types } from 'mongoose';
import { UserStatus } from '../enums/user-status.enum';

export type UserDocument = HydratedDocument<User>;

@Schema({ timestamps: true, collection: 'users' })
export class User {
  _id!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, default: null, index: true })
  tenantId!: Types.ObjectId | null;

  @Prop({ required: true, lowercase: true, trim: true })
  email!: string;

  @Prop({ required: true, select: false })
  passwordHash!: string;

  @Prop({ required: true, trim: true })
  firstName!: string;

  @Prop({ required: true, trim: true })
  lastName!: string;

  @Prop({ trim: true })
  phone?: string;

  @Prop({ type: Types.ObjectId, required: true, ref: 'Role' })
  roleId!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  managerUserId?: Types.ObjectId;

  @Prop({ required: true, trim: true })
  role!: string;

  @Prop({ type: [String], default: [] })
  permissions!: string[];

  @Prop({
    type: String,
    enum: Object.values(UserStatus),
    default: UserStatus.ACTIVE,
  })
  status!: UserStatus;

  @Prop({ type: Date })
  lastLoginAt?: Date;

  @Prop({ type: Date })
  passwordChangedAt?: Date;

  @Prop({ default: 0 })
  failedLoginAttempts!: number;

  @Prop({ type: Date })
  lockedUntil?: Date;

  @Prop({ type: Map, of: MongooseSchema.Types.Mixed, default: {} })
  customFields?: Map<string, unknown>;

  @Prop({ type: Date })
  deletedAt?: Date;
}

export const UserSchema = SchemaFactory.createForClass(User);

UserSchema.index({ tenantId: 1, email: 1 }, { unique: true });
UserSchema.index({ tenantId: 1, status: 1 });
UserSchema.index({ tenantId: 1, createdAt: -1 });
UserSchema.index({ tenantId: 1, roleId: 1 });
UserSchema.index({ tenantId: 1, role: 1 });
