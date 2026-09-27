import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { AuthenticatedUser } from '../../auth/interfaces/authenticated-user.interface';
import { PermissionCode } from '../../common/constants/permissions';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { FilteredQueryDto } from '../../common/dto/filtered-query.dto';
import { ParseObjectIdPipe } from '../../common/pipes/parse-object-id.pipe';
import {
  CreateAssignmentDto,
  CreateEmployeeDto,
  UpdateAssignmentDto,
  UpdateEmployeeDto,
} from '../dto/employee.dto';
import { EmployeeStatus } from '../enums/employee.enums';
import { EmployeesService } from '../services/employees.service';

@ApiTags('Employees')
@ApiBearerAuth()
@Controller()
export class EmployeesController {
  constructor(private readonly employeesService: EmployeesService) {}

  @Post('employees')
  @RequirePermissions(PermissionCode.EMPLOYEES_CREATE)
  create(
    @Body() dto: CreateEmployeeDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.employeesService.create(dto, user);
  }

  @Get('employees/me')
  @RequirePermissions(PermissionCode.ATTENDANCE_READ)
  me(@CurrentUser() user: AuthenticatedUser) {
    return this.employeesService.findByUser(user.userId);
  }

  @Get('employees')
  @RequirePermissions(PermissionCode.EMPLOYEES_READ)
  list(@Query() query: FilteredQueryDto) {
    return this.employeesService.list(query);
  }

  @Get('employees/:id')
  @RequirePermissions(PermissionCode.EMPLOYEES_READ)
  get(@Param('id', ParseObjectIdPipe) id: string) {
    return this.employeesService.get(id);
  }

  @Patch('employees/:id')
  @RequirePermissions(PermissionCode.EMPLOYEES_UPDATE)
  update(
    @Param('id', ParseObjectIdPipe) id: string,
    @Body() dto: UpdateEmployeeDto,
  ) {
    return this.employeesService.update(id, dto);
  }

  @Post('employees/:id/activate')
  @RequirePermissions(PermissionCode.EMPLOYEES_UPDATE)
  activate(@Param('id', ParseObjectIdPipe) id: string) {
    return this.employeesService.setStatus(id, EmployeeStatus.ACTIVE);
  }

  @Post('employees/:id/deactivate')
  @RequirePermissions(PermissionCode.EMPLOYEES_UPDATE)
  deactivate(@Param('id', ParseObjectIdPipe) id: string) {
    return this.employeesService.setStatus(id, EmployeeStatus.INACTIVE);
  }

  @Post('employees/:employeeId/site-assignments')
  @RequirePermissions(PermissionCode.ASSIGNMENTS_CREATE)
  assign(
    @Param('employeeId', ParseObjectIdPipe) employeeId: string,
    @Body() dto: CreateAssignmentDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.employeesService.createAssignment(employeeId, dto, user);
  }

  @Get('employees/:employeeId/site-assignments')
  @RequirePermissions(PermissionCode.ASSIGNMENTS_READ)
  assignments(@Param('employeeId', ParseObjectIdPipe) employeeId: string) {
    return this.employeesService.listAssignments(employeeId);
  }
}

@ApiTags('Site Assignments')
@ApiBearerAuth()
@Controller('site-assignments')
export class SiteAssignmentsController {
  constructor(private readonly employeesService: EmployeesService) {}

  @Get(':id')
  @RequirePermissions(PermissionCode.ASSIGNMENTS_READ)
  get(@Param('id', ParseObjectIdPipe) id: string) {
    return this.employeesService.getAssignment(id);
  }

  @Patch(':id')
  @RequirePermissions(PermissionCode.ASSIGNMENTS_UPDATE)
  update(
    @Param('id', ParseObjectIdPipe) id: string,
    @Body() dto: UpdateAssignmentDto,
  ) {
    return this.employeesService.updateAssignment(id, dto);
  }

  @Post(':id/revoke')
  @RequirePermissions(PermissionCode.ASSIGNMENTS_UPDATE)
  revoke(
    @Param('id', ParseObjectIdPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.employeesService.revokeAssignment(id, user);
  }
}
