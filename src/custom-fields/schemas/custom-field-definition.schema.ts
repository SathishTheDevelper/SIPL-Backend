import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema, Types } from 'mongoose';
import { CustomFieldType } from '../enums/field-type.enum';

export type CustomFieldDefinitionDocument =
  HydratedDocument<CustomFieldDefinition>;

@Schema({ _id: false })
export class CustomFieldValidation {
  @Prop()
  min?: number;

  @Prop()
  max?: number;

  @Prop()
  minLength?: number;

  @Prop()
  maxLength?: number;

  @Prop()
  pattern?: string;
}

@Schema({ timestamps: true, collection: 'custom_field_definitions' })
export class CustomFieldDefinition {
  _id!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, required: true, index: true })
  tenantId!: Types.ObjectId;

  @Prop({ required: true, uppercase: true, trim: true })
  module!: string;

  @Prop({ required: true, trim: true })
  key!: string;

  @Prop({ required: true, trim: true })
  label!: string;

  @Prop({ type: String, enum: Object.values(CustomFieldType), required: true })
  fieldType!: CustomFieldType;

  @Prop({ default: false })
  required!: boolean;

  @Prop({ type: [String], default: [] })
  options!: string[];

  @Prop({ type: MongooseSchema.Types.Mixed })
  defaultValue?: unknown;

  @Prop({ type: CustomFieldValidation })
  validation?: CustomFieldValidation;

  @Prop({ default: 0 })
  displayOrder!: number;

  @Prop({ default: true })
  isActive!: boolean;
}

export const CustomFieldDefinitionSchema = SchemaFactory.createForClass(
  CustomFieldDefinition,
);

CustomFieldDefinitionSchema.index(
  { tenantId: 1, module: 1, key: 1 },
  { unique: true },
);
CustomFieldDefinitionSchema.index({ tenantId: 1, module: 1, isActive: 1 });
CustomFieldDefinitionSchema.index({ tenantId: 1, createdAt: -1 });
