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
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { ParseObjectIdPipe } from '../../common/pipes/parse-object-id.pipe';
import {
  CreateWorkflowDefinitionDto,
  StartWorkflowDto,
  WorkflowActDto,
} from '../dto/workflow.dto';
import { WorkflowService } from '../services/workflow.service';

@ApiTags('Workflow')
@ApiBearerAuth()
@Controller('workflows')
export class WorkflowController {
  constructor(private readonly workflowService: WorkflowService) {}

  @Post('definitions')
  @RequirePermissions(PermissionCode.WORKFLOW_CREATE)
  @ApiOperation({ summary: 'Create a tenant workflow definition' })
  createDefinition(@Body() dto: CreateWorkflowDefinitionDto) {
    return this.workflowService.createDefinition(dto);
  }

  @Get('definitions')
  @RequirePermissions(PermissionCode.WORKFLOW_READ)
  @ApiOperation({ summary: 'List workflow definitions' })
  listDefinitions(@Query('module') module?: string) {
    return this.workflowService.listDefinitions(module);
  }

  @Patch('definitions/:id/activate')
  @RequirePermissions(PermissionCode.WORKFLOW_UPDATE)
  @ApiOperation({ summary: 'Activate a workflow version for a module' })
  activate(@Param('id', ParseObjectIdPipe) id: string) {
    return this.workflowService.activate(id);
  }

  @Get('inbox')
  @RequirePermissions(PermissionCode.WORKFLOW_ACT)
  @ApiOperation({
    summary:
      'Pending approvals for the current user. Backend resolved the approver.',
  })
  inbox(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: PaginationQueryDto,
  ) {
    return this.workflowService.inbox(user, query);
  }

  @Post('instances')
  @RequirePermissions(PermissionCode.WORKFLOW_CREATE)
  @ApiOperation({ summary: 'Start a workflow instance for a business record' })
  start(@CurrentUser() user: AuthenticatedUser, @Body() dto: StartWorkflowDto) {
    return this.workflowService.start(dto, user);
  }

  @Get('instances/:id')
  @RequirePermissions(PermissionCode.WORKFLOW_READ)
  @ApiOperation({
    summary:
      'Get a workflow instance and approval history. Cross-tenant ids return 404.',
  })
  getInstance(@Param('id', ParseObjectIdPipe) id: string) {
    return this.workflowService.getInstance(id);
  }

  @Post('instances/:id/actions')
  @RequirePermissions(PermissionCode.WORKFLOW_ACT)
  @ApiOperation({
    summary:
      'Approve, reject, send back, or escalate. Reject and send-back require a reason. Frontend does not choose the approver.',
  })
  act(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseObjectIdPipe) id: string,
    @Body() dto: WorkflowActDto,
  ) {
    return this.workflowService.act(id, dto, user);
  }
}
