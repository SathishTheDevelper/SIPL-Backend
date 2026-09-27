import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { TenantsModule } from '../tenants/tenants.module';
import { NumberingController } from './controllers/numbering.controller';
import { NumberingRepository } from './repositories/numbering.repository';
import {
  NumberingSequence,
  NumberingSequenceSchema,
} from './schemas/numbering-sequence.schema';
import { NumberingService } from './services/numbering.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: NumberingSequence.name, schema: NumberingSequenceSchema },
    ]),
    TenantsModule,
  ],
  controllers: [NumberingController],
  providers: [NumberingService, NumberingRepository],
  exports: [NumberingService],
})
export class NumberingModule {}
