import { HttpStatus, Injectable } from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { ClientSession, Connection, Model, Types } from 'mongoose';
import type { AuthenticatedUser } from '../../auth/interfaces/authenticated-user.interface';
import { AuditAction } from '../../audit/enums/audit-action.enum';
import { AuditService } from '../../audit/services/audit.service';
import { BusinessModule } from '../../common/constants/modules';
import { ErrorCodes } from '../../common/constants/error-codes';
import { PermissionCode } from '../../common/constants/permissions';
import { TenantContext } from '../../common/context/tenant.context';
import { AppException } from '../../common/exceptions/app.exception';
import { paginated, skipTake } from '../../common/utils/pagination.util';
import { EmployeeStatus } from '../../employees/enums/employee.enums';
import { EmployeesService } from '../../employees/services/employees.service';
import { SiteStatus } from '../../sites/enums/site-status.enum';
import { SitesService } from '../../sites/services/sites.service';
import { TenantsService } from '../../tenants/services/tenants.service';
import { AttendanceReportQueryDto, PunchDto } from '../dto/attendance.dto';
import { AttendanceStatus, PunchType } from '../enums/attendance.enums';
import { AttendancePunch } from '../schemas/attendance-punch.schema';
import { Attendance } from '../schemas/attendance.schema';
import { withinGeofence } from '../utils/haversine';

@Injectable()
export class AttendanceService {
  constructor(
    @InjectConnection() private readonly connection: Connection,
    @InjectModel(Attendance.name)
    private readonly attendance: Model<Attendance>,
    @InjectModel(AttendancePunch.name)
    private readonly punches: Model<AttendancePunch>,
    private readonly employeesService: EmployeesService,
    private readonly sitesService: SitesService,
    private readonly tenantsService: TenantsService,
    private readonly auditService: AuditService,
  ) {}

  private tenantId(): Types.ObjectId {
    return new Types.ObjectId(TenantContext.requireTenantId());
  }

  async punchIn(dto: PunchDto, user: AuthenticatedUser) {
    const context = await this.prepare(dto, user);
    const open = await this.punches
      .findOne({
        tenantId: this.tenantId(),
        employeeId: context.employee._id,
        type: PunchType.IN,
        open: true,
      })
      .lean()
      .exec();
    if (open) {
      throw new AppException(
        HttpStatus.CONFLICT,
        'Punch out before punching in again',
        ErrorCodes.DUPLICATE_PUNCH,
      );
    }
    const timestamp = new Date();
    try {
      const punch = await this.withTransaction(async (session) => {
        const created = await this.punches.create(
          [
            {
              tenantId: this.tenantId(),
              employeeId: context.employee._id,
              siteId: context.site._id,
              projectId: context.assignment.projectId,
              type: PunchType.IN,
              latitude: dto.latitude,
              longitude: dto.longitude,
              distanceFromSite: context.distance,
              accuracy: dto.accuracy,
              timestamp,
              deviceInfo: dto.deviceInfo,
              open: true,
            },
          ],
          session ? { session } : undefined,
        );
        await this.attendance
          .updateOne(
            {
              tenantId: this.tenantId(),
              employeeId: context.employee._id,
              siteId: context.site._id,
              attendanceDate: context.attendanceDate,
            },
            {
              $setOnInsert: {
                projectId: context.assignment.projectId,
                firstPunchIn: timestamp,
                totalWorkedMinutes: 0,
                status: AttendanceStatus.PARTIAL,
              },
            },
            { upsert: true, session },
          )
          .exec();
        return created[0]!.toObject();
      });
      await this.auditService.record({
        action: AuditAction.CREATE,
        module: BusinessModule.EMPLOYEE,
        entityType: 'AttendancePunch',
        entityId: punch._id.toString(),
        after: {
          type: PunchType.IN,
          siteId: context.site._id.toString(),
          distanceFromSite: context.distance,
        },
      });
      return punch;
    } catch (error) {
      if (this.isDuplicate(error)) {
        throw new AppException(
          HttpStatus.CONFLICT,
          'Punch out before punching in again',
          ErrorCodes.DUPLICATE_PUNCH,
        );
      }
      throw error;
    }
  }

