import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { MaterialRequestStatus } from '../enums/material-request.enums';
import { MaterialRequestItem } from '../schemas/material-request-item.schema';

@Injectable()
export class MaterialRequestQuantityService {
  constructor(
    @InjectModel(MaterialRequestItem.name)
    private readonly items: Model<MaterialRequestItem>,
  ) {}

  async getPreviouslyApprovedQuantity(
    tenantId: Types.ObjectId,
    projectId: Types.ObjectId,
    boqItemId: Types.ObjectId,
  ): Promise<number> {
    const quantities = await this.getPreviouslyApprovedQuantities(
      tenantId,
      projectId,
      [boqItemId],
    );
    return quantities.get(boqItemId.toString()) ?? 0;
  }

  async getPreviouslyApprovedQuantities(
    tenantId: Types.ObjectId,
    projectId: Types.ObjectId,
    boqItemIds: Types.ObjectId[],
    excludeRequestId?: Types.ObjectId,
  ): Promise<Map<string, number>> {
    if (boqItemIds.length === 0) return new Map();
    const requestMatch: Record<string, unknown> = {
      'request.tenantId': tenantId,
      'request.projectId': projectId,
      'request.status': MaterialRequestStatus.APPROVED,
    };
    if (excludeRequestId)
      requestMatch['request._id'] = { $ne: excludeRequestId };
    const rows = await this.items
      .aggregate<{ _id: Types.ObjectId; quantity: number }>([
        {
          $match: {
            tenantId,
            projectId,
            boqItemId: { $in: boqItemIds },
          },
        },
        {
          $lookup: {
            from: 'material_requests',
            localField: 'materialRequestId',
            foreignField: '_id',
            as: 'request',
          },
        },
        { $unwind: '$request' },
        { $match: requestMatch },
        {
          $group: {
            _id: '$boqItemId',
            quantity: { $sum: '$currentRequestQuantity' },
          },
        },
      ])
      .exec();
    return new Map(rows.map((row) => [row._id.toString(), row.quantity]));
  }
}
