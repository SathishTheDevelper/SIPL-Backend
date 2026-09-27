import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { AuthenticatedUser } from '../../auth/interfaces/authenticated-user.interface';
import { PermissionCode } from '../../common/constants/permissions';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { ParseObjectIdPipe } from '../../common/pipes/parse-object-id.pipe';
import {
  CreateGrnDto,
  CreateGrnItemDto,
  GrnReasonDto,
  UpdateGrnDto,
} from '../dto/grn.dto';
import { GrnService } from '../services/grn.service';

@ApiTags('GRN')
@ApiBearerAuth()
@Controller()
export class GrnController {
  constructor(private readonly grnService: GrnService) {}

  @Get('grn/summary')
  @RequirePermissions(PermissionCode.GRN_READ)
  @ApiOperation({
    summary:
      'GRN summary: pending, approved, rejected, partial receipts, and completed receipts',
  })
  summary() {
    return this.grnService.summary();
  }

  @Post('purchase-orders/:poId/grns')
  @RequirePermissions(PermissionCode.GRN_CREATE)
  @ApiOperation({
    summary:
      'Create a draft GRN for a delivered purchase order. Site and vendor are taken from the PO. Previously received quantity is calculated from approved GRNs.',
  })
  create(
    @Param('poId', ParseObjectIdPipe) poId: string,
    @Body() dto: CreateGrnDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.grnService.create(poId, dto, user);
  }

  @Get('purchase-orders/:poId/grns')
  @RequirePermissions(PermissionCode.GRN_READ)
  @ApiOperation({
    summary: 'List GRNs for a purchase order. One PO can have many GRNs.',
  })
  list(@Param('poId', ParseObjectIdPipe) poId: string) {
    return this.grnService.listForPurchaseOrder(poId);
  }

  @Get('grns/:id')
  @RequirePermissions(PermissionCode.GRN_READ)
  @ApiOperation({ summary: 'Get a GRN. Cross-tenant ids return 404.' })
  get(@Param('id', ParseObjectIdPipe) id: string) {
    return this.grnService.get(id);
  }

  @Patch('grns/:id')
  @RequirePermissions(PermissionCode.GRN_UPDATE)
  @ApiOperation({ summary: 'Update a draft GRN' })
  update(
    @Param('id', ParseObjectIdPipe) id: string,
    @Body() dto: UpdateGrnDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.grnService.update(id, dto, user);
  }

  @Post('grns/:id/submit')
  @RequirePermissions(PermissionCode.GRN_UPDATE)
  @ApiOperation({
    summary: 'Submit a GRN and start the configured approval workflow',
  })
  submit(
    @Param('id', ParseObjectIdPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.grnService.submit(id, user);
  }

  @Post('grns/:id/approve')
  @RequirePermissions(PermissionCode.GRN_UPDATE)
  @ApiOperation({
    summary:
      'Approve the current workflow step. Accepted quantity updates PO received quantity only after the workflow outcome.',
  })
  approve(
    @Param('id', ParseObjectIdPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.grnService.approve(id, user);
  }

  @Post('grns/:id/reject')
  @RequirePermissions(PermissionCode.GRN_UPDATE)
  @ApiOperation({
    summary:
      'Reject a submitted GRN. Reason is required. Rejected GRNs do not change PO received quantity.',
  })
  reject(
    @Param('id', ParseObjectIdPipe) id: string,
    @Body() dto: GrnReasonDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.grnService.reject(id, dto, user);
  }

  @Post('grns/:id/cancel')
  @RequirePermissions(PermissionCode.GRN_UPDATE)
  @ApiOperation({ summary: 'Cancel a draft GRN. Reason is required.' })
  cancel(
    @Param('id', ParseObjectIdPipe) id: string,
    @Body() dto: GrnReasonDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.grnService.cancel(id, dto, user);
  }

  @Get('grns/:id/items')
  @RequirePermissions(PermissionCode.GRN_READ)
  @ApiOperation({ summary: 'List GRN items. Cross-tenant GRNs return 404.' })
  items(@Param('id', ParseObjectIdPipe) id: string) {
    return this.grnService.listItems(id);
  }

  @Post('grns/:id/items')
  @RequirePermissions(PermissionCode.GRN_UPDATE)
  @ApiOperation({ summary: 'Add an item to a draft GRN' })
  addItem(
    @Param('id', ParseObjectIdPipe) id: string,
    @Body() dto: CreateGrnItemDto,
  ) {
    return this.grnService.addItem(id, dto);
  }
}
