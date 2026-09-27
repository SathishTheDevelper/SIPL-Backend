import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { TenantStatus } from '../enums/tenant-status.enum';

export type TenantDocument = HydratedDocument<Tenant>;

@Schema({ _id: false })
export class Address {
  @Prop({ required: true, trim: true })
  line1!: string;

  @Prop({ trim: true })
  line2?: string;

  @Prop({ required: true, trim: true })
  city!: string;

  @Prop({ required: true, trim: true })
  state!: string;

  @Prop({ required: true, trim: true })
  country!: string;

  @Prop({ required: true, trim: true })
  postalCode!: string;
}

@Schema({ _id: false })
export class NumberingConfig {
  @Prop({ required: true, trim: true })
  prefix!: string;

  @Prop({ required: true, min: 1, max: 12, default: 5 })
  padding!: number;

  @Prop({ default: true })
  includeYear!: boolean;
}

@Schema({ _id: false })
export class TenantNumbering {
  @Prop({ type: NumberingConfig })
  lead?: NumberingConfig;

  @Prop({ type: NumberingConfig })
  opportunity?: NumberingConfig;

  @Prop({ type: NumberingConfig })
  tender?: NumberingConfig;

  @Prop({ type: NumberingConfig })
  project?: NumberingConfig;

  @Prop({ type: NumberingConfig })
  materialRequest?: NumberingConfig;

  @Prop({ type: NumberingConfig })
  boq?: NumberingConfig;

  @Prop({ type: NumberingConfig })
  employee?: NumberingConfig;

  @Prop({ type: NumberingConfig })
  rfq?: NumberingConfig;

  @Prop({ type: NumberingConfig })
  quotation?: NumberingConfig;

  @Prop({ type: NumberingConfig })
  purchaseOrder?: NumberingConfig;

  @Prop({ type: NumberingConfig })
  delivery?: NumberingConfig;

  @Prop({ type: NumberingConfig })
  grn?: NumberingConfig;

  @Prop({ type: NumberingConfig })
  invoice?: NumberingConfig;

  @Prop({ type: NumberingConfig })
  payment?: NumberingConfig;
}

@Schema({ _id: false })
export class PoApprovalLimit {
  @Prop({ required: true, trim: true })
  roleCode!: string;

  @Prop({ required: true, min: 0 })
  maxAmount!: number;
}

@Schema({ _id: false })
export class TenantSettings {
  @Prop({ required: true, min: 1, default: 100 })
  geofenceRadiusMeters!: number;

  @Prop({ required: true, default: 'Asia/Kolkata' })
  timezone!: string;

  @Prop({ required: true, default: 'INR' })
  currency!: string;

  @Prop({ required: true, min: 1, max: 12, default: 4 })
  financialYearStartMonth!: number;

  @Prop({ required: true, min: 0, default: 0 })
  invoiceTolerancePercent!: number;

  @Prop({ required: true, min: 0, default: 0 })
  invoiceToleranceAmount!: number;

  @Prop({ required: true, default: true })
  gstEnabled!: boolean;

  @Prop({ required: true, min: 0, default: 18 })
  defaultGstPercent!: number;

  @Prop({ required: true, min: 0, default: 30 })
  defaultPaymentTermsDays!: number;

  @Prop({ type: [Number], default: [1, 2, 3, 4, 5] })
  workingDays!: number[];

  @Prop({ required: true, default: '09:00' })
  workingStartTime!: string;

  @Prop({ required: true, default: '18:00' })
  workingEndTime!: string;

  @Prop({ type: Object, default: {} })
  slaHoursByModule!: Record<string, number>;

  @Prop({ type: [PoApprovalLimit], default: [] })
  poApprovalLimits!: PoApprovalLimit[];

  @Prop({ type: [Object], default: [] })
  approvalHierarchy!: Record<string, unknown>[];

  @Prop({ type: TenantNumbering, default: {} })
  numbering!: TenantNumbering;

  @Prop({ type: Object, default: {} })
  notificationRecipients!: Record<string, string[]>;

  @Prop({ min: 0 })
  overReceiptTolerancePercent?: number;

  @Prop({ default: false })
  allowPartialPoCancel!: boolean;

  @Prop()
  holidayCalendarId?: string;
}

@Schema({ _id: false })
export class TenantSubscription {
  @Prop({ required: true, default: 'standard' })
  plan!: string;

  @Prop({ required: true, min: 1, default: 50 })
  maxUsers!: number;

  @Prop({ required: true, min: 1, default: 20 })
  maxProjects!: number;

  @Prop({ required: true, min: 1, default: 50 })
  maxSites!: number;

  @Prop({ type: Date })
  startsAt?: Date;

  @Prop({ type: Date })
  endsAt?: Date;

  @Prop({ required: true, default: TenantStatus.ACTIVE })
  status!: string;
}

@Schema({ timestamps: true, collection: 'tenants' })
export class Tenant {
  _id!: Types.ObjectId;

  @Prop({ required: true, trim: true })
  name!: string;

  @Prop({ required: true, uppercase: true, trim: true })
  code!: string;

  @Prop({ required: true, trim: true })
  legalName!: string;

  @Prop({ trim: true })
  gstNumber?: string;

  @Prop({ trim: true })
  panNumber?: string;

  @Prop({ type: Address, required: true })
  address!: Address;

  @Prop({ required: true, trim: true })
  phone!: string;

  @Prop({ required: true, lowercase: true, trim: true })
  email!: string;

  @Prop({
    type: String,
    enum: Object.values(TenantStatus),
    default: TenantStatus.TRIAL,
  })
  status!: TenantStatus;

  @Prop({ type: TenantSettings, required: true })
  settings!: TenantSettings;

  @Prop({ type: TenantSubscription, required: true })
  subscription!: TenantSubscription;
}

export const TenantSchema = SchemaFactory.createForClass(Tenant);

TenantSchema.index({ code: 1 }, { unique: true });
TenantSchema.index({ status: 1 });
TenantSchema.index({ createdAt: -1 });
TenantSchema.index({ email: 1 });
