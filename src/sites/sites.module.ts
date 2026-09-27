import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { CustomFieldsModule } from '../custom-fields/custom-fields.module';
import { ProjectsModule } from '../projects/projects.module';
import { TenantsModule } from '../tenants/tenants.module';
import { ProjectSitesController } from './controllers/project-sites.controller';
import { SitesController } from './controllers/sites.controller';
import {
  SiteProjectAssignment,
  SiteProjectAssignmentSchema,
} from './schemas/site-project-assignment.schema';
import { Site, SiteSchema } from './schemas/site.schema';
import { SitesService } from './services/sites.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Site.name, schema: SiteSchema },
      { name: SiteProjectAssignment.name, schema: SiteProjectAssignmentSchema },
    ]),
    ProjectsModule,
    TenantsModule,
    CustomFieldsModule,
  ],
  controllers: [SitesController, ProjectSitesController],
  providers: [SitesService],
  exports: [SitesService],
})
export class SitesModule {}
