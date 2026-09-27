import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema, Types } from 'mongoose';

@Schema({ collection: 'purchase_approvals', timestamps: true })
export class PurchaseApprovalSource {
  _id!: Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, required: true })
  tenantId!: Types.ObjectId;

  @Prop({ required: true, trim: true })
  status!: string;

  @Prop({ type: MongooseSchema.Types.ObjectId, required: true })
  procurementRequestId!: Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, required: true })
  comparisonStatementId!: Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, required: true })
  vendorSelectionId!: Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, required: true })
  projectId!: Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, required: true })
  siteId!: Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, required: true })
  vendorId!: Types.ObjectId;
}

export type PurchaseApprovalSourceDocument =
  HydratedDocument<PurchaseApprovalSource>;
export const PurchaseApprovalSourceSchema = SchemaFactory.createForClass(
  PurchaseApprovalSource,
);
PurchaseApprovalSourceSchema.index({ tenantId: 1, status: 1 });

@Schema({ collection: 'vendor_selections', timestamps: true })
export class VendorSelectionSource {
  _id!: Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, required: true })
  tenantId!: Types.ObjectId;

  @Prop({ required: true, trim: true })
  status!: string;

  @Prop({ type: MongooseSchema.Types.ObjectId, required: true })
  vendorId!: Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, required: true })
  projectId!: Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, required: true })
  siteId!: Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, required: true })
  procurementRequestId!: Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, required: true })
  comparisonStatementId!: Types.ObjectId;
}

export const VendorSelectionSourceSchema = SchemaFactory.createForClass(
  VendorSelectionSource,
);

@Schema({ collection: 'vendor_selection_items', timestamps: true })
export class VendorSelectionItemSource {
  _id!: Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, required: true })
  tenantId!: Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, required: true })
  vendorSelectionId!: Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, required: true })
  materialId!: Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId })
  boqItemId?: Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId })
  rfqItemId?: Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId })
  vendorQuotationItemId?: Types.ObjectId;

  @Prop({ trim: true })
  description?: string;

  @Prop({ required: true, min: 0 })
  quantity!: number;

  @Prop({ type: MongooseSchema.Types.ObjectId, required: true })
  unitId!: Types.ObjectId;

  @Prop({ required: true, min: 0 })
  unitRate!: number;

  @Prop({ min: 0, default: 0 })
  discount?: number;

  @Prop({ min: 0, default: 0 })
  taxRate?: number;
}

export const VendorSelectionItemSourceSchema = SchemaFactory.createForClass(
  VendorSelectionItemSource,
);
VendorSelectionItemSourceSchema.index({ tenantId: 1, vendorSelectionId: 1 });

@Schema({ collection: 'procurement_requests', timestamps: true })
export class ProcurementRequestSource {
  _id!: Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, required: true })
  tenantId!: Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, required: true })
  projectId!: Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, required: true })
  siteId!: Types.ObjectId;

  @Prop({ required: true, trim: true })
  status!: string;
}

export const ProcurementRequestSourceSchema = SchemaFactory.createForClass(
  ProcurementRequestSource,
);

@Schema({ collection: 'comparison_statements', timestamps: true })
export class ComparisonStatementSource {
  _id!: Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, required: true })
  tenantId!: Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, required: true })
  procurementRequestId!: Types.ObjectId;
}

export const ComparisonStatementSourceSchema = SchemaFactory.createForClass(
  ComparisonStatementSource,
);

@Schema({ collection: 'vendors', timestamps: true })
export class VendorSource {
  _id!: Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, required: true })
  tenantId!: Types.ObjectId;

  @Prop({ required: true, trim: true })
  name!: string;

  @Prop({ trim: true, default: 'ACTIVE' })
  status?: string;
}

export const VendorSourceSchema = SchemaFactory.createForClass(VendorSource);
VendorSourceSchema.index({ tenantId: 1, name: 1 });
