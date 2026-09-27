import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PermissionCode } from '../../common/constants/permissions';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { BusinessDevelopmentSummaryService } from '../services/business-development-summary.service';

@ApiTags('Leads')
@ApiBearerAuth()
@Controller('business-development')
export class BusinessDevelopmentController {
  constructor(
    private readonly summaryService: BusinessDevelopmentSummaryService,
  ) {}

  @Get('summary')
  @RequirePermissions(PermissionCode.LEADS_READ)
  @ApiOperation({ summary: 'Tenant-scoped business development counters' })
  summary() {
    return this.summaryService.summary();
  }
}
