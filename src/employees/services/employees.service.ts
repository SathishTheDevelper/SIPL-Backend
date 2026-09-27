import { HttpStatus, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import type { AuthenticatedUser } from '../../auth/interfaces/authenticated-user.interface';
import { AuditAction } from '../../audit/enums/audit-action.enum';
import { AuditService } from '../../audit/services/audit.service';
import { BusinessModule, DocumentType } from '../../common/constants/modules';
import { ErrorCodes } from '../../common/constants/error-codes';
import { TenantContext } from '../../common/context/tenant.context';
import { FilteredQueryDto } from '../../common/dto/filtered-query.dto';
import { AppException } from '../../common/exceptions/app.exception';
import { paginated, skipTake } from '../../common/utils/pagination.util';
import { CustomFieldValidationService } from '../../custom-fields/services/custom-field-validation.service';
import { NumberingService } from '../../numbering/services/numbering.service';
import { ProjectsService } from '../../projects/services/projects.service';
import { SitesService } from '../../sites/services/sites.service';
import { UsersRepository } from '../../users/repositories/users.repository';
import {
  CreateAssignmentDto,
  CreateEmployeeDto,
  UpdateAssignmentDto,
  UpdateEmployeeDto,
} from '../dto/employee.dto';
import { AssignmentStatus, EmployeeStatus } from '../enums/employee.enums';
import { EmployeeSiteAssignment } from '../schemas/employee-site-assignment.schema';
import { Employee } from '../schemas/employee.schema';

@Injectable()
export class EmployeesService {
  constructor(
    @InjectModel(Employee.name) private readonly employees: Model<Employee>,
    @InjectModel(EmployeeSiteAssignment.name)
    private readonly assignments: Model<EmployeeSiteAssignment>,
    private readonly numberingService: NumberingService,
    private readonly customFields: CustomFieldValidationService,
    private readonly usersRepository: UsersRepository,
    private readonly sitesService: SitesService,
    private readonly projectsService: ProjectsService,
    private readonly auditService: AuditService,
  ) {}

  private tenantId(): Types.ObjectId {
    return new Types.ObjectId(TenantContext.requireTenantId());
  }

  private missing(message: string): never {
    throw new AppException(HttpStatus.NOT_FOUND, message, ErrorCodes.NOT_FOUND);
  }

  async requireEmployee(id: string): Promise<Employee> {
    const row = await this.employees
      .findOne({ _id: id, tenantId: this.tenantId() })
      .lean<Employee>()
      .exec();
    if (!row) this.missing('Employee not found');
    return row;
  }

  async findByUser(userId: string): Promise<Employee> {
    const row = await this.employees
      .findOne({
        tenantId: this.tenantId(),
        userId: new Types.ObjectId(userId),
      })
      .lean<Employee>()
      .exec();
    if (!row) this.missing('Employee profile not found for the signed-in user');
    return row;
  }

  async create(dto: CreateEmployeeDto, _user: AuthenticatedUser) {
    if (dto.userId) {
      await this.usersRepository.findByIdOrThrow(dto.userId);
    }
    const customFields = await this.customFields.validate(
      BusinessModule.EMPLOYEE,
      dto.customFields,
    );
    const allocated = await this.numberingService.next(DocumentType.EMPLOYEE);
    try {
      const created = await this.employees.create({
        tenantId: this.tenantId(),
        employeeCode: allocated.number,
        userId: dto.userId ? new Types.ObjectId(dto.userId) : undefined,
        name: dto.name,
        email: dto.email.toLowerCase(),
        phone: dto.phone,
        department: dto.department,
        designation: dto.designation,
        joiningDate: dto.joiningDate ? new Date(dto.joiningDate) : undefined,
        customFields,
      });
      await this.auditService.record({
        action: AuditAction.CREATE,
        module: BusinessModule.EMPLOYEE,
        entityType: 'Employee',
        entityId: created._id.toString(),
        after: { employeeCode: created.employeeCode, userId: dto.userId },
      });
      return created.toObject();
    } catch (error) {
      if (this.isDuplicate(error)) {
        throw new AppException(
          HttpStatus.CONFLICT,
          'Employee code or linked user already exists',
          ErrorCodes.DUPLICATE_CODE,
        );
      }
      throw error;
    }
  }

  async list(query: FilteredQueryDto) {
    const filter: Record<string, unknown> = { tenantId: this.tenantId() };
    if (query.status) filter.status = query.status;
    if (query.q) {
      filter.$or = [
        { name: { $regex: query.q, $options: 'i' } },
        { employeeCode: { $regex: query.q, $options: 'i' } },
      ];
    }
    const page = skipTake(query.page, query.limit);
    const [data, total] = await Promise.all([
      this.employees
        .find(filter)
        .select({
          employeeCode: 1,
          name: 1,
          email: 1,
          status: 1,
          department: 1,
          designation: 1,
        })
        .sort({ employeeCode: 1 })
        .skip(page.skip)
        .limit(page.limit)
        .lean()
        .exec(),
      this.employees.countDocuments(filter).exec(),
    ]);
    return paginated(data, total, query.page, query.limit);
  }

  get(id: string) {
    return this.requireEmployee(id);
  }

  async update(id: string, dto: UpdateEmployeeDto) {
    const current = await this.requireEmployee(id);
    const customFields = dto.customFields
      ? await this.customFields.validate(
          BusinessModule.EMPLOYEE,
          dto.customFields,
        )
      : current.customFields;
    const updated = await this.employees
      .findOneAndUpdate(
        { _id: id, tenantId: this.tenantId() },
        {
          $set: {
            name: dto.name ?? current.name,
            phone: dto.phone ?? current.phone,
            department: dto.department ?? current.department,
            designation: dto.designation ?? current.designation,
            customFields,
          },
        },
        { new: true },
      )
      .lean()
      .exec();
    await this.auditService.record({
      action: AuditAction.UPDATE,
      module: BusinessModule.EMPLOYEE,
      entityType: 'Employee',
      entityId: id,
      after: { name: updated?.name },
    });
    return updated;
  }

  async setStatus(id: string, status: EmployeeStatus) {
    await this.requireEmployee(id);
    return this.employees
      .findOneAndUpdate(
        { _id: id, tenantId: this.tenantId() },
        { $set: { status } },
        { new: true },
      )
      .lean()
      .exec();
  }

  async createAssignment(
    employeeId: string,
    dto: CreateAssignmentDto,
    user: AuthenticatedUser,
  ) {
    const employee = await this.requireEmployee(employeeId);
    const site = await this.sitesService.findById(dto.siteId);
    const project = await this.projectsService.findById(dto.projectId);
    if (site.projectId.toString() !== project._id.toString()) {
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        'Site does not belong to the assignment project',
        ErrorCodes.VALIDATION_ERROR,
      );
    }
    const validFrom = new Date(dto.validFrom);
    const validTo = dto.validTo ? new Date(dto.validTo) : undefined;
    if (validTo && validTo < validFrom) {
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        'validTo cannot be before validFrom',
        ErrorCodes.VALIDATION_ERROR,
      );
    }
    try {
      const created = await this.assignments.create({
        tenantId: this.tenantId(),
        employeeId: employee._id,
        siteId: site._id,
        projectId: project._id,
        validFrom,
        validTo,
        assignedBy: new Types.ObjectId(user.userId),
      });
      await this.auditService.record({
        action: AuditAction.ASSIGN,
        module: BusinessModule.EMPLOYEE,
        entityType: 'EmployeeSiteAssignment',
        entityId: created._id.toString(),
        after: { employeeId, siteId: dto.siteId, projectId: dto.projectId },
      });
      return created.toObject();
    } catch (error) {
      if (this.isDuplicate(error)) {
        throw new AppException(
          HttpStatus.CONFLICT,
          'An active assignment already exists for this employee and site',
          ErrorCodes.CONFLICT,
        );
      }
      throw error;
    }
  }

  listAssignments(employeeId: string) {
    return this.assignments
      .find({
        tenantId: this.tenantId(),
        employeeId: new Types.ObjectId(employeeId),
      })
      .sort({ validFrom: -1 })
      .lean()
      .exec();
  }

  async getAssignment(id: string) {
    const row = await this.assignments
      .findOne({ _id: id, tenantId: this.tenantId() })
      .lean()
      .exec();
    if (!row) this.missing('Site assignment not found');
    return row;
  }

  async updateAssignment(id: string, dto: UpdateAssignmentDto) {
    const current = await this.getAssignment(id);
    const validFrom = dto.validFrom
      ? new Date(dto.validFrom)
      : current.validFrom;
    const validTo = dto.validTo ? new Date(dto.validTo) : current.validTo;
    if (validTo && validTo < validFrom) {
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        'validTo cannot be before validFrom',
        ErrorCodes.VALIDATION_ERROR,
      );
    }
    return this.assignments
      .findOneAndUpdate(
        { _id: id, tenantId: this.tenantId() },
        { $set: { validFrom, validTo } },
        { new: true },
      )
      .lean()
      .exec();
  }

  async revokeAssignment(id: string, user: AuthenticatedUser) {
    const current = await this.getAssignment(id);
    if (current.status !== AssignmentStatus.ACTIVE) {
      throw new AppException(
        HttpStatus.CONFLICT,
        'Assignment is not active',
        ErrorCodes.ALREADY_PROCESSED,
      );
    }
    const updated = await this.assignments
      .findOneAndUpdate(
        { _id: id, tenantId: this.tenantId(), status: AssignmentStatus.ACTIVE },
        { $set: { status: AssignmentStatus.REVOKED } },
        { new: true },
      )
      .lean()
      .exec();
    await this.auditService.record({
      action: AuditAction.STATUS_CHANGE,
      module: BusinessModule.EMPLOYEE,
      entityType: 'EmployeeSiteAssignment',
      entityId: id,
      userId: user.userId,
      after: { status: AssignmentStatus.REVOKED },
    });
    return updated;
  }

  async findActiveAssignment(
    employeeId: Types.ObjectId,
    siteId: string,
    at: Date,
  ) {
    const row = await this.assignments
      .findOne({
        tenantId: this.tenantId(),
        employeeId,
        siteId: new Types.ObjectId(siteId),
        status: AssignmentStatus.ACTIVE,
        validFrom: { $lte: at },
      })
      .lean<EmployeeSiteAssignment>()
      .exec();
    if (!row) return null;
    if (row.validTo && row.validTo < at) {
      await this.assignments
        .updateOne(
          {
            _id: row._id,
            tenantId: this.tenantId(),
            status: AssignmentStatus.ACTIVE,
          },
          { $set: { status: AssignmentStatus.EXPIRED } },
        )
        .exec();
      return null;
    }
    return row;
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
