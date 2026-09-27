import { Body, Controller, Delete, Param, Patch } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { AuthenticatedUser } from '../../auth/interfaces/authenticated-user.interface';
import { PermissionCode } from '../../common/constants/permissions';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { ParseObjectIdPipe } from '../../common/pipes/parse-object-id.pipe';
import { UpdatePurchaseOrderChargeDto } from '../dto/purchase-order.dto';
import { PurchaseOrdersService } from '../services/purchase-orders.service';

@ApiTags('PO Charges')
@ApiBearerAuth()
@Controller('purchase-order-charges')
export class PurchaseOrderChargesController {
  constructor(private readonly purchaseOrdersService: PurchaseOrdersService) {}

  @Patch(':id')
  @RequirePermissions(PermissionCode.PO_UPDATE)
  @ApiOperation({
    summary:
      'Update a purchase order charge. Amount, tax, and PO grand total are recalculated. Blocked after approval.',
  })
  update(
    @Param('id', ParseObjectIdPipe) id: string,
    @Body() dto: UpdatePurchaseOrderChargeDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.purchaseOrdersService.updateCharge(id, dto, user);
  }

  @Delete(':id')
  @RequirePermissions(PermissionCode.PO_UPDATE)
  @ApiOperation({ summary: 'Delete a draft purchase order charge' })
  remove(@Param('id', ParseObjectIdPipe) id: string) {
    return this.purchaseOrdersService.deleteCharge(id);
  }
}