  async punchOut(dto: PunchDto, user: AuthenticatedUser) {
    const context = await this.prepare(dto, user);
    const open = await this.punches
      .findOne({
        tenantId: this.tenantId(),
        employeeId: context.employee._id,
        siteId: context.site._id,
        type: PunchType.IN,
        open: true,
      })
      .lean<AttendancePunch>()
      .exec();
    if (!open) {
      throw new AppException(
        HttpStatus.CONFLICT,
        'An open punch-in is required before punch-out',
        ErrorCodes.OPEN_PUNCH_REQUIRED,
      );
    }
    const timestamp = new Date();
    const minutes = Math.max(
      0,
      Math.round((timestamp.getTime() - open.timestamp.getTime()) / 60000),
    );
    const closed = await this.punches
      .findOneAndUpdate(
        { _id: open._id, tenantId: this.tenantId(), open: true },
        { $set: { open: false } },
        { new: true },
      )
      .lean()
      .exec();
    if (!closed) {
      throw new AppException(
        HttpStatus.CONFLICT,
        'Punch-out was already recorded',
        ErrorCodes.DUPLICATE_PUNCH,
      );
    }
    const punch = await this.punches.create({
      tenantId: this.tenantId(),
      employeeId: context.employee._id,
      siteId: context.site._id,
      projectId: context.assignment.projectId,
      type: PunchType.OUT,
      latitude: dto.latitude,
      longitude: dto.longitude,
      distanceFromSite: context.distance,
      accuracy: dto.accuracy,
      timestamp,
      deviceInfo: dto.deviceInfo,
      open: false,
    });
    await this.attendance
      .updateOne(
        {
          tenantId: this.tenantId(),
          employeeId: context.employee._id,
          siteId: context.site._id,
          attendanceDate: context.attendanceDate,
        },
        {
          $set: {
            lastPunchOut: timestamp,
            status: AttendanceStatus.PRESENT,
            projectId: context.assignment.projectId,
          },
          $inc: { totalWorkedMinutes: minutes },
        },
        { upsert: true },
      )
      .exec();
    await this.auditService.record({
      action: AuditAction.UPDATE,
      module: BusinessModule.EMPLOYEE,
      entityType: 'AttendancePunch',
      entityId: punch._id.toString(),
      after: {
        type: PunchType.OUT,
        workedMinutes: minutes,
        distanceFromSite: context.distance,
      },
    });
    return punch.toObject();
  }

  async myAttendance(user: AuthenticatedUser, query: AttendanceReportQueryDto) {
    const employee = await this.employeesService.findByUser(user.userId);
    return this.report({ ...query, employeeId: employee._id.toString() });
  }

  async forEmployee(
    employeeId: string,
    user: AuthenticatedUser,
    query: AttendanceReportQueryDto,
  ) {
    const employee = await this.employeesService.requireEmployee(employeeId);
    const self = employee.userId?.toString() === user.userId;
    if (!self && !user.permissions.includes(PermissionCode.EMPLOYEES_READ)) {
      throw new AppException(
        HttpStatus.FORBIDDEN,
        'Attendance for another employee requires HR access',
        ErrorCodes.FORBIDDEN,
      );
    }
    return this.report({ ...query, employeeId });
  }

  forSite(siteId: string, query: AttendanceReportQueryDto) {
    return this.report({ ...query, siteId });
  }

  forProject(projectId: string, query: AttendanceReportQueryDto) {
    return this.report({ ...query, projectId });
  }

