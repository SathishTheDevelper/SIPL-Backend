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
import type { AuthenticatedUser } from '../../../auth/interfaces/authenticated-user.interface';
import { PermissionCode } from '../../../common/constants/permissions';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../../common/decorators/permissions.decorator';
import { FilteredQueryDto } from '../../../common/dto/filtered-query.dto';
import { ParseObjectIdPipe } from '../../../common/pipes/parse-object-id.pipe';
import { CreateRequirementDto } from '../../requirements/dto/requirement.dto';
import { RequirementsService } from '../../requirements/services/requirements.service';
import { CreateQuotationDto } from '../../quotations/dto/quotation.dto';
import { QuotationsService } from '../../quotations/services/quotations.service';
import {
  CreateTenderDto,
  LoseTenderDto,
  UpdateTenderDto,
} from '../dto/tender.dto';
import { TendersService } from '../services/tenders.service';

@ApiTags('Tenders')
@ApiBearerAuth()
@Controller('tenders')
export class TendersController {
  constructor(
    private readonly tendersService: TendersService,
    private readonly requirementsService: RequirementsService,
    private readonly quotationsService: QuotationsService,
  ) {}

  @Post()
  @RequirePermissions(PermissionCode.TENDERS_CREATE)
  @ApiOperation({ summary: 'Create a tender or enquiry' })
  create(@Body() dto: CreateTenderDto, @CurrentUser() user: AuthenticatedUser) {
    return this.tendersService.create(dto, user);
  }

  @Get()
  @RequirePermissions(PermissionCode.TENDERS_READ)
  @ApiOperation({ summary: 'List tenant tenders' })
  findAll(@Query() query: FilteredQueryDto) {
    return this.tendersService.findAll(query);
  }

  @Get(':id')
  @RequirePermissions(PermissionCode.TENDERS_READ)
  @ApiOperation({ summary: 'Get a tender. Cross-tenant ids return 404.' })
  findOne(@Param('id', ParseObjectIdPipe) id: string) {
    return this.tendersService.findById(id);
  }

  @Patch(':id')
  @RequirePermissions(PermissionCode.TENDERS_UPDATE)
  @ApiOperation({ summary: 'Update a tender' })
  update(
    @Param('id', ParseObjectIdPipe) id: string,
    @Body() dto: UpdateTenderDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.tendersService.update(id, dto, user);
  }

  @Post(':id/submit')
  @RequirePermissions(PermissionCode.TENDERS_UPDATE)
  @ApiOperation({ summary: 'Submit a tender and start workflow if configured' })
  submit(
    @Param('id', ParseObjectIdPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.tendersService.submit(id, user);
  }

  @Post(':id/win')
  @RequirePermissions(PermissionCode.TENDERS_UPDATE)
  @ApiOperation({ summary: 'Mark tender WON. Does not create a project.' })
  win(
    @Param('id', ParseObjectIdPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.tendersService.win(id, user);
  }

  @Post(':id/lose')
  @RequirePermissions(PermissionCode.TENDERS_UPDATE)
  @ApiOperation({ summary: 'Mark tender LOST. Requires lostReason.' })
  lose(
    @Param('id', ParseObjectIdPipe) id: string,
    @Body() dto: LoseTenderDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.tendersService.lose(id, dto, user);
  }

  @Post(':id/cancel')
  @RequirePermissions(PermissionCode.TENDERS_UPDATE)
  @ApiOperation({ summary: 'Cancel a tender' })
  cancel(
    @Param('id', ParseObjectIdPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.tendersService.cancel(id, user);
  }

  @Post(':tenderId/requirements')
  @RequirePermissions(PermissionCode.REQUIREMENTS_CREATE)
  @ApiOperation({ summary: 'Capture requirements for a tender' })
  createRequirement(
    @Param('tenderId', ParseObjectIdPipe) tenderId: string,
    @Body() dto: CreateRequirementDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.requirementsService.create(tenderId, dto, user);
  }

  @Get(':tenderId/requirements')
  @RequirePermissions(PermissionCode.REQUIREMENTS_READ)
  @ApiOperation({ summary: 'List requirements for a tender' })
  listRequirements(@Param('tenderId', ParseObjectIdPipe) tenderId: string) {
    return this.requirementsService.listByTender(tenderId);
  }

  @Post(':tenderId/quotations')
  @RequirePermissions(PermissionCode.QUOTATIONS_CREATE)
  @ApiOperation({
    summary: 'Create a quotation. Totals are calculated on the backend.',
  })
  createQuotation(
    @Param('tenderId', ParseObjectIdPipe) tenderId: string,
    @Body() dto: CreateQuotationDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.quotationsService.create(tenderId, dto, user);
  }

  @Get(':tenderId/quotations')
  @RequirePermissions(PermissionCode.QUOTATIONS_READ)
  @ApiOperation({ summary: 'List quotations for a tender' })
  listQuotations(@Param('tenderId', ParseObjectIdPipe) tenderId: string) {
    return this.quotationsService.listByTender(tenderId);
  }
}
