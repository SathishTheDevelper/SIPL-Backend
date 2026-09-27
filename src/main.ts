import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { json, urlencoded } from 'express';
import helmet from 'helmet';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  const configService = app.get(ConfigService);
  const logger = app.get(Logger);
  app.useLogger(logger);

  const prefix = configService.get<string>('apiPrefix', 'api/v1');
  app.setGlobalPrefix(prefix);

  app.use(helmet());
  const origins = configService.get<string[]>('corsOrigins', []);
  app.enableCors({
    origin: origins.length > 0 ? origins : true,
    credentials: true,
  });

  const bodyLimit = configService.get<string>('bodyLimit', '1mb');
  app.use(json({ limit: bodyLimit }));
  app.use(urlencoded({ extended: true, limit: bodyLimit }));

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  app.enableShutdownHooks();

  if (configService.get<boolean>('swaggerEnabled', true)) {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('SIPL Workflow 360')
      .setDescription(
        'Unified multi-tenant construction workflow platform. Tenant isolation is enforced from JWT, never from the request body.',
      )
      .setVersion('1.0')
      .addBearerAuth()
      .addTag('Authentication')
      .addTag('Tenants')
      .addTag('Users')
      .addTag('Roles')
      .addTag('Permissions')
      .addTag('Custom Fields')
      .addTag('Workflow')
      .addTag('SLA')
      .addTag('Notifications')
      .addTag('Audit')
      .addTag('Numbering')
      .addTag('Leads')
      .addTag('Opportunities')
      .addTag('Tenders')
      .addTag('Requirements')
      .addTag('Quotations')
      .addTag('Client Decisions')
      .addTag('Projects')
      .addTag('Sites')
      .addTag('Materials')
      .addTag('Material Categories')
      .addTag('Units')
      .addTag('BOQ')
      .addTag('Material Planning')
      .addTag('Material Requests')
      .addTag('Employees')
      .addTag('Site Assignments')
      .addTag('Attendance')
      .addTag('Site Access Requests')
      .addTag('Purchase Orders')
      .addTag('PO Charges')
      .addTag('Deliveries')
      .addTag('GRN')
      .addTag('Invoices')
      .addTag('Health')
      .build();
    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup('docs', app, document, {
      swaggerOptions: { persistAuthorization: true },
    });
  }

  const port = configService.get<number>('port', 3000);
  await app.listen(port);
  logger.log(`SIPL Workflow 360 listening on port ${port}`);
  logger.log(`Swagger available at /docs`);
}

void bootstrap();
