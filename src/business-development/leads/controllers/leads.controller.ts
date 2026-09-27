import {
  Body,
  Controller,
  Delete,
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
import {
  CreateActivityDto,
  CreateLeadDto,
  ReasonDto,
  UpdateLeadDto,
} from '../dto/lead.dto';
import { LeadsService } from '../services/leads.service';

@ApiTags('Leads')
@ApiBearerAuth()
@Controller('leads')
export class LeadsController {
  constructor(private readonly leadsService: LeadsService) {}

  @Post()
  @RequirePermissions(PermissionCode.LEADS_CREATE)
  @ApiOperation({ summary: 'Create a lead' })
  create(@Body() dto: CreateLeadDto, @CurrentUser() user: AuthenticatedUser) {
    return this.leadsService.create(dto, user);
  }

  @Get()
  @RequirePermissions(PermissionCode.LEADS_READ)
  @ApiOperation({ summary: 'List tenant leads' })
  findAll(@Query() query: FilteredQueryDto) {
    return this.leadsService.findAll(query);
  }

  @Get(':id/activities')
  @RequirePermissions(PermissionCode.LEADS_READ)
  @ApiOperation({ summary: 'List lead activities' })
  activities(@Param('id', ParseObjectIdPipe) id: string) {
    return this.leadsService.listActivities(id);
  }

  @Get(':id')
  @RequirePermissions(PermissionCode.LEADS_READ)
  @ApiOperation({ summary: 'Get a lead. Cross-tenant ids return 404.' })
  findOne(@Param('id', ParseObjectIdPipe) id: string) {
    return this.leadsService.findById(id);
  }

  @Patch(':id')
  @RequirePermissions(PermissionCode.LEADS_UPDATE)
  @ApiOperation({ summary: 'Update a lead' })
  update(
    @Param('id', ParseObjectIdPipe) id: string,
    @Body() dto: UpdateLeadDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.leadsService.update(id, dto, user);
  }

  @Delete(':id')
  @RequirePermissions(PermissionCode.LEADS_DELETE)
  @ApiOperation({ summary: 'Close a lead' })
  remove(
    @Param('id', ParseObjectIdPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.leadsService.remove(id, user);
  }

  @Post(':id/qualify')
  @RequirePermissions(PermissionCode.LEADS_UPDATE)
  @ApiOperation({ summary: 'Qualify a lead' })
  qualify(
    @Param('id', ParseObjectIdPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.leadsService.qualify(id, user);
  }

  @Post(':id/disqualify')
  @RequirePermissions(PermissionCode.LEADS_UPDATE)
  @ApiOperation({ summary: 'Disqualify a lead' })
  disqualify(
    @Param('id', ParseObjectIdPipe) id: string,
    @Body() dto: ReasonDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.leadsService.disqualify(id, user, dto.reason);
  }

  @Post(':id/convert')
  @RequirePermissions(PermissionCode.LEADS_UPDATE)
  @ApiOperation({ summary: 'Convert a qualified lead into an opportunity' })
  convert(
    @Param('id', ParseObjectIdPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.leadsService.convert(id, user);
  }

  @Post(':id/activities')
  @RequirePermissions(PermissionCode.LEADS_UPDATE)
  @ApiOperation({ summary: 'Add a lead activity' })
  addActivity(
    @Param('id', ParseObjectIdPipe) id: string,
    @Body() dto: CreateActivityDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.leadsService.addActivity(id, dto, user);
  }
}
