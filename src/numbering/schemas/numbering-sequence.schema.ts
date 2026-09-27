import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type NumberingSequenceDocument = HydratedDocument<NumberingSequence>;

@Schema({ timestamps: true, collection: 'numbering_sequences' })
export class NumberingSequence {
  _id!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, required: true, index: true })
  tenantId!: Types.ObjectId;

  @Prop({ required: true, uppercase: true, trim: true })
  documentType!: string;

  @Prop({ required: true })
  year!: number;

  @Prop({ required: true, trim: true })
  prefix!: string;

  @Prop({ required: true, min: 1, max: 12 })
  padding!: number;

  @Prop({ required: true, min: 0, default: 0 })
  current!: number;
}

export const NumberingSequenceSchema =
  SchemaFactory.createForClass(NumberingSequence);

NumberingSequenceSchema.index(
  { tenantId: 1, documentType: 1, year: 1 },
  { unique: true },
);
