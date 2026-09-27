import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ClientSession, Model, Types } from 'mongoose';
import { TenantContext } from '../../common/context/tenant.context';
import { AttachmentMetaDto } from '../dto/attachment.dto';
import { EntityAttachment } from '../schemas/entity-attachment.schema';

@Injectable()
export class AttachmentsService {
  constructor(
    @InjectModel(EntityAttachment.name)
    private readonly attachments: Model<EntityAttachment>,
  ) {}

  async record(
    entityType: string,
    entityId: Types.ObjectId,
    rows: AttachmentMetaDto[] | undefined,
    userId: string,
    session?: ClientSession,
  ): Promise<Types.ObjectId[]> {
    if (!rows?.length) return [];
    const tenantId = new Types.ObjectId(TenantContext.requireTenantId());
    const created = await this.attachments.insertMany(
      rows.map((row) => ({
        tenantId,
        entityType,
        entityId,
        fileName: row.fileName,
        mimeType: row.mimeType,
        size: row.size,
        storageKey: row.storageKey,
        uploadedBy: new Types.ObjectId(userId),
      })),
      session ? { session } : undefined,
    );
    return created.map((row) => row._id);
  }
}
