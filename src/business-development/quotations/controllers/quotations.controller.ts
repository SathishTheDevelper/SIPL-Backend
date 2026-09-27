import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { AuthenticatedUser } from '../../../auth/interfaces/authenticated-user.interface';
import { PermissionCode } from '../../../common/constants/permissions';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../../common/decorators/permissions.decorator';
import { ParseObjectIdPipe } from '../../../common/pipes/parse-object-id.pipe';
import { RecordClientDecisionDto } from '../../client-decisions/dto/client-decision.dto';
import { ClientDecisionsService } from '../../client-decisions/services/client-decisions.service';
import { UpdateQuotationDto } from '../dto/quotation.dto';
import { QuotationsService } from '../services/quotations.service';

@ApiTags('Quotations')
@ApiBearerAuth()
@Controller('quotations')
export class QuotationsController {
  constructor(
    private readonly quotationsService: QuotationsService,
    private readonly clientDecisionsService: ClientDecisionsService,
  ) {}

  @Get(':id')
  @RequirePermissions(PermissionCode.QUOTATIONS_READ)
  @ApiOperation({ summary: 'Get a quotation. Cross-tenant ids return 404.' })
  findOne(@Param('id', ParseObjectIdPipe) id: string) {
    return this.quotationsService.findById(id);
  }

  @Patch(':id')
  @RequirePermissions(PermissionCode.QUOTATIONS_UPDATE)
  @ApiOperation({
    summary: 'Update a draft quotation. Totals are recalculated.',
  })
  update(
    @Param('id', ParseObjectIdPipe) id: string,
    @Body() dto: UpdateQuotationDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.quotationsService.update(id, dto, user);
  }

  @Post(':id/submit')
  @RequirePermissions(PermissionCode.QUOTATIONS_UPDATE)
  @ApiOperation({ summary: 'Submit a quotation' })
  submit(
    @Param('id', ParseObjectIdPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.quotationsService.submit(id, user);
  }

  @Post(':id/revise')
  @RequirePermissions(PermissionCode.QUOTATIONS_UPDATE)
  @ApiOperation({
    summary:
      'Create a new quotation version. Historical versions are preserved.',
  })
  revise(
    @Param('id', ParseObjectIdPipe) id: string,
    @Body() dto: UpdateQuotationDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.quotationsService.revise(id, dto, user);
  }

  @Post(':id/cancel')
  @RequirePermissions(PermissionCode.QUOTATIONS_UPDATE)
  @ApiOperation({ summary: 'Cancel a quotation' })
  cancel(
    @Param('id', ParseObjectIdPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.quotationsService.cancel(id, user);
  }

  @Post(':quotationId/client-decision')
  @RequirePermissions(PermissionCode.CLIENT_DECISIONS_CREATE)
  @ApiOperation({
    summary:
      'Record WIN or LOSE. WIN creates a project in a MongoDB transaction.',
  })
  recordDecision(
    @Param('quotationId', ParseObjectIdPipe) quotationId: string,
    @Body() dto: RecordClientDecisionDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.clientDecisionsService.record(quotationId, dto, user);
  }
}
