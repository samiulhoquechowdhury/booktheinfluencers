import { Module } from "@nestjs/common";
import { APP_FILTER, APP_GUARD } from "@nestjs/core";
import { env } from "./config/env";
import { ErrorFilter } from "./common/errors";
import { AuthController } from "./auth/auth.controller";
import { AuthService } from "./auth/auth.service";
import { AuthGuard } from "./auth/guard";
import { CustomerBookingsController } from "./bookings/customer.controller";
import { CatalogueController } from "./catalogue/catalogue.controller";
import { HealthController } from "./health/health.controller";
import { IntakeController } from "./intake/intake.controller";
import { MeController } from "./me/me.controller";
import { PrismaService } from "./prisma/prisma.service";
import { StaffController } from "./staff/staff.controller";
import { StaffService } from "./staff/staff.service";
import { CustomerDocumentsController, StaffDocumentsController } from "./documents/documents.controller";
import { DocumentsService } from "./documents/documents.service";
import { FollowUpsController } from "./follow-ups/follow-ups.controller";
import { ReconciliationController } from "./reconciliation/reconciliation.controller";
import { FollowUpsService } from "./follow-ups/follow-ups.service";
import { SiteController } from "./site/site.controller";
import { SiteService } from "./site/site.service";
import { StaffAccountsController } from "./staff-accounts/staff-accounts.controller";
import { StaffAccountsService } from "./staff-accounts/staff-accounts.service";
import { TalentPortalController } from "./talent/talent.controller";
import { TalentAdminController } from "./talents/talent-admin.controller";
import { TalentAdminService } from "./talents/talent-admin.service";
import { OnboardingService } from "./talent/onboarding.service";
import { VerificationsController } from "./verifications/verifications.controller";
import { VerificationsService } from "./verifications/verifications.service";
import { DevProvidersController } from "./webhooks/dev-providers.controller";
import { WebhooksController } from "./webhooks/webhooks.controller";

@Module({
  controllers: [
    HealthController,
    AuthController,
    CatalogueController,
    CustomerBookingsController,
    MeController,
    TalentPortalController,
    IntakeController,
    StaffController,
    TalentAdminController,
    StaffAccountsController,
    SiteController,
    FollowUpsController,
    CustomerDocumentsController,
    StaffDocumentsController,
    ReconciliationController,
    VerificationsController,
    WebhooksController,
    // Simulated provider screens never ship to production.
    ...(env.NODE_ENV === "production" ? [] : [DevProvidersController]),
  ],
  providers: [
    PrismaService,
    AuthService,
    StaffService,
    TalentAdminService,
    StaffAccountsService,
    SiteService,
    FollowUpsService,
    DocumentsService,
    OnboardingService,
    VerificationsService,
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_FILTER, useClass: ErrorFilter },
  ],
})
export class AppModule {}
