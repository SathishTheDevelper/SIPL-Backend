import { Body, Controller, Delete, Param, Patch } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { AuthenticatedUser } from '../../auth/interfaces/authenticated-user.interface';
import { PermissionCode } from '../../common/constants/permissions';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { ParseObjectIdPipe } from '../../common/pipes/parse-object-id.pipe';
import { UpdatePoLineDto } from '../dto/purchase-order.dto';
import { PurchaseOrdersService } from '../services/purchase-orders.service';

@ApiTags('Purchase Orders')
@ApiBearerAuth()
@Controller('purchase-order-items')
export class PurchaseOrderItemsController {
  constructor(private readonly purchaseOrdersService: PurchaseOrdersService) {}

  @Patch(':id')
  @RequirePermissions(PermissionCode.PO_UPDATE)
  @ApiOperation({
    summary:
      'Update a purchase order item. Line totals are recalculated. Financial edits after approval return PO_AMENDMENT_REQUIRED.',
  })
  update(
    @Param('id', ParseObjectIdPipe) id: string,
    @Body() dto: UpdatePoLineDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.purchaseOrdersService.updateItem(id, dto, user);
  }

  @Delete(':id')
  @RequirePermissions(PermissionCode.PO_UPDATE)
  @ApiOperation({ summary: 'Delete a draft purchase order item' })
  remove(@Param('id', ParseObjectIdPipe) id: string) {
    return this.purchaseOrdersService.deleteItem(id);
  }
}