  async report(query: AttendanceReportQueryDto) {
    const page = query.page && query.page > 0 ? query.page : 1;
    const limit =
      query.limit && query.limit > 0 ? Math.min(query.limit, 100) : 20;
    const paging = skipTake(page, limit);
    const match: Record<string, unknown> = { tenantId: this.tenantId() };
    if (query.employeeId)
      match.employeeId = new Types.ObjectId(query.employeeId);
    if (query.siteId) match.siteId = new Types.ObjectId(query.siteId);
    if (query.projectId) match.projectId = new Types.ObjectId(query.projectId);
    if (query.status) match.status = query.status;
    if (query.dateFrom || query.dateTo) {
      match.attendanceDate = {
        ...(query.dateFrom ? { $gte: query.dateFrom.slice(0, 10) } : {}),
        ...(query.dateTo ? { $lte: query.dateTo.slice(0, 10) } : {}),
      };
    }
    const [rows, count] = await Promise.all([
      this.attendance
        .aggregate<{
          employeeId: Types.ObjectId;
          siteId: Types.ObjectId;
          projectId: Types.ObjectId;
          attendanceDate: string;
          firstPunchIn?: Date;
          lastPunchOut?: Date;
          totalWorkedMinutes: number;
          status: string;
          employeeName?: string;
          siteName?: string;
          projectName?: string;
        }>([
          { $match: match },
          { $sort: { attendanceDate: -1, employeeId: 1 } },
          { $skip: paging.skip },
          { $limit: paging.limit },
          {
            $lookup: {
              from: 'employees',
              localField: 'employeeId',
              foreignField: '_id',
              as: 'employee',
            },
          },
          {
            $lookup: {
              from: 'sites',
              localField: 'siteId',
              foreignField: '_id',
              as: 'site',
            },
          },
          {
            $lookup: {
              from: 'projects',
              localField: 'projectId',
              foreignField: '_id',
              as: 'project',
            },
          },
          {
            $project: {
              employeeId: 1,
              siteId: 1,
              projectId: 1,
              attendanceDate: 1,
              firstPunchIn: 1,
              lastPunchOut: 1,
              workedMinutes: '$totalWorkedMinutes',
              status: 1,
              employee: { $arrayElemAt: ['$employee.name', 0] },
              site: { $arrayElemAt: ['$site.name', 0] },
              project: { $arrayElemAt: ['$project.name', 0] },
            },
          },
        ])
        .exec(),
      this.attendance.countDocuments(match).exec(),
    ]);
    return paginated(rows, count, page, limit);
  }

  private async prepare(dto: PunchDto, user: AuthenticatedUser) {
    const employee = await this.employeesService.findByUser(user.userId);
    if (employee.status !== EmployeeStatus.ACTIVE) {
      throw new AppException(
        HttpStatus.FORBIDDEN,
        'Employee is not active',
        ErrorCodes.ACCOUNT_INACTIVE,
      );
    }
    const site = await this.sitesService.findById(dto.siteId);
    if (site.status !== SiteStatus.ACTIVE) {
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        'Site is not active',
        ErrorCodes.INVALID_STATUS,
      );
    }
    const assignment = await this.employeesService.findActiveAssignment(
      employee._id,
      site._id.toString(),
      new Date(),
    );
    if (!assignment) {
      throw new AppException(
        HttpStatus.FORBIDDEN,
        'Employee is not assigned to this site',
        ErrorCodes.NO_SITE_ASSIGNMENT,
      );
    }
    const fence = withinGeofence(
      dto.latitude,
      dto.longitude,
      site.latitude,
      site.longitude,
      site.geofenceRadius,
    );
    if (!fence.allowed) {
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        `Outside site geofence (${Math.round(fence.distanceMeters)}m > ${site.geofenceRadius}m)`,
        ErrorCodes.GEOFENCE_REJECTED,
      );
    }
    return {
      employee,
      site,
      assignment,
      distance: fence.distanceMeters,
      attendanceDate: await this.dateKey(new Date()),
    };
  }

  private async dateKey(date: Date): Promise<string> {
    const tenant = await this.tenantsService.findByIdOrThrow(
      TenantContext.requireTenantId(),
    );
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: tenant.settings.timezone || 'Asia/Kolkata',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(date);
  }

  private async withTransaction<T>(
    fn: (session?: ClientSession) => Promise<T>,
  ): Promise<T> {
    const session = await this.connection.startSession();
    try {
      session.startTransaction();
      const result = await fn(session);
      await session.commitTransaction();
      return result;
    } catch (error) {
      await session.abortTransaction().catch(() => undefined);
      const message = error instanceof Error ? error.message : String(error);
      if (
        message.includes('Transaction numbers are only allowed') ||
        message.includes('replica set')
      ) {
        return fn(undefined);
      }
      throw error;
    } finally {
      await session.endSession();
    }
  }

  private isDuplicate(error: unknown): boolean {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      (error as { code?: number }).code === 11000
    );
  }
}
