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
import type { AuthenticatedUser } from '../../auth/interfaces/authenticated-user.interface';
import { PermissionCode } from '../../common/constants/permissions';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { FilteredQueryDto } from '../../common/dto/filtered-query.dto';
import { ParseObjectIdPipe } from '../../common/pipes/parse-object-id.pipe';
import {
  CreateProjectDto,
  CreateProjectMemberDto,
  UpdateProjectDto,
  UpdateProjectMemberDto,
} from '../dto/project.dto';
import { ProjectsService } from '../services/projects.service';

@ApiTags('Projects')
@ApiBearerAuth()
@Controller('projects')
export class ProjectsController {
  constructor(private readonly projectsService: ProjectsService) {}

  @Post()
  @RequirePermissions(PermissionCode.PROJECTS_CREATE)
  @ApiOperation({
    summary: 'Create a project from a WIN client decision only',
  })
  create(
    @Body() dto: CreateProjectDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.projectsService.create(dto, user);
  }

  @Get('summary')
  @RequirePermissions(PermissionCode.PROJECTS_READ)
  @ApiOperation({ summary: 'Tenant-scoped project status counters' })
  summary() {
    return this.projectsService.summary();
  }

  @Get()
  @RequirePermissions(PermissionCode.PROJECTS_READ)
  @ApiOperation({ summary: 'List tenant projects' })
  findAll(@Query() query: FilteredQueryDto) {
    return this.projectsService.findAll(query);
  }

  @Get(':id/members')
  @RequirePermissions(PermissionCode.PROJECTS_READ)
  @ApiOperation({ summary: 'List project members' })
  members(@Param('id', ParseObjectIdPipe) id: string) {
    return this.projectsService.listMembers(id);
  }

  @Get(':id')
  @RequirePermissions(PermissionCode.PROJECTS_READ)
  @ApiOperation({ summary: 'Get a project. Cross-tenant ids return 404.' })
  findOne(@Param('id', ParseObjectIdPipe) id: string) {
    return this.projectsService.findById(id);
  }

  @Patch(':id')
  @RequirePermissions(PermissionCode.PROJECTS_UPDATE)
  @ApiOperation({ summary: 'Update project planning details' })
  update(
    @Param('id', ParseObjectIdPipe) id: string,
    @Body() dto: UpdateProjectDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.projectsService.update(id, dto, user);
  }

  @Post(':id/activate')
  @RequirePermissions(PermissionCode.PROJECTS_UPDATE)
  @ApiOperation({ summary: 'Activate a project in PLANNING' })
  activate(
    @Param('id', ParseObjectIdPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.projectsService.activate(id, user);
  }

  @Post(':id/on-hold')
  @RequirePermissions(PermissionCode.PROJECTS_UPDATE)
  @ApiOperation({ summary: 'Put an active project on hold' })
  hold(
    @Param('id', ParseObjectIdPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.projectsService.hold(id, user);
  }

  @Post(':id/complete')
  @RequirePermissions(PermissionCode.PROJECTS_UPDATE)
  @ApiOperation({ summary: 'Complete an active project' })
  complete(
    @Param('id', ParseObjectIdPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.projectsService.complete(id, user);
  }

  @Post(':id/cancel')
  @RequirePermissions(PermissionCode.PROJECTS_UPDATE)
  @ApiOperation({ summary: 'Cancel a project' })
  cancel(
    @Param('id', ParseObjectIdPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.projectsService.cancel(id, user);
  }

  @Post(':id/members')
  @RequirePermissions(PermissionCode.PROJECTS_UPDATE)
  @ApiOperation({ summary: 'Assign a project member' })
  addMember(
    @Param('id', ParseObjectIdPipe) id: string,
    @Body() dto: CreateProjectMemberDto,
  ) {
    return this.projectsService.addMember(id, dto);
  }

  @Patch(':id/members/:memberId')
  @RequirePermissions(PermissionCode.PROJECTS_UPDATE)
  @ApiOperation({ summary: 'Update a project member' })
  updateMember(
    @Param('id', ParseObjectIdPipe) id: string,
    @Param('memberId', ParseObjectIdPipe) memberId: string,
    @Body() dto: UpdateProjectMemberDto,
  ) {
    return this.projectsService.updateMember(id, memberId, dto);
  }

  @Delete(':id/members/:memberId')
  @RequirePermissions(PermissionCode.PROJECTS_UPDATE)
  @ApiOperation({ summary: 'Remove a project member' })
  removeMember(
    @Param('id', ParseObjectIdPipe) id: string,
    @Param('memberId', ParseObjectIdPipe) memberId: string,
  ) {
    return this.projectsService.removeMember(id, memberId);
  }
}
