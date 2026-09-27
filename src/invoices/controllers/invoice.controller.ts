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
import { CreateInvoiceDto } from '../dto/create-invoice.dto';
import { InvoiceListQueryDto } from '../dto/invoice-list-query.dto';
import { HoldInvoiceDto, InvoiceReasonDto } from '../dto/hold-invoice.dto';
import { ReviewInvoiceDto } from '../dto/review-invoice.dto';
import { UpdateInvoiceDto } from '../dto/update-invoice.dto';
import { InvoiceAccountsService } from '../services/invoice-accounts.service';
import { InvoiceService } from '../services/invoice.service';

@ApiTags('Invoices')
@ApiBearerAuth()
@Controller('invoices')
export class InvoiceController {
  constructor(
    private readonly invoices: InvoiceService,
    private readonly accounts: InvoiceAccountsService,
  ) {}

  @Get('accounts/pending')
  @RequirePermissions(PermissionCode.INVOICES_REVIEW)
  @ApiOperation({
    summary: 'Accounts queue of submitted invoices awaiting review',
  })
  pending(@Query() query: InvoiceListQueryDto) {
    return this.accounts.pending(query);
  }

  @Get('accounts/review')
  @RequirePermissions(PermissionCode.INVOICES_REVIEW)
  @ApiOperation({ summary: 'Invoices currently in accounts review' })
  reviewQueue(@Query() query: InvoiceListQueryDto) {
    return this.accounts.reviewQueue(query);
  }

  @Get('accounts/mismatch')
  @RequirePermissions(PermissionCode.INVOICES_REVIEW)
  @ApiOperation({
    summary: 'Invoices with a 3-way mismatch. These are never auto-approved.',
  })
  mismatch(@Query() query: InvoiceListQueryDto) {
    return this.accounts.mismatch(query);
  }

  @Get('accounts/on-hold')
  @RequirePermissions(PermissionCode.INVOICES_REVIEW)
  @ApiOperation({ summary: 'Invoices placed on hold' })
  onHold(@Query() query: InvoiceListQueryDto) {
    return this.accounts.onHold(query);
  }

  @Post()
  @RequirePermissions(PermissionCode.INVOICES_CREATE)
  @ApiOperation({
    summary:
      'Site invoice upload. Allocates a tenant invoice number and stores attachment metadata only.',
  })
  create(
    @Body() dto: CreateInvoiceDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.invoices.create(dto, user);
  }

  @Get()
  @RequirePermissions(PermissionCode.INVOICES_READ)
  @ApiOperation({ summary: 'List invoices for the current tenant' })
  list(@Query() query: InvoiceListQueryDto) {
    return this.invoices.list(query);
  }

  @Get(':id/accounts-view')
  @RequirePermissions(PermissionCode.INVOICES_REVIEW)
  @ApiOperation({
    summary:
      'Accounts detail: invoice, PO, GRNs, match history, previous invoices, and remaining quantity',
  })
  accountsView(@Param('id', ParseObjectIdPipe) id: string) {
    return this.accounts.accountsView(id);
  }

  @Get(':id')
  @RequirePermissions(PermissionCode.INVOICES_READ)
  @ApiOperation({ summary: 'Get an invoice. Cross-tenant ids return 404.' })
  get(@Param('id', ParseObjectIdPipe) id: string) {
    return this.invoices.get(id);
  }

  @Patch(':id')
  @RequirePermissions(PermissionCode.INVOICES_UPDATE)
  @ApiOperation({
    summary:
      'Update a draft invoice, or a sent-back invoice when a correction reason is provided',
  })
  update(
    @Param('id', ParseObjectIdPipe) id: string,
    @Body() dto: UpdateInvoiceDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.invoices.update(id, dto, user);
  }

  @Post(':id/submit')
  @RequirePermissions(PermissionCode.INVOICES_SUBMIT)
  @ApiOperation({ summary: 'Submit a draft invoice to accounts' })
  submit(
    @Param('id', ParseObjectIdPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.invoices.submit(id, user);
  }

  @Post(':id/cancel')
  @RequirePermissions(PermissionCode.INVOICES_CANCEL)
  @ApiOperation({
    summary: 'Cancel a draft or submitted invoice. Reason is required.',
  })
  cancel(
    @Param('id', ParseObjectIdPipe) id: string,
    @Body() dto: InvoiceReasonDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.invoices.cancel(id, dto, user);
  }

  @Post(':id/review')
  @RequirePermissions(PermissionCode.INVOICES_REVIEW)
  @ApiOperation({
    summary:
      'Move a submitted invoice into accounts review, or send a mismatch back for correction',
  })
  review(
    @Param('id', ParseObjectIdPipe) id: string,
    @Body() dto: ReviewInvoiceDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.accounts.review(id, dto, user);
  }

  @Post(':id/hold')
  @RequirePermissions(PermissionCode.INVOICES_HOLD)
  @ApiOperation({
    summary: 'Place an invoice on hold. A hold reason is required.',
  })
  hold(
    @Param('id', ParseObjectIdPipe) id: string,
    @Body() dto: HoldInvoiceDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.accounts.hold(id, dto, user);
  }

  @Post(':id/release-hold')
  @RequirePermissions(PermissionCode.INVOICES_HOLD)
  @ApiOperation({
    summary: 'Release an invoice from hold back to accounts review',
  })
  release(
    @Param('id', ParseObjectIdPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.accounts.releaseHold(id, user);
  }

  @Post(':id/approve')
  @RequirePermissions(PermissionCode.INVOICES_APPROVE)
  @ApiOperation({
    summary:
      'Approve a matched invoice through the configured workflow. Does not create a payment.',
  })
  approve(
    @Param('id', ParseObjectIdPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.accounts.approve(id, user);
  }

  @Post(':id/reject')
  @RequirePermissions(PermissionCode.INVOICES_REJECT)
  @ApiOperation({
    summary: 'Reject an invoice. A mismatch cannot be approved.',
  })
  reject(
    @Param('id', ParseObjectIdPipe) id: string,
    @Body() dto: InvoiceReasonDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.accounts.reject(id, dto, user);
  }
}
