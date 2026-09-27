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
import { CreateActivityDto } from '../../leads/dto/lead.dto';
import {
  CreateOpportunityDto,
  LoseOpportunityDto,
  MoveStageDto,
  UpdateOpportunityDto,
} from '../dto/opportunity.dto';
import { OpportunitiesService } from '../services/opportunities.service';

@ApiTags('Opportunities')
@ApiBearerAuth()
@Controller('opportunities')
export class OpportunitiesController {
  constructor(private readonly opportunitiesService: OpportunitiesService) {}

  @Post()
  @RequirePermissions(PermissionCode.OPPORTUNITIES_CREATE)
  @ApiOperation({ summary: 'Create an opportunity' })
  create(
    @Body() dto: CreateOpportunityDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.opportunitiesService.create(dto, user);
  }

  @Get()
  @RequirePermissions(PermissionCode.OPPORTUNITIES_READ)
  @ApiOperation({ summary: 'List tenant opportunities' })
  findAll(@Query() query: FilteredQueryDto) {
    return this.opportunitiesService.findAll(query);
  }

  @Get(':id/activities')
  @RequirePermissions(PermissionCode.OPPORTUNITIES_READ)
  @ApiOperation({ summary: 'List opportunity activities' })
  activities(@Param('id', ParseObjectIdPipe) id: string) {
    return this.opportunitiesService.listActivities(id);
  }

  @Get(':id')
  @RequirePermissions(PermissionCode.OPPORTUNITIES_READ)
  @ApiOperation({ summary: 'Get an opportunity. Cross-tenant ids return 404.' })
  findOne(@Param('id', ParseObjectIdPipe) id: string) {
    return this.opportunitiesService.findById(id);
  }

  @Patch(':id')
  @RequirePermissions(PermissionCode.OPPORTUNITIES_UPDATE)
  @ApiOperation({ summary: 'Update an open opportunity' })
  update(
    @Param('id', ParseObjectIdPipe) id: string,
    @Body() dto: UpdateOpportunityDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.opportunitiesService.update(id, dto, user);
  }

  @Post(':id/move-stage')
  @RequirePermissions(PermissionCode.OPPORTUNITIES_UPDATE)
  @ApiOperation({ summary: 'Move an opportunity to the next configured stage' })
  moveStage(
    @Param('id', ParseObjectIdPipe) id: string,
    @Body() dto: MoveStageDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.opportunitiesService.moveStage(id, dto, user);
  }

  @Post(':id/win')
  @RequirePermissions(PermissionCode.OPPORTUNITIES_UPDATE)
  @ApiOperation({
    summary: 'Mark opportunity WON. Does not create a project.',
  })
  win(
    @Param('id', ParseObjectIdPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.opportunitiesService.win(id, user);
  }

  @Post(':id/lose')
  @RequirePermissions(PermissionCode.OPPORTUNITIES_UPDATE)
  @ApiOperation({ summary: 'Mark opportunity LOST. Requires lostReason.' })
  lose(
    @Param('id', ParseObjectIdPipe) id: string,
    @Body() dto: LoseOpportunityDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.opportunitiesService.lose(id, dto, user);
  }

  @Post(':id/activities')
  @RequirePermissions(PermissionCode.OPPORTUNITIES_UPDATE)
  @ApiOperation({ summary: 'Add an opportunity activity' })
  addActivity(
    @Param('id', ParseObjectIdPipe) id: string,
    @Body() dto: CreateActivityDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.opportunitiesService.addActivity(id, dto, user);
  }
}
