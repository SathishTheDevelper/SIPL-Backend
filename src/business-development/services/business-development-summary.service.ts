import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { TenantContext } from '../../common/context/tenant.context';
import { Lead } from '../leads/schemas/lead.schema';
import { OpportunityStatus } from '../opportunities/enums/opportunity.enums';
import { Opportunity } from '../opportunities/schemas/opportunity.schema';
import { QuotationStatus } from '../quotations/enums/quotation-status.enum';
import { Quotation } from '../quotations/schemas/quotation.schema';
import { TenderStatus } from '../tenders/enums/tender-status.enum';
import { Tender } from '../tenders/schemas/tender.schema';

@Injectable()
export class BusinessDevelopmentSummaryService {
  constructor(
    @InjectModel(Lead.name) private readonly leadModel: Model<Lead>,
    @InjectModel(Opportunity.name)
    private readonly opportunityModel: Model<Opportunity>,
    @InjectModel(Tender.name) private readonly tenderModel: Model<Tender>,
    @InjectModel(Quotation.name)
    private readonly quotationModel: Model<Quotation>,
  ) {}

  async summary() {
    const tenantId = new Types.ObjectId(TenantContext.requireTenantId());
    const [
      leadCount,
      openOpportunityCount,
      openTenderCount,
      pendingQuotationCount,
      won,
      lost,
    ] = await Promise.all([
      this.leadModel.countDocuments({ tenantId }).exec(),
      this.opportunityModel
        .countDocuments({ tenantId, status: OpportunityStatus.OPEN })
        .exec(),
      this.tenderModel
        .countDocuments({
          tenantId,
          status: {
            $in: [
              TenderStatus.DRAFT,
              TenderStatus.RECEIVED,
              TenderStatus.IN_PROGRESS,
              TenderStatus.SUBMITTED,
              TenderStatus.UNDER_EVALUATION,
            ],
          },
        })
        .exec(),
      this.quotationModel
        .countDocuments({
          tenantId,
          status: { $in: [QuotationStatus.DRAFT, QuotationStatus.SUBMITTED] },
          isCurrent: true,
        })
        .exec(),
      this.tenderModel
        .countDocuments({ tenantId, status: TenderStatus.WON })
        .exec(),
      this.tenderModel
        .countDocuments({ tenantId, status: TenderStatus.LOST })
        .exec(),
    ]);
    return {
      leadCount,
      openOpportunityCount,
      openTenderCount,
      pendingQuotationCount,
      wonCount: won,
      lostCount: lost,
    };
  }
}
