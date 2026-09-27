import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  EntityAttachment,
  EntityAttachmentSchema,
} from './schemas/entity-attachment.schema';
import { AttachmentsService } from './services/attachments.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: EntityAttachment.name, schema: EntityAttachmentSchema },
    ]),
  ],
  providers: [AttachmentsService],
  exports: [AttachmentsService, MongooseModule],
})
export class AttachmentsModule {}
