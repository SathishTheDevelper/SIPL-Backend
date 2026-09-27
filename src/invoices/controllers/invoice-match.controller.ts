import { Body, Controller, Param, Post } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import type { AuthenticatedUser } from '../../auth/interfaces/authenticated-user.interface';
import { PermissionCode } from '../../common/constants/permissions';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { ParseObjectIdPipe } from '../../common/pipes/parse-object-id.pipe';
import { RunThreeWayMatchDto } from '../dto/run-3way-match.dto';
import { InvoiceMatchService } from '../services/invoice-match.service';

@ApiTags('Invoices')
@ApiBearerAuth()
@Controller('invoices')
export class InvoiceMatchController {
  constructor(private readonly matches: InvoiceMatchService) {}

  @Post(':id/three-way-match')
  @RequirePermissions(PermissionCode.INVOICES_MATCH)
  @ApiOperation({
    summary:
      'Run PO + GRN + invoice matching. MATCH does not approve payment. A mismatch is never stored as a match.',
  })
  @ApiOkResponse({
    description:
      'Wrapped by the standard success envelope. Example data payload for a quantity match.',
    schema: {
      example: {
        status: 'MATCH',
        quantityMatched: true,
        amountMatched: true,
        lines: [],
        summary: {
          poQuantity: 100,
          receivedQuantity: 90,
          invoiceQuantity: 90,
          previouslyInvoicedQuantity: 0,
          remainingInvoiceableQuantity: 100,
        },
        issues: [],
        toleranceApplied: { percent: 2, amount: 0 },
      },
    },
  })
  match(
    @Param('id', ParseObjectIdPipe) id: string,
    @Body() _dto: RunThreeWayMatchDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.matches.runThreeWayMatch(id, user);
  }
}
