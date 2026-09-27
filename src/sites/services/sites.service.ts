import { HttpStatus, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import type { AuthenticatedUser } from '../../auth/interfaces/authenticated-user.interface';
import { AuditAction } from '../../audit/enums/audit-action.enum';
import { AuditService } from '../../audit/services/audit.service';
import { BusinessModule } from '../../common/constants/modules';
import { ErrorCodes } from '../../common/constants/error-codes';
import { TenantContext } from '../../common/context/tenant.context';
import { AppException } from '../../common/exceptions/app.exception';
import { assertTransition } from '../../common/utils/status-transition';
import { CustomFieldValidationService } from '../../custom-fields/services/custom-field-validation.service';
import { ProjectsService } from '../../projects/services/projects.service';
import { TenantsService } from '../../tenants/services/tenants.service';
import { CreateSiteDto, UpdateSiteDto } from '../dto/site.dto';
import { SITE_TRANSITIONS, SiteStatus } from '../enums/site-status.enum';
import { SiteProjectAssignment } from '../schemas/site-project-assignment.schema';
import { Site } from '../schemas/site.schema';

@Injectable()
export class SitesService {
  constructor(
    @InjectModel(Site.name) private readonly model: Model<Site>,
    @InjectModel(SiteProjectAssignment.name)
    private readonly assignmentModel: Model<SiteProjectAssignment>,
    private readonly projectsService: ProjectsService,
    private readonly tenantsService: TenantsService,
    private readonly customFields: CustomFieldValidationService,
    private readonly auditService: AuditService,
  ) {}

  async create(projectId: string, dto: CreateSiteDto, user: AuthenticatedUser) {
    await this.projectsService.findById(projectId);
    this.assertGeo(dto.latitude, dto.longitude, dto.geofenceRadius);
    const tenant = await this.tenantsService.findByIdOrThrow(
      TenantContext.requireTenantId(),
    );
    const geofenceRadius =
      dto.geofenceRadius ?? tenant.settings.geofenceRadiusMeters;
    if (!geofenceRadius || geofenceRadius <= 0) {
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        'geofenceRadius must be greater than 0',
        ErrorCodes.VALIDATION_ERROR,
      );
    }
    const customFields = await this.customFields.validate(
      BusinessModule.SITE,
      dto.customFields,
    );
    const code = dto.code.trim().toUpperCase();
    const duplicate = await this.model
      .findOne({
        tenantId: this.tenantId(),
        projectId: new Types.ObjectId(projectId),
        code,
      })
      .lean()
      .exec();
    if (duplicate) {
      throw new AppException(
        HttpStatus.CONFLICT,
        'Site code already exists for this project',
        ErrorCodes.DUPLICATE_CODE,
      );
    }
    const created = await this.model.create({
      tenantId: this.tenantId(),
      projectId: new Types.ObjectId(projectId),
      name: dto.name,
      code,
      address: dto.address,
      city: dto.city,
      state: dto.state,
      pincode: dto.pincode,
      latitude: dto.latitude,
      longitude: dto.longitude,
      location: { type: 'Point', coordinates: [dto.longitude, dto.latitude] },
      geofenceRadius,
      status: SiteStatus.DRAFT,
      customFields,
      createdBy: new Types.ObjectId(user.userId),
    });
    await this.assignmentModel.create({
      tenantId: this.tenantId(),
      siteId: created._id,
      projectId: new Types.ObjectId(projectId),
      isPrimary: true,
    });
    await this.auditService.record({
      action: AuditAction.CREATE,
      module: BusinessModule.SITE,
      entityType: 'Site',
      entityId: created._id.toString(),
      after: { code, projectId, geofenceRadius },
    });
    return created.toObject();
  }

  async listByProject(projectId: string) {
    await this.projectsService.findById(projectId);
    return this.model
      .find({
        tenantId: this.tenantId(),
        projectId: new Types.ObjectId(projectId),
      })
      .sort({ createdAt: -1 })
      .lean<Site[]>()
      .exec();
  }

  async findById(id: string): Promise<Site> {
    const doc = await this.model
      .findOne({ _id: id, tenantId: this.tenantId() })
      .lean<Site>()
      .exec();
    if (!doc) {
      throw new AppException(
        HttpStatus.NOT_FOUND,
        'Resource not found',
        ErrorCodes.NOT_FOUND,
      );
    }
    return doc;
  }

  async update(id: string, dto: UpdateSiteDto, user: AuthenticatedUser) {
    const current = await this.findById(id);
    this.assertGeo(
      dto.latitude ?? current.latitude,
      dto.longitude ?? current.longitude,
      dto.geofenceRadius ?? current.geofenceRadius,
    );
    const customFields = dto.customFields
      ? await this.customFields.validate(BusinessModule.SITE, dto.customFields)
      : current.customFields;
    const updated = await this.model
      .findOneAndUpdate(
        { _id: id, tenantId: this.tenantId() },
        {
          $set: {
            name: dto.name ?? current.name,
            address: dto.address ?? current.address,
            city: dto.city ?? current.city,
            state: dto.state ?? current.state,
            pincode: dto.pincode ?? current.pincode,
            latitude: dto.latitude ?? current.latitude,
            longitude: dto.longitude ?? current.longitude,
            location: {
              type: 'Point',
              coordinates: [
                dto.longitude ?? current.longitude,
                dto.latitude ?? current.latitude,
              ],
            },
            geofenceRadius: dto.geofenceRadius ?? current.geofenceRadius,
            customFields,
            updatedBy: new Types.ObjectId(user.userId),
          },
        },
        { new: true },
      )
      .lean<Site>()
      .exec();
    return updated!;
  }

  async activate(id: string, user: AuthenticatedUser) {
    return this.changeStatus(id, SiteStatus.ACTIVE, user);
  }

  async deactivate(id: string, user: AuthenticatedUser) {
    return this.changeStatus(id, SiteStatus.INACTIVE, user);
  }

  async close(id: string, user: AuthenticatedUser) {
    return this.changeStatus(id, SiteStatus.CLOSED, user);
  }

  private async changeStatus(
    id: string,
    status: SiteStatus,
    user: AuthenticatedUser,
  ) {
    const current = await this.findById(id);
    assertTransition(current.status, status, SITE_TRANSITIONS);
    const updated = await this.model
      .findOneAndUpdate(
        { _id: id, tenantId: this.tenantId() },
        { $set: { status, updatedBy: new Types.ObjectId(user.userId) } },
        { new: true },
      )
      .lean<Site>()
      .exec();
    await this.auditService.record({
      action: AuditAction.STATUS_CHANGE,
      module: BusinessModule.SITE,
      entityType: 'Site',
      entityId: id,
      before: { status: current.status },
      after: { status },
    });
    return updated!;
  }

  private assertGeo(
    latitude: number,
    longitude: number,
    geofenceRadius?: number,
  ) {
    if (latitude < -90 || latitude > 90) {
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        'latitude must be between -90 and 90',
        ErrorCodes.VALIDATION_ERROR,
      );
    }
    if (longitude < -180 || longitude > 180) {
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        'longitude must be between -180 and 180',
        ErrorCodes.VALIDATION_ERROR,
      );
    }
    if (geofenceRadius !== undefined && geofenceRadius <= 0) {
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        'geofenceRadius must be greater than 0',
        ErrorCodes.VALIDATION_ERROR,
      );
    }
  }

  private tenantId(): Types.ObjectId {
    return new Types.ObjectId(TenantContext.requireTenantId());
  }
}
