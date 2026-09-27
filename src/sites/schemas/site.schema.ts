import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { SiteStatus } from '../enums/site-status.enum';

export type SiteDocument = HydratedDocument<Site>;

@Schema({ timestamps: true, collection: 'sites' })
export class Site {
  _id!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, required: true, index: true })
  tenantId!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, required: true, ref: 'Project' })
  projectId!: Types.ObjectId;

  @Prop({ required: true, trim: true })
  name!: string;

  @Prop({ required: true, trim: true, uppercase: true })
  code!: string;

  @Prop({ trim: true })
  address?: string;

  @Prop({ trim: true })
  city?: string;

  @Prop({ trim: true })
  state?: string;

  @Prop({ trim: true })
  pincode?: string;

  @Prop({ required: true, min: -90, max: 90 })
  latitude!: number;

  @Prop({ required: true, min: -180, max: 180 })
  longitude!: number;

  @Prop({ required: true, min: 1 })
  geofenceRadius!: number;

  location?: { type: 'Point'; coordinates: number[] };

  @Prop({
    type: String,
    enum: Object.values(SiteStatus),
    default: SiteStatus.DRAFT,
  })
  status!: SiteStatus;

  @Prop({ type: Object, default: {} })
  customFields?: Record<string, unknown>;

  @Prop({ type: Types.ObjectId, required: true })
  createdBy!: Types.ObjectId;

  @Prop({ type: Types.ObjectId })
  updatedBy?: Types.ObjectId;
}

export const SiteSchema = SchemaFactory.createForClass(Site);
SiteSchema.add({
  location: {
    type: { type: String, enum: ['Point'] },
    coordinates: { type: [Number] },
  },
});
SiteSchema.index({ tenantId: 1, projectId: 1, code: 1 }, { unique: true });
SiteSchema.index({ tenantId: 1, status: 1 });
SiteSchema.index({ location: '2dsphere' });
