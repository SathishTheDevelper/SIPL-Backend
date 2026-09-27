import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ClientSession, Model, Types } from 'mongoose';
import { GrnStatus } from '../enums/grn.enums';
import { GrnItem } from '../schemas/grn-item.schema';

@Injectable()
export class GrnQuantityService {
  constructor(
    @InjectModel(GrnItem.name) private readonly items: Model<GrnItem>,
  ) {}

  async getReceivedQuantities(
    tenantId: Types.ObjectId,
    purchaseOrderId: Types.ObjectId,
    purchaseOrderItemIds: Types.ObjectId[],
    session?: ClientSession,
  ): Promise<Map<string, number>> {
    if (purchaseOrderItemIds.length === 0) return new Map();
    const pipeline = this.items.aggregate<{
      _id: Types.ObjectId;
      quantity: number;
    }>([
      {
        $match: {
          tenantId,
          purchaseOrderItemId: { $in: purchaseOrderItemIds },
        },
      },
      {
        $lookup: {
          from: 'grns',
          localField: 'grnId',
          foreignField: '_id',
          as: 'grn',
        },
      },
      { $unwind: '$grn' },
      {
        $match: {
          'grn.tenantId': tenantId,
          'grn.purchaseOrderId': purchaseOrderId,
          'grn.status': GrnStatus.APPROVED,
        },
      },
      {
        $group: {
          _id: '$purchaseOrderItemId',
          quantity: { $sum: '$acceptedQuantity' },
        },
      },
    ]);
    if (session) pipeline.session(session);
    const rows = await pipeline.exec();
    return new Map(rows.map((row) => [row._id.toString(), row.quantity]));
  }
}
