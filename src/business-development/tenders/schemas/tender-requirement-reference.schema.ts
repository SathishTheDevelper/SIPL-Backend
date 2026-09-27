import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type TenderRequirementReferenceDocument =
  HydratedDocument<TenderRequirementReference>;

@Schema({ timestamps: true, collection: 'tender_requirement_references' })
export class TenderRequirementReference {
  _id!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, required: true, index: true })
  tenantId!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, required: true, ref: 'Tender' })
  tenderId!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, required: true, ref: 'Requirement' })
  requirementId!: Types.ObjectId;
}

export const TenderRequirementReferenceSchema = SchemaFactory.createForClass(
  TenderRequirementReference,
);
TenderRequirementReferenceSchema.index(
  { tenantId: 1, tenderId: 1, requirementId: 1 },
  { unique: true },
);
