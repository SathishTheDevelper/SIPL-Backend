import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { AuthenticatedUser } from '../../auth/interfaces/authenticated-user.interface';
import { PermissionCode } from '../../common/constants/permissions';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { ParseObjectIdPipe } from '../../common/pipes/parse-object-id.pipe';
import {
  AcknowledgePurchaseOrderDto,
  CancelPurchaseOrderDto,
  CreatePoLineDto,
  CreatePurchaseOrderChargeDto,
  CreatePurchaseOrderDto,
  ListPurchaseOrdersDto,
  UpdatePurchaseOrderDto,
} from '../dto/purchase-order.dto';
import { PurchaseOrdersService } from '../services/purchase-orders.service';

@ApiTags('Purchase Orders')
@ApiBearerAuth()
@Controller('purchase-orders')
export class PurchaseOrdersController {
  constructor(private readonly purchaseOrdersService: PurchaseOrdersService) {}

  @Post()
  @RequirePermissions(PermissionCode.PO_CREATE)
  @ApiOperation({
    summary:
      'Create a purchase order from an APPROVED purchase approval. Project, site, and vendor are taken from the approval. Totals are calculated on the server.',
  })
  create(
    @Body() dto: CreatePurchaseOrderDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.purchaseOrdersService.create(dto, user);
  }

  @Get('summary')
  @RequirePermissions(PermissionCode.PO_READ)
  @ApiOperation({ summary: 'Purchase order counts by status' })
  summary() {
    return this.purchaseOrdersService.summary();
  }

  @Get()
  @RequirePermissions(PermissionCode.PO_READ)
  @ApiOperation({
    summary:
      'List purchase orders. Does not populate vendor, project, or site. Limit max 100.',
  })
  list(@Query() query: ListPurchaseOrdersDto) {
    return this.purchaseOrdersService.list(query);
  }

  @Get(':id')
  @RequirePermissions(PermissionCode.PO_READ)
  @ApiOperation({
    summary: 'Get a purchase order. Cross-tenant ids return 404.',
  })
  get(@Param('id', ParseObjectIdPipe) id: string) {
    return this.purchaseOrdersService.get(id);
  }

  @Patch(':id')
  @RequirePermissions(PermissionCode.PO_UPDATE)
  @ApiOperation({
    summary:
      'Update a draft purchase order. Financial edits after approval return PO_AMENDMENT_REQUIRED.',
  })
  update(
    @Param('id', ParseObjectIdPipe) id: string,
    @Body() dto: UpdatePurchaseOrderDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.purchaseOrdersService.update(id, dto, user);
  }

  @Post(':id/submit')
  @RequirePermissions(PermissionCode.PO_UPDATE)
  @ApiOperation({
    summary:
      'Submit a draft purchase order. Starts the configured PO approval workflow.',
  })
  submit(
    @Param('id', ParseObjectIdPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.purchaseOrdersService.submit(id, user);
  }

  @Post(':id/cancel')
  @RequirePermissions(PermissionCode.PO_UPDATE)
  @ApiOperation({
    summary:
      'Cancel a purchase order. Reason is required. Fully delivered and closed orders cannot be cancelled.',
  })
  cancel(
    @Param('id', ParseObjectIdPipe) id: string,
    @Body() dto: CancelPurchaseOrderDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.purchaseOrdersService.cancel(id, dto, user);
  }

  @Post(':id/send-to-vendor')
  @RequirePermissions(PermissionCode.PO_UPDATE)
  @ApiOperation({
    summary: 'Send an approved purchase order to the vendor. No vendor portal.',
  })
  send(
    @Param('id', ParseObjectIdPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.purchaseOrdersService.sendToVendor(id, user);
  }

  @Post(':id/acknowledge')
  @RequirePermissions(PermissionCode.PO_UPDATE)
  @ApiOperation({
    summary: 'Record vendor acknowledgement of a sent purchase order',
  })
  acknowledge(
    @Param('id', ParseObjectIdPipe) id: string,
    @Body() dto: AcknowledgePurchaseOrderDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.purchaseOrdersService.acknowledge(id, dto, user);
  }

  @Get(':id/items')
  @RequirePermissions(PermissionCode.PO_READ)
  @ApiOperation({ summary: 'List purchase order items' })
  items(@Param('id', ParseObjectIdPipe) id: string) {
    return this.purchaseOrdersService.listItems(id);
  }

  @Post(':id/items')
  @RequirePermissions(PermissionCode.PO_UPDATE)
  @ApiOperation({ summary: 'Add an item to a draft purchase order' })
  addItem(
    @Param('id', ParseObjectIdPipe) id: string,
    @Body() dto: CreatePoLineDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.purchaseOrdersService.addItem(id, dto, user);
  }

  @Get(':id/charges')
  @RequirePermissions(PermissionCode.PO_READ)
  @ApiOperation({ summary: 'List structured purchase order charges' })
  charges(@Param('id', ParseObjectIdPipe) id: string) {
    return this.purchaseOrdersService.listCharges(id);
  }

  @Post(':id/charges')
  @RequirePermissions(PermissionCode.PO_UPDATE)
  @ApiTags('PO Charges')
  @ApiOperation({
    summary:
      'Add a delivery, installation, transportation, loading, unloading, or other charge. Blocked after approval.',
  })
  addCharge(
    @Param('id', ParseObjectIdPipe) id: string,
    @Body() dto: CreatePurchaseOrderChargeDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.purchaseOrdersService.addCharge(id, dto, user);
  }
}
