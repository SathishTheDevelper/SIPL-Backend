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
  CancelDeliveryDto,
  CreateDeliveryDto,
  ListDeliveriesDto,
  UpdateDeliveryDto,
} from '../dto/delivery.dto';
import { DeliveriesService } from '../services/deliveries.service';

@ApiTags('Deliveries')
@ApiBearerAuth()
@Controller()
export class DeliveriesController {
  constructor(private readonly deliveriesService: DeliveriesService) {}

  @Post('purchase-orders/:poId/deliveries')
  @RequirePermissions(PermissionCode.DELIVERY_CREATE)
  @ApiOperation({
    summary:
      'Schedule a delivery against an approved purchase order. Vendor, project, and site come from the PO. Shipment quantity does not update PO received quantity.',
  })
  create(
    @Param('poId', ParseObjectIdPipe) poId: string,
    @Body() dto: CreateDeliveryDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.deliveriesService.create(poId, dto, user);
  }

  @Get('purchase-orders/:poId/deliveries')
  @RequirePermissions(PermissionCode.DELIVERY_READ)
  @ApiOperation({ summary: 'List deliveries for a purchase order' })
  listForPo(
    @Param('poId', ParseObjectIdPipe) poId: string,
    @Query() query: ListDeliveriesDto,
  ) {
    return this.deliveriesService.listForPurchaseOrder(poId, query);
  }

  @Get('deliveries')
  @RequirePermissions(PermissionCode.DELIVERY_READ)
  @ApiOperation({
    summary:
      'List deliveries filtered by status, purchase order, project, or site',
  })
  list(@Query() query: ListDeliveriesDto) {
    return this.deliveriesService.list(query);
  }

  @Get('deliveries/:id')
  @RequirePermissions(PermissionCode.DELIVERY_READ)
  @ApiOperation({ summary: 'Get a delivery. Cross-tenant ids return 404.' })
  get(@Param('id', ParseObjectIdPipe) id: string) {
    return this.deliveriesService.get(id);
  }

  @Patch('deliveries/:id')
  @RequirePermissions(PermissionCode.DELIVERY_UPDATE)
  @ApiOperation({
    summary: 'Update logistics details before the delivery is completed',
  })
  update(
    @Param('id', ParseObjectIdPipe) id: string,
    @Body() dto: UpdateDeliveryDto,
  ) {
    return this.deliveriesService.update(id, dto);
  }

  @Post('deliveries/:id/in-transit')
  @RequirePermissions(PermissionCode.DELIVERY_UPDATE)
  @ApiOperation({ summary: 'Move a scheduled delivery to in transit' })
  inTransit(@Param('id', ParseObjectIdPipe) id: string) {
    return this.deliveriesService.inTransit(id);
  }

  @Post('deliveries/:id/delivered')
  @RequirePermissions(PermissionCode.DELIVERY_UPDATE)
  @ApiOperation({
    summary:
      'Mark an in-transit delivery as delivered. Does not increase PO received quantity.',
  })
  delivered(@Param('id', ParseObjectIdPipe) id: string) {
    return this.deliveriesService.delivered(id);
  }

  @Post('deliveries/:id/cancel')
  @RequirePermissions(PermissionCode.DELIVERY_UPDATE)
  @ApiOperation({
    summary:
      'Cancel a scheduled delivery. A cancelled delivery cannot become delivered.',
  })
  cancel(
    @Param('id', ParseObjectIdPipe) id: string,
    @Body() dto: CancelDeliveryDto,
  ) {
    return this.deliveriesService.cancel(id, dto);
  }
}
