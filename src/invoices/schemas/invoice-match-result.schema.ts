import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema, Types } from 'mongoose';
import { InvoiceMatchStatus } from '../enums/invoice-match-status.enum';
import {
  MatchIssue,
  MatchLineResult,
  MatchSummary,
  ToleranceApplied,
} from '../interfaces/invoice-match-result.interface';

export type InvoiceMatchResultDocument = HydratedDocument<InvoiceMatchResult>;

@Schema({ timestamps: true, collection: 'invoice_match_results' })
export class InvoiceMatchResult {
  _id!: Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, required: true })
  tenantId!: Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, required: true })
  invoiceId!: Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, required: true })
  purchaseOrderId!: Types.ObjectId;

  @Prop({ type: [MongooseSchema.Types.ObjectId], default: [] })
  grnIds!: Types.ObjectId[];

  @Prop({
    type: String,
    enum: [InvoiceMatchStatus.MATCH, InvoiceMatchStatus.MISMATCH],
    required: true,
  })
  matchStatus!: InvoiceMatchStatus.MATCH | InvoiceMatchStatus.MISMATCH;

  @Prop({ required: true })
  matchedAt!: Date;

  @Prop({ type: MongooseSchema.Types.ObjectId, required: true })
  matchedBy!: Types.ObjectId;

  @Prop({ required: true })
  poTotalAmount!: number;

  @Prop({ required: true })
  invoiceTotalAmount!: number;

  @Prop({ required: true })
  receivedTotalAmount!: number;

  @Prop({ required: true })
  quantityVariance!: number;

  @Prop({ required: true })
  amountVariance!: number;

  @Prop({ type: Object, required: true })
  toleranceApplied!: ToleranceApplied;

  @Prop({ type: [Object], default: [] })
  lineResults!: MatchLineResult[];

  @Prop({ type: [Object], default: [] })
  issues!: MatchIssue[];

  @Prop({ type: Object, required: true })
  summary!: MatchSummary;

  @Prop({ required: true })
  quantityMatched!: boolean;

  @Prop({ required: true })
  amountMatched!: boolean;

  createdAt!: Date;
  updatedAt!: Date;
}

export const InvoiceMatchResultSchema =
  SchemaFactory.createForClass(InvoiceMatchResult);

InvoiceMatchResultSchema.index({ tenantId: 1, invoiceId: 1, createdAt: -1 });
InvoiceMatchResultSchema.index({ tenantId: 1, purchaseOrderId: 1 });
