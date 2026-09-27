import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ClientSession, Model, Types } from 'mongoose';
import { NumberingSequence } from '../schemas/numbering-sequence.schema';

@Injectable()
export class NumberingRepository {
  constructor(
    @InjectModel(NumberingSequence.name)
    private readonly model: Model<NumberingSequence>,
  ) {}

  async increment(
    tenantId: Types.ObjectId,
    documentType: string,
    year: number,
    prefix: string,
    padding: number,
    session?: ClientSession,
  ): Promise<NumberingSequence> {
    const updated = await this.model
      .findOneAndUpdate(
        { tenantId, documentType, year },
        {
          $inc: { current: 1 },
          $setOnInsert: { prefix, padding },
        },
        { new: true, upsert: true, session },
      )
      .lean<NumberingSequence>()
      .exec();
    if (!updated) {
      throw new Error('Failed to increment numbering sequence');
    }
    return updated;
  }

  async findAll(tenantId: Types.ObjectId): Promise<NumberingSequence[]> {
    return this.model
      .find({ tenantId })
      .sort({ documentType: 1, year: -1 })
      .lean<NumberingSequence[]>()
      .exec();
  }
}
