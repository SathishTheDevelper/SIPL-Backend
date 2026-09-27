import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { AuthenticatedUser } from '../../auth/interfaces/authenticated-user.interface';
import { PermissionCode } from '../../common/constants/permissions';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { ParseObjectIdPipe } from '../../common/pipes/parse-object-id.pipe';
import { AttendanceReportQueryDto, PunchDto } from '../dto/attendance.dto';
import { AttendanceService } from '../services/attendance.service';

@ApiTags('Attendance')
@ApiBearerAuth()
@Controller('attendance')
export class AttendanceController {
  constructor(private readonly attendanceService: AttendanceService) {}

  @Post('punch-in')
  @RequirePermissions(PermissionCode.ATTENDANCE_PUNCH)
  @ApiOperation({
    summary: 'Punch in at an assigned site inside that site geofence',
  })
  punchIn(@Body() dto: PunchDto, @CurrentUser() user: AuthenticatedUser) {
    return this.attendanceService.punchIn(dto, user);
  }

  @Post('punch-out')
  @RequirePermissions(PermissionCode.ATTENDANCE_PUNCH)
  punchOut(@Body() dto: PunchDto, @CurrentUser() user: AuthenticatedUser) {
    return this.attendanceService.punchOut(dto, user);
  }

  @Get('my')
  @RequirePermissions(PermissionCode.ATTENDANCE_READ)
  my(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: AttendanceReportQueryDto,
  ) {
    return this.attendanceService.myAttendance(user, query);
  }

  @Get('reports')
  @RequirePermissions(PermissionCode.ATTENDANCE_READ)
  @ApiOperation({ summary: 'Aggregated attendance report' })
  reports(@Query() query: AttendanceReportQueryDto) {
    return this.attendanceService.report(query);
  }

  @Get('site/:siteId')
  @RequirePermissions(PermissionCode.ATTENDANCE_READ)
  bySite(
    @Param('siteId', ParseObjectIdPipe) siteId: string,
    @Query() query: AttendanceReportQueryDto,
  ) {
    return this.attendanceService.forSite(siteId, query);
  }

  @Get('project/:projectId')
  @RequirePermissions(PermissionCode.ATTENDANCE_READ)
  byProject(
    @Param('projectId', ParseObjectIdPipe) projectId: string,
    @Query() query: AttendanceReportQueryDto,
  ) {
    return this.attendanceService.forProject(projectId, query);
  }

  @Get(':employeeId')
  @RequirePermissions(PermissionCode.ATTENDANCE_READ)
  byEmployee(
    @Param('employeeId', ParseObjectIdPipe) employeeId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: AttendanceReportQueryDto,
  ) {
    return this.attendanceService.forEmployee(employeeId, user, query);
  }
}
